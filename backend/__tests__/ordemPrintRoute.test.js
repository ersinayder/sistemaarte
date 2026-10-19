import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-ordem-print-route';
process.env.ORDEM_PRINTER_NAME = '\\\\ARTESERVER\\Impressoraloja';

const db = {
  getOne: vi.fn(),
  getAll: vi.fn(),
  runInsert: vi.fn(),
  run: vi.fn(),
};

const resumoFinanceiro = vi.fn();
const renderOrdemServicoHtml = vi.fn();
const printHtml = vi.fn();
const getImpressaoConfig = vi.fn();
const notificarNovoJob = vi.fn();
const normalizePrintCopies = (value = 1) => {
  const copies = Number(value ?? 1);
  if (!Number.isInteger(copies) || ![1, 2].includes(copies)) {
    throw new Error('Informe 1 ou 2 vias para impressao.');
  }
  return copies;
};

const require = createRequire(import.meta.url);

require.cache[require.resolve('../database.js')] = {
  id: require.resolve('../database.js'),
  filename: require.resolve('../database.js'),
  loaded: true,
  exports: db,
};
require.cache[require.resolve('../routes/impressaoAgente.js')] = {
  id: require.resolve('../routes/impressaoAgente.js'),
  filename: require.resolve('../routes/impressaoAgente.js'),
  loaded: true,
  exports: { notificarNovoJob },
};
require.cache[require.resolve('../domain/financeiroRules.js')] = {
  id: require.resolve('../domain/financeiroRules.js'),
  filename: require.resolve('../domain/financeiroRules.js'),
  loaded: true,
  exports: { getResumoFinanceiroOS: resumoFinanceiro },
};
require.cache[require.resolve('../utils/print/ordemServico.js')] = {
  id: require.resolve('../utils/print/ordemServico.js'),
  filename: require.resolve('../utils/print/ordemServico.js'),
  loaded: true,
  exports: { renderOrdemServicoHtml },
};
require.cache[require.resolve('../utils/print/serverPrinter.js')] = {
  id: require.resolve('../utils/print/serverPrinter.js'),
  filename: require.resolve('../utils/print/serverPrinter.js'),
  loaded: true,
  exports: { normalizePrintCopies, printHtml },
};
require.cache[require.resolve('../utils/impressaoConfig.js')] = {
  id: require.resolve('../utils/impressaoConfig.js'),
  filename: require.resolve('../utils/impressaoConfig.js'),
  loaded: true,
  exports: { getImpressaoConfig },
};

