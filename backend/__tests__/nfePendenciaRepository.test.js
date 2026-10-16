import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  buscarPendenciaFiscalComTransicoes,
  liberarPendenciaFiscal,
  listarPendenciasFiscais,
} from '../repositories/nfePendenciaRepository.js';

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE clientes (
      id INTEGER PRIMARY KEY,
      name TEXT
    );

    CREATE TABLE ordens (
      id INTEGER PRIMARY KEY,
      numero TEXT,
      clienteid INTEGER,
      clientenome TEXT,
      nfe_status TEXT,
      deletedat TEXT
    );

    CREATE TABLE IF NOT EXISTS nfe_notas (
      id INTEGER PRIMARY KEY,
      origem TEXT,
      ordemid INTEGER,
      status TEXT,
      numero TEXT,
      serie TEXT,
      rejeicao_cstat TEXT,
      rejeicao_motivo TEXT,
      updatedat TEXT
    );

    CREATE TABLE nfe_emissao_tentativas (
      id INTEGER PRIMARY KEY,
      ordemid INTEGER NOT NULL,
      operacao TEXT NOT NULL,
      numero INTEGER,
      serie TEXT,
      lote TEXT,
      status TEXT NOT NULL,
      cstat TEXT,
      motivo TEXT,
      chave TEXT,
      protocolo TEXT,
      xml_envio TEXT,
      xml_retorno TEXT,
      erro_local TEXT,
      createdat TEXT,
      updatedat TEXT,
      concluido_em TEXT
    );

    CREATE TABLE nfe_evento_tentativas (
      id INTEGER PRIMARY KEY,
      ordemid INTEGER NOT NULL,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT,
      cstat TEXT,
      motivo TEXT,
      protocolo TEXT,
      xml_retorno TEXT,
      erro_local TEXT,
      createdat TEXT,
      updatedat TEXT,
      concluido_em TEXT
    );

    CREATE TABLE nfe_emissao_transicoes (
      id INTEGER PRIMARY KEY,
      tentativaid INTEGER NOT NULL,
      ordemid INTEGER NOT NULL,
      status TEXT NOT NULL,
      estado_anterior TEXT,
      estado_novo TEXT,
      cstat TEXT,
      motivo TEXT,
      createdat TEXT
    );

    CREATE TABLE nfe_evento_transicoes (
      id INTEGER PRIMARY KEY,
      tentativaid INTEGER NOT NULL,
      ordemid INTEGER NOT NULL,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL,
      status TEXT NOT NULL,
      estado_anterior TEXT,
      estado_novo TEXT,
      cstat TEXT,
      motivo TEXT,
      createdat TEXT
    );

    CREATE TABLE IF NOT EXISTS nfe_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordemid INTEGER,
      nfeid INTEGER DEFAULT NULL,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL DEFAULT 1,
      protocolo TEXT,
      cstat TEXT,
      motivo TEXT,
      texto TEXT,
      xml TEXT,
      createdat TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  return db;
}

