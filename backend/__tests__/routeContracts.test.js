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
  formatarRejeicaoSefaz: vi.fn(({ cStat, xMotivo }) => ({
    cstat: cStat,
    campo: 'Rejeicao SEFAZ',
    item: null,
    motivoOriginal: xMotivo,
    mensagem: `SEFAZ rejeitou a emissao: ${xMotivo}`,
  })),
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
  it('protects users routes with fine-grained RBAC permissions', () => {
    const source = fs.readFileSync(new URL('../routes/users.js', import.meta.url), 'utf8');

    expect(source).toMatch(/router\.get\(["']\/["'],\s*auth\(\),\s*authPermission\(["']usuarios\.ver["']\)/);
    expect(source).toMatch(/router\.post\(["']\/["'],\s*auth\(\),\s*authPermission\(["']usuarios\.criar["']\)/);
    expect(source).toMatch(/router\.put\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']usuarios\.editar["']\)/);
    expect(source).toMatch(/router\.get\(["']\/:id\/delete-check["'],\s*auth\(\),\s*authPermission\(["']usuarios\.excluir_permanente["']\)/);
    expect(source).toMatch(/router\.post\(["']\/:id\/archive["'],\s*auth\(\),\s*authPermission\(["']usuarios\.arquivar["']\)/);
    expect(source).toMatch(/router\.post\(["']\/:id\/restore["'],\s*auth\(\),\s*authPermission\(["']usuarios\.restaurar["']\)/);
    expect(source).toMatch(/router\.post\(["']\/:id\/reset-password["'],\s*auth\(\),\s*authPermission\(["']usuarios\.resetar_senha["']\)/);
    expect(source).toMatch(/router\.delete\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']usuarios\.excluir_permanente["']\)/);
  });

  it('protects clientes and produtos routes with fine-grained RBAC permissions', () => {
    const clientesSource = fs.readFileSync(new URL('../routes/clientes.js', import.meta.url), 'utf8');
    const produtosSource = fs.readFileSync(new URL('../routes/produtos.js', import.meta.url), 'utf8');

    expect(clientesSource).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(clientesSource).toMatch(/router\.get\(["']\/["'],\s*auth\(\),\s*authPermission\(["']clientes\.ver["']\)/);
    expect(clientesSource).toMatch(/router\.get\(["']\/cnpj\/:cnpj["'],\s*auth\(\),\s*authPermission\(["']clientes\.consultar_documentos["']\)/);
    expect(clientesSource).toMatch(/router\.get\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']clientes\.ver["']\)/);
    expect(clientesSource).toMatch(/router\.get\(["']\/:id\/ordens["'],\s*auth\(\),\s*authPermission\(["']clientes\.ver["']\)/);
    expect(clientesSource).toMatch(/router\.post\(["']\/["'],\s*auth\(\),\s*authPermission\(["']clientes\.criar["']\)/);
    expect(clientesSource).toMatch(/router\.put\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']clientes\.editar["']\)/);
    expect(clientesSource).toMatch(/router\.delete\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']clientes\.excluir["']\)/);

    expect(produtosSource).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(produtosSource).toMatch(/router\.get\(["']\/["'],\s*auth\(\),\s*authPermission\(["']produtos\.ver["']\)/);
    expect(produtosSource).toMatch(/router\.get\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']produtos\.ver["']\)/);
    expect(produtosSource).toMatch(/router\.post\(["']\/["'],\s*auth\(\),\s*authPermission\(["']produtos\.criar["']\)/);
    expect(produtosSource).toMatch(/router\.put\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']produtos\.editar["']\)/);
    expect(produtosSource).toMatch(/router\.delete\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']produtos\.excluir["']\)/);
  });

  it('protects admin support routes with fine-grained RBAC permissions', () => {
    const backupSource = fs.readFileSync(new URL('../routes/backup.js', import.meta.url), 'utf8');
    const configuracoesSource = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');
    const relatoriosSource = fs.readFileSync(new URL('../routes/relatorios.js', import.meta.url), 'utf8');

    expect(backupSource).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(backupSource).toMatch(/router\.get\(["']\/status["'],\s*auth\(\),\s*authPermission\(["']backups\.ver["']\)/);
    expect(backupSource).toMatch(/router\.post\(["']\/["'],\s*auth\(\),\s*authPermission\(["']backups\.executar["']\)/);

    expect(configuracoesSource).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(configuracoesSource).toMatch(/router\.get\(["']\/backups["'],\s*auth\(\),\s*authPermission\(["']backups\.ver["']\)/);
    expect(configuracoesSource).toMatch(/router\.post\(["']\/backups\/manual["'],\s*auth\(\),\s*authPermission\(["']backups\.executar["']\)/);
    expect(configuracoesSource).toMatch(/router\.get\(["']\/seguranca["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.seguranca["']\)/);
    expect(configuracoesSource).toMatch(/router\.get\(["']\/sistema["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.ver["']\)/);

    expect(relatoriosSource).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(relatoriosSource).toMatch(/router\.get\(["']\/resumo["'],\s*auth\(\),\s*authPermission\(["']relatorios\.ver["']\)/);
    expect(relatoriosSource).toMatch(/router\.get\(["']\/producao["'],\s*auth\(\),\s*authPermission\(["']relatorios\.producao["']\)/);
    expect(relatoriosSource).toMatch(/router\.get\(["']\/producao\/pdf["'],\s*auth\(\),\s*authPermission\(["']relatorios\.producao["']\)/);
  });

  it('protects all configuration routes with fine-grained RBAC permissions', () => {
    const source = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(source).toMatch(/router\.get\(["']\/["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.ver["']\)/);
    expect(source).toMatch(/router\.get\(["']\/empresa["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.ver["']\)/);
    expect(source).toMatch(/router\.put\(["']\/empresa["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_empresa["']\)/);
    expect(source).toMatch(/router\.get\(["']\/fiscal["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_fiscal["']\)/);
    expect(source).toMatch(/router\.put\(["']\/fiscal["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_fiscal["']\)/);
    expect(source).toMatch(/router\.post\(["']\/fiscal\/certificado["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_fiscal["']\)/);
    expect(source).toMatch(/router\.put\(["']\/fiscal\/certificado\/senha["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_fiscal["']\)/);
    expect(source).toMatch(/router\.get\(["']\/fiscal\/autxml["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_fiscal["']\)/);
    expect(source).toMatch(/router\.post\(["']\/fiscal\/autxml["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_fiscal["']\)/);
    expect(source).toMatch(/router\.put\(["']\/fiscal\/autxml\/:id["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_fiscal["']\)/);
    expect(source).toMatch(/router\.delete\(["']\/fiscal\/autxml\/:id["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_fiscal["']\)/);
    expect(source).toMatch(/router\.get\(["']\/whatsapp["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_whatsapp["']\)/);
    expect(source).toMatch(/router\.get\(["']\/whatsapp\/web-status["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_whatsapp["']\)/);
    expect(source).toMatch(/router\.put\(["']\/whatsapp["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_whatsapp["']\)/);
    expect(source).toMatch(/router\.get\(["']\/impressao["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_impressao["']\)/);
    expect(source).toMatch(/router\.put\(["']\/impressao["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_impressao["']\)/);
    expect(source).toMatch(/router\.post\(["']\/impressao\/teste["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_impressao["']\)/);
    expect(source).toMatch(/router\.post\(["']\/impressao\/diagnostico["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_impressao["']\)/);
  });

  it('gates configuration frontend access and sections by permissions', () => {
    const appSource = fs.readFileSync(new URL('../../frontend/src/App.jsx', import.meta.url), 'utf8');
    const sidebarSource = fs.readFileSync(new URL('../../frontend/src/components/Sidebar.jsx', import.meta.url), 'utf8');
    const configuracoesSource = fs.readFileSync(new URL('../../frontend/src/pages/Configuracoes.jsx', import.meta.url), 'utf8');

    expect(appSource).toMatch(/path=["']\/configuracoes["'][\s\S]+permissions=\{\[[^\]]*configuracoes\.ver[^\]]*configuracoes\.editar_empresa[^\]]*configuracoes\.editar_fiscal[^\]]*configuracoes\.editar_whatsapp[^\]]*configuracoes\.editar_impressao[^\]]*configuracoes\.seguranca[^\]]*backups\.ver[^\]]*backups\.executar[^\]]*\]\}/);
    expect(sidebarSource).toMatch(/canViewConfiguracoes\s*=[\s\S]+configuracoes\.ver[\s\S]+configuracoes\.editar_empresa[\s\S]+configuracoes\.editar_fiscal[\s\S]+configuracoes\.editar_whatsapp[\s\S]+configuracoes\.editar_impressao[\s\S]+configuracoes\.seguranca[\s\S]+backups\.ver[\s\S]+backups\.executar/);
    expect(sidebarSource).toMatch(/\{canViewConfiguracoes && \([\s\S]+navItem\(["']\/configuracoes["']/);
    expect(configuracoesSource).toMatch(/useAuth/);
    expect(configuracoesSource).toMatch(/permissions:\s*\[['"]configuracoes\.editar_fiscal["']\]/);
    expect(configuracoesSource).toMatch(/permissions:\s*\[['"]configuracoes\.editar_whatsapp["']\]/);
    expect(configuracoesSource).toMatch(/permissions:\s*\[['"]configuracoes\.editar_impressao["']\]/);
    expect(configuracoesSource).toMatch(/visibleSections/);
    expect(configuracoesSource).toMatch(/canEditEmpresa/);
    expect(configuracoesSource).toMatch(/canRunBackup/);
  });

  it('protects dashboard and consultation routes with fine-grained RBAC permissions', () => {
    const kpisSource = fs.readFileSync(new URL('../routes/kpis.js', import.meta.url), 'utf8');
    const consultaSource = fs.readFileSync(new URL('../routes/consulta.js', import.meta.url), 'utf8');
    const appSource = fs.readFileSync(new URL('../../frontend/src/App.jsx', import.meta.url), 'utf8');
    const sidebarSource = fs.readFileSync(new URL('../../frontend/src/components/Sidebar.jsx', import.meta.url), 'utf8');
    const dashboardSource = fs.readFileSync(new URL('../../frontend/src/pages/Dashboard.jsx', import.meta.url), 'utf8');

    expect(kpisSource).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(kpisSource).toMatch(/router\.get\(["']\/["'],\s*auth\(\),\s*authPermission\(["']dashboard\.ver["']\)/);
    expect(kpisSource).toMatch(/router\.get\(["']\/integridade["'],\s*auth\(\),\s*authPermission\(["']dashboard\.integridade["']\)/);
    expect(kpisSource).toMatch(/router\.get\(["']\/stream["'],\s*auth\(\),\s*authPermission\(["']dashboard\.ver["']\)/);

    expect(consultaSource).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(consultaSource).toMatch(/router\.get\(["']\/cnpj\/:cnpj["'],\s*auth\(\),\s*authPermission\(["']clientes\.consultar_documentos["']\)/);
    expect(consultaSource).toMatch(/router\.get\(["']\/cep\/:cep["'],\s*auth\(\),\s*authPermission\(["']clientes\.consultar_documentos["']\)/);
    expect(consultaSource).toMatch(/router\.get\(["']\/cpf\/:cpf["'],\s*auth\(\),\s*authPermission\(["']clientes\.consultar_documentos["']\)/);

    expect(appSource).toMatch(/path=["']\/dashboard["'][\s\S]+permissions=\{\[['"]dashboard\.ver["']\]\}/);
    expect(sidebarSource).toMatch(/canViewDashboard\s*=[\s\S]+dashboard\.ver/);
    expect(sidebarSource).toMatch(/canViewDashboard && navItem\(["']\/dashboard["']/);
    expect(dashboardSource).toMatch(/can\(["']dashboard\.integridade["']\)/);
  });

  it('protects financeiro admin routes with fine-grained RBAC permissions', () => {
    const source = fs.readFileSync(new URL('../routes/financeiro.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(source).toMatch(/router\.get\(["']\/resumo["'],\s*auth\(\),\s*authPermission\(["']financeiro\.ver["']\)/);
    expect(source).toMatch(/router\.get\(["']\/resumo\/pdf["'],\s*auth\(\),\s*authPermission\(["']financeiro\.relatorios["']\)/);
    expect(source).toMatch(/router\.get\(["']\/contas-pagar["'],\s*auth\(\),\s*authPermission\(["']financeiro\.contas_pagar\.ver["']\)/);
    expect(source).toMatch(/router\.get\(["']\/contas-pagar\/pdf["'],\s*auth\(\),\s*authPermission\(["']financeiro\.relatorios["']\)/);
    expect(source).toMatch(/router\.post\(["']\/contas-pagar["'],\s*auth\(\),\s*authPermission\(["']financeiro\.contas_pagar\.editar["']\)/);
    expect(source).toMatch(/router\.put\(["']\/contas-pagar\/:id["'],\s*auth\(\),\s*authPermission\(["']financeiro\.contas_pagar\.editar["']\)/);
    expect(source).toMatch(/router\.patch\(["']\/contas-pagar\/:id\/pagar["'],\s*auth\(\),\s*authPermission\(["']financeiro\.contas_pagar\.pagar["']\)/);
    expect(source).toMatch(/router\.patch\(["']\/contas-pagar\/:id\/cancelar["'],\s*auth\(\),\s*authPermission\(["']financeiro\.contas_pagar\.editar["']\)/);
    expect(source).toMatch(/router\.delete\(["']\/contas-pagar\/:id["'],\s*auth\(\),\s*authPermission\(["']financeiro\.contas_pagar\.editar["']\)/);
    expect(source).toMatch(/router\.get\(["']\/contas-receber["'],\s*auth\(\),\s*authPermission\(["']financeiro\.ver["']\)/);
    expect(source).toMatch(/router\.get\(["']\/integridade-os\/:ordemId["'],\s*auth\(\),\s*authPermission\(["']financeiro\.ver["']\)/);
    expect(source).toMatch(/router\.get\(["']\/integridade-os["'],\s*auth\(\),\s*authPermission\(["']financeiro\.ver["']\)/);
    expect(source).toMatch(/router\.get\(["']\/contas-receber\/pdf["'],\s*auth\(\),\s*authPermission\(["']financeiro\.relatorios["']\)/);
    expect(source).toMatch(/router\.get\(["']\/dre["'],\s*auth\(\),\s*authPermission\(["']financeiro\.relatorios["']\)/);
    expect(source).toMatch(/router\.get\(["']\/dre\/pdf["'],\s*auth\(\),\s*authPermission\(["']financeiro\.relatorios["']\)/);
  });

  it('gates financeiro frontend access and actions by permissions', () => {
    const appSource = fs.readFileSync(new URL('../../frontend/src/App.jsx', import.meta.url), 'utf8');
    const sidebarSource = fs.readFileSync(new URL('../../frontend/src/components/Sidebar.jsx', import.meta.url), 'utf8');
    const financeiroSource = fs.readFileSync(new URL('../../frontend/src/pages/Financeiro.jsx', import.meta.url), 'utf8');

    expect(appSource).toMatch(/path=["']\/financeiro["'][\s\S]+permissions=\{\[['"]financeiro\.ver['"],\s*['"]financeiro\.contas_pagar\.ver['"],\s*['"]financeiro\.relatorios['"]\]\}/);
    expect(sidebarSource).toMatch(/canViewFinanceiro\s*=[\s\S]+financeiro\.ver[\s\S]+financeiro\.contas_pagar\.ver[\s\S]+financeiro\.relatorios/);
    expect(sidebarSource).toMatch(/\{canViewFinanceiro && \([\s\S]+navItem\(["']\/financeiro["'],\s*["']Financeiro["']/);
    expect(financeiroSource).toMatch(/useAuth/);
    expect(financeiroSource).toMatch(/can\(["']financeiro\.contas_pagar\.editar["']\)/);
    expect(financeiroSource).toMatch(/can\(["']financeiro\.contas_pagar\.pagar["']\)/);
    expect(financeiroSource).toMatch(/can\(["']financeiro\.relatorios["']\)/);
    expect(financeiroSource).toMatch(/canEditContasPagar &&/);
    expect(financeiroSource).toMatch(/canPrintReports &&/);
  });

  it('protects sensitive order routes with fine-grained RBAC permissions', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');
    const pdfSource = fs.readFileSync(new URL('../routes/pdf.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const\s+\{\s*auth,\s*authAnyPermission,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(source).toMatch(/router\.get\(["']\/["'],\s*auth\(\),\s*authPermission\(["']ordens\.ver["']\)/);
    expect(source).toMatch(/router\.get\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']ordens\.ver["']\)/);
    expect(source).toMatch(/router\.post\(["']\/["'],\s*auth\(\),\s*authPermission\(["']ordens\.criar["']\)/);
    expect(source).toMatch(/router\.put\(["']\/:id["'],\s*auth\(\),\s*authAnyPermission\(\[["']ordens\.editar["'],\s*["']ordens\.alterar_status["'],\s*["']oficina\.alterar_status["']\]\)/);
    expect(source).toMatch(/router\.patch\(["']\/:id\/status["'],\s*auth\(\),\s*authAnyPermission\(\[["']ordens\.alterar_status["'],\s*["']oficina\.alterar_status["']\]\)/);
    expect(source).toMatch(/router\.post\(["']\/:id\/whatsapp-avisos\/:tipo\/abrir["'],\s*auth\(\),\s*authPermission\(["']ordens\.whatsapp["']\)/);
    expect(source).toMatch(/router\.patch\(["']\/:id\/whatsapp-avisos\/:tipo\/status["'],\s*auth\(\),\s*authPermission\(["']ordens\.whatsapp["']\)/);
    expect(source).toMatch(/router\.post\(["']\/:id\/whatsapp-confirmacao["'],\s*auth\(\),\s*authPermission\(["']ordens\.whatsapp["']\)/);
    expect(source).toMatch(/router\.delete\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']ordens\.excluir["']\)/);
    expect(source).toMatch(/router\.post\(["']\/:id\/restore["'],\s*auth\(\),\s*authPermission\(["']ordens\.restaurar["']\)/);
    expect(source).toMatch(/router\.delete\(["']\/:id\/permanente["'],\s*auth\(\),\s*authPermission\(["']ordens\.excluir_permanente["']\)/);
    expect(pdfSource).toMatch(/router\.get\(["']\/:id\/pdf["'],\s*auth\(\),\s*authPermission\(["']ordens\.imprimir["']\)/);
    expect(pdfSource).toMatch(/router\.post\(["']\/:id\/print["'],\s*auth\(\),\s*authPermission\(["']ordens\.imprimir["']\)/);
  });

  it('protects fiscal routes with fine-grained RBAC permissions', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(['"]\.\.\/middlewares\/auth['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/['"],\s*auth\(\),\s*authPermission\(['"]nfe\.ver['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/lixeira['"],\s*auth\(\),\s*authPermission\(['"]nfe\.lixeira['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/status-servico['"],\s*auth\(\),\s*authPermission\(['"]nfe\.ver['"]\)/);
    expect(source).toMatch(/router\.post\(['"]\/integridade-financeira\/:ordemId\/conciliar['"],\s*auth\(\),\s*authPermission\(['"]nfe\.conciliar['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/integridade-financeira['"],\s*auth\(\),\s*authPermission\(['"]nfe\.integridade['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/pendencias['"],\s*auth\(\),\s*authPermission\(['"]nfe\.integridade['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/inutilizacoes\/contexto['"],\s*auth\(\),\s*authPermission\(['"]nfe\.inutilizar['"]\)/);
    expect(source).toMatch(/router\.post\(['"]\/inutilizacoes['"],\s*auth\(\),\s*authPermission\(['"]nfe\.inutilizar['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/avulsa\/preview['"],\s*auth\(\),\s*authPermission\(['"]nfe\.emitir['"]\)/);
    expect(source).toMatch(/router\.post\(['"]\/avulsa['"],\s*auth\(\),\s*authPermission\(['"]nfe\.emitir['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/exportar['"],\s*auth\(\),\s*authPermission\(['"]nfe\.exportar['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/:chave\/xml\/autorizacao['"],\s*auth\(\),\s*authPermission\(['"]nfe\.xml['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/:chave\/danfe['"],\s*auth\(\),\s*authPermission\(['"]nfe\.danfe['"]\)/);
    expect(source).toMatch(/router\.get\(['"]\/emitir\/:id\/preview['"],\s*auth\(\),\s*authPermission\(['"]nfe\.emitir['"]\)/);
    expect(source).toMatch(/router\.delete\(['"]\/:id['"],\s*auth\(\),\s*authPermission\(['"]nfe\.lixeira['"]\)/);
    expect(source).toMatch(/router\.post\(['"]\/:id\/restore['"],\s*auth\(\),\s*authPermission\(['"]nfe\.lixeira['"]\)/);
    expect(source).toMatch(/router\.post\(['"]\/emitir\/:id['"],\s*auth\(\),\s*authPermission\(['"]nfe\.emitir['"]\)/);
    expect(source).toMatch(/router\.post\(['"]\/:chave\/cce['"],\s*auth\(\),\s*authPermission\(['"]nfe\.cce['"]\)/);
    expect(source).toMatch(/router\.post\(['"]\/:chave\/cancelar['"],\s*auth\(\),\s*authPermission\(['"]nfe\.cancelar['"]\)/);
  });

  it('protects caixa routes with fine-grained RBAC permissions', () => {
    const source = fs.readFileSync(new URL('../routes/caixa.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(source).toMatch(/router\.get\(["']\/["'],\s*auth\(\),\s*authPermission\(["']caixa\.ver["']\)/);
    expect(source).toMatch(/router\.get\(["']\/fechamento["'],\s*auth\(\),\s*authPermission\(["']caixa\.fechamento["']\)/);
    expect(source).toMatch(/router\.post\(["']\/["'],\s*auth\(\),\s*authPermission\(["']caixa\.criar_lancamento["']\)/);
    expect(source).toMatch(/router\.put\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']caixa\.editar_lancamento["']\)/);
    expect(source).toMatch(/router\.delete\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']caixa\.excluir_lancamento["']\)/);
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
    const serviceSource = fs.readFileSync(new URL('../services/caixaLancamentoService.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const\s*\{[^}]*categoria/s);
    expect(source).toMatch(/INSERT INTO lancamentos\s*\([^)]*categoria/s);
    expect(source).toMatch(/createCaixaLancamentoService/);
    expect(source).toMatch(/service\.editar\(req\.params\.id,\s*req\.body \?\? \{\},\s*req\.user\)/);
    expect(serviceSource).toMatch(/UPDATE lancamentos SET[^"]*categoria=\?/s);
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
    const serviceSource = fs.readFileSync(new URL('../services/caixaLancamentoService.js', import.meta.url), 'utf8');
    const databaseSource = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(caixaSource).toMatch(/origem === "vendaavulsa" \|\| origem === "saldoos"\s*\?\s*"Entrada"/);
    expect(serviceSource).toMatch(/novoOrdemId\s*\?\s*"Entrada"\s*:\s*\(tipo \|\| "Diversos"\)/);
    expect(databaseSource).toMatch(/origem='saldoos' AND tipo != 'Entrada' AND deletedat IS NULL/);
  });

  it('lets permitted users remove an accidental OS entry payment from caixa and resets the OS entry value', () => {
    const source = fs.readFileSync(new URL('../routes/caixa.js', import.meta.url), 'utf8');

    expect(source).not.toMatch(/A entrada automatica da OS nao pode ser excluida pelo caixa/);
    expect(source).toMatch(/router\.delete\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']caixa\.excluir_lancamento["']\)/);
    expect(source).toMatch(/getResumoFinanceiroOS\(old\.ordemid\)/);
    expect(source).toMatch(/ordemStatus\?\.status === "Entregue"/);
    expect(source).toMatch(/Nao e possivel excluir pagamento de OS entregue/);
    expect(source).toMatch(/transaction\(\(\) => \{/);
    expect(source).toMatch(/UPDATE lancamentos SET deletedat=datetime\('now','localtime'\), deletedpor=\? WHERE id=\?/);
    expect(source).toMatch(/old\.origem === "entradaos" && old\.ordemid/);
    expect(source).toMatch(/UPDATE ordens SET valorentrada=0, updatedat=datetime\('now','localtime'\) WHERE id=\? AND deletedat IS NULL/);
  });

  it('blocks admin and caixa from delivering an OS with open balance through the generic update route', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');
    const adminBranchStart = source.indexOf('const desconto = descontoinput');
    const transactionStart = source.indexOf('transaction(() => {', adminBranchStart);
    const adminBranchBeforeSave = source.slice(adminBranchStart, transactionStart);

    expect(adminBranchBeforeSave).toMatch(/ns === 'Entregue'/);
    expect(adminBranchBeforeSave).toMatch(/getResumoFinanceiroOS\(req\.params\.id\)/);
    expect(adminBranchBeforeSave).toMatch(/saldoProjetado/);
    expect(adminBranchBeforeSave).toMatch(/Quite antes de entregar/);
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

  it('selects Atendimento item quantity and price fields on focus', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/Atendimento.jsx', import.meta.url), 'utf8');

    expect(source).toMatch(/const selectInputValue/);
    expect(source).toMatch(/onFocus=\{selectInputValue\}/);
  });

  it('mounts financeiro API and paying accounts creates a caixa output', async () => {
    const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const source = fs.readFileSync(new URL('../routes/financeiro.js', import.meta.url), 'utf8');

    expect(serverSource).toMatch(/app\.use\(["']\/api\/financeiro["'],\s*require\(["']\.\/routes\/financeiro["']\)\)/);
    expect(source).toMatch(/INSERT INTO lancamentos/);
    expect(source).toMatch(/tipo,\s*categoria,\s*descricao,\s*pagamento,\s*valor/);
    expect(source).toMatch(/UPDATE contas_pagar SET status='Pago'/);
  });

  it('does not call the unstable automatic whatsapp sender when OS becomes ready', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/function maybeNotifyPronto/);
    expect(source).not.toMatch(/sendWhatsApp\(os\)/);
    expect(source).toMatch(/garantirAvisoPronto/);
  });

  it('redacts financial fields from oficina OS responses on the backend', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/function deveRedigirDadosOperacionais/);
    expect(source).toMatch(/hasPermission\(user,\s*["']oficina\.ver["']\)/);
    expect(source).toMatch(/!hasAnyPermission\(user,\s*\[/);
    expect(source).toMatch(/function redactOrdemForPermissions/);
    expect(source).toMatch(/if \(!shouldRedact\) return row/);
    expect(source).toMatch(/saldoaberto/);
    expect(source).toMatch(/descontoinput,\s*\n\s*descontovalor,/);
    expect(source).toMatch(/function redactItensForPermissions/);
    expect(source).toMatch(/\{\s*preco_unitario,\s*subtotal,\s*\.\.\.item\s*\}/);
    expect(source).toMatch(/lancamentos:\s*deveRedigirDadosOperacionais\(req\.user\) \? \[\] : lancamentos/);
  });

  it('redacts fiscal and customer PII fields from oficina OS responses on the backend', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/clientetelefone,\s*\n\s*clientecontato,\s*\n\s*clientecpf,/);
    expect(source).toMatch(/nfe_status,\s*\n\s*nfe_chave,\s*\n\s*nfe_protocolo,/);
    expect(source).toMatch(/nfe_xml,/);
    expect(source).toMatch(/nfe_cancel_motivo,/);
  });

  it('does not let oficina mutate OS items through the generic update route', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');
    const start = source.indexOf('if (!canEditOrdem)');
    const end = source.indexOf('const total =', start);
    const statusOnlyBranch = source.slice(start, end);

    expect(statusOnlyBranch).toContain('UPDATE ordens SET status=?');
    expect(statusOnlyBranch).not.toMatch(/saveItens/);
    expect(statusOnlyBranch).not.toMatch(/DELETE FROM ordem_itens/);
  });

  it('blocks OS cancellation without the cancel permission through update and status routes', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/status === 'Cancelado'[\s\S]+!hasPermission\(req\.user,\s*["']ordens\.cancelar["']\)/);
    expect(source).toMatch(/Sem permissao para cancelar OS/);
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

  it('mounts the CSRF origin guard before API routes', () => {
    const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

    expect(source).toMatch(/require\(["']\.\/middlewares\/csrfOriginGuard["']\)/);
    expect(source).toMatch(/app\.use\(["']\/api["'],\s*csrfOriginGuard\(\{\s*allowedOrigins\s*\}\)\)/);
  });

  it('does not trust forwarded proxy headers by default', () => {
    const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

    expect(source).toMatch(/process\.env\.TRUST_PROXY/);
    expect(source).not.toMatch(/app\.set\(["']trust proxy["'],\s*1\s*\)/);
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

  it('keeps print configuration permission-gated and sanitized before server printing', () => {
    const source = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');

    expect(source).toMatch(/router\.get\(["']\/impressao["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_impressao["']\)/);
    expect(source).toMatch(/router\.put\(["']\/impressao["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_impressao["']\)/);
    expect(source).toMatch(/router\.post\(["']\/impressao\/teste["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_impressao["']\)/);
    expect(source).toMatch(/router\.post\(["']\/impressao\/diagnostico["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_impressao["']\)/);
    expect(source).toMatch(/normalizarImpressaoConfig/);
    expect(source).toMatch(/validarImpressaoConfig/);
    expect(source).toMatch(/renderTesteImpressaoHtml/);
    expect(source).toMatch(/printHtml\(\{\s*html,\s*jobName:\s*["']teste-impressao-a5["']/);
    expect(source).toMatch(/diagnosePrintHtml\(\{\s*html,\s*jobName:\s*["']diagnostico-impressao-a5["']/);
  });

  it('shows the A5 print diagnostic package in the configuration UI', () => {
    const configuracoesSource = fs.readFileSync(new URL('../../frontend/src/pages/Configuracoes.jsx', import.meta.url), 'utf8');

    expect(configuracoesSource).toMatch(/\/configuracoes\/impressao\/diagnostico/);
    expect(configuracoesSource).toMatch(/diagnosticoImpressao/);
    expect(configuracoesSource).toMatch(/HTML renderizado/);
    expect(configuracoesSource).toMatch(/Destino resolvido/);
    expect(configuracoesSource).toMatch(/Capacidades A5/);
    expect(configuracoesSource).toMatch(/Erro do envio/);
  });

  it('keeps whatsapp web status permission-gated and starts the queue worker behind an env gate', () => {
    const configuracoesSource = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');
    const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const ecosystemSource = fs.readFileSync(new URL('../ecosystem.config.js', import.meta.url), 'utf8');

    expect(configuracoesSource).toMatch(/router\.get\(["']\/whatsapp\/web-status["'],\s*auth\(\),\s*authPermission\(["']configuracoes\.editar_whatsapp["']\)/);
    expect(configuracoesSource).toMatch(/createWhatsappWebProvider/);
    expect(serverSource).toMatch(/WHATSAPP_WEB_ENABLED/);
    expect(serverSource).toMatch(/createWhatsappWorker/);
    expect(ecosystemSource).toMatch(/WHATSAPP_WEB_ENABLED/);
    expect(ecosystemSource).toMatch(/WHATSAPP_WEB_BASE_URL/);
    expect(ecosystemSource).toMatch(/WHATSAPP_WEB_INSTANCE/);
  });

  it('exposes whatsapp web local settings in the configuration UI', () => {
    const configuracoesSource = fs.readFileSync(new URL('../../frontend/src/pages/Configuracoes.jsx', import.meta.url), 'utf8');

    expect(configuracoesSource).toMatch(/web_local/);
    expect(configuracoesSource).toMatch(/webBaseUrl/);
    expect(configuracoesSource).toMatch(/webInstance/);
    expect(configuracoesSource).toMatch(/\/configuracoes\/whatsapp\/web-status/);
  });

  it('uses the internal API for CEP lookup so production CSP does not block address autofill', () => {
    const cepSource = fs.readFileSync(new URL('../../frontend/src/utils/cep.js', import.meta.url), 'utf8');
    const configuracoesSource = fs.readFileSync(new URL('../../frontend/src/pages/Configuracoes.jsx', import.meta.url), 'utf8');

    expect(cepSource).toMatch(/from ['"]\.\.\/services\/api['"]/);
    expect(cepSource).toMatch(/api\.get\(`\/consulta\/cep\/\$\{cep\}`\)/);
    expect(cepSource).not.toMatch(/viacep\.com\.br/);
    expect(configuracoesSource).toMatch(/buscarEnderecoPorCep/);
    expect(configuracoesSource).toMatch(/buscarCepEmpresa/);
  });

  it('shows the NF-e homologation target only while the fiscal environment is homologation', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');

    expect(source).toMatch(/const mostraHomologacao = Number\(nfeMeta\.ambiente\) === 2/);
    expect(source).toMatch(/\{mostraHomologacao && !lixeira && <div/);
    expect(source).not.toMatch(/Ambiente atual: producao/);
  });

  it('keeps fiscal event XML downloads scoped to active canonical notes without trash permission', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/FROM nfe_eventos e[\s\S]+LEFT JOIN nfe_notas n[\s\S]+n\.id = e\.nfeid/);
    expect(source).toMatch(/LEFT JOIN ordens o ON o\.id = COALESCE\(e\.ordemid,\s*n\.ordemid\)/);
    expect(source).toMatch(/!hasPermission\(req\.user,\s*['"]nfe\.lixeira['"]\)[\s\S]+notaOculta[\s\S]+legadoOculto[\s\S]+semEscopoFiscal/);
  });

  it('does not log NF-e payloads or event payloads with fiscal PII', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).not.toMatch(/Payload dest/);
    expect(source).not.toMatch(/Payload det/);
    expect(source).not.toMatch(/JSON\.stringify\(eventoPayload\)/);
    expect(source).not.toMatch(/JSON\.stringify\(payload\.infNFe\.dest\)/);
  });

  it('preserves custom OS item names when loading items for NF-e emission', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/SELECT oi\.\*, p\.nome AS produto_nome/);
    expect(source).not.toMatch(/SELECT oi\.\*, p\.nome,/);
  });

  it('reviews and validates per-emission fiscal item overrides before issuing NF-e', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/router\.get\(['"]\/emitir\/:id\/preview['"]/);
    expect(source).toMatch(/serializarPreviaEmissaoNFe/);
    expect(source).toMatch(/aplicarOverridesItensNFe\(itensBase,\s*overrides\)/);
    expect(source).toMatch(/return res\.status\(400\)\.json\(\{\s*erro:\s*itensComOverrides\.erro\s*\}\)/);
  });

  it('delegates NF-e emission to the idempotent orchestrator without unsafe route fallbacks', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const postStart = source.indexOf("router.post('/emitir/:id'");
    const nextPostStart = source.indexOf("router.post('/:chave/cce'", postStart);
    const postEmitirSource = source.slice(postStart, nextPostStart);

    expect(source).toMatch(/createNfeEmissaoService/);
    expect(source).not.toMatch(/JSON\.stringify\(resultado,\s*null,\s*2\)/);
    expect(postEmitirSource).not.toMatch(/nfe_status\s*=\s*'rejeitado'/);
    expect(postEmitirSource).not.toMatch(/nfe_status='rejeitado'/);
    expect(postEmitirSource).not.toMatch(/detalhe:\s*(e|err)\.message/);
    expect(postEmitirSource).not.toMatch(/guardTimeout/);
  });

  it('does not expose internal NF-e exception messages in fiscal event responses', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const emitirStart = source.indexOf("router.post('/emitir/:id'");
    const cceStart = source.indexOf("router.post('/:chave/cce'");
    const eventSource = source.slice(cceStart);

    expect(source.slice(emitirStart, cceStart)).not.toMatch(/detalhe:\s*(e|err)\.message/);
    expect(eventSource).not.toMatch(/detalhe:\s*(e|err)\.message/);
  });

  it('delegates OS CC-e and cancellation to the idempotent fiscal event service while preserving avulsa fallback', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const cceStart = source.indexOf("router.post('/:chave/cce'");
    const cancelarStart = source.indexOf("router.post('/:chave/cancelar'");
    const cceSource = source.slice(cceStart, cancelarStart);
    const cancelarSource = source.slice(cancelarStart);

    expect(source).toMatch(/createNfeEventoService/);
    expect(source).toMatch(/createNfeEventoAttemptRepository/);
    expect(cceSource).toMatch(/if \(!nota\.ordemid\)[\s\S]+wizard\.NFE_CartaDeCorrecao/);
    expect(cancelarSource).toMatch(/if \(!nota\.ordemid\)[\s\S]+wizard\.NFE_Cancelamento/);
    expect(cceSource).not.toMatch(/guardTimeout/);
    expect(cancelarSource).not.toMatch(/guardTimeout/);
    expect(cceSource).toMatch(/service\.executar/);
    expect(cancelarSource).toMatch(/service\.executar/);
    expect(cceSource).toMatch(/ordemId:\s*nota\.ordemid/);
    expect(cancelarSource).toMatch(/ordemId:\s*nota\.ordemid/);
  });

  it('blocks new NF-e emission when the local note is cancelled', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const validarSource = source.slice(
      source.indexOf('function validarOrdemEmitivel'),
      source.indexOf('function serializarPreviaEmissaoNFe')
    );

    expect(validarSource).toMatch(/cancelad[ao]/);
    expect(validarSource).toMatch(/NF-e cancelada nao pode ser reemitida/);
  });

  it('validates cancelled NF-e before reserving, transmitting, or persisting emission attempts', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const postStart = source.indexOf("router.post('/emitir/:id'");
    const postEnd = source.indexOf("// POST /api/nfe/:chave/cce");
    const postEmitirSource = source.slice(postStart, postEnd);
    const validarIndex = postEmitirSource.indexOf('const erroOrdem = validarOrdemEmitivel(os, itensBase)');

    expect(validarIndex).toBeGreaterThan(-1);
    expect(postEmitirSource.indexOf('createNfeAttemptRepository')).toBeGreaterThan(validarIndex);
    expect(postEmitirSource.indexOf('createNfePersistenceService')).toBeGreaterThan(validarIndex);
    expect(postEmitirSource.indexOf('createNfeEmissaoService')).toBeGreaterThan(validarIndex);
    expect(postEmitirSource.indexOf('wizard.NFE_Autorizacao')).toBeGreaterThan(validarIndex);
    expect(postEmitirSource.indexOf('service.emitir')).toBeGreaterThan(validarIndex);
  });

  it('keeps manual NF-e invalidation routes before dynamic key routes', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const serviceSource = fs.readFileSync(new URL('../services/nfeInutilizacaoService.js', import.meta.url), 'utf8');

    expect(source).toMatch(/createNfeInutilizacaoService/);
    expect(source).toMatch(/transmitirInutilizacaoNFe/);
    expect(source).toMatch(/router\.get\(['"]\/inutilizacoes\/contexto['"],\s*auth\(\),\s*authPermission\(['"]nfe\.inutilizar['"]\)/);
    expect(source).toMatch(/router\.post\(['"]\/inutilizacoes['"],\s*auth\(\),\s*authPermission\(['"]nfe\.inutilizar['"]\)/);
    expect(source.indexOf("'/inutilizacoes/contexto'")).toBeLessThan(source.indexOf("'/:chave/eventos'"));
    expect(source).toMatch(/res\.setHeader\(['"]Content-Type['"],\s*['"]application\/xml; charset=utf-8['"]\)/);
    expect(serviceSource).toMatch(/const sharedBusyState/);
    expect(serviceSource).toMatch(/busyState\.busy/);
  });

  it('exposes sanitized fiscal pending attempts before dynamic key routes', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const repositorySource = fs.readFileSync(new URL('../repositories/nfePendenciaRepository.js', import.meta.url), 'utf8');
    const pendenciasStart = source.indexOf("router.get('/pendencias'");
    const chaveEventosStart = source.indexOf("router.get('/:chave/eventos'");

    expect(source).toMatch(/router\.get\(['"]\/pendencias['"],\s*auth\(\),\s*authPermission\(['"]nfe\.integridade['"]\)/);
    expect(source).toMatch(/listarPendenciasFiscais/);
    expect(pendenciasStart).toBeGreaterThan(-1);
    expect(pendenciasStart).toBeLessThan(chaveEventosStart);
    expect(repositorySource).not.toMatch(/payload_json/);
    expect(repositorySource).not.toMatch(/xml_envio/);
    expect(repositorySource).not.toMatch(/xml_retorno/);
    expect(repositorySource).not.toMatch(/erro_local/);
  });

  it('exposes fiscal-financial integrity audit without SEFAZ calls', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const routeStart = source.indexOf("router.get('/integridade-financeira',");
    const pendenciasStart = source.indexOf("router.get('/pendencias'", routeStart);
    const routeSource = source.slice(routeStart, pendenciasStart);

    expect(source).toMatch(/router\.get\(['"]\/integridade-financeira['"],\s*auth\(\),\s*authPermission\(['"]nfe\.integridade['"]\)/);
    expect(source).toMatch(/auditarIntegridadeFiscalFinanceiraNFe/);
    expect(routeStart).toBeGreaterThan(-1);
    expect(routeStart).toBeLessThan(pendenciasStart);
    expect(routeSource).not.toMatch(/getNFEWizard|callSEFAZ|NFE_|service\.executar|wizard\./);
    expect(routeSource).not.toMatch(/nfe_xml[:,]|xml:/);
  });

  it('exposes fiscal-financial integrity detail without SEFAZ calls', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const routeStart = source.indexOf("router.get('/integridade-financeira/:ordemId'");
    const listRouteStart = source.indexOf("router.get('/integridade-financeira'", routeStart + 1);
    const routeSource = source.slice(routeStart, listRouteStart);

    expect(source).toMatch(/router\.get\(['"]\/integridade-financeira\/:ordemId['"],\s*auth\(\),\s*authPermission\(['"]nfe\.integridade['"]\)/);
    expect(source).toMatch(/montarDetalheIntegridadeFiscalFinanceiraNFe/);
    expect(routeStart).toBeGreaterThan(-1);
    expect(routeStart).toBeLessThan(listRouteStart);
    expect(routeSource).toMatch(/Number\(req\.params\.ordemId\)/);
    expect(routeSource).toMatch(/status\(400\)/);
    expect(routeSource).toMatch(/status\(404\)/);
    expect(routeSource).not.toMatch(/getNFEWizard|callSEFAZ|NFE_|service\.executar|wizard\./);
    expect(routeSource).not.toMatch(/res\.json\([^)]*nfe_xml|xml:/s);
  });

  it('allows permitted users to locally reconcile fiscal-financial total divergence without SEFAZ calls', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const databaseSource = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');
    const routeStart = source.indexOf("router.post('/integridade-financeira/:ordemId/conciliar'");
    const nextRouteStart = source.indexOf("router.get('/integridade-financeira/:ordemId'", routeStart);
    const routeSource = source.slice(routeStart, nextRouteStart);

    expect(source).toMatch(/router\.post\(['"]\/integridade-financeira\/:ordemId\/conciliar['"],\s*auth\(\),\s*authPermission\(['"]nfe\.conciliar['"]\)/);
    expect(routeStart).toBeGreaterThan(-1);
    expect(routeStart).toBeLessThan(nextRouteStart);
    expect(routeSource).toMatch(/prepararConciliacaoIntegridadeFiscalFinanceiraNFe/);
    expect(routeSource).toMatch(/inserirConciliacaoIntegridadeFiscalFinanceiraNFe/);
    expect(routeSource).not.toMatch(/getNFEWizard|callSEFAZ|NFE_|service\.executar|wizard\./);
    expect(databaseSource).toMatch(/CREATE TABLE IF NOT EXISTS nfe_integridade_conciliacoes/);
    expect(databaseSource).toMatch(/CREATE INDEX IF NOT EXISTS idx_nfe_integridade_conciliacoes_ordem/);
  });

  it('exposes permission-gated integrity summary without external fiscal calls', () => {
    const source = fs.readFileSync(new URL('../routes/kpis.js', import.meta.url), 'utf8');
    const routeStart = source.indexOf('router.get("/integridade"');
    const streamStart = source.indexOf('router.get("/stream"');
    const routeSource = source.slice(routeStart, streamStart);

    expect(source).toMatch(/router\.get\(["']\/integridade["'],\s*auth\(\),\s*authPermission\(["']dashboard\.integridade["']\)/);
    expect(source).toMatch(/montarResumoIntegridade/);
    expect(source).toMatch(/listarPendenciasFiscais/);
    expect(source).toMatch(/auditarIntegridadeFinanceiraOS/);
    expect(source).toMatch(/getContasReceberPayload/);
    expect(source).toMatch(/auditarIntegridadeFiscalFinanceiraNFe/);
    expect(routeSource).not.toMatch(/SUM\(CASE|MAX\(0/);
    expect(routeSource).not.toMatch(/getNFEWizard|callSEFAZ|NFE_|wizard\.|service\.executar/);
    expect(routeSource).not.toMatch(/res\.json\([^)]*(xml|payload|cpf|phone)/s);
  });

  it('exposes sanitized fiscal pending transition audit without SEFAZ calls', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const repositorySource = fs.readFileSync(new URL('../repositories/nfePendenciaRepository.js', import.meta.url), 'utf8');
    const routeStart = source.indexOf("router.get('/pendencias/:origem/:id/transicoes'");
    const nextRouteStart = source.indexOf("router.get('/inutilizacoes/contexto'", routeStart);
    const routeSource = source.slice(routeStart, nextRouteStart);

    expect(source).toMatch(/router\.get\(['"]\/pendencias\/:origem\/:id\/transicoes['"],\s*auth\(\),\s*authPermission\(['"]nfe\.integridade['"]\)/);
    expect(source).toMatch(/buscarPendenciaFiscalComTransicoes/);
    expect(routeStart).toBeGreaterThan(-1);
    expect(routeStart).toBeLessThan(source.indexOf("router.get('/:chave/eventos'"));
    expect(routeSource).not.toMatch(/getNFEWizard|callSEFAZ|NFE_|service\.executar/);
    expect(repositorySource).not.toMatch(/SELECT[^`]*(payload_json|xml_envio|xml_retorno|erro_local)/s);
  });

  it('allows NF-e workflow for orders in production status', () => {
    const backendSource = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const notasSource = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');
    const detalheSource = fs.readFileSync(new URL('../../frontend/src/pages/OrdemDetalhe.jsx', import.meta.url), 'utf8');

    const eligibleStatuses = /STATUS_NFE_EMISSAO\s*=\s*\['Aguardando',\s*'Em Produção',\s*'Pronto',\s*'Entregue'\]/;
    expect(backendSource).toMatch(eligibleStatuses);
    expect(notasSource).toMatch(eligibleStatuses);
    expect(detalheSource).toMatch(eligibleStatuses);
    expect(notasSource).toMatch(/Aguardando, Em Produção, Pronto ou Entregue/);
  });

  it('offers common store NCM suggestions while keeping manual entry in NF-e review', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');

    expect(source).toMatch(/NCM_SUGESTOES_NFE/);
    expect(source).toMatch(/MDF[\s\S]+44151000/);
    expect(source).toMatch(/Acrilico[\s\S]+39269090/);
    expect(source).toMatch(/Molduras[\s\S]+44151000/);
    expect(source).toMatch(/function CampoNCM/);
    expect(source).toMatch(/value=""[\s\S]+Selecionar NCM comum/);
    expect(source).toMatch(/onChange=\{e => \{[\s\S]+if \(e\.target\.value\) onChange\(index, 'ncm', e\.target\.value\)/);
    expect(source).toMatch(/<CampoNCM item=\{item\} index=\{index\} onChange=\{atualizarItemFiscal\} \/>/);
    expect(source).not.toMatch(/<datalist/);
  });

  it('shows fiscal pending attempts on the NF-e operational page', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');

    expect(source).toMatch(/function PendenciasFiscaisPanel/);
    expect(source).toMatch(/api\.get\(['"]\/nfe\/pendencias['"],\s*\{\s*skipGlobalErrorToast:\s*true\s*\}\)/);
    expect(source).toMatch(/setPendenciasFiscais\(r\.data\?\.pendencias \|\| \[\]\)/);
    expect(source).toMatch(/\{canIntegridade && !lixeira && pendenciasFiscais\.length > 0 && \(/);
    expect(source).toMatch(/<PendenciasFiscaisPanel pendencias=\{pendenciasFiscais\}/);
  });

  it('shows fiscal-financial integrity findings on the NF-e operational page', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');
    const panelStart = source.indexOf('function IntegridadeFiscalFinanceiraPanel');
    const nextFunction = source.indexOf('function ModalAuditoriaPendenciaFiscal', panelStart);
    const panelSource = source.slice(panelStart, nextFunction);

    expect(source).toMatch(/function IntegridadeFiscalFinanceiraPanel/);
    expect(source).toMatch(/api\.get\(['"]\/nfe\/integridade-financeira['"],\s*\{\s*skipGlobalErrorToast:\s*true\s*\}\)/);
    expect(source).toMatch(/setIntegridadeFiscalFinanceira\(r\.data\?\.itens \|\| \[\]\)/);
    expect(source).toMatch(/\{canIntegridade && !lixeira && integridadeFiscalFinanceira\.length > 0 && \(/);
    expect(source).toMatch(/<IntegridadeFiscalFinanceiraPanel itens=\{integridadeFiscalFinanceira\} onRefresh=\{carregarIntegridadeFiscalFinanceira\}/);
    expect(panelSource).not.toMatch(/Reemitir|Cancelar|Corrigir|Consultar SEFAZ|Editar OS/);
  });

  it('opens read-only fiscal-financial integrity detail from the NF-e page', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');
    const modalStart = source.indexOf('function ModalAuditoriaIntegridadeFiscalFinanceira');
    const nextFunction = source.indexOf('function ModalAuditoriaPendenciaFiscal', modalStart);
    const modalSource = source.slice(modalStart, nextFunction);

    expect(source).toMatch(/function ModalAuditoriaIntegridadeFiscalFinanceira/);
    expect(source).toMatch(/api\.get\(`\/nfe\/integridade-financeira\/\$\{apontamento\.ordemId\}`,\s*\{\s*skipGlobalErrorToast:\s*true\s*\}\)/);
    expect(source).toMatch(/onAudit=\{setAuditoriaIntegridadeFiscalFinanceira\}/);
    expect(source).toMatch(/<IntegridadeFiscalFinanceiraPanel itens=\{integridadeFiscalFinanceira\} onRefresh=\{carregarIntegridadeFiscalFinanceira\} onAudit=\{setAuditoriaIntegridadeFiscalFinanceira\}/);
    expect(source).toMatch(/\{auditoriaIntegridadeFiscalFinanceira && <ModalAuditoriaIntegridadeFiscalFinanceira apontamento=\{auditoriaIntegridadeFiscalFinanceira\}/);
    expect(modalSource).not.toMatch(/Reemitir|Cancelar|Corrigir|Consultar SEFAZ|Editar OS|Emitir CC-e/);
  });

  it('offers permission-gated local reconciliation for divergent fiscal-financial findings', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');
    const modalStart = source.indexOf('function ModalAuditoriaIntegridadeFiscalFinanceira');
    const nextFunction = source.indexOf('function ModalAuditoriaPendenciaFiscal', modalStart);
    const modalSource = source.slice(modalStart, nextFunction);

    expect(source).toMatch(/canConciliar && apontamentos\.some\(item => item\.tipo === 'nfe_total_divergente'\)/);
    expect(source).toMatch(/api\.post\(`\/nfe\/integridade-financeira\/\$\{ordem\.id \|\| apontamento\?\.ordemId\}\/conciliar`,\s*\{\s*motivo: motivoConciliacao/);
    expect(source).toMatch(/onConciliado=\{\(\) => carregarIntegridadeFiscalFinanceira\(\)\}/);
    expect(modalSource).not.toMatch(/Conciliar.*SEFAZ|Corrigir.*XML|Editar.*OS/s);
  });

  it('opens read-only fiscal pending audit from the NF-e page', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');

    expect(source).toMatch(/function ModalAuditoriaPendenciaFiscal/);
    expect(source).toMatch(/api\.get\(`\/nfe\/pendencias\/\$\{pendencia\.origem\}\/\$\{pendencia\.id\}\/transicoes`,\s*\{\s*skipGlobalErrorToast:\s*true\s*\}\)/);
    expect(source).toMatch(/onAudit=\{setAuditoriaPendencia\}/);
    expect(source).toMatch(/<PendenciasFiscaisPanel pendencias=\{pendenciasFiscais\} onRefresh=\{carregarPendenciasFiscais\} onAudit=\{setAuditoriaPendencia\}/);
    expect(source).toMatch(/\{auditoriaPendencia && <ModalAuditoriaPendenciaFiscal pendencia=\{auditoriaPendencia\}/);
    expect(source).not.toMatch(/Resolver pendencia|Reenviar pendencia|Consultar SEFAZ agora/);
  });

  it('shows permission-gated integrity summary on Dashboard without corrective actions', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/Dashboard.jsx', import.meta.url), 'utf8');
    const panelStart = source.indexOf('function IntegridadeResumoPanel');
    const nextFunction = source.indexOf('export default function Dashboard', panelStart);
    const panelSource = source.slice(panelStart, nextFunction);

    expect(source).toMatch(/function IntegridadeResumoPanel/);
    expect(source).toMatch(/const \{ kpis: live, online \} = useKpiStream\(\)/);
    expect(source).toMatch(/can\(["']dashboard\.integridade["']\)/);
    expect(source).toMatch(/api\.get\(['"]\/kpis\/integridade['"],\s*\{\s*skipGlobalErrorToast:\s*true\s*\}\)/);
    expect(source).toMatch(/canViewIntegridade && integridadeResumo\?\.meta\?\.total > 0/);
    expect(source).toMatch(/<IntegridadeResumoPanel resumo=\{integridadeResumo\} onNavigate=\{navigate\}/);
    expect(panelSource).not.toMatch(/Corrigir|Consultar SEFAZ|Reenviar|Cancelar|Emitir CC-e|Editar OS/);
  });

  it('uses editable customer data in NF-e emission and persists it only after authorization', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const persistenceSource = fs.readFileSync(new URL('../services/nfePersistenceService.js', import.meta.url), 'utf8');

    expect(source).toMatch(/aplicarOverrideClienteNFe\(os,\s*req\.body\?\.cliente\)/);
    expect(source).toMatch(/cliente:\s*clienteComOverrides\.cliente/);
    expect(source).toMatch(/getAutXmlParaNFe\(clienteComOverrides\.cliente\.cpf\)/);
    expect(source).toMatch(/createNfePersistenceService/);
    expect(persistenceSource).toMatch(/UPDATE clientes[\s\S]+SET cpf = \?[\s\S]+WHERE id = \? AND deletedat IS NULL/);
    expect(persistenceSource.indexOf("SET nfe_status = 'autorizado'"))
      .toBeLessThan(persistenceSource.indexOf('UPDATE clientes'));
  });

  it('hydrates OS NF-e summary from nfe_notas without selecting canonical XML', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/LEFT JOIN nfe_notas nn/);
    expect(source).toMatch(/nn\.status AS nfe_status/);
    expect(source).toMatch(/nn\.chave AS nfe_chave/);
    expect(source).toMatch(/nn\.createdat AS nfe_emitida_em/);
    expect(source).toMatch(/NULL AS nfe_xml/);
    expect(source).not.toMatch(/nn\.xml/);
  });

  it('emits OS NF-e through nfe_notas without writing active legacy ordem fields', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/buscarNotaAtivaParaOrdem/);
    expect(source).toMatch(/criarNotaEmitindo/);
    expect(source).toMatch(/marcarNotaAutorizada/);
    expect(source).toMatch(/marcarNotaRejeitada/);
    expect(source).toMatch(/substituirItensNota/);
    expect(source).not.toMatch(/UPDATE ordens\s+SET\s+nfe_status = 'emitindo'/);
    expect(source).not.toMatch(/UPDATE ordens SET nfe_status='rejeitado'/);
    expect(source).not.toMatch(/nfe_xml\s+=\s+\?/);
  });

  it('keeps avulsa NF-e emission independent from OS and caixa writes', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const start = source.indexOf("router.post('/avulsa'");
    const end = source.indexOf("router.get('/:chave/eventos'", start);
    const avulsaRoute = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(avulsaRoute).toMatch(/origem:\s*'avulsa'/);
    expect(avulsaRoute).toMatch(/ordemid:\s*null/);
    expect(avulsaRoute).toMatch(/validarClienteFiscalNFe\(clienteNormalizado\.cliente\)/);
    expect(avulsaRoute).not.toMatch(/INSERT INTO ordens/);
    expect(avulsaRoute).not.toMatch(/INSERT INTO lancamentos/);
    expect(avulsaRoute).not.toMatch(/INSERT INTO lancamento_itens/);
    expect(avulsaRoute).not.toMatch(/salvarClienteCadastroAposEmissao/);
    expect(avulsaRoute).not.toMatch(/detalhe:\s*(e|err|sefazErr)\.message/);
  });

  it('keeps avulsa NF-e emission conservative for non-conclusive SEFAZ responses', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const start = source.indexOf("router.post('/avulsa'");
    const end = source.indexOf("router.get('/exportar'", start);
    const avulsaRoute = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(avulsaRoute).toMatch(/classificarResultadoEmissao/);
    expect(avulsaRoute).toMatch(/marcarNotaIncerta/);
    expect(avulsaRoute).toMatch(/tipo:\s*'incerto'/);
    expect(avulsaRoute).toMatch(/validarXmlAutorizacao\(xmlAutorizacao,\s*chave\)/);
  });

  it('routes complementary NF-e information into note storage and SEFAZ payload', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/normalizarInformacoesComplementares/);
    expect(source).toMatch(/informacoes_complementares:\s*informacoesComplementares/);
    expect(source).toMatch(/montarNFe\(\{[\s\S]+informacoes_complementares:\s*informacoesComplementares/);
  });

  it('routes NF-e list and fiscal document reads through nfe_notas', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/listarNotasFiscais/);
    expect(source).toMatch(/resolverNotaPorChave/);
    expect(source).toMatch(/nfe_notas/);
    expect(source).toMatch(/router\.get\(['"]\/:chave\/xml\/autorizacao['"]/);
    expect(source).toMatch(/renderDanfePdf\(html\)/);
    expect(source).toMatch(/Content-Type['"],\s*['"]application\/pdf/);
    expect(source).toMatch(/attachment; filename="danfe-\$\{filenameSeguro\(chave\)\}\.pdf"/);
  });

  it('only serves authorization XML and DANFE for authorized fiscal notes with valid legal XML', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const xmlRouteStart = source.indexOf("router.get('/:chave/xml/autorizacao'");
    const danfeRouteStart = source.indexOf("router.get('/:chave/danfe'");
    const eventosRouteStart = source.indexOf("router.get('/eventos/:eventoId/xml'");
    const xmlRoute = source.slice(xmlRouteStart, danfeRouteStart);
    const danfeRoute = source.slice(danfeRouteStart, eventosRouteStart);

    expect(xmlRouteStart).toBeGreaterThan(-1);
    expect(danfeRouteStart).toBeGreaterThan(-1);
    expect(xmlRoute).toMatch(/notaPermiteDocumentoAutorizacao\(nota\)/);
    expect(xmlRoute).toMatch(/validarXmlAutorizacao\(xml,\s*chave\)/);
    expect(danfeRoute).toMatch(/notaPermiteDocumentoAutorizacao\(nota\)/);
    expect(danfeRoute).toMatch(/validarXmlAutorizacao\(xml,\s*chave\)/);
  });

  it('wires NF-e ZIP export before dynamic fiscal routes', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/gerarExportacaoNFe/);
    expect(source).toMatch(/router\.get\(['"]\/exportar['"],\s*auth\(\),\s*authPermission\(['"]nfe\.exportar['"]\)/);
    expect(source.indexOf("router.get('/exportar'")).toBeLessThan(source.indexOf("router.get('/:chave/eventos'"));
    expect(source).toMatch(/Content-Type['"],\s*result\.contentType/);
    expect(source).toMatch(/Content-Disposition['"],\s*`attachment; filename="\$\{result\.filename\}"/);
  });

  it('resolves CC-e and cancellation through nfe_notas instead of legacy ordem fiscal columns', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/marcarNotaCancelada/);
    expect(source).toMatch(/const nota = resolverNotaPorChave\(db,\s*chave\)/);
    expect(source).toMatch(/nota\.status/);
    expect(source).toMatch(/nota\.protocolo/);
    expect(source).toMatch(/nfeid:\s*nota\.id/);
    expect(source).not.toMatch(/SELECT \* FROM ordens WHERE nfe_chave = \?/);
    expect(source).not.toMatch(/UPDATE ordens SET nfe_status='cancelado'/);
  });

  it('links NF-e authorization and rejection events to the canonical note id', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/INSERT INTO nfe_eventos[\s\S]+\(nfeid, ordemid, chave/);
    expect(source).toMatch(/nfeid:\s*notaEmitindo\.id/);
  });

  it('documents phase 2 cleanup by keeping legacy ordem NF-e columns out of active fiscal routes', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/nfe_notas/);
    expect(source).not.toMatch(/SELECT \* FROM ordens WHERE nfe_chave/);
    expect(source).not.toMatch(/UPDATE ordens SET[\s\S]+nfe_status/);
    expect(source).not.toMatch(/nfe_xml\s+=\s+\?/);
  });

  it('keeps NF-e trash as a soft delete that is hidden from the main list', () => {
    const databaseSource = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
    const serviceSource = fs.readFileSync(new URL('../services/nfeNotasService.js', import.meta.url), 'utf8');

    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_deletedat TEXT/);
    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_deletedpor INTEGER/);
    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_deletedreason TEXT/);
    expect(source).toMatch(/listarNotasFiscais\(getDB\(\),\s*\{\s*lixeira:\s*false\s*\}\)/);
    expect(source).toMatch(/router\.get\(['"]\/lixeira['"],\s*auth\(\),\s*authPermission\(['"]nfe\.lixeira['"]\)/);
    expect(source).toMatch(/listarNotasFiscais\(getDB\(\),\s*\{\s*lixeira:\s*true\s*\}\)/);
    expect(source).toMatch(/moverNotaParaLixeira/);
    expect(source).toMatch(/restaurarNotaDaLixeira/);
    expect(serviceSource).toMatch(/UPDATE nfe_notas\s+SET deletedat=datetime\('now','localtime'\)/);
    expect(serviceSource).toMatch(/UPDATE nfe_notas\s+SET deletedat=NULL/);
    expect(source).not.toMatch(/UPDATE ordens SET nfe_deletedat/);
  });

  it('blocks moving authorized or cancelled NF-e records to fiscal trash', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const STATUS_NFE_LIXEIRA = \['rejeitado'\]/);
    expect(source).toMatch(/!STATUS_NFE_LIXEIRA\.includes\(nota\.status\)/);
    expect(source).toMatch(/NF-e autorizada ou cancelada nao pode ser movida para a lixeira/);
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
    expect(source).toMatch(/res\.json\(\{\s*data:\s*anexarAvisosWhatsApp\(rows,\s*req\.user\),\s*meta:/);
  });

  it('exposes latest status movement timestamp for Oficina ordering', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/AS statusalteradoem/);
    expect(source).toMatch(/FROM statuslog sl[\s\S]+sl\.ordemid=o\.id[\s\S]+sl\.statusnovo=o\.status/);
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
  it('exposes backup status and returns full manual backup result', () => {
    const source = fs.readFileSync(new URL('../routes/backup.js', import.meta.url), 'utf8');

    expect(source).toMatch(/readBackupStatus/);
    expect(source).toMatch(/res\.json\(result\)/);
    expect(source).not.toMatch(/res\.json\(\{\s*ok:\s*true\s*\}\)/);
  });

  it('writes backup-status.json after backup attempts', () => {
    const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');
    const configuracoesSource = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');

    expect(source).toMatch(/utils\/backupStatus/);
    expect(source).toMatch(/writeBackupStatus/);
    expect(source).toMatch(/buildBackupStatus/);
    expect(source).toMatch(/runOffsiteBackup/);
    expect(configuracoesSource).toMatch(/readBackupStatus/);
    expect(configuracoesSource).not.toMatch(/function backupAtual\(\)\s*\{\s*return buildBackupStatus\(BACKUPS_DIR\);/);
  });

  it('keeps local backup success when offsite upload fails', () => {
    const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(source).toMatch(/offsiteResult\?\.ok === false/);
    expect(source).toMatch(/statusAnterior\.offsite\.ultimo/);
    expect(source).toMatch(/return \{\s*ok: true/);
  });

  it('sanitizes local backup failure before persisting and logging it', () => {
    const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const mensagem = sanitizeMessage\(e\.message\)/);
    expect(source).toMatch(/offsiteSnapshotToBuildInput\(statusAnterior\.offsite\)/);
    expect(source).not.toMatch(/buildBackupStatus\(bdir,\s*\{\s*offsite:\s*statusAnterior\.offsite\s*\}\)/);
    expect(source).toMatch(/ultimoErro = \{\s*mensagem,/);
    expect(source).toMatch(/console\.error\("\[Backup\] Erro:",\s*mensagem\)/);
    expect(source).toMatch(/throw new Error\(mensagem\)/);
    expect(source).toMatch(/console\.log\("\[Backup\] Salvo:",\s*path\.basename\(dest\)\)/);
    expect(source).not.toMatch(/console\.log\("\[Backup\] Salvo:",\s*dest\)/);
  });
});

describe('configuration route contracts', () => {
  it('protects WhatsApp secrets before database persistence', () => {
    const source = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');

    expect(source).toMatch(/prepararWhatsappSecretsParaPersistencia/);
    expect(source).not.toMatch(/const token = config\.token \|\| atual\.token \|\| null/);
    expect(source).not.toMatch(/const webApiKey = config\.webApiKey \|\| atual\.web_api_key \|\| null/);
  });
});

describe('propostas route contracts', () => {
  it('mounts propostas API and protects it with fine-grained RBAC permissions', () => {
    const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const propostasSource = fs.readFileSync(new URL('../routes/propostas.js', import.meta.url), 'utf8');

    expect(source).toMatch(/app\.use\(["']\/api\/propostas["'],\s*require\(["']\.\/routes\/propostas["']\)\)/);

    expect(propostasSource).toMatch(/const\s+\{\s*auth,\s*authPermission\s*\}\s*=\s*require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(propostasSource).toMatch(/router\.get\(["']\/["'],\s*auth\(\),\s*authPermission\(["']propostas\.ver["']\)/);
    expect(propostasSource).toMatch(/router\.get\(["']\/:id["'],\s*auth\(\),\s*authPermission\(["']propostas\.ver["']\)/);
    expect(propostasSource).toMatch(/router\.post\(["']\/["'],\s*auth\(\),\s*authPermission\(["']propostas\.criar["']\)/);
    expect(propostasSource).toMatch(/router\.patch\(["']\/:id\/status["'],\s*auth\(\),\s*authPermission\(["']propostas\.editar_status["']\)/);
    expect(propostasSource).toMatch(/router\.post\(["']\/:id\/gerar-os["'],\s*auth\(\),\s*authPermission\(["']propostas\.gerar_os["']\)/);
  });

  it('implements proposal conversion without generating OS numbers before approval', () => {
    const source = fs.readFileSync(new URL('../routes/propostas.js', import.meta.url), 'utf8');

    expect(source).toMatch(/podeGerarOS/);
    expect(source).toMatch(/gerarNumeroOS/);
    expect(source).toMatch(/INSERT INTO ordens/);
    expect(source).toMatch(/UPDATE propostas SET ordemid=\?/);
  });

  it('exposes printable proposal PDF through the proposal print permission', () => {
    const source = fs.readFileSync(new URL('../routes/propostas.js', import.meta.url), 'utf8');

    expect(source).toMatch(/router\.get\(["']\/:id\/pdf["'],\s*auth\(\),\s*authPermission\(["']propostas\.imprimir["']\)/);
    expect(source).toMatch(/renderPropostaHtml/);
    expect(source).toMatch(/sendPrintHtml/);
  });
});
