import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

process.env.JWT_SECRET = 'test-route-contracts';

const db = {
  getAll: vi.fn(() => []),
  getOne: vi.fn(() => null),
  run: vi.fn(() => ({ changes: 1 })),
  runInsert: vi.fn(() => 123),
  transaction: vi.fn((fn) => fn()),
  getDB: vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(() => ({ changes: 1 })),
    })),
  })),
};

vi.mock('../database.js', () => db);
vi.mock('../database', () => db);
vi.mock('../utils/whatsapp.js', () => ({
  sendWhatsApp: vi.fn(() => Promise.resolve()),
  sendWhatsAppConfirmacao: vi.fn(() => Promise.resolve()),
}));
vi.mock('../utils/nfe.js', () => ({
  getNFEWizard: vi.fn(),
  callSEFAZ: vi.fn(),
  resetNFEWizard: vi.fn(),
}));

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function loadRouter(path) {
  const mod = await import(path);
  return mod.default || mod;
}

function routeLayer(router, method, path) {
  return router.stack.find((layer) =>
    layer.route?.path === path && layer.route?.methods?.[method]
  );
}

function businessHandler(router, method, path) {
  const layer = routeLayer(router, method, path);
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

function routeRoles(router, method, path) {
  const layer = routeLayer(router, method, path);
  return (layer?.route?.stack || [])
    .map((entry) => entry.handle?._roles)
    .find((roles) => Array.isArray(roles));
}

describe('route authorization contracts', () => {
  it('restricts fiscal write routes to admin and caixa', async () => {
    const nfeRouter = await loadRouter('../routes/nfe.js');

    expect(routeRoles(nfeRouter, 'post', '/emitir/:id')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'post', '/:chave/cce')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'post', '/:chave/cancelar')).toEqual(['admin', 'caixa']);
  });

  it('restricts sensitive read routes away from oficina', async () => {
    const caixaRouter = await loadRouter('../routes/caixa.js');
    const relatoriosRouter = await loadRouter('../routes/relatorios.js');
    const clientesRouter = await loadRouter('../routes/clientes.js');
    const produtosRouter = await loadRouter('../routes/produtos.js');

    expect(routeRoles(caixaRouter, 'get', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(relatoriosRouter, 'get', '/resumo')).toEqual(['admin', 'caixa']);
    expect(routeRoles(clientesRouter, 'get', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(clientesRouter, 'get', '/:id')).toEqual(['admin', 'caixa']);
    expect(routeRoles(clientesRouter, 'get', '/:id/ordens')).toEqual(['admin', 'caixa']);
    expect(routeRoles(produtosRouter, 'get', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(produtosRouter, 'get', '/:id')).toEqual(['admin', 'caixa']);
  });
});

describe('route persistence contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getOne.mockReturnValue(null);
    db.getAll.mockReturnValue([]);
    db.run.mockReturnValue({ changes: 1 });
    db.runInsert.mockReturnValue(123);
  });

  it('persists product fiscal fields sent by the frontend', () => {
    const source = fs.readFileSync(new URL('../routes/produtos.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const\s*\{[^}]*ncm[^}]*cfop[^}]*csosn[^}]*origem_fiscal/s);
    expect(source).toMatch(/INSERT INTO produtos\s*\([^)]*ncm[^)]*cfop[^)]*csosn[^)]*origem_fiscal/s);
    expect(source).toMatch(/UPDATE produtos SET[^`]*ncm=\?[^`]*cfop=\?[^`]*csosn=\?[^`]*origem_fiscal=\?/s);
  });

  it('persists caixa categoria on manual launches', () => {
    const source = fs.readFileSync(new URL('../routes/caixa.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const\s*\{[^}]*categoria/s);
    expect(source).toMatch(/INSERT INTO lancamentos\s*\([^)]*categoria/s);
    expect(source).toMatch(/UPDATE lancamentos SET[^"]*categoria=\?/s);
  });
});

describe('security configuration contracts', () => {
  it('keeps helmet enabled and global API rate limit at 60 requests per minute', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

    expect(packageJson.dependencies).toHaveProperty('helmet');
    expect(source).toMatch(/require\(["']helmet["']\)/);
    expect(source).toMatch(/app\.use\(helmet\(/);
    expect(source).toMatch(/max:\s*60/);
  });

  it('keeps the configuration health endpoint aligned with implemented security policies', () => {
    const source = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');

    expect(source).toMatch(/missing:\s*\[\]/);
    expect(source).not.toMatch(/helmet", "lockout-login/);
    expect(source).not.toMatch(/Instalar\/configurar helmet/);
    expect(source).not.toMatch(/Adicionar lockout por usuario no login/);
    expect(source).toMatch(/helmet:\s*true/);
    expect(source).toMatch(/lockoutLoginPorUsuario:\s*true/);
  });
});

describe('ordens route input contracts', () => {
  it('normalizes cliente name lookup before matching by name', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/String\(clientenome\s*\?\?\s*["']["']\)\.trim\(\)\.slice\(0,\s*200\)/);
    expect(source).toMatch(/WHERE name=\? LIMIT 1", \[nomeBusca\]/);
  });
});

describe('pagination route contracts', () => {
  it('paginates ordens with matching count metadata', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/normalizarPaginacao/);
    expect(source).toMatch(/montarMetaPaginacao/);
    expect(source).toMatch(/COUNT\(\*\) AS total[\s\S]+FROM ordens o/);
    expect(source).toMatch(/LIMIT \? OFFSET \?/);
    expect(source).toMatch(/res\.json\(\{\s*data:\s*rows,\s*meta:/);
  });

  it('paginates clientes with matching count metadata', () => {
    const source = fs.readFileSync(new URL('../routes/clientes.js', import.meta.url), 'utf8');

    expect(source).toMatch(/normalizarPaginacao/);
    expect(source).toMatch(/montarMetaPaginacao/);
    expect(source).toMatch(/COUNT\(\*\) AS total[\s\S]+FROM clientes c/);
    expect(source).toMatch(/LIMIT \? OFFSET \?/);
    expect(source).toMatch(/res\.json\(\{\s*data:\s*rows,\s*meta:/);
  });
});
