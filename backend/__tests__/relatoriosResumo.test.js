import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-relatorios-routes';

let sqlite;
const dbMock = {
  getOne: (sql, p = []) => sqlite.prepare(sql).get(...(Array.isArray(p) ? p : [p])),
  getAll: (sql, p = []) => sqlite.prepare(sql).all(...(Array.isArray(p) ? p : [p])),
  run: (sql, p = []) => sqlite.prepare(sql).run(...(Array.isArray(p) ? p : [p])),
  runInsert: (sql, p = []) => sqlite.prepare(sql).run(...(Array.isArray(p) ? p : [p])).lastInsertRowid,
  transaction: (fn) => sqlite.transaction(fn)(),
  getDB: () => sqlite,
};

const require = createRequire(import.meta.url);
const dbModulePath = require.resolve('../database.js');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: dbMock,
};

const relatoriosModule = await import('../routes/relatorios.js');
const relatoriosRouter = relatoriosModule.default || relatoriosModule;
const financeiroModule = await import('../routes/financeiro.js');
const financeiroRouter = financeiroModule.default || financeiroModule;

function makeRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

function getResumoHandler() {
  const layer = relatoriosRouter.stack.find(
    (entry) => entry.route?.path === '/resumo' && entry.route?.methods?.get
  );
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

function getFinanceiroResumoHandler() {
  const layer = financeiroRouter.stack.find(
    (entry) => entry.route?.path === '/resumo' && entry.route?.methods?.get
  );
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

describe('relatorios resumo route', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE ordens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        status TEXT DEFAULT 'Aguardando',
        deletedat TEXT DEFAULT NULL,
        prazoentrega TEXT DEFAULT NULL
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
        deletedat TEXT DEFAULT NULL
      );

      CREATE TABLE contas_pagar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        valor REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Pendente',
        vencimento TEXT NOT NULL,
        pagoem TEXT,
        categoria TEXT,
        deletedat TEXT DEFAULT NULL
      );
    `);
  });

  it('subtrai saidas lancadas no caixa em vez de soma-las no total do mes', async () => {
    const handler = getResumoHandler();
    expect(handler).toBeDefined();

    // 2 Entradas: 200 + 100 = 300
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
      VALUES ('2026-06-10', 'Entrada', 'Pagamento OS', 'Entrada OS 1', 'Pix', 200, 1)
    `).run();
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
      VALUES ('2026-06-11', 'Entrada', 'Venda avulsa', 'Entrada Venda', 'Cartao de Credito', 100, 1)
    `).run();

    // 1 Saida com acento: 50
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
      VALUES ('2026-06-12', 'Saída', 'Material', 'Compra de vidro', 'Dinheiro', 50, 1)
    `).run();

    // 1 Saida sem acento (legado): 20
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
      VALUES ('2026-06-13', 'Saida', 'Despesa fixa', 'Motoboy', 'Pix', 20, 1)
    `).run();

    const req = { query: { mes: '2026-06' } };
    const res = makeRes();
    const next = (err) => { if (err) throw err; };

    await handler(req, res, next);

    expect(res.body).toBeDefined();
    // Entradas: 300, Saidas: 70 -> Total = 230 (NÃO 370!)
    expect(res.body.entradas).toBe(300);
    expect(res.body.saidas).toBe(70);
    expect(res.body.total).toBe(230);

    // porpagamento deve conter apenas entradas (recebimentos reais)
    expect(res.body.porpagamento.Pix).toBe(200); // Não deve somar nem deduzir os 20 de saída em Pix
    expect(res.body.porpagamento.Credito).toBe(100);

    // dias deve refletir o total liquido de cada dia
    const dia12 = res.body.dias.find((d) => d.data === '2026-06-12');
    expect(dia12).toBeDefined();
    expect(dia12.total).toBe(-50);
    expect(dia12.saidas).toBe(50);
  });

  it('ignora lancamentos deletados ou de ordens excluidas', async () => {
    const handler = getResumoHandler();

    sqlite.prepare(`
      INSERT INTO ordens (id, numero, deletedat) VALUES (1, 'OS-0001', '2026-06-05 10:00:00')
    `).run();

    // Lancamento valido: Entrada 150
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
      VALUES ('2026-06-01', 'Entrada', 'Pagamento OS', 'Valido', 'Pix', 150, 1)
    `).run();

    // Lancamento com deletedat (deve ser ignorado)
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago, deletedat)
      VALUES ('2026-06-02', 'Saída', 'Material', 'Cancelado', 'Pix', 50, 1, '2026-06-02 11:00:00')
    `).run();

    // Lancamento vinculado a ordem excluida (deve ser ignorado)
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago, ordemid)
      VALUES ('2026-06-03', 'Entrada', 'Pagamento OS', 'OS Deletada', 'Pix', 200, 1, 1)
    `).run();

    const req = { query: { mes: '2026-06' } };
    const res = makeRes();
    const next = (err) => { if (err) throw err; };

    await handler(req, res, next);

    expect(res.body.entradas).toBe(150);
    expect(res.body.saidas).toBe(0);
    expect(res.body.total).toBe(150);
  });

  it('considera saidas lancadas no caixa no resumo financeiro admin mesmo sem acento ou com pago null', async () => {
    const handler = getFinanceiroResumoHandler();
    expect(handler).toBeDefined();

    // Entrada: 1000
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
      VALUES ('2026-06-05', 'Entrada', 'Pagamento OS', 'Venda', 'Pix', 1000, 1)
    `).run();

    // Saida lancada no caixa sem acento e pago=1: 300
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
      VALUES ('2026-06-06', 'Saida', 'Material', 'Compra madeira', 'Dinheiro', 300, 1)
    `).run();

    // Saida com acento e pago NULL: 100
    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
      VALUES ('2026-06-07', 'Saída', 'Despesa fixa', 'Luz', 'Pix', 100, NULL)
    `).run();

    const req = { query: { mes: '2026-06' } };
    const res = makeRes();
    const next = (err) => { if (err) throw err; };

    await handler(req, res, next);

    expect(res.body).toBeDefined();
    expect(res.body.receitaRealizada).toBe(1000);
    expect(res.body.despesasPagas).toBe(400); // 300 + 100
    expect(res.body.saldoRealizado).toBe(600); // 1000 - 400
  });
});