function makeRes() {
  const res = {
    headers: {},
  };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn((key, val) => {
    res.headers[key.toLowerCase()] = val;
    return res;
  });
  res.send = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

async function loadPrintHandler() {
  const mod = await import('../routes/pdf.js');
  const router = mod.default || mod;
  const layer = router.stack.find((entry) => entry.route?.path === '/:id/print' && entry.route?.methods?.post);
  return {
    layer,
    handler: layer?.route?.stack?.at(-1)?.handle,
    roles: layer?.route?.stack?.map((entry) => entry.handle?._roles).find(Array.isArray),
    permission: layer?.route?.stack?.map((entry) => entry.handle?._permission).find(Boolean),
  };
}

async function loadPdfHandler() {
  const mod = await import('../routes/pdf.js');
  const router = mod.default || mod;
  const layer = router.stack.find((entry) => entry.route?.path === '/:id/pdf' && entry.route?.methods?.get);
  return {
    layer,
    handler: layer?.route?.stack?.at(-1)?.handle,
    roles: layer?.route?.stack?.map((entry) => entry.handle?._roles).find(Array.isArray),
    permission: layer?.route?.stack?.map((entry) => entry.handle?._permission).find(Boolean),
  };
}

describe('ordem service order server printing route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getOne.mockReturnValue({
      id: 42,
      numero: 'OS-0042',
      deletedat: null,
    });
    db.getAll.mockReturnValue([]);
    resumoFinanceiro.mockReturnValue({ total: 100, recebido: 0, saldo: 100 });
    renderOrdemServicoHtml.mockReturnValue('<html>OS-0042</html>');
    getImpressaoConfig.mockReturnValue({ directPrintEnabled: true, printerName: 'Impressoraloja', printerIp: '192.168.0.45' });
    printHtml.mockImplementation(({ copies }) => Promise.resolve({
      ok: true,
      printerName: '\\\\192.168.0.45\\Impressoraloja',
      copies,
    }));
  });

  it('exposes direct OS printing only to users with print permission', async () => {
    const { layer, permission } = await loadPrintHandler();

    expect(layer).toBeTruthy();
    expect(permission).toBe('ordens.imprimir');
  });

  it('enqueues print job into print_queue and notifies agent when agent is online', async () => {
    getImpressaoConfig.mockReturnValue({
      agent_mode: 1,
      agent_last_seen: new Date().toISOString(),
    });
    db.runInsert.mockReturnValue(101);

    const { handler } = await loadPrintHandler();
    const res = makeRes();

    await handler({ params: { id: '42' }, body: { copies: 2 } }, res);

    expect(renderOrdemServicoHtml).toHaveBeenCalledWith(
      expect.objectContaining({ autoPrint: false })
    );
    expect(db.runInsert).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO print_queue'),
      [42, 'OS-OS-0042', '<html>OS-0042</html>', 2]
    );
    expect(notificarNovoJob).toHaveBeenCalledWith({
      id: 101,
      tipo: 'ordem',
      documento_nome: 'OS-OS-0042',
    });
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      mode: 'queue',
      message: 'OS OS-0042 enviada para a impressora da loja.',
      jobId: 101,
      copies: 2,
    });
  });

  it('prints the requested service order with one or two copies on the server printer when directPrintEnabled', async () => {
    getImpressaoConfig.mockReturnValue({
      directPrintEnabled: true,
      printerName: 'Impressoraloja',
      printerIp: '192.168.0.45',
      agent_mode: 0,
    });
    const { handler } = await loadPrintHandler();
    const res = makeRes();
    db.getAll
      .mockReturnValueOnce([{ nome: 'Moldura', quantidade: 1, preco_unitario: 100 }])
      .mockReturnValueOnce([]);

    await handler({ params: { id: '42' }, body: { copies: 2 } }, res);

    expect(renderOrdemServicoHtml).toHaveBeenCalledWith({
      ordem: expect.objectContaining({ numero: 'OS-0042' }),
      itens: [{ nome: 'Moldura', quantidade: 1, preco_unitario: 100 }],
      logs: [],
      resumo: { total: 100, recebido: 0, saldo: 100 },
      autoPrint: true,
    });
    expect(printHtml).toHaveBeenCalledWith({
      html: '<html>OS-0042</html>',
      jobName: 'ordem-OS-0042',
      copies: 2,
      printerConfig: { directPrintEnabled: true, printerName: 'Impressoraloja', printerIp: '192.168.0.45', agent_mode: 0 },
      settleMs: 6000,
    });
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      mode: 'server',
      message: 'OS OS-0042 enviada para impressao.',
      copies: 2,
      printerName: '\\\\192.168.0.45\\Impressoraloja',
    });
  });

  it('returns an in-page browser print target when direct server printing is disabled', async () => {
    getImpressaoConfig.mockReturnValue({
      directPrintEnabled: false,
      status: { status: 'OK', missing: [] },
    });
    const { handler } = await loadPrintHandler();
    const res = makeRes();

    await handler({ params: { id: '42' }, body: { copies: 2 } }, res);

    expect(printHtml).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      mode: 'browser',
      message: 'Abra a impressao da OS OS-0042 no navegador.',
      copies: 2,
      printUrl: '/api/ordens/42/pdf?embedded=1',
    });
  });

  it('rejects copy counts other than one or two', async () => {
    const { handler } = await loadPrintHandler();
    const res = makeRes();

    await handler({ params: { id: '42' }, body: { copies: 3 } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Informe 1 ou 2 vias para impressao.' });
    expect(printHtml).not.toHaveBeenCalled();
  });

  it('returns 404 when the service order does not exist', async () => {
    db.getOne.mockReturnValue(null);
    const { handler } = await loadPrintHandler();
    const res = makeRes();

    await handler({ params: { id: '999' }, body: { copies: 1 } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'OS nao encontrada' });
    expect(printHtml).not.toHaveBeenCalled();
  });

  it('define CSP com frame-ancestors self para permitir impressao via iframe mesma origem', async () => {
    const { handler } = await loadPdfHandler();
    const res = makeRes();

    await handler({ params: { id: '42' }, query: { embedded: '1' } }, res);

    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(res.headers['content-security-policy']).not.toContain("frame-ancestors 'none'");
  });
});
