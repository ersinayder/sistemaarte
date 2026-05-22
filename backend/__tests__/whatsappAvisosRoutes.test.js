import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-whatsapp-avisos';

const db = {
  getAll: vi.fn(() => []),
  getOne: vi.fn(() => null),
  run: vi.fn(() => ({ changes: 1 })),
  runInsert: vi.fn(() => 123),
  transaction: vi.fn((fn) => fn()),
};

const require = createRequire(import.meta.url);
const whatsappMock = {
  sendWhatsApp: vi.fn(() => Promise.resolve()),
  sendWhatsAppConfirmacao: vi.fn(() => Promise.resolve()),
};

require.cache[require.resolve('../database.js')] = {
  id: require.resolve('../database.js'),
  filename: require.resolve('../database.js'),
  loaded: true,
  exports: db,
};
require.cache[require.resolve('../utils/whatsapp.js')] = {
  id: require.resolve('../utils/whatsapp.js'),
  filename: require.resolve('../utils/whatsapp.js'),
  loaded: true,
  exports: whatsappMock,
};

const ordensModule = await import('../routes/ordens.js');
const ordensRouter = ordensModule.default || ordensModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function businessHandler(method, path) {
  const layer = ordensRouter.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

const ordem = {
  id: 77,
  numero: 'OS-0077',
  clientenome: 'Cliente Real',
  clientetelefone: '(31) 99999-0000',
  servico: 'Quadro',
  status: 'Pronto',
  valortotal: 900,
  valorentrada: 100,
  saldoaberto: 800,
  deletedat: null,
};

describe('whatsapp avisos routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getOne.mockReturnValue(null);
    db.getAll.mockReturnValue([]);
    db.run.mockReturnValue({ changes: 1 });
    db.runInsert.mockReturnValue(123);
  });

  it('opens a ready notice using backend order data and ignores malicious body values', async () => {
    db.getOne
      .mockReturnValueOnce(ordem)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ id: 456, ordemid: 77, tipo: 'pedido_pronto', status: 'aberto' });

    const handler = businessHandler('post', '/:id/whatsapp-avisos/:tipo/abrir');
    const res = makeRes();
    const next = vi.fn();

    await handler({
      params: { id: '77', tipo: 'pedido_pronto' },
      user: { id: 9, role: 'oficina' },
      body: {
        telefone: '5511999999999',
        mensagem: 'mensagem atacada',
        status: 'enviado',
      },
    }, res, next);

    if (next.mock.calls.length) throw next.mock.calls[0][0];
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.whatsapp.phone).toBe('5531999990000');
    expect(payload.whatsapp.text).toContain('Cliente Real');
    expect(payload.whatsapp.text).not.toContain('mensagem atacada');
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('telefone_snapshot'), expect.arrayContaining([
      77,
      'pedido_pronto',
      '5531999990000',
      expect.stringContaining('Cliente Real'),
      9,
    ]));
  });

  it('does not expose financial fields or forbidden confirmation notices in oficina list responses', async () => {
    db.getAll
      .mockReturnValueOnce([{ ...ordem, status: 'Aguardando' }])
      .mockReturnValueOnce([{ id: 456, ordemid: 77, tipo: 'confirmacao_pedido', status: 'pendente' }]);

    const handler = businessHandler('get', '/');
    const res = makeRes();
    const next = vi.fn();

    await handler({
      query: {},
      user: { id: 9, role: 'oficina' },
    }, res, next);

    if (next.mock.calls.length) throw next.mock.calls[0][0];
    expect(res.json).toHaveBeenCalled();

    const [payload] = res.json.mock.calls[0];
    expect(payload).toHaveLength(1);
    expect(payload[0].valortotal).toBeUndefined();
    expect(payload[0].valorentrada).toBeUndefined();
    expect(payload[0].saldoaberto).toBeUndefined();
    expect(payload[0].pagamento).toBeUndefined();
    expect(payload[0].whatsappAvisos.confirmacao_pedido).toBeNull();
    expect(payload[0].whatsappAvisoPrincipal).toBeNull();
  });

  it('forbids oficina from opening financial confirmation notices', async () => {
    db.getOne.mockReturnValueOnce({ ...ordem, status: 'Aguardando' });

    const handler = businessHandler('post', '/:id/whatsapp-avisos/:tipo/abrir');
    const res = makeRes();

    await handler({
      params: { id: '77', tipo: 'confirmacao_pedido' },
      user: { id: 9, role: 'oficina' },
      body: {},
    }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Aviso nao permitido para este usuario.' });
  });

  it('rejects invalid notice types and invalid final-state transitions', async () => {
    const openHandler = businessHandler('post', '/:id/whatsapp-avisos/:tipo/abrir');
    const openRes = makeRes();
    await openHandler({
      params: { id: '77', tipo: 'http://evil.test' },
      user: { id: 2, role: 'admin' },
      body: {},
    }, openRes, vi.fn());
    expect(openRes.status).toHaveBeenCalledWith(400);

    db.getOne
      .mockReturnValueOnce(ordem)
      .mockReturnValueOnce({ id: 456, ordemid: 77, tipo: 'pedido_pronto', status: 'enviado' });
    const patchHandler = businessHandler('patch', '/:id/whatsapp-avisos/:tipo/status');
    const patchRes = makeRes();
    const next = vi.fn();
    await patchHandler({
      params: { id: '77', tipo: 'pedido_pronto' },
      user: { id: 2, role: 'admin' },
      body: { status: 'ignorado' },
    }, patchRes, next);
    if (next.mock.calls.length) throw next.mock.calls[0][0];
    expect(next).not.toHaveBeenCalled();
    expect(patchRes.status).toHaveBeenCalledWith(409);
  });
});
