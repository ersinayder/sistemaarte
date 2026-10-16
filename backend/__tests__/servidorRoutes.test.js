import { describe, expect, it, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const deployTriggerPath = path.resolve(__dirname, '..', '.deploy-trigger');

function cleanupDeployTrigger() {
  if (fs.existsSync(deployTriggerPath)) {
    try {
      fs.unlinkSync(deployTriggerPath);
    } catch (_) {}
  }
}

process.env.JWT_SECRET = 'test-secret-servidor-routes';

const dbMock = {
  getDB: () => ({
    prepare: (sql) => ({
      get: () => {
        if (sql.includes('integrity_check')) return { integrity_check: 'ok' };
        return { total: 10 };
      },
    }),
  }),
  getOne: vi.fn(),
  getAll: vi.fn(),
};

const require = createRequire(import.meta.url);
require.cache[require.resolve('../database.js')] = {
  id: require.resolve('../database.js'),
  filename: require.resolve('../database.js'),
  loaded: true,
  exports: dbMock,
};

const servidorModule = await import('../routes/servidor.js');
const router = servidorModule.default || servidorModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function getRouteStack(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  return layer?.route?.stack || [];
}

describe('servidor routes', () => {
  beforeEach(() => {
    cleanupDeployTrigger();
  });

  afterEach(() => {
    cleanupDeployTrigger();
  });

  afterAll(() => {
    cleanupDeployTrigger();
  });

  it('bloqueia acesso para usuarios sem permissao (ex: caixa)', () => {
    const stack = getRouteStack('get', '/status');
    // stack contains: [authMiddleware, guardServidor, businessHandler]
    const guard = stack[1].handle;

    const req = { user: { id: 2, role: 'caixa', permissions: ['caixa.ver'] } };
    const res = makeRes();
    const next = vi.fn();

    guard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/Sem permissao/) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('permite acesso para usuario com permissao configuracoes.ver ou servidor.ver', () => {
    const stack = getRouteStack('get', '/status');
    const guard = stack[1].handle;

    const req = { user: { id: 1, role: 'admin', permissions: ['configuracoes.ver'] } };
    const res = makeRes();
    const next = vi.fn();

    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('GET /status retorna métricas de sistema, banco, backups e fiscal', () => {
    const stack = getRouteStack('get', '/status');
    const handler = stack[stack.length - 1].handle;

    const req = { user: { id: 1, role: 'admin' } };
    const res = makeRes();
    const next = vi.fn();

    handler(req, res, next);

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.system).toBeDefined();
    expect(payload.system.ram).toBeDefined();
    expect(payload.system.disk).toBeDefined();
    expect(payload.database).toBeDefined();
    expect(payload.database.integridade).toBe('ok');
    expect(payload.backups).toBeDefined();
    expect(payload.fiscal).toBeDefined();
    expect(Array.isArray(payload.alertas)).toBe(true);
  });

  it('GET /logs retorna linhas e metadados do arquivo de log', () => {
    const stack = getRouteStack('get', '/logs');
    const handler = stack[stack.length - 1].handle;

    const req = { user: { id: 1, role: 'admin' }, query: { tipo: 'error', lines: '50' } };
    const res = makeRes();
    const next = vi.fn();

    handler(req, res, next);

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.tipo).toBe('error');
    expect(Array.isArray(payload.linhas)).toBe(true);
    expect(payload.arquivo).toBeDefined();
  });

  it('POST /restart dispara o gatilho de reinício com sucesso', () => {
    const stack = getRouteStack('post', '/restart');
    const handler = stack[stack.length - 1].handle;

    const req = { user: { id: 1, role: 'admin' } };
    const res = makeRes();
    const next = vi.fn();

    try {
      handler(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.ok).toBe(true);
      expect(payload.message).toMatch(/Gatilho de reinício acionado/);
    } finally {
      cleanupDeployTrigger();
    }
  });

  describe('serverStats utils', () => {
    it('retorna métricas de CPU com cores e loadFormatted', async () => {
      const { getCpuMetrics } = await import('../utils/serverStats.js');
      const cpu = getCpuMetrics();
      expect(cpu).toBeDefined();
      expect(typeof cpu.cores).toBe('number');
      expect(typeof cpu.load1).toBe('number');
      expect(typeof cpu.loadFormatted).toBe('string');
    });

    it('retorna métricas de RAM com total, free e percentUsed válidos', async () => {
      const { getRamMetrics } = await import('../utils/serverStats.js');
      const ram = getRamMetrics();
      expect(ram).toBeDefined();
      expect(typeof ram.totalBytes).toBe('number');
      expect(typeof ram.freeBytes).toBe('number');
      expect(typeof ram.percentUsed).toBe('number');
      expect(ram.percentUsed).toBeGreaterThanOrEqual(0);
      expect(ram.percentUsed).toBeLessThanOrEqual(100);
    });

    it('retorna métricas de disco sem falha', async () => {
      const { getDiskMetrics } = await import('../utils/serverStats.js');
      const disk = getDiskMetrics();
      expect(disk).toBeDefined();
      expect(typeof disk.drive).toBe('string');
      expect(typeof disk.percentUsed).toBe('number');
      expect(typeof disk.percentFree).toBe('number');
      expect(disk.percentUsed + disk.percentFree).toBe(100);
    });
  });
});
