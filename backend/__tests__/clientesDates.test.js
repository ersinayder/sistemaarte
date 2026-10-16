import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-clientes-dates';

const db = {
  getAll: vi.fn(() => []),
  getOne: vi.fn(() => null),
  run: vi.fn(() => ({ changes: 1 })),
  runInsert: vi.fn(() => 1),
  transaction: vi.fn((fn) => fn()),
};

const require = createRequire(import.meta.url);

require.cache[require.resolve('../database.js')] = {
  id: require.resolve('../database.js'),
  filename: require.resolve('../database.js'),
  loaded: true,
  exports: db,
};

const clientesModule = await import('../routes/clientes.js');
const clientesRouter = clientesModule.default || clientesModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function businessHandler(method, path) {
  const layer = clientesRouter.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

describe('clientes dates - overdue OS calculation with Brasilia timezone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const fn of Object.values(db)) fn.mockReset();
    db.getAll.mockReturnValue([]);
    db.getOne.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not mark OS with deadline of today as overdue after 21:00 BRT (when UTC is next day)', async () => {
    // 22:30 in Brasilia (UTC-3) on 2026-10-15 is 01:30 UTC on 2026-10-16
    const dateAtNight = new Date('2026-10-16T01:30:00.000Z');
    vi.setSystemTime(dateAtNight);

    db.getOne.mockReturnValueOnce({
      id: 1,
      name: 'Cliente Teste',
      phone: '11999999999',
    });

    db.getAll.mockReturnValueOnce([
      {
        id: 101,
        numero: 'OS-0101',
        status: 'Em Produção',
        servico: 'Moldura',
        valortotal: 150,
        createdat: '2026-10-10 10:00:00',
        prazoentrega: '2026-10-15',
      },
    ]);

    const handler = businessHandler('get', '/:id');
    const res = makeRes();
    const next = vi.fn();

    await handler(
      {
        params: { id: '1' },
        user: { id: 1, role: 'caixa', permissions: ['clientes.ver'] },
      },
      res,
      next
    );

    if (next.mock.calls.length) throw next.mock.calls[0][0];

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload._sumario.osEmAberto).toBe(1);
    expect(payload._sumario.osVencidas).toBe(0);
  });

  it('correctly marks OS as overdue when deadline is strictly before today in Brasilia', async () => {
    // 22:30 in Brasilia on 2026-10-15
    const dateAtNight = new Date('2026-10-16T01:30:00.000Z');
    vi.setSystemTime(dateAtNight);

    db.getOne.mockReturnValueOnce({
      id: 2,
      name: 'Cliente Teste 2',
      phone: '11999999999',
    });

    db.getAll.mockReturnValueOnce([
      {
        id: 102,
        numero: 'OS-0102',
        status: 'Aguardando',
        servico: 'Moldura',
        valortotal: 200,
        createdat: '2026-10-01 10:00:00',
        prazoentrega: '2026-10-14',
      },
    ]);

    const handler = businessHandler('get', '/:id');
    const res = makeRes();
    const next = vi.fn();

    await handler(
      {
        params: { id: '2' },
        user: { id: 1, role: 'caixa', permissions: ['clientes.ver'] },
      },
      res,
      next
    );

    if (next.mock.calls.length) throw next.mock.calls[0][0];

    const payload = res.json.mock.calls[0][0];
    expect(payload._sumario.osVencidas).toBe(1);
  });
});
