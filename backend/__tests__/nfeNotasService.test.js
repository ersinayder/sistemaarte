import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  backfillNfeNotasFromOrdens,
  buscarNotaAtivaParaOrdem,
  criarNotaEmitindo,
  listarEventosNota,
  listarNotasFiscais,
  marcarNotaAutorizada,
  marcarNotaCancelada,
  marcarNotaRejeitada,
  montarDocumentoFiscalAvulso,
  moverNotaParaLixeira,
  resolverNotaPorChave,
  resolverNotaPorId,
  restaurarNotaDaLixeira,
  substituirItensNota,
} from '../services/nfeNotasService.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE clientes (
      id INTEGER PRIMARY KEY,
      name TEXT,
      cpf TEXT,
      ie TEXT,
      logradouro TEXT,
      numero TEXT,
      bairro TEXT,
      cidade TEXT,
      uf TEXT,
      cep TEXT,
      deletedat TEXT
    );
    CREATE TABLE ordens (
      id INTEGER PRIMARY KEY,
      numero TEXT,
      clienteid INTEGER,
      clientenome TEXT,
      servico TEXT,
      valortotal REAL,
      descontovalor REAL,
      pagamento TEXT,
      status TEXT,
      deletedat TEXT,
      nfe_numero TEXT,
      nfe_serie TEXT,
      nfe_chave TEXT,
      nfe_protocolo TEXT,
      nfe_status TEXT,
      nfe_xml TEXT,
      nfe_emitida_em TEXT,
      nfe_cancelado_em TEXT,
      nfe_cancel_protocolo TEXT,
      nfe_cancel_motivo TEXT,
      nfe_deletedat TEXT,
      nfe_deletedpor INTEGER,
      nfe_deletedreason TEXT
    );
    CREATE TABLE produtos (
      id INTEGER PRIMARY KEY,
      nome TEXT,
      unidade TEXT,
      ncm TEXT,
      cfop TEXT,
      csosn TEXT,
      origem_fiscal INTEGER
    );
    CREATE TABLE ordem_itens (
      id INTEGER PRIMARY KEY,
      ordemid INTEGER,
      produto_id INTEGER,
      nome TEXT,
      quantidade REAL,
      preco_unitario REAL,
      avulso INTEGER
    );
    CREATE TABLE nfe_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origem TEXT NOT NULL,
      ordemid INTEGER DEFAULT NULL,
      clienteid INTEGER DEFAULT NULL,
      cliente_snapshot TEXT NOT NULL DEFAULT '{}',
      emitente_snapshot TEXT NOT NULL DEFAULT '{}',
      valortotal REAL NOT NULL DEFAULT 0,
      descontovalor REAL NOT NULL DEFAULT 0,
      pagamento TEXT DEFAULT 'Pix',
      informacoes_complementares TEXT,
      ambiente INTEGER NOT NULL DEFAULT 2,
      numero TEXT,
      serie TEXT NOT NULL DEFAULT '1',
      chave TEXT,
      protocolo TEXT,
      status TEXT NOT NULL,
      xml TEXT,
      rejeicao_cstat TEXT,
      rejeicao_motivo TEXT,
      cancelado_em TEXT,
      cancel_protocolo TEXT,
      cancel_motivo TEXT,
      deletedat TEXT DEFAULT NULL,
      deletedpor INTEGER DEFAULT NULL,
      deletedreason TEXT DEFAULT NULL,
      criadopor INTEGER DEFAULT NULL,
      imported_legacy INTEGER NOT NULL DEFAULT 0,
      createdat TEXT DEFAULT (datetime('now','localtime')),
      updatedat TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE nfe_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nfeid INTEGER NOT NULL,
      ordem_item_id INTEGER DEFAULT NULL,
      produto_id INTEGER DEFAULT NULL,
      nome TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
      avulso INTEGER DEFAULT 0,
      ncm TEXT NOT NULL,
      cfop TEXT NOT NULL,
      csosn TEXT NOT NULL,
      origem_fiscal TEXT NOT NULL DEFAULT '0',
      unidade TEXT NOT NULL DEFAULT 'UN',
      createdat TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE nfe_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave TEXT NOT NULL,
      ordemid INTEGER,
      nfeid INTEGER,
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

