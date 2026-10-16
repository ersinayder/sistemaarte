import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-caixa-estorno';

const require = createRequire(import.meta.url);

let sqlite;
const db = {
  getAll: vi.fn((sql, params = []) => sqlite.prepare(sql).all(params)),
  getOne: vi.fn((sql, params = []) => sqlite.prepare(sql).get(params)),
  run: vi.fn((sql, params = []) => sqlite.prepare(sql).run(params)),
  runInsert: vi.fn((sql, params = []) => {
    const res = sqlite.prepare(sql).run(params);
    return res.lastInsertRowid;
  }),
  transaction: vi.fn((fn) => sqlite.transaction(fn)()),
  getDB: () => sqlite,
};

require.cache[require.resolve('../database.js')] = {
  id: require.resolve('../database.js'),
  filename: require.resolve('../database.js'),
  loaded: true,
  exports: db,
};

const caixaModule = await import('../routes/caixa.js');
const caixaRouter = caixaModule.default || caixaModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function businessHandler(method, path) {
  const layer = caixaRouter.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

describe('caixa DELETE /api/caixa/:id - estorno de conta a pagar', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    sqlite.exec(`
      CREATE TABLE ordens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        status TEXT,
        valortotal REAL DEFAULT 0,
        valorentrada REAL DEFAULT 0,
        deletedat TEXT DEFAULT NULL,
        updatedat TEXT
      );

      CREATE TABLE contas_pagar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor TEXT NOT NULL,
        descricao TEXT NOT NULL,
        categoria TEXT DEFAULT 'Outros',
        valor REAL NOT NULL DEFAULT 0,
        vencimento TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendente',
        pagamento TEXT,
        pagoem TEXT,
        datapagamento TEXT,
        lancamentoid INTEGER,
        updatedat TEXT,
        deletedat TEXT DEFAULT NULL
      );

      CREATE TABLE lancamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'Saída',
        categoria TEXT,
        descricao TEXT NOT NULL,
        pagamento TEXT NOT NULL,
        valor REAL NOT NULL,
        pago INTEGER DEFAULT 1,
        ordemid INTEGER,
        criadopor INTEGER,
        origem TEXT DEFAULT NULL,
        conta_pagar_id INTEGER,
        deletedat TEXT DEFAULT NULL,
        deletedpor INTEGER DEFAULT NULL,
        createdat TEXT DEFAULT (datetime('now','localtime'))
      );
    `);
  });

  it('reverts corresponding contas_pagar to status Pendente and clears datapagamento when deleting conta-pagar launch', async () => {
    // 1. Create a conta a pagar and mark it as Pago
    sqlite.prepare(`
      INSERT INTO contas_pagar (id, fornecedor, descricao, valor, vencimento, status, datapagamento, pagoem, lancamentoid)
      VALUES (42, 'Fornecedor Madeira', 'Madeira Moldura', 250.00, '2026-10-20', 'Pago', '2026-10-15', '2026-10-15', 10)
    `).run();

    // 2. Create the associated lancamento
    sqlite.prepare(`
      INSERT INTO lancamentos (id, data, tipo, categoria, descricao, pagamento, valor, pago, criadopor, origem, conta_pagar_id)
      VALUES (10, '2026-10-15', 'Saída', 'Insumos', 'Fornecedor Madeira - Madeira Moldura', 'Pix', 250.00, 1, 1, 'conta-pagar', 42)
    `).run();

    const handler = businessHandler('delete', '/:id');
    const res = makeRes();
    const next = vi.fn();

    await handler(
      {
        params: { id: '10' },
        user: { id: 99, role: 'admin', permissions: ['caixa.excluir_lancamento'] },
      },
      res,
      next
    );

    if (next.mock.calls.length) throw next.mock.calls[0][0];

    expect(res.json).toHaveBeenCalledWith({ ok: true });

    // Verify lancamento was soft-deleted
    const lancamento = sqlite.prepare('SELECT deletedat, deletedpor FROM lancamentos WHERE id = 10').get();
    expect(lancamento.deletedat).not.toBeNull();
    expect(lancamento.deletedpor).toBe(99);

    // Verify contas_pagar status was reverted to 'Pendente' and datapagamento cleared
    const conta = sqlite.prepare('SELECT status, datapagamento, pagoem, lancamentoid FROM contas_pagar WHERE id = 42').get();
    expect(conta.status).toBe('Pendente');
    expect(conta.datapagamento).toBeNull();
    expect(conta.pagoem).toBeNull();
    expect(conta.lancamentoid).toBeNull();
  });

  it('reverts legacy contas_pagar where lancamentos.conta_pagar_id is null via contas_pagar.lancamentoid fallback', async () => {
    // 1. Create a conta a pagar and mark it as Pago with lancamentoid=20
    sqlite.prepare(`
      INSERT INTO contas_pagar (id, fornecedor, descricao, valor, vencimento, status, datapagamento, pagoem, lancamentoid)
      VALUES (43, 'Fornecedor Vidro', 'Vidro Comum', 180.00, '2026-10-20', 'Pago', '2026-10-15', '2026-10-15', 20)
    `).run();

    // 2. Create the associated legacy lancamento (conta_pagar_id is NULL, origem is 'conta-pagar')
    sqlite.prepare(`
      INSERT INTO lancamentos (id, data, tipo, categoria, descricao, pagamento, valor, pago, criadopor, origem, conta_pagar_id)
      VALUES (20, '2026-10-15', 'Saída', 'Insumos', 'Fornecedor Vidro - Vidro Comum', 'Pix', 180.00, 1, 1, 'conta-pagar', NULL)
    `).run();

    const handler = businessHandler('delete', '/:id');
    const res = makeRes();
    const next = vi.fn();

    await handler(
      {
        params: { id: '20' },
        user: { id: 99, role: 'admin', permissions: ['caixa.excluir_lancamento'] },
      },
      res,
      next
    );

    if (next.mock.calls.length) throw next.mock.calls[0][0];

    expect(res.json).toHaveBeenCalledWith({ ok: true });

    // Verify lancamento was soft-deleted
    const lancamento = sqlite.prepare('SELECT deletedat, deletedpor FROM lancamentos WHERE id = 20').get();
    expect(lancamento.deletedat).not.toBeNull();
    expect(lancamento.deletedpor).toBe(99);

    // Verify contas_pagar status was reverted to 'Pendente', datapagamento cleared, pagoem cleared, lancamentoid cleared
    const conta = sqlite.prepare('SELECT status, datapagamento, pagoem, lancamentoid FROM contas_pagar WHERE id = 43').get();
    expect(conta.status).toBe('Pendente');
    expect(conta.datapagamento).toBeNull();
    expect(conta.pagoem).toBeNull();
    expect(conta.lancamentoid).toBeNull();
  });
});
