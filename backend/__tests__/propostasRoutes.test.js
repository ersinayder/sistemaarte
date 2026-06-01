import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-propostas-routes';

const db = {
  getAll: vi.fn(() => []),
  getOne: vi.fn(() => null),
  run: vi.fn(() => ({ changes: 1 })),
  runInsert: vi.fn(() => 123),
  transaction: vi.fn((fn) => fn()),
};

const require = createRequire(import.meta.url);

require.cache[require.resolve('../database.js')] = {
  id: require.resolve('../database.js'),
  filename: require.resolve('../database.js'),
  loaded: true,
  exports: db,
};

const propostasModule = await import('../routes/propostas.js');
const propostasRouter = propostasModule.default || propostasModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function businessHandler(method, path) {
  const layer = propostasRouter.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

describe('propostas routes', () => {
  beforeEach(() => {
    for (const fn of Object.values(db)) fn.mockReset();
    db.getAll.mockReturnValue([]);
    db.getOne.mockReturnValue(null);
    db.run.mockReturnValue({ changes: 1 });
    db.runInsert.mockReturnValue(123);
    db.transaction.mockImplementation((fn) => fn());
  });

  it('rejects POST totals that differ from normalized item totals', async () => {
    const handler = businessHandler('post', '/');
    const res = makeRes();
    const next = vi.fn();

    await handler({
      body: {
        clientenome: 'Cliente',
        valortotal: 999,
        produtos: [{ nome: 'Item customizado', quantidade: 2, preco_unitario: 25 }],
      },
      user: { id: 7, role: 'caixa' },
    }, res, next);

    if (next.mock.calls.length) throw next.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Total/);
    expect(db.runInsert).not.toHaveBeenCalled();
  });

  it('calculates POST total from items and persists validated prazo', async () => {
    db.getOne
      .mockReturnValueOnce({ ultimo: 9 })
      .mockReturnValueOnce({
        id: 123,
        numero: 'PROP-0009',
        clientenome: 'Cliente',
        valortotal: 70,
        prazoentrega: '2026-05-25',
      });
    db.getAll.mockReturnValueOnce([
      { nome: 'Linha avulsa', quantidade: 2, preco_unitario: 35, avulso: 1 },
    ]);

    const handler = businessHandler('post', '/');
    const res = makeRes();
    const next = vi.fn();

    await handler({
      body: {
        clientenome: 'Cliente',
        prazoentrega: '2026-05-25',
        produtos: [{ nome: 'Linha avulsa', quantidade: 2, preco_unitario: 35 }],
      },
      user: { id: 7, role: 'caixa' },
    }, res, next);

    if (next.mock.calls.length) throw next.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(201);
    expect(db.runInsert.mock.calls[0][1]).toEqual(expect.arrayContaining([
      'PROP-0009',
      'Cliente',
      70,
      '2026-05-25',
      7,
    ]));
  });

  it('accepts flexible proposal deadlines as commercial text', async () => {
    db.getOne
      .mockReturnValueOnce({ ultimo: 9 })
      .mockReturnValueOnce({
        id: 123,
        numero: 'PROP-0009',
        clientenome: 'Cliente',
        valortotal: 10,
        prazoentrega: '25/05/2026',
      });
    db.getAll.mockReturnValueOnce([
      { nome: 'Item', quantidade: 1, preco_unitario: 10, avulso: 1 },
    ]);

    const handler = businessHandler('post', '/');
    const res = makeRes();

    await handler({
      body: {
        clientenome: 'Cliente',
        prazoentrega: '25/05/2026',
        produtos: [{ nome: 'Item', quantidade: 1, preco_unitario: 10 }],
      },
      user: { id: 7, role: 'caixa' },
    }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(db.runInsert.mock.calls[0][1]).toEqual(expect.arrayContaining(['25/05/2026']));
  });

  it('uses an atomic proposta update when generating OS to harden duplicate conversion', async () => {
    db.runInsert.mockReturnValueOnce(555).mockReturnValueOnce(777);
    db.getOne
      .mockReturnValueOnce({
        id: 12,
        numero: 'PROP-0012',
        clientenome: 'Cliente',
        status: 'Aprovado',
        valortotal: 90,
        prazoentrega: '10 dias uteis',
        observacoes: 'Produzir apos sinal',
        ordemid: null,
      })
      .mockReturnValueOnce({ ultimo: 44 })
      .mockReturnValueOnce({ id: 555, numero: 'OS-0044' });
    db.getAll.mockReturnValueOnce([
      { nome: 'Item customizado', quantidade: 3, preco_unitario: 30, avulso: 1 },
    ]);

    const handler = businessHandler('post', '/:id/gerar-os');
    const res = makeRes();
    const next = vi.fn();

    await handler({
      params: { id: '12' },
      body: {},
      user: { id: 7, role: 'caixa' },
    }, res, next);

    if (next.mock.calls.length) throw next.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(201);
    const ordemInsert = db.runInsert.mock.calls.find(([sql]) => sql.includes('INSERT INTO ordens'));
    expect(ordemInsert[1][9]).toBeNull();
    expect(ordemInsert[1][12]).toContain('Produzir apos sinal');
    expect(ordemInsert[1][12]).toContain('Prazo previsto na proposta: 10 dias uteis');
    expect(db.run).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE propostas SET ordemid=\?, updatedat=datetime\('now','localtime'\) WHERE id=\? AND ordemid IS NULL/),
      [555, 12],
    );
  });
});
