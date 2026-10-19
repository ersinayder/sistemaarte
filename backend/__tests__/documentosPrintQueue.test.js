import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-documentos-print-queue';

const db = {
  getOne: vi.fn(),
  getAll: vi.fn(),
  runInsert: vi.fn(),
  run: vi.fn(),
};

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

async function loadPropostaPrintHandler() {
  const mod = await import('../routes/propostas.js');
  const router = mod.default || mod;
  const layer = router.stack.find((entry) => entry.route?.path === '/:id/print' && entry.route?.methods?.post);
  return {
    layer,
    handler: layer?.route?.stack?.at(-1)?.handle,
    permission: layer?.route?.stack?.map((entry) => entry.handle?._permission).find(Boolean),
  };
}

async function loadCaixaFechamentoPrintHandler() {
  const mod = await import('../routes/caixa.js');
  const router = mod.default || mod;
  const layer = router.stack.find((entry) => entry.route?.path === '/fechamento/print' && entry.route?.methods?.post);
  return {
    layer,
    handler: layer?.route?.stack?.at(-1)?.handle,
    permission: layer?.route?.stack?.map((entry) => entry.handle?._permission).find(Boolean),
  };
}

describe('Documentos Print Queue (Propostas e Caixa)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Propostas POST /:id/print', () => {
    it('exige permissão propostas.imprimir', async () => {
      const { layer, permission } = await loadPropostaPrintHandler();
      expect(layer).toBeTruthy();
      expect(permission).toBe('propostas.imprimir');
    });

    it('enfileira proposta em print_queue quando o agente está online', async () => {
      getImpressaoConfig.mockReturnValue({
        agent_mode: 1,
        agent_last_seen: new Date().toISOString(),
      });
      db.getOne.mockImplementation((sql) => {
        if (sql.includes('FROM propostas')) {
          return { id: 7, numero: 'PROP-0007', clientenome: 'Cliente Teste' };
        }
        if (sql.includes('empresa_config')) {
          return { razaosocial: 'Arte & Molduras' };
        }
        return null;
      });
      db.getAll.mockReturnValue([
        { id: 1, nome: 'Quadro A3', quantidade: 2, preco_unitario: 50 },
      ]);
      db.runInsert.mockReturnValue(201);

      const { handler } = await loadPropostaPrintHandler();
      const res = makeRes();

      await handler({ params: { id: '7' }, body: { copies: 2 }, user: { id: 1, name: 'Admin' } }, res, vi.fn());

      expect(db.runInsert).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO print_queue'),
        expect.arrayContaining([7, 'Proposta-PROP-0007', expect.any(String), 2])
      );
      expect(notificarNovoJob).toHaveBeenCalledWith({
        id: 201,
        tipo: 'proposta',
        documento_nome: 'Proposta-PROP-0007',
      });
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        mode: 'queue',
        message: 'Proposta enviada para a impressora da loja.',
        jobId: 201,
        copies: 2,
      });
    });

    it('retorna fallback mode: browser quando o agente está offline', async () => {
      getImpressaoConfig.mockReturnValue({
        agent_mode: 1,
        agent_last_seen: '2020-01-01 00:00:00', // Bem no passado
      });
      db.getOne.mockReturnValue({ id: 7, numero: 'PROP-0007' });

      const { handler } = await loadPropostaPrintHandler();
      const res = makeRes();

      await handler({ params: { id: '7' }, body: { copies: 1 }, user: { id: 1 } }, res, vi.fn());

      expect(db.runInsert).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        mode: 'browser',
        message: 'Abra a impressao da Proposta PROP-0007 no navegador.',
        copies: 1,
        printUrl: '/api/propostas/7/pdf?embedded=1',
      });
    });

    it('retorna 404 quando proposta não é encontrada', async () => {
      db.getOne.mockReturnValue(null);

      const { handler } = await loadPropostaPrintHandler();
      const res = makeRes();

      await handler({ params: { id: '999' }, body: { copies: 1 }, user: { id: 1 } }, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Proposta nao encontrada' });
    });

    it('rejeita cópias inválidas', async () => {
      const { handler } = await loadPropostaPrintHandler();
      const res = makeRes();

      await handler({ params: { id: '7' }, body: { copies: 5 }, user: { id: 1 } }, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Informe 1 ou 2 vias para impressao.' });
    });
  });

  describe('Caixa POST /fechamento/print', () => {
    it('exige permissão caixa.fechamento', async () => {
      const { layer, permission } = await loadCaixaFechamentoPrintHandler();
      expect(layer).toBeTruthy();
      expect(permission).toBe('caixa.fechamento');
    });

    it('enfileira fechamento de caixa em print_queue quando o agente está online', async () => {
      getImpressaoConfig.mockReturnValue({
        agent_mode: 1,
        agent_last_seen: new Date().toISOString(),
      });
      db.getAll.mockReturnValue([
        { id: 10, tipo: 'Entrada', valor: 150, pagamento: 'Dinheiro', pago: 1 },
      ]);
      db.runInsert.mockReturnValue(301);

      const { handler } = await loadCaixaFechamentoPrintHandler();
      const res = makeRes();

      await handler(
        {
          query: { data: '2026-10-19' },
          body: {},
          user: { id: 1, name: 'Operador Caixa' },
        },
        res,
        vi.fn()
      );

      expect(db.runInsert).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO print_queue'),
        expect.arrayContaining(['Fechamento-Caixa-2026-10-19', expect.any(String)])
      );
      expect(notificarNovoJob).toHaveBeenCalledWith({
        id: 301,
        tipo: 'caixa',
        documento_nome: 'Fechamento-Caixa-2026-10-19',
      });
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        mode: 'queue',
        message: 'Fechamento enviado para a impressora da loja.',
        jobId: 301,
        copies: 1,
      });
    });

    it('retorna fallback mode: browser quando o agente está offline', async () => {
      getImpressaoConfig.mockReturnValue({
        agent_mode: 0,
      });
      db.getAll.mockReturnValue([]);

      const { handler } = await loadCaixaFechamentoPrintHandler();
      const res = makeRes();

      await handler(
        {
          query: { data: '2026-10-19' },
          body: {},
          user: { id: 1, name: 'Operador Caixa' },
        },
        res,
        vi.fn()
      );

      expect(db.runInsert).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        mode: 'browser',
        message: 'Abra a impressao do Fechamento de Caixa (2026-10-19) no navegador.',
        copies: 1,
        printUrl: '/api/caixa/fechamento?data=2026-10-19&embedded=1',
      });
    });
  });
});