describe('nfeNotasService', () => {
  it('backfills legacy OS NF-e rows and item snapshots idempotently', () => {
    const db = makeDb();
    db.prepare(`
      INSERT INTO clientes
        (id, name, cpf, ie, logradouro, numero, bairro, cidade, uf, cep)
      VALUES
        (5, 'Cliente OS', '12345678901', 'ISENTO', 'Rua A', '10', 'Centro', 'Curitiba', 'PR', '80000000')
    `).run();
    db.prepare(`
      INSERT INTO ordens
        (id, numero, clienteid, clientenome, servico, valortotal, descontovalor, pagamento, status,
         nfe_numero, nfe_serie, nfe_chave, nfe_protocolo, nfe_status, nfe_xml, nfe_emitida_em)
      VALUES
        (10, 'OS-10', 5, 'Cliente OS', 'Moldura', 120, 5, 'Pix', 'Entregue',
         '280', '1', '31260600000000000000550010000002801000000010', '131260000001',
         'autorizado', '<xml/>', '2026-07-01 09:00:00')
    `).run();
    db.prepare(`
      INSERT INTO produtos
        (id, nome, unidade, ncm, cfop, csosn, origem_fiscal)
      VALUES
        (3, 'Moldura fiscal', 'UN', '44151000', '5102', '400', 0)
    `).run();
    db.prepare(`
      INSERT INTO ordem_itens
        (id, ordemid, produto_id, nome, quantidade, preco_unitario, avulso)
      VALUES
        (99, 10, 3, 'Moldura fiscal', 2, 60, 0)
    `).run();

    expect(backfillNfeNotasFromOrdens(db)).toEqual({ inserted: 1, skipped: 0 });
    expect(backfillNfeNotasFromOrdens(db)).toEqual({ inserted: 0, skipped: 1 });

    const nota = db.prepare('SELECT * FROM nfe_notas WHERE ordemid = 10').get();
    expect(nota).toMatchObject({
      origem: 'ordem',
      ordemid: 10,
      clienteid: 5,
      valortotal: 120,
      descontovalor: 5,
      numero: '280',
      status: 'autorizado',
      imported_legacy: 1,
    });
    expect(JSON.parse(nota.cliente_snapshot)).toMatchObject({ nome: 'Cliente OS', cpf: '12345678901' });

    const itens = db.prepare('SELECT * FROM nfe_itens WHERE nfeid = ?').all(nota.id);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      ordem_item_id: 99,
      produto_id: 3,
      nome: 'Moldura fiscal',
      quantidade: 2,
      preco_unitario: 60,
      ncm: '44151000',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    });
  });

  it('lists avulsa notes through a UI-compatible row shape', () => {
    const db = makeDb();
    db.prepare(`
      INSERT INTO nfe_notas
        (origem, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, chave, protocolo, status)
      VALUES
        ('avulsa', '{"nome":"Cliente Avulso"}', '{}', 80, 2, '301', '1',
         '31260600000000000000550010000003011000000010', '131260000301', 'autorizado')
    `).run();

    expect(listarNotasFiscais(db)).toEqual([
      expect.objectContaining({
        origem: 'avulsa',
        numero: 'Avulsa',
        clientenome: 'Cliente Avulso',
        servico: 'NF-e avulsa',
        valortotal: 80,
        nfe_numero: '301',
        nfe_status: 'autorizado',
      }),
    ]);
  });

  it('keeps OS notes hidden when they were already moved to the legacy fiscal trash', () => {
    const db = makeDb();
    db.prepare(`
      INSERT INTO ordens
        (id, numero, clientenome, servico, status, valortotal, nfe_status, nfe_deletedat, nfe_deletedpor, nfe_deletedreason)
      VALUES
        (11, 'OS-11', 'Cliente Homologacao', 'Servico antigo', 'Pronto', 80, 'autorizado',
         '2026-06-30 10:00:00', 4, 'Ocultada antes da entidade canonica')
    `).run();
    db.prepare(`
      INSERT INTO nfe_notas
        (origem, ordemid, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, chave, status)
      VALUES
        ('ordem', 11, '{}', '{}', 80, 2, '309', '1',
         '31260600000000000000550010000003091000000010', 'autorizado')
    `).run();

    expect(listarNotasFiscais(db)).toEqual([]);
    expect(listarNotasFiscais(db, { lixeira: true })).toEqual([
      expect.objectContaining({
        ordemid: 11,
        nfe_status: 'autorizado',
        nfe_deletedat: '2026-06-30 10:00:00',
        nfe_deletedpor: 4,
        nfe_deletedreason: 'Ocultada antes da entidade canonica',
      }),
    ]);
  });

  it('resolves a canonical note by its access key', () => {
    const db = makeDb();
    const chave = '31260600000000000000550010000003021000000010';
    db.prepare(`
      INSERT INTO nfe_notas
        (origem, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, chave, status)
      VALUES
        ('avulsa', '{}', '{}', 80, 2, '302', '1', ?, 'autorizado')
    `).run(chave);

    expect(resolverNotaPorChave(db, chave)).toMatchObject({
      origem: 'avulsa',
      chave,
      numero: '302',
      status: 'autorizado',
    });
  });

  it('finds only active OS notes for duplicate emission protection', () => {
    const db = makeDb();
    db.prepare(`
      INSERT INTO nfe_notas
        (origem, ordemid, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, status)
      VALUES
        ('ordem', 20, '{}', '{}', 80, 2, '303', '1', 'rejeitado'),
        ('ordem', 20, '{}', '{}', 80, 2, '304', '1', 'autorizado'),
        ('ordem', 21, '{}', '{}', 80, 2, '305', '1', 'emitindo')
    `).run();

    expect(buscarNotaAtivaParaOrdem(db, 20)).toMatchObject({
      origem: 'ordem',
      ordemid: 20,
      numero: '304',
      status: 'autorizado',
    });
    expect(buscarNotaAtivaParaOrdem(db, 999)).toBeNull();
  });

  it('resolves notes by id and respects trash visibility by default', () => {
    const db = makeDb();
    const info = db.prepare(`
      INSERT INTO nfe_notas
        (origem, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, chave, status, deletedat)
      VALUES
        ('avulsa', '{}', '{}', 80, 2, '306', '1',
         '31260600000000000000550010000003061000000010', 'rejeitado', datetime('now','localtime'))
    `).run();

    expect(resolverNotaPorId(db, Number(info.lastInsertRowid))).toBeNull();
    expect(resolverNotaPorId(db, Number(info.lastInsertRowid), { includeDeleted: true })).toMatchObject({
      numero: '306',
      status: 'rejeitado',
    });
  });

  it('lists events linked by note id, key, or legacy ordem id', () => {
    const db = makeDb();
    const chave = '31260600000000000000550010000003071000000010';
    const info = db.prepare(`
      INSERT INTO nfe_notas
        (origem, ordemid, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, chave, status)
      VALUES
        ('ordem', 30, '{}', '{}', 80, 2, '307', '1', ?, 'autorizado')
    `).run(chave);
    const nota = { id: Number(info.lastInsertRowid), ordemid: 30, chave };
    db.prepare("INSERT INTO nfe_eventos (nfeid, ordemid, chave, tipo, protocolo, xml) VALUES (?, NULL, '', 'autorizacao', 'p1', '<xml/>')").run(nota.id);
    db.prepare("INSERT INTO nfe_eventos (nfeid, ordemid, chave, tipo, protocolo, xml) VALUES (NULL, NULL, ?, 'cce', 'p2', NULL)").run(chave);
    db.prepare("INSERT INTO nfe_eventos (nfeid, ordemid, chave, tipo, protocolo, xml) VALUES (NULL, 30, '', 'rejeicao', 'p3', '')").run();

    const eventos = listarEventosNota(db, nota);

    expect(eventos).toHaveLength(3);
    expect(eventos.map((evento) => evento.tipo).sort()).toEqual(['autorizacao', 'cce', 'rejeicao']);
    expect(eventos.find((evento) => evento.tipo === 'autorizacao')).toMatchObject({ tem_xml: 1 });
  });

  it('moves and restores notes from fiscal trash without touching OS data', () => {
    const db = makeDb();
    const info = db.prepare(`
      INSERT INTO nfe_notas
        (origem, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, chave, status)
      VALUES
        ('avulsa', '{}', '{}', 80, 2, '308', '1',
         '31260600000000000000550010000003081000000010', 'rejeitado')
    `).run();
    const id = Number(info.lastInsertRowid);

    expect(moverNotaParaLixeira(db, id, 7, 'Teste fiscal').changes).toBe(1);
    expect(resolverNotaPorId(db, id, { includeDeleted: true })).toMatchObject({
      deletedpor: 7,
      deletedreason: 'Teste fiscal',
    });

    expect(restaurarNotaDaLixeira(db, id).changes).toBe(1);
    expect(resolverNotaPorId(db, id)).toMatchObject({ id, deletedat: null });
  });

  it('creates an emitindo note and replaces its item snapshots', () => {
    const db = makeDb();
    const nota = criarNotaEmitindo(db, {
      origem: 'ordem',
      ordemid: 40,
      clienteid: 5,
      cliente_snapshot: { nome: 'Cliente OS' },
      emitente_snapshot: { xNome: 'Arte' },
      valortotal: 91,
      descontovalor: 0,
      pagamento: 'Pix',
      informacoes_complementares: 'Entrega combinada com cliente.',
      ambiente: 2,
      numero: '309',
      serie: '1',
      criadopor: 7,
    });

    substituirItensNota(db, nota.id, [{
      id: 90,
      produto_id: 3,
      nome: 'Item OS',
      quantidade: 2,
      preco_unitario: 45.5,
      avulso: false,
      ncm: '44151000',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    }]);

    expect(nota).toMatchObject({
      origem: 'ordem',
      ordemid: 40,
      clienteid: 5,
      status: 'emitindo',
      numero: '309',
      criadopor: 7,
      informacoes_complementares: 'Entrega combinada com cliente.',
    });
    expect(JSON.parse(nota.cliente_snapshot)).toMatchObject({ nome: 'Cliente OS' });
    expect(db.prepare('SELECT * FROM nfe_itens WHERE nfeid=?').get(nota.id)).toMatchObject({
      ordem_item_id: 90,
      produto_id: 3,
      nome: 'Item OS',
      quantidade: 2,
      preco_unitario: 45.5,
      ncm: '44151000',
    });
  });

  it('marks canonical notes as authorized or rejected', () => {
    const db = makeDb();
    const autorizada = criarNotaEmitindo(db, {
      origem: 'avulsa',
      cliente_snapshot: {},
      emitente_snapshot: {},
      valortotal: 80,
      ambiente: 2,
      numero: '310',
      serie: '1',
    });
    const rejeitada = criarNotaEmitindo(db, {
      origem: 'avulsa',
      cliente_snapshot: {},
      emitente_snapshot: {},
      valortotal: 80,
      ambiente: 2,
      numero: '311',
      serie: '1',
    });

    marcarNotaAutorizada(db, autorizada.id, {
      chave: '31260600000000000000550010000003101000000010',
      protocolo: '131260000310',
      xml: '<nfeProc />',
      emitida_em: '2026-07-01T10:00:00-03:00',
    });
    marcarNotaRejeitada(db, rejeitada.id, {
      cstat: '539',
      motivo: 'Duplicidade de NF-e',
      xml: '<retEnviNFe />',
      chave: '31260600000000000000550010000003111000000010',
    });

    expect(resolverNotaPorId(db, autorizada.id)).toMatchObject({
      status: 'autorizado',
      chave: '31260600000000000000550010000003101000000010',
      protocolo: '131260000310',
      xml: '<nfeProc />',
      createdat: '2026-07-01T10:00:00-03:00',
    });
    expect(resolverNotaPorId(db, rejeitada.id)).toMatchObject({
      status: 'rejeitado',
      rejeicao_cstat: '539',
      rejeicao_motivo: 'Duplicidade de NF-e',
      xml: '<retEnviNFe />',
      chave: '31260600000000000000550010000003111000000010',
    });
  });

  it('marks canonical notes as cancelled with cancellation metadata', () => {
    const db = makeDb();
    const nota = criarNotaEmitindo(db, {
      origem: 'avulsa',
      cliente_snapshot: {},
      emitente_snapshot: {},
      valortotal: 80,
      ambiente: 2,
      numero: '313',
      serie: '1',
    });

    marcarNotaAutorizada(db, nota.id, {
      chave: '31260600000000000000550010000003131000000010',
      protocolo: '131260000313',
      xml: '<nfeProc />',
      emitida_em: '2026-07-01T10:00:00-03:00',
    });
    marcarNotaCancelada(db, nota.id, {
      cancelado_em: '2026-07-01T11:00:00-03:00',
      protocolo: '135260000313',
      motivo: 'Cancelamento solicitado pelo cliente',
    });

    expect(resolverNotaPorId(db, nota.id)).toMatchObject({
      status: 'cancelado',
      cancelado_em: '2026-07-01T11:00:00-03:00',
      cancel_protocolo: '135260000313',
      cancel_motivo: 'Cancelamento solicitado pelo cliente',
    });
  });

  it('builds an avulsa fiscal document total without requiring OS or caixa data', () => {
    const documento = montarDocumentoFiscalAvulso({
      cliente: { clientenome: 'Cliente Avulso' },
      pagamento: 'Pix',
      itens: [
        { nome: 'Item 1', quantidade: 2, preco_unitario: 25.5 },
        { nome: 'Item 2', quantidade: 1, preco_unitario: 29 },
      ],
    });

    expect(documento).toMatchObject({
      valortotal: 80,
      descontovalor: 0,
      pagamento: 'Pix',
      cliente: { clientenome: 'Cliente Avulso' },
    });
    expect(documento.itens).toHaveLength(2);
  });

  it('creates avulsa notes without requiring ordem or caixa tables', () => {
    const db = makeDb();
    const nota = criarNotaEmitindo(db, {
      origem: 'avulsa',
      cliente_snapshot: {},
      emitente_snapshot: {},
      valortotal: 80,
      ambiente: 2,
      numero: '312',
      serie: '1',
    });

    expect(nota.origem).toBe('avulsa');
    expect(nota.ordemid).toBeNull();
  });
});
