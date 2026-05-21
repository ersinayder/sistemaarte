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
  getSefazErrorInfo: vi.fn(() => ({ tipo: 'comunicacao', cstat: 'comunicacao', mensagem: 'Falha SEFAZ' })),
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

    expect(routeRoles(nfeRouter, 'get', '/status-servico')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'post', '/emitir/:id')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'post', '/:chave/cce')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'post', '/:chave/cancelar')).toEqual(['admin', 'caixa']);
  });

  it('restricts sensitive read routes away from oficina', async () => {
    const caixaRouter = await loadRouter('../routes/caixa.js');
    const relatoriosRouter = await loadRouter('../routes/relatorios.js');
    const financeiroRouter = await loadRouter('../routes/financeiro.js');
    const clientesRouter = await loadRouter('../routes/clientes.js');
    const produtosRouter = await loadRouter('../routes/produtos.js');

    expect(routeRoles(caixaRouter, 'get', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(relatoriosRouter, 'get', '/resumo')).toEqual(['admin', 'caixa']);
    expect(routeRoles(financeiroRouter, 'get', '/resumo')).toEqual(['admin']);
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

  it('persists structured standalone sale items in caixa launches', () => {
    const databaseSource = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');
    const source = fs.readFileSync(new URL('../routes/caixa.js', import.meta.url), 'utf8');

    expect(databaseSource).toMatch(/CREATE TABLE IF NOT EXISTS lancamento_itens/);
    expect(databaseSource).toMatch(/idx_lancamento_itens_lancamentoid/);
    expect(source).toMatch(/normalizarItensVendaAvulsa/);
    expect(source).toMatch(/origem = "vendaavulsa"/);
    expect(source).toMatch(/INSERT INTO lancamento_itens/);
    expect(source).toMatch(/itens_resumo/);
    expect(source).toMatch(/transaction\(\(\) =>/);
    expect(source).toMatch(/origem === "vendaavulsa" \|\| origem === "saldoos"\s*\?\s*"Entrada"/);
    expect(source).toMatch(/pagoFinal = 1/);
  });

  it('keeps OS balance receipts as caixa entries and repairs old invalid balance receipt types', () => {
    const caixaSource = fs.readFileSync(new URL('../routes/caixa.js', import.meta.url), 'utf8');
    const databaseSource = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(caixaSource).toMatch(/origem === "vendaavulsa" \|\| origem === "saldoos"\s*\?\s*"Entrada"/);
    expect(caixaSource).toMatch(/novoOrdemId\s*\?\s*"Entrada"\s*:\s*\(tipo\|\|"Diversos"\)/);
    expect(databaseSource).toMatch(/origem='saldoos' AND tipo != 'Entrada' AND deletedat IS NULL/);
  });

  it('keeps atendimento in a wide workspace without the lateral action rail', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/Atendimento.jsx', import.meta.url), 'utf8');

    expect(source).not.toMatch(/Pr[oó]ximas a[cç][oõ]es/i);
    expect(source).toMatch(/atendimento-wide-workspace/);
    expect(source).toMatch(/mode === 'home' && \(\s*<div className="atendimento-kpis">/);
    expect(source).toMatch(/atendimento-nova-grid/);
    expect(source).toMatch(/atendimento-receber-grid/);
    expect(source).toMatch(/atendimento-results-list \{[^}]*max-height:min\(32vh, 420px\)/);
    expect(source).toMatch(/atendimento-venda-grid/);
  });

  it('mounts admin financeiro API and paying accounts creates a caixa output', async () => {
    const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const source = fs.readFileSync(new URL('../routes/financeiro.js', import.meta.url), 'utf8');
    const financeiroRouter = await loadRouter('../routes/financeiro.js');

    expect(serverSource).toMatch(/app\.use\(["']\/api\/financeiro["'],\s*require\(["']\.\/routes\/financeiro["']\)\)/);
    expect(routeRoles(financeiroRouter, 'get', '/resumo')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/contas-pagar')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'post', '/contas-pagar')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'patch', '/contas-pagar/:id/pagar')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/contas-receber')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/dre')).toEqual(['admin']);
    expect(source).toMatch(/INSERT INTO lancamentos/);
    expect(source).toMatch(/tipo,\s*categoria,\s*descricao,\s*pagamento,\s*valor/);
    expect(source).toMatch(/UPDATE contas_pagar SET status='Pago'/);
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

describe('backup route contracts', () => {
  it('exposes admin-only backup status and returns full manual backup result', async () => {
    const backupRouter = await loadRouter('../routes/backup.js');
    const source = fs.readFileSync(new URL('../routes/backup.js', import.meta.url), 'utf8');

    expect(routeRoles(backupRouter, 'get', '/status')).toEqual(['admin']);
    expect(routeRoles(backupRouter, 'post', '/')).toEqual(['admin']);
    expect(source).toMatch(/readBackupStatus/);
    expect(source).toMatch(/res\.json\(result\)/);
    expect(source).not.toMatch(/res\.json\(\{\s*ok:\s*true\s*\}\)/);
  });

  it('writes backup-status.json after backup attempts', () => {
    const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(source).toMatch(/utils\/backupStatus/);
    expect(source).toMatch(/writeBackupStatus/);
    expect(source).toMatch(/buildBackupStatus/);
  });
});

describe('propostas route contracts', () => {
  it('mounts propostas API and keeps it restricted to admin and caixa', async () => {
    const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

    expect(source).toMatch(/app\.use\(["']\/api\/propostas["'],\s*require\(["']\.\/routes\/propostas["']\)\)/);

    const propostasRouter = await loadRouter('../routes/propostas.js');
    expect(routeRoles(propostasRouter, 'get', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(propostasRouter, 'post', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(propostasRouter, 'patch', '/:id/status')).toEqual(['admin', 'caixa']);
    expect(routeRoles(propostasRouter, 'post', '/:id/gerar-os')).toEqual(['admin', 'caixa']);
  });

  it('implements proposal conversion without generating OS numbers before approval', () => {
    const source = fs.readFileSync(new URL('../routes/propostas.js', import.meta.url), 'utf8');

    expect(source).toMatch(/podeGerarOS/);
    expect(source).toMatch(/gerarNumeroOS/);
    expect(source).toMatch(/INSERT INTO ordens/);
    expect(source).toMatch(/UPDATE propostas SET ordemid=\?/);
  });

  it('exposes printable proposal PDF only to admin and caixa', async () => {
    const propostasRouter = await loadRouter('../routes/propostas.js');
    const source = fs.readFileSync(new URL('../routes/propostas.js', import.meta.url), 'utf8');

    expect(routeRoles(propostasRouter, 'get', '/:id/pdf')).toEqual(['admin', 'caixa']);
    expect(source).toMatch(/renderPropostaHtml/);
    expect(source).toMatch(/Content-Type["'],\s*["']text\/html; charset=utf-8/);
  });
});
