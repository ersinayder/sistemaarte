import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import {
  buscarNotasExportaveis,
  gerarExportacaoNFe,
  montarEntradasExportacaoNFe,
} from '../services/nfeExportService.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE ordens (
      id INTEGER PRIMARY KEY,
      numero TEXT,
      deletedat TEXT,
      nfe_deletedat TEXT,
      nfe_deletedreason TEXT
    );
    CREATE TABLE nfe_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origem TEXT NOT NULL,
      ordemid INTEGER DEFAULT NULL,
      cliente_snapshot TEXT NOT NULL DEFAULT '{}',
      emitente_snapshot TEXT NOT NULL DEFAULT '{}',
      valortotal REAL NOT NULL DEFAULT 0,
      ambiente INTEGER NOT NULL DEFAULT 1,
      numero TEXT,
      serie TEXT NOT NULL DEFAULT '1',
      chave TEXT,
      protocolo TEXT,
      status TEXT NOT NULL,
      xml TEXT,
      deletedat TEXT DEFAULT NULL,
      createdat TEXT DEFAULT (datetime('now','localtime')),
      updatedat TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  return db;
}

function insertNota(db, data = {}) {
  return db.prepare(`
    INSERT INTO nfe_notas
      (origem, ordemid, numero, serie, chave, status, xml, deletedat, createdat)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.origem || 'ordem',
    data.ordemid || null,
    data.numero || null,
    data.serie || '1',
    data.chave || null,
    data.status || 'autorizado',
    data.xml || null,
    data.deletedat || null,
    data.createdat || '2026-06-15 10:00:00'
  );
}

function xmlAutorizado(chave) {
  return `<nfeProc><NFe><infNFe Id="NFe${chave}"><ide><nNF>${Number(chave.slice(25, 34))}</nNF><serie>1</serie></ide><emit><xNome>Arte</xNome></emit><dest><xNome>Cliente</xNome></dest><total><ICMSTot><vNF>10.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>${chave}</chNFe><cStat>100</cStat><nProt>123</nProt></infProt></protNFe></nfeProc>`;
}

describe('nfeExportService', () => {
  it('queries canonical nfe_notas, includes avulsa, and preserves OS-deleted fiscal notes', () => {
    const db = makeDb();
    db.prepare("INSERT INTO ordens (id, numero, deletedat) VALUES (10, 'OS-10', '2026-07-01 09:00:00')").run();
    db.prepare("INSERT INTO ordens (id, numero, nfe_deletedat) VALUES (11, 'OS-11', '2026-07-01 09:00:00')").run();

    insertNota(db, {
      origem: 'ordem',
      ordemid: 10,
      numero: '000000285',
      chave: '31260507500718000196550010000002851000000285',
      xml: xmlAutorizado('31260507500718000196550010000002851000000285'),
      createdat: '2026-06-10 08:00:00',
    });
    insertNota(db, {
      origem: 'avulsa',
      numero: '000000286',
      chave: '31260507500718000196550010000002861000000286',
      xml: xmlAutorizado('31260507500718000196550010000002861000000286'),
      createdat: '2026-06-11 08:00:00',
    });
    insertNota(db, {
      origem: 'ordem',
      ordemid: 11,
      numero: '000000287',
      chave: '31260507500718000196550010000002871000000287',
      xml: xmlAutorizado('31260507500718000196550010000002871000000287'),
      createdat: '2026-06-12 08:00:00',
    });
    insertNota(db, {
      origem: 'avulsa',
      numero: '000000288',
      chave: '31260507500718000196550010000002881000000288',
      status: 'rejeitado',
      xml: xmlAutorizado('31260507500718000196550010000002881000000288'),
      createdat: '2026-06-13 08:00:00',
    });
    insertNota(db, {
      origem: 'avulsa',
      numero: '000000289',
      chave: '31260507500718000196550010000002891000000289',
      deletedat: '2026-06-13 09:00:00',
      xml: xmlAutorizado('31260507500718000196550010000002891000000289'),
      createdat: '2026-06-13 08:00:00',
    });

    const notas = buscarNotasExportaveis(db, { inicio: '2026-06-01', fim: '2026-06-30' });

    expect(notas.map((nota) => nota.numero)).toEqual(['000000285', '000000286']);
    expect(notas[0]).toMatchObject({
      origem: 'ordem',
      ordemid: 10,
      chave: '31260507500718000196550010000002851000000285',
      emitida_em: '2026-06-10 08:00:00',
    });
  });

  it('builds XML entries and a manifesto while recording invalid XML as skipped', async () => {
    const result = await montarEntradasExportacaoNFe({
      pedido: { tipo: 'xml', inicio: '2026-06-01', fim: '2026-06-30' },
      notas: [
        {
          id: 1,
          numero: '000000285',
          chave: '31260507500718000196550010000002851000000285',
          xml: xmlAutorizado('31260507500718000196550010000002851000000285'),
        },
        {
          id: 2,
          numero: '000000286',
          chave: '31260507500718000196550010000002861000000286',
          xml: '<nfeProc><NFe /></nfeProc>',
        },
        {
          id: 3,
          numero: '000000287',
          chave: '31260507500718000196550010000002871000000287',
          xml: 'sem xml',
        },
      ],
      now: new Date('2026-07-01T12:00:00.000Z'),
    });

    expect(result.entries).toEqual([
      {
        name: 'xml/000000285-31260507500718000196550010000002851000000285.xml',
        content: xmlAutorizado('31260507500718000196550010000002851000000285'),
      },
      expect.objectContaining({ name: 'manifesto.txt' }),
    ]);
    expect(result.puladas).toEqual([
      expect.objectContaining({ numero: '000000286', motivo: 'XML autorizado ausente ou invalido' }),
      expect.objectContaining({ numero: '000000287', motivo: 'XML autorizado ausente ou invalido' }),
    ]);
    expect(String(result.entries[1].content)).toContain('Arquivos exportados: 1');
  });

  it('builds DANFE PDF entries with the injected PDF renderer', async () => {
    const renderPdf = vi.fn(async (html) => Buffer.from(`%PDF ${html.includes('DANFE')}`));

    const result = await montarEntradasExportacaoNFe({
      pedido: { tipo: 'danfe', inicio: '2026-06-01', fim: '2026-06-30' },
      notas: [{
        id: 1,
        numero: '000000285',
        chave: '31260507500718000196550010000002851000000285',
        xml: xmlAutorizado('31260507500718000196550010000002851000000285'),
      }],
      renderPdf,
      now: new Date('2026-07-01T12:00:00.000Z'),
    });

    expect(renderPdf).toHaveBeenCalledTimes(1);
    expect(result.entries[0]).toEqual({
      name: 'danfe/000000285-31260507500718000196550010000002851000000285.pdf',
      content: Buffer.from('%PDF true'),
    });
  });

  it('returns ZIP metadata and rejects empty or fully invalid exports', async () => {
    const db = makeDb();
    insertNota(db, {
      origem: 'avulsa',
      numero: '000000285',
      chave: '31260507500718000196550010000002851000000285',
      xml: xmlAutorizado('31260507500718000196550010000002851000000285'),
      createdat: '2026-06-15 10:00:00',
    });

    const result = await gerarExportacaoNFe({
      db,
      tipo: 'xml',
      inicio: '2026-06-01',
      fim: '2026-06-30',
      now: new Date('2026-07-01T12:00:00.000Z'),
    });

    expect(result.filename).toBe('nfe-xml-2026-06-01-a-2026-06-30.zip');
    expect(result.contentType).toBe('application/zip');
    expect(result.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(result.exportadas).toBe(1);

    await expect(gerarExportacaoNFe({
      db,
      tipo: 'xml',
      inicio: '2026-05-01',
      fim: '2026-05-31',
    })).rejects.toMatchObject({ status: 404, code: 'sem_notas_exportaveis' });

    db.prepare('UPDATE nfe_notas SET xml = ?').run('sem xml');
    await expect(gerarExportacaoNFe({
      db,
      tipo: 'xml',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    })).rejects.toMatchObject({ status: 422, code: 'sem_arquivos_exportaveis' });
  });
});
