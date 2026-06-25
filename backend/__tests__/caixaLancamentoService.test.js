import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCaixaLancamentoService } = require('../services/caixaLancamentoService');

function criarDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE ordens (
      id INTEGER PRIMARY KEY,
      numero TEXT NOT NULL,
      clientenome TEXT NOT NULL,
      servico TEXT,
      valortotal REAL NOT NULL DEFAULT 0,
      valorentrada REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Aguardando',
      deletedat TEXT DEFAULT NULL
    );

    CREATE TABLE lancamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'Entrada',
      categoria TEXT DEFAULT NULL,
      descricao TEXT NOT NULL,
      pagamento TEXT NOT NULL,
      valor REAL NOT NULL,
      pago INTEGER DEFAULT 1,
      ordemid INTEGER,
      criadopor INTEGER,
      origem TEXT DEFAULT NULL,
      deletedat TEXT DEFAULT NULL,
      deletedpor INTEGER DEFAULT NULL
    );
  `);
  return db;
}

function inserirOrdem(db, attrs = {}) {
  const ordem = {
    id: attrs.id,
    numero: attrs.numero || `OS-${String(attrs.id).padStart(4, '0')}`,
    clientenome: attrs.clientenome || 'Cliente Teste',
    servico: attrs.servico || 'Moldura',
    valortotal: attrs.valortotal ?? 100,
    status: attrs.status || 'Aguardando',
  };
  db.prepare(`
    INSERT INTO ordens (id, numero, clientenome, servico, valortotal, status)
    VALUES (@id, @numero, @clientenome, @servico, @valortotal, @status)
  `).run(ordem);
}

function inserirLancamento(db, attrs = {}) {
  return db.prepare(`
    INSERT INTO lancamentos (data,tipo,categoria,descricao,pagamento,valor,pago,ordemid,criadopor,origem,deletedat)
    VALUES (@data,@tipo,@categoria,@descricao,@pagamento,@valor,@pago,@ordemid,@criadopor,@origem,@deletedat)
  `).run({
    data: attrs.data || '2026-06-24',
    tipo: attrs.tipo || 'Entrada',
    categoria: attrs.categoria ?? 'Pagamento OS',
    descricao: attrs.descricao || 'Restante OS',
    pagamento: attrs.pagamento || 'Pix',
    valor: attrs.valor ?? 100,
    pago: attrs.pago ?? 1,
    ordemid: attrs.ordemid ?? null,
    criadopor: attrs.criadopor ?? 1,
    origem: attrs.origem ?? 'saldoos',
    deletedat: attrs.deletedat ?? null,
  }).lastInsertRowid;
}

function patch(attrs = {}) {
  return {
    data: attrs.data || '2026-06-24',
    tipo: attrs.tipo || 'Entrada',
    categoria: attrs.categoria,
    descricao: attrs.descricao || 'Manual',
    pagamento: attrs.pagamento || 'Pix',
    valor: attrs.valor,
    pago: attrs.pago,
    ordemid: attrs.ordemid,
  };
}

function row(db, id) {
  return db.prepare('SELECT * FROM lancamentos WHERE id=?').get(id);
}

async function expect409(fn) {
  try {
    await fn();
    throw new Error('expected conflict');
  } catch (error) {
    expect(error.status).toBe(409);
    expect(error.code).toBe('os_entregue_saldo_aberto');
    return error;
  }
}

describe('caixaLancamentoService.editar', () => {
  let db;
  let service;
  const admin = { id: 7, role: 'admin' };
  const caixa = { id: 8, role: 'caixa' };

  beforeEach(() => {
    db = criarDb();
    service = createCaixaLancamentoService({ db });
  });

  it('bloqueia reduzir valor de pagamento de OS entregue e rollback preserva lancamento', async () => {
    inserirOrdem(db, { id: 1, status: 'Entregue', valortotal: 100 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 100 });

    await expect409(() => service.editar(id, patch({ ordemid: 1, valor: 90 }), admin));

    expect(row(db, id).valor).toBe(100);
    expect(row(db, id).ordemid).toBe(1);
  });

  it('bloqueia marcar pago=0 de OS entregue', async () => {
    inserirOrdem(db, { id: 1, status: 'Entregue', valortotal: 100 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 100 });

    await expect409(() => service.editar(id, patch({ ordemid: null, pago: 0, valor: 100 }), admin));

    expect(row(db, id).pago).toBe(1);
    expect(row(db, id).ordemid).toBe(1);
  });

  it('bloqueia desvincular pagamento de OS entregue', async () => {
    inserirOrdem(db, { id: 1, status: 'Entregue', valortotal: 100 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 100 });

    await expect409(() => service.editar(id, patch({ ordemid: null, pago: 1, valor: 100 }), admin));

    expect(row(db, id).ordemid).toBe(1);
  });

  it('bloqueia trocar pagamento para outra OS quando reabre saldo da anterior', async () => {
    inserirOrdem(db, { id: 1, status: 'Entregue', valortotal: 100 });
    inserirOrdem(db, { id: 2, status: 'Aguardando', valortotal: 200 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 100 });

    await expect409(() => service.editar(id, patch({ ordemid: 2, valor: 100 }), admin));

    expect(row(db, id).ordemid).toBe(1);
  });

  it('permite ajuste que mantem OS entregue quitada por outro lancamento compensador', () => {
    inserirOrdem(db, { id: 1, status: 'Entregue', valortotal: 100 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 80 });
    inserirLancamento(db, { ordemid: 1, valor: 30 });

    expect(service.editar(id, patch({ ordemid: 1, valor: 70 }), admin)).toEqual({ ok: true });

    expect(row(db, id).valor).toBe(70);
  });

  it('permite alterar saldo de OS nao entregue', () => {
    inserirOrdem(db, { id: 1, status: 'Pronto', valortotal: 100 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 100 });

    expect(service.editar(id, patch({ ordemid: 1, valor: 50 }), admin)).toEqual({ ok: true });

    expect(row(db, id).valor).toBe(50);
  });

  it('valida as duas OS quando vinculo muda e bloqueia se a nova OS entregue ficaria inconsistente', async () => {
    inserirOrdem(db, { id: 1, status: 'Aguardando', valortotal: 100 });
    inserirOrdem(db, { id: 2, status: 'Entregue', valortotal: 100 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 50 });

    await expect409(() => service.editar(id, patch({ ordemid: 2, valor: 50 }), admin));

    expect(row(db, id).ordemid).toBe(1);
  });

  it('recusa editar lancamento quando a OS antiga vinculada foi removida', () => {
    inserirOrdem(db, { id: 1, status: 'Aguardando', valortotal: 100 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 50 });
    db.prepare("UPDATE ordens SET deletedat='2026-06-24' WHERE id=1").run();

    expect(() => service.editar(id, patch({ ordemid: null, pago: 1, valor: 50 }), admin))
      .toThrow(expect.objectContaining({
        status: 404,
        code: 'os_nao_encontrada',
      }));
    expect(row(db, id).ordemid).toBe(1);
  });

  it('preserva regra entradaos para role nao admin e admin', () => {
    inserirOrdem(db, { id: 1, status: 'Aguardando', valortotal: 100 });
    const id = inserirLancamento(db, {
      ordemid: 1,
      valor: 30,
      origem: 'entradaos',
      data: '2026-06-20',
      pagamento: 'Pix',
    });

    expect(() => service.editar(id, patch({ data: '2026-06-21', pagamento: 'Dinheiro', valor: 99 }), caixa))
      .toThrow(/entrada vinculada/i);

    expect(service.editar(id, patch({ data: '2026-06-21', pagamento: 'Dinheiro', valor: 99 }), admin))
      .toEqual({ ok: true });
    expect(row(db, id)).toMatchObject({
      data: '2026-06-21',
      pagamento: 'Dinheiro',
      valor: 30,
      ordemid: 1,
      origem: 'entradaos',
    });
  });

  it('usa transacao: se update falhar apos validacao, nao deixa alteracao parcial', () => {
    inserirOrdem(db, { id: 1, status: 'Aguardando', valortotal: 100 });
    const id = inserirLancamento(db, { ordemid: 1, valor: 40, descricao: 'Antes' });
    db.exec(`
      CREATE TRIGGER falha_update_lancamento
      BEFORE UPDATE ON lancamentos
      WHEN NEW.valor = 50
      BEGIN
        SELECT RAISE(ABORT, 'falha_forcada_update');
      END;
    `);

    expect(() => service.editar(id, patch({ ordemid: 1, valor: 50, descricao: 'TRIGGER_FAIL' }), admin))
      .toThrow(/falha_forcada_update/);

    expect(row(db, id)).toMatchObject({
      descricao: 'Antes',
      valor: 40,
      ordemid: 1,
    });
  });
});
