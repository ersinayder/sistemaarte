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
  it('exposes whatsapp notice routes with explicit role restrictions', async () => {
    const ordensRouter = await loadRouter('../routes/ordens.js');

    expect(routeRoles(ordensRouter, 'post', '/:id/whatsapp-avisos/:tipo/abrir')).toEqual(['admin', 'caixa', 'oficina']);
    expect(routeRoles(ordensRouter, 'patch', '/:id/whatsapp-avisos/:tipo/status')).toEqual(['admin', 'caixa', 'oficina']);
  });

  it('restricts fiscal write routes to admin and caixa', async () => {
    const nfeRouter = await loadRouter('../routes/nfe.js');

    expect(routeRoles(nfeRouter, 'get', '/status-servico')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'get', '/emitir/:id/preview')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'post', '/emitir/:id')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'post', '/:chave/cce')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'post', '/:chave/cancelar')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'get', '/lixeira')).toEqual(['admin']);
    expect(routeRoles(nfeRouter, 'delete', '/:id')).toEqual(['admin']);
    expect(routeRoles(nfeRouter, 'post', '/:id/restore')).toEqual(['admin']);
  });

  it('restricts sensitive read routes away from oficina', async () => {
    const caixaRouter = await loadRouter('../routes/caixa.js');
    const relatoriosRouter = await loadRouter('../routes/relatorios.js');
    const financeiroRouter = await loadRouter('../routes/financeiro.js');
    const clientesRouter = await loadRouter('../routes/clientes.js');
    const produtosRouter = await loadRouter('../routes/produtos.js');

    expect(routeRoles(caixaRouter, 'get', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(caixaRouter, 'get', '/fechamento')).toEqual(['admin', 'caixa']);
    expect(routeRoles(relatoriosRouter, 'get', '/resumo')).toEqual(['admin', 'caixa']);
    expect(routeRoles(relatoriosRouter, 'get', '/producao/pdf')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/resumo')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/resumo/pdf')).toEqual(['admin']);
    expect(routeRoles(clientesRouter, 'get', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(clientesRouter, 'get', '/:id')).toEqual(['admin', 'caixa']);
    expect(routeRoles(clientesRouter, 'get', '/:id/ordens')).toEqual(['admin', 'caixa']);
    expect(routeRoles(produtosRouter, 'get', '/')).toEqual(['admin', 'caixa']);
    expect(routeRoles(produtosRouter, 'get', '/:id')).toEqual(['admin', 'caixa']);
  });

  it('keeps CEP lookup behind the authenticated API for admin and caixa', async () => {
    const consultaRouter = await loadRouter('../routes/consulta.js');

    expect(routeRoles(consultaRouter, 'get', '/cep/:cep')).toEqual(['admin', 'caixa']);
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

  it('selects Atendimento item quantity and price fields on focus', () => {
    const source = fs.readFileSync(new URL('../../frontend/src/pages/Atendimento.jsx', import.meta.url), 'utf8');

    expect(source).toMatch(/const selectInputValue/);
    expect(source).toMatch(/onFocus=\{selectInputValue\}/);
  });

  it('mounts admin financeiro API and paying accounts creates a caixa output', async () => {
    const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const source = fs.readFileSync(new URL('../routes/financeiro.js', import.meta.url), 'utf8');
    const financeiroRouter = await loadRouter('../routes/financeiro.js');

    expect(serverSource).toMatch(/app\.use\(["']\/api\/financeiro["'],\s*require\(["']\.\/routes\/financeiro["']\)\)/);
    expect(routeRoles(financeiroRouter, 'get', '/resumo')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/contas-pagar')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/contas-pagar/pdf')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'post', '/contas-pagar')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'patch', '/contas-pagar/:id/pagar')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/contas-receber')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/contas-receber/pdf')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/dre')).toEqual(['admin']);
    expect(routeRoles(financeiroRouter, 'get', '/dre/pdf')).toEqual(['admin']);
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

    expect(source).toMatch(/function redactOrdemForRole/);
    expect(source).toMatch(/role !== 'oficina'/);
    expect(source).toMatch(/saldoaberto/);
    expect(source).toMatch(/descontoinput,\s*\n\s*descontovalor,/);
    expect(source).toMatch(/function redactItensForRole/);
    expect(source).toMatch(/\{\s*preco_unitario,\s*subtotal,\s*\.\.\.item\s*\}/);
    expect(source).toMatch(/lancamentos:\s*req\.user\.role === 'oficina' \? \[\] : lancamentos/);
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
    const start = source.indexOf('if (req.user.role === "oficina")');
    const end = source.indexOf('const total =', start);
    const oficinaBranch = source.slice(start, end);

    expect(oficinaBranch).toContain('UPDATE ordens SET status=?');
    expect(oficinaBranch).not.toMatch(/saveItens/);
    expect(oficinaBranch).not.toMatch(/DELETE FROM ordem_itens/);
  });

  it('blocks oficina from cancelling an OS through update and status routes', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/req\.user\.role === "oficina"[\s\S]+status === 'Cancelado'[\s\S]+Oficina nao pode cancelar OS/);
    expect(source).toMatch(/req\.user\.role === 'oficina' && status === 'Cancelado'/);
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

  it('keeps print configuration admin-only and sanitized before server printing', async () => {
    const configuracoesRouter = await loadRouter('../routes/configuracoes.js');
    const source = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');

    expect(routeRoles(configuracoesRouter, 'get', '/impressao')).toEqual(['admin']);
    expect(routeRoles(configuracoesRouter, 'put', '/impressao')).toEqual(['admin']);
    expect(routeRoles(configuracoesRouter, 'post', '/impressao/teste')).toEqual(['admin']);
    expect(source).toMatch(/normalizarImpressaoConfig/);
    expect(source).toMatch(/validarImpressaoConfig/);
    expect(source).toMatch(/renderTesteImpressaoHtml/);
    expect(source).toMatch(/printHtml\(\{\s*html,\s*jobName:\s*["']teste-impressao-a5["']/);
  });

  it('keeps whatsapp web status admin-only and starts the queue worker behind an env gate', async () => {
    const configuracoesRouter = await loadRouter('../routes/configuracoes.js');
    const configuracoesSource = fs.readFileSync(new URL('../routes/configuracoes.js', import.meta.url), 'utf8');
    const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

    expect(routeRoles(configuracoesRouter, 'get', '/whatsapp/web-status')).toEqual(['admin']);
    expect(configuracoesSource).toMatch(/createWhatsappWebProvider/);
    expect(serverSource).toMatch(/WHATSAPP_WEB_ENABLED/);
    expect(serverSource).toMatch(/createWhatsappWorker/);
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

  it('keeps fiscal event XML downloads scoped to active OS for non-admin users', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/FROM nfe_eventos e[\s\S]+LEFT JOIN ordens o ON o\.id = e\.ordemid/);
    expect(source).toMatch(/req\.user\.role !== 'admin'[\s\S]+evento\.deletedat/);
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

  it('uses editable customer data in NF-e emission and persists it only after authorization', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/aplicarOverrideClienteNFe\(os,\s*req\.body\?\.cliente\)/);
    expect(source).toMatch(/cliente:\s*clienteComOverrides\.cliente/);
    expect(source).toMatch(/getAutXmlParaNFe\(clienteComOverrides\.cliente\.cpf\)/);
    expect(source).toMatch(/function salvarClienteCadastroAposEmissao/);
    expect(source).toMatch(/UPDATE clientes SET[\s\S]+name = \?[\s\S]+cpf = \?[\s\S]+WHERE id = \? AND deletedat IS NULL/);
    expect(source.indexOf('const autorizado = cStat ===')).toBeLessThan(source.indexOf('salvarClienteCadastroAposEmissao(db, os, clienteComOverrides.cliente)'));
  });

  it('keeps NF-e trash as a soft delete that is hidden from the main list', () => {
    const databaseSource = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_deletedat TEXT/);
    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_deletedpor INTEGER/);
    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_deletedreason TEXT/);
    expect(source).toMatch(/WHERE o\.nfe_status IS NOT NULL AND o\.deletedat IS NULL AND o\.nfe_deletedat IS NULL/);
    expect(source).toMatch(/router\.get\(['"]\/lixeira['"],\s*auth\(\['admin'\]\)/);
    expect(source).toMatch(/o\.nfe_deletedat IS NOT NULL/);
    expect(source).toMatch(/UPDATE ordens SET nfe_deletedat=datetime\('now','localtime'\), nfe_deletedpor=\?, nfe_deletedreason=\?/);
    expect(source).toMatch(/UPDATE ordens SET nfe_deletedat=NULL, nfe_deletedpor=NULL, nfe_deletedreason=NULL/);
  });

  it('blocks moving authorized or cancelled NF-e records to fiscal trash', () => {
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(source).toMatch(/const STATUS_NFE_LIXEIRA = \['rejeitado'\]/);
    expect(source).toMatch(/!STATUS_NFE_LIXEIRA\.includes\(nota\.nfe_status\)/);
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
    expect(source).toMatch(/res\.json\(\{\s*data:\s*anexarAvisosWhatsApp\(rows,\s*req\.user\.role\),\s*meta:/);
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
    expect(source).toMatch(/sendPrintHtml/);
  });
});
