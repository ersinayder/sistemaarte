import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-ordem-print-route';
process.env.ORDEM_PRINTER_NAME = '\\\\ARTESERVER\\Impressoraloja';

const db = {
  getOne: vi.fn(),
  getAll: vi.fn(),
};

const resumoFinanceiro = vi.fn();
const renderOrdemServicoHtml = vi.fn();
const printHtml = vi.fn();
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

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
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
    printHtml.mockImplementation(({ copies }) => Promise.resolve({
      ok: true,
      printerName: '\\\\ARTESERVER\\Impressoraloja',
      copies,
    }));
  });

  it('exposes direct OS printing only to admin and caixa', async () => {
    const { layer, roles } = await loadPrintHandler();

    expect(layer).toBeTruthy();
    expect(roles).toEqual(['admin', 'caixa']);
  });

  it('prints the requested service order with one or two copies on the server printer', async () => {
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
    });
    expect(printHtml).toHaveBeenCalledWith({
      html: '<html>OS-0042</html>',
      jobName: 'ordem-OS-0042',
      copies: 2,
    });
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      message: 'OS OS-0042 enviada para impressao.',
      copies: 2,
      printerName: '\\\\ARTESERVER\\Impressoraloja',
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
});