describe('nfePendenciaRepository', () => {
  it('lista somente pendencias fiscais ativas e sanitizadas', () => {
    const db = createDb();
    db.prepare('INSERT INTO clientes (id, name) VALUES (?, ?)').run(1, 'Cliente Fiscal');
    db.prepare(`
      INSERT INTO ordens (id, numero, clienteid, clientenome, deletedat)
      VALUES (?, ?, ?, ?, NULL), (?, ?, NULL, ?, NULL), (?, ?, NULL, ?, '2026-06-25')
    `).run(17, 'OS-017', 1, 'Fallback Cliente', 18, 'OS-018', 'Cliente Avulso', 19, 'OS-019', 'Excluida');

    db.prepare(`
      INSERT INTO nfe_emissao_tentativas
        (id, ordemid, operacao, numero, serie, lote, status, cstat, motivo, chave, xml_envio, xml_retorno, erro_local, createdat, updatedat)
      VALUES
        (1, 17, 'emissao', 11, '1', '000000011', 'incerto', 'timeout', 'SEFAZ demorou demais', NULL, '<envio/>', '<retorno/>', 'stack interna', '2026-06-25T10:00:00.000Z', '2026-06-25T10:02:00.000Z'),
        (2, 17, 'emissao', 12, '1', '000000012', 'autorizado', '100', 'Autorizado', '35111111111111111111111111111111111111111111', '<envio/>', '<retorno/>', NULL, '2026-06-25T09:00:00.000Z', '2026-06-25T09:02:00.000Z'),
        (3, 19, 'emissao', 13, '1', '000000013', 'processando', NULL, NULL, NULL, '<envio/>', NULL, NULL, '2026-06-25T12:00:00.000Z', '2026-06-25T12:01:00.000Z')
    `).run();

    db.prepare(`
      INSERT INTO nfe_evento_tentativas
        (id, ordemid, chave, tipo, nseqevento, status, payload_json, cstat, motivo, protocolo, xml_retorno, erro_local, createdat, updatedat)
      VALUES
        (4, 18, '35111111111111111111111111111111111111111111', 'cce', 2, 'processando', '{"dest":{"cpf":"secret"}}', NULL, 'Transmitindo evento', NULL, '<evento/>', 'erro interno', '2026-06-25T11:00:00.000Z', '2026-06-25T11:03:00.000Z'),
        (5, 18, '35111111111111111111111111111111111111111111', 'cancelamento', 1, 'rejeitado', '{"x":"y"}', '573', 'Duplicidade', NULL, '<evento/>', NULL, '2026-06-25T08:00:00.000Z', '2026-06-25T08:03:00.000Z')
    `).run();

    const pendencias = listarPendenciasFiscais(db);

    expect(pendencias).toEqual([
      expect.objectContaining({
        id: 4,
        origem: 'evento',
        tipo: 'cce',
        status: 'processando',
        ordemid: 18,
        numero_os: 'OS-018',
        cliente: 'Cliente Avulso',
        chave: '35111111111111111111111111111111111111111111',
        numero_nfe: null,
        serie: null,
        nseqevento: 2,
        motivo: 'Transmitindo evento',
      }),
      expect.objectContaining({
        id: 1,
        origem: 'emissao',
        tipo: 'emissao',
        status: 'incerto',
        ordemid: 17,
        numero_os: 'OS-017',
        cliente: 'Cliente Fiscal',
        chave: null,
        numero_nfe: 11,
        serie: '1',
        nseqevento: null,
        cstat: 'timeout',
      }),
    ]);

    expect(pendencias).toHaveLength(2);
    for (const pendencia of pendencias) {
      expect(pendencia).not.toHaveProperty('xml_envio');
      expect(pendencia).not.toHaveProperty('xml_retorno');
      expect(pendencia).not.toHaveProperty('payload_json');
      expect(pendencia).not.toHaveProperty('erro_local');
    }
  });

  it('busca detalhe de emissao ativa com transicoes sanitizadas', () => {
    const db = createDb();
    db.prepare('INSERT INTO clientes (id, name) VALUES (?, ?)').run(1, 'Cliente Fiscal');
    db.prepare('INSERT INTO ordens (id, numero, clienteid, clientenome, deletedat) VALUES (?, ?, ?, ?, NULL)')
      .run(17, 'OS-017', 1, 'Fallback Cliente');
    db.prepare(`
      INSERT INTO nfe_emissao_tentativas
        (id, ordemid, operacao, numero, serie, lote, status, cstat, motivo, chave, xml_envio, xml_retorno, erro_local, createdat, updatedat)
      VALUES
        (1, 17, 'emissao', 11, '1', '000000011', 'incerto', 'timeout', 'SEFAZ demorou demais', NULL, '<envio/>', '<retorno/>', 'stack interna', '2026-06-25T10:00:00.000Z', '2026-06-25T10:02:00.000Z')
    `).run();
    db.prepare(`
      INSERT INTO nfe_emissao_transicoes
        (id, tentativaid, ordemid, status, estado_anterior, estado_novo, cstat, motivo, createdat)
      VALUES
        (10, 1, 17, 'processando', NULL, 'processando', NULL, NULL, '2026-06-25T10:00:00.000Z'),
        (11, 1, 17, 'incerto', 'processando', 'incerto', 'timeout', 'Tempo esgotado', '2026-06-25T10:02:00.000Z')
    `).run();

    const result = buscarPendenciaFiscalComTransicoes(db, { origem: 'emissao', id: 1 });

    expect(result).toEqual({
      pendencia: expect.objectContaining({
        id: 1,
        origem: 'emissao',
        tipo: 'emissao',
        status: 'incerto',
        ordemid: 17,
        numero_os: 'OS-017',
        cliente: 'Cliente Fiscal',
        numero_nfe: 11,
        serie: '1',
      }),
      transicoes: [
        {
          id: 10,
          status: 'processando',
          estado_anterior: null,
          estado_novo: 'processando',
          cstat: null,
          motivo: null,
          createdat: '2026-06-25T10:00:00.000Z',
        },
        {
          id: 11,
          status: 'incerto',
          estado_anterior: 'processando',
          estado_novo: 'incerto',
          cstat: 'timeout',
          motivo: 'Tempo esgotado',
          createdat: '2026-06-25T10:02:00.000Z',
        },
      ],
    });
    expect(result.pendencia).not.toHaveProperty('xml_envio');
    expect(result.pendencia).not.toHaveProperty('xml_retorno');
    expect(result.pendencia).not.toHaveProperty('erro_local');
  });

  it('busca detalhe de evento ativo com transicoes sanitizadas', () => {
    const db = createDb();
    db.prepare('INSERT INTO ordens (id, numero, clienteid, clientenome, deletedat) VALUES (?, ?, NULL, ?, NULL)')
      .run(18, 'OS-018', 'Cliente Avulso');
    db.prepare(`
      INSERT INTO nfe_evento_tentativas
        (id, ordemid, chave, tipo, nseqevento, status, payload_json, cstat, motivo, protocolo, xml_retorno, erro_local, createdat, updatedat)
      VALUES
        (4, 18, '35111111111111111111111111111111111111111111', 'cce', 2, 'processando', '{"dest":{"cpf":"secret"}}', NULL, 'Transmitindo evento', NULL, '<evento/>', 'erro interno', '2026-06-25T11:00:00.000Z', '2026-06-25T11:03:00.000Z')
    `).run();
    db.prepare(`
      INSERT INTO nfe_evento_transicoes
        (id, tentativaid, ordemid, chave, tipo, nseqevento, status, estado_anterior, estado_novo, cstat, motivo, createdat)
      VALUES
        (20, 4, 18, '35111111111111111111111111111111111111111111', 'cce', 2, 'processando', NULL, 'processando', NULL, NULL, '2026-06-25T11:00:00.000Z')
    `).run();

    const result = buscarPendenciaFiscalComTransicoes(db, { origem: 'evento', id: 4 });

    expect(result).toEqual({
      pendencia: expect.objectContaining({
        id: 4,
        origem: 'evento',
        tipo: 'cce',
        status: 'processando',
        ordemid: 18,
        numero_os: 'OS-018',
        cliente: 'Cliente Avulso',
        chave: '35111111111111111111111111111111111111111111',
        nseqevento: 2,
      }),
      transicoes: [
        {
          id: 20,
          status: 'processando',
          estado_anterior: null,
          estado_novo: 'processando',
          cstat: null,
          motivo: null,
          createdat: '2026-06-25T11:00:00.000Z',
        },
      ],
    });
    expect(result.pendencia).not.toHaveProperty('payload_json');
    expect(result.pendencia).not.toHaveProperty('xml_retorno');
    expect(result.pendencia).not.toHaveProperty('erro_local');
  });

  it('retorna null para origem invalida, tentativa finalizada ou OS excluida', () => {
    const db = createDb();
    db.prepare(`
      INSERT INTO ordens (id, numero, clienteid, clientenome, deletedat)
      VALUES (17, 'OS-017', NULL, 'Cliente', NULL), (18, 'OS-018', NULL, 'Cliente', '2026-06-25')
    `).run();
    db.prepare(`
      INSERT INTO nfe_emissao_tentativas
        (id, ordemid, operacao, numero, serie, lote, status, createdat, updatedat)
      VALUES
        (1, 17, 'emissao', 11, '1', '000000011', 'autorizado', '2026-06-25T10:00:00.000Z', '2026-06-25T10:02:00.000Z'),
        (2, 18, 'emissao', 12, '1', '000000012', 'incerto', '2026-06-25T10:00:00.000Z', '2026-06-25T10:02:00.000Z')
    `).run();

    expect(buscarPendenciaFiscalComTransicoes(db, { origem: 'invalida', id: 1 })).toBeNull();
    expect(buscarPendenciaFiscalComTransicoes(db, { origem: 'emissao', id: 1 })).toBeNull();
    expect(buscarPendenciaFiscalComTransicoes(db, { origem: 'emissao', id: 2 })).toBeNull();
    expect(buscarPendenciaFiscalComTransicoes(db, { origem: 'emissao', id: 0 })).toBeNull();
  });

  describe('liberarPendenciaFiscal', () => {
    it('libera tentativa de emissao com status incerto, transicionando ordens e notas para rejeitado', () => {
      const db = createDb();
      db.prepare(`
        INSERT INTO ordens (id, numero, clienteid, clientenome, nfe_status)
        VALUES (10, 'OS-0654', 1, 'Paroquia Sao Sebastiao', 'incerto')
      `).run();
      db.prepare(`
        INSERT INTO nfe_notas (id, origem, ordemid, status, numero, serie)
        VALUES (1, 'ordem', 10, 'incerto', '000000347', '1')
      `).run();
      db.prepare(`
        INSERT INTO nfe_emissao_tentativas
          (id, ordemid, operacao, numero, serie, status, cstat, motivo)
        VALUES
          (1, 10, 'emissao', 347, '1', 'incerto', '805', 'Rejeicao SEFAZ: Contribuinte Isento nao permitido')
      `).run();

      const resultado = liberarPendenciaFiscal(db, {
        origem: 'emissao',
        id: 1,
        motivo: 'Rejeicao conferida na SEFAZ. Destinatario ajustado para nao contribuinte.',
        usuarioId: 99,
      });

      expect(resultado.ok).toBe(true);
      expect(resultado.status).toBe(200);

      // 1. Tentativa atualizada para rejeitado
      const tentativa = db.prepare('SELECT * FROM nfe_emissao_tentativas WHERE id = 1').get();
      expect(tentativa.status).toBe('rejeitado');
      expect(tentativa.cstat).toBe('805');

      // 2. Transicao registrada
      const transicao = db.prepare('SELECT * FROM nfe_emissao_transicoes WHERE tentativaid = 1').get();
      expect(transicao).toMatchObject({
        estado_anterior: 'incerto',
        estado_novo: 'rejeitado',
        cstat: '805',
      });

      // 3. Nota atualizada para rejeitado
      const nota = db.prepare('SELECT * FROM nfe_notas WHERE id = 1').get();
      expect(nota.status).toBe('rejeitado');
      expect(nota.rejeicao_cstat).toBe('805');

      // 4. Ordem atualizada para rejeitado
      const ordem = db.prepare('SELECT * FROM ordens WHERE id = 10').get();
      expect(ordem.nfe_status).toBe('rejeitado');

      // 5. Registra evento operacional com fallback seguro para chave quando nula
      const evento = db.prepare('SELECT * FROM nfe_eventos WHERE ordemid = 10').get();
      expect(evento).toMatchObject({
        ordemid: 10,
        chave: 'OS-10',
        tipo: 'rejeicao',
        cstat: '805',
      });

      // 6. Pendencia nao aparece mais na listagem de ativas
      const pendencias = listarPendenciasFiscais(db);
      expect(pendencias).toHaveLength(0);
    });

    it('rejeita liberacao de tentativa ja concluida (autorizado ou rejeitado)', () => {
      const db = createDb();
      db.prepare(`
        INSERT INTO nfe_emissao_tentativas
          (id, ordemid, operacao, numero, serie, status)
        VALUES (2, 10, 'emissao', 348, '1', 'autorizado')
      `).run();

      const resultado = liberarPendenciaFiscal(db, {
        origem: 'emissao',
        id: 2,
        motivo: 'Tentativa indevida de liberar nota autorizada',
      });

      expect(resultado.ok).toBe(false);
      expect(resultado.status).toBe(409);
      expect(resultado.erro).toContain('autorizado');
    });

    it('libera tentativa de evento em estado processando/incerto', () => {
      const db = createDb();
      db.prepare(`
        INSERT INTO nfe_evento_tentativas
          (id, ordemid, chave, tipo, nseqevento, status, cstat)
        VALUES (5, 10, '35111111111111111111111111111111111111111111', 'cancelamento', 1, 'incerto', 'timeout')
      `).run();

      const resultado = liberarPendenciaFiscal(db, {
        origem: 'evento',
        id: 5,
        motivo: 'Cancelamento rejeitado na SEFAZ',
      });

      expect(resultado.ok).toBe(true);
      const evTentativa = db.prepare('SELECT * FROM nfe_evento_tentativas WHERE id = 5').get();
      expect(evTentativa.status).toBe('rejeitado');
    });
  });
});
