const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = require("express").Router();
const { getOne, getAll, run, runInsert, backup } = require("../database");
const { auth, authPermission } = require("../middlewares/auth");
const {
  normalizarEmpresaConfig,
  validarEmpresaConfig,
  statusEmpresaConfig,
  pickEmpresaConfig,
} = require("../domain/configuracoesRules");
const {
  normalizarFiscalConfig,
  validarFiscalConfig,
  normalizarAutXml,
  validarAutXml,
} = require("../domain/fiscalConfigRules");
const {
  getFiscalConfig,
  getCnpjEmitente,
} = require("../utils/nfeConfig");
const { resetNFEWizard } = require("../utils/nfe");
const { encryptSecret } = require("../utils/secrets");
const {
  normalizarWhatsappConfig,
  validarWhatsappConfig,
} = require("../domain/whatsappConfigRules");
const {
  getWhatsappPublicConfig,
  getWhatsappRuntimeConfig,
  prepararWhatsappSecretsParaPersistencia,
} = require("../utils/whatsappConfig");
const {
  normalizarImpressaoConfig,
  validarImpressaoConfig,
  statusImpressaoConfig,
} = require("../domain/impressaoConfigRules");
const { getImpressaoConfig } = require("../utils/impressaoConfig");
const { diagnosePrintHtml, printHtml } = require("../utils/print/serverPrinter");
const { readBackupStatus } = require("../utils/backupStatus");
const pkg = require("../package.json");

const EMPRESA_COLUMNS = [
  "razaosocial",
  "nomefantasia",
  "cnpj",
  "inscricaoestadual",
  "crt",
  "telefone",
  "email",
  "logradouro",
  "numero",
  "bairro",
  "municipio",
  "codigomunicipio",
  "uf",
  "cep",
];

const SEL_EMPRESA = `
  SELECT
    razaosocial,
    nomefantasia,
    cnpj,
    inscricaoestadual,
    crt,
    telefone,
    email,
    logradouro,
    numero,
    bairro,
    municipio,
    codigomunicipio,
    uf,
    cep,
    updatedat
  FROM empresa_config
  WHERE id = 1
`;

const CERT_DIR = path.resolve(__dirname, "..", "certs");
const CERT_PATH = path.resolve(CERT_DIR, "certificado-config.pfx");
const BACKUPS_DIR = path.resolve(__dirname, "..", "data", "backups");

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(CERT_DIR, { recursive: true });
      cb(null, CERT_DIR);
    },
    filename: (_req, _file, cb) => cb(null, path.basename(CERT_PATH)),
  }),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/\.pfx$/i.test(file.originalname || "")) {
      return cb(new Error("Apenas arquivos .pfx sao aceitos"));
    }
    cb(null, true);
  },
});

const uploadCertificado = (req, res, next) => {
  upload.single("certificado")(req, res, (err) => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "Certificado deve ter no maximo 512KB"
      : err.message;
    return res.status(400).json({ error: message });
  });
};

const SEL_AUTXML_BASE = `
  SELECT id, nome, documento, tipo, ativo, createdat, updatedat
  FROM nfe_autxml
`;

const SEL_AUTXML = `
  ${SEL_AUTXML_BASE}
  ORDER BY id
`;

function empresaAtual() {
  return pickEmpresaConfig(getOne(SEL_EMPRESA) || {});
}

function statusConfiguracoes(empresa) {
  const fiscal = getFiscalConfig();
  const whatsapp = getWhatsappPublicConfig();
  const impressao = getImpressaoConfig();
  const backups = backupAtual();
  const seguranca = segurancaAtual();
  return {
    empresa: statusEmpresaConfig(empresa),
    fiscal: fiscal.status,
    whatsapp: whatsapp.status,
    impressao: impressao.status,
    backups: backups.status,
    seguranca: seguranca.status,
    sistema: sistemaAtual().status,
  };
}

function backupAtual() {
  return readBackupStatus(BACKUPS_DIR);
}

function whatsappRowAtual() {
  return getOne(`
    SELECT id, enabled, provider, phone_id, token, template_pronto,
           template_confirmacao, mensagem_pronto, mensagem_confirmacao,
           web_base_url, web_instance, web_api_key,
           configurado, updatedat
    FROM whatsapp_config
    WHERE id = 1
  `);
}

function renderTesteImpressaoHtml(config = {}) {
  const destino = config.destino || "Impressora nao resolvida";
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Teste de impressao A5</title>
  <style>
    @page { size: A5; margin: 6mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { width: 148mm; min-height: 210mm; padding: 8mm; border: 2px solid #111827; }
    .band { padding: 6mm; background: #009246; color: #fff; border-radius: 6px; }
    h1 { margin: 0; font-size: 22px; letter-spacing: .03em; }
    p { font-size: 12px; line-height: 1.45; }
    .swatches { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-top: 8mm; }
    .swatch { height: 24mm; border-radius: 6px; border: 1px solid #111827; }
    .c1 { background: #009246; }
    .c2 { background: #facc15; }
    .c3 { background: #ef4444; }
    .c4 { background: #2563eb; }
    .meta { margin-top: 8mm; padding: 4mm; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="band">
      <h1>Teste de impressao A5 colorida</h1>
      <p>Sistema Arte e Molduras</p>
    </section>
    <div class="swatches">
      <div class="swatch c1"></div>
      <div class="swatch c2"></div>
      <div class="swatch c3"></div>
      <div class="swatch c4"></div>
    </div>
    <section class="meta">
      <p><strong>Papel:</strong> A5</p>
      <p><strong>Cor:</strong> Ativada no documento</p>
      <p><strong>Destino:</strong> ${String(destino).replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]))}</p>
    </section>
  </main>
  <script>window.addEventListener("load",function(){window.setTimeout(function(){window.print();},150);});</script>
</body>
</html>`;
}

function segurancaAtual() {
  return {
    status: {
      status: "OK",
      missing: [],
    },
    politicas: {
      helmet: true,
      rateLimitGlobalPorMinuto: 60,
      loginTentativasPorIp: 10,
      lockoutLoginPorUsuario: true,
      loginJanelaMinutos: 15,
      senhaMinima: 8,
      sessaoHoras: 12,
      protegeAutoDesativacaoAdmin: true,
    },
    pendencias: [
      "Ativar backup offsite fora do servidor",
    ],
  };
}

function sistemaAtual() {
  return {
    status: { status: "OK", missing: [] },
    app: {
      nome: "Sistema Arte e Molduras",
      versao: pkg.version,
      node: process.versions.node,
      ambiente: process.env.NODE_ENV || "production",
      plataforma: `${process.platform} ${process.arch}`,
      timezone: process.env.TZ || "America/Sao_Paulo",
    },
    servicos: {
      api: "OK",
      banco: "OK",
      backups: "Configurado localmente",
    },
  };
}

function listarAutXml() {
  return getAll(SEL_AUTXML);
}

function buscarAutXml(id) {
  return getOne(
    `${SEL_AUTXML_BASE} WHERE id = ?`,
    [id]
  );
}

function contarAutXmlAtivos(excluirId = null) {
  const row = excluirId
    ? getOne("SELECT COUNT(*) AS total FROM nfe_autxml WHERE ativo = 1 AND id <> ?", [excluirId])
    : getOne("SELECT COUNT(*) AS total FROM nfe_autxml WHERE ativo = 1");
  return Number(row?.total || 0);
}

function obterSequenciaNFe(serie) {
  return getOne("SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?", [serie]);
}

function garantirSequenciaNFe(serie) {
  run(
    "INSERT OR IGNORE INTO nfe_sequencias (serie, ultimo_numero) VALUES (?, 0)",
    [serie]
  );
  return obterSequenciaNFe(serie);
}

function fiscalAtualComAutXml() {
  return {
    fiscal: getFiscalConfig(),
    autxml: listarAutXml(),
  };
}

router.get("/", auth(), authPermission("configuracoes.ver"), (_req, res, next) => {
  try {
    const empresa = empresaAtual();
    res.json({ empresa, status: statusConfiguracoes(empresa) });
  } catch (e) { next(e); }
});

router.get("/empresa", auth(), authPermission("configuracoes.ver"), (_req, res, next) => {
  try {
    const empresa = empresaAtual();
    res.json({ empresa, status: statusEmpresaConfig(empresa) });
  } catch (e) { next(e); }
});

router.put("/empresa", auth(), authPermission("configuracoes.editar_empresa"), (req, res, next) => {
  try {
    const empresa = normalizarEmpresaConfig(req.body || {});
    const validacao = validarEmpresaConfig(empresa);

    if (!validacao.ok) {
      return res.status(400).json({
        error: "Verifique os campos da empresa",
        errors: validacao.errors,
      });
    }

    run(
      `INSERT INTO empresa_config (id, ${EMPRESA_COLUMNS.join(", ")}, updatedat)
       VALUES (1, ${EMPRESA_COLUMNS.map(() => "?").join(", ")}, datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         ${EMPRESA_COLUMNS.map((column) => `${column}=excluded.${column}`).join(", ")},
         updatedat=datetime('now','localtime')`,
      EMPRESA_COLUMNS.map((column) => empresa[column])
    );

    const saved = empresaAtual();
    res.json({ empresa: saved, status: statusEmpresaConfig(saved) });
  } catch (e) { next(e); }
});

router.get("/fiscal", auth(), authPermission("configuracoes.editar_fiscal"), (_req, res, next) => {
  try {
    res.json(fiscalAtualComAutXml());
  } catch (e) { next(e); }
});

router.get("/whatsapp", auth(), authPermission("configuracoes.editar_whatsapp"), (_req, res, next) => {
  try {
    res.json({ whatsapp: getWhatsappPublicConfig() });
  } catch (e) { next(e); }
});

router.get("/whatsapp/web-status", auth(), authPermission("configuracoes.editar_whatsapp"), async (_req, res, next) => {
  try {
    const runtime = getWhatsappRuntimeConfig();
    if (runtime.provider !== "web_local" || !runtime.webBaseUrl || !runtime.webInstance) {
      return res.json({ connected: false, state: "not_configured", qr: null });
    }
    const { createWhatsappWebProvider, providerStatusFromError } = require("../utils/whatsappWebProvider");
    const provider = createWhatsappWebProvider({
      baseUrl: runtime.webBaseUrl,
      instance: runtime.webInstance,
      apiKey: runtime.webApiKey,
    });
    try {
      res.json(await provider.getStatus());
    } catch (providerError) {
      res.json(providerStatusFromError(providerError));
    }
  } catch (e) { next(e); }
});

router.get("/impressao", auth(), authPermission("configuracoes.editar_impressao"), (_req, res, next) => {
  try {
    res.json({ impressao: getImpressaoConfig() });
  } catch (e) { next(e); }
});

router.put("/impressao", auth(), authPermission("configuracoes.editar_impressao"), (req, res, next) => {
  try {
    const config = normalizarImpressaoConfig(req.body || {});
    const validacao = validarImpressaoConfig(config);

    if (!validacao.ok) {
      return res.status(400).json({
        error: "Verifique a configuracao de impressao",
        errors: validacao.errors,
      });
    }

    run(
      `INSERT INTO impressao_config (id, printer_name, printer_ip, paper_size, color, direct_print_enabled, updatedat)
       VALUES (1, ?, ?, 'A5', 1, ?, datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         printer_name=excluded.printer_name,
         printer_ip=excluded.printer_ip,
         paper_size='A5',
         color=1,
         direct_print_enabled=excluded.direct_print_enabled,
         updatedat=datetime('now','localtime')`,
      [config.printerName, config.printerIp, config.directPrintEnabled]
    );

    const impressao = getImpressaoConfig();
    res.json({ impressao, status: statusImpressaoConfig(impressao) });
  } catch (e) { next(e); }
});

router.post("/impressao/teste", auth(), authPermission("configuracoes.editar_impressao"), async (_req, res, next) => {
  try {
    const impressao = getImpressaoConfig();
    if (!impressao.directPrintEnabled) {
      return res.status(400).json({
        error: "Ative a impressao direta no servidor para enviar teste pela impressora do servidor.",
      });
    }
    const validacao = validarImpressaoConfig(impressao);
    if (!validacao.ok) {
      return res.status(400).json({
        error: "Verifique a configuracao de impressao",
        errors: validacao.errors,
      });
    }
    if (impressao.status?.status !== "OK") {
      return res.status(400).json({
        error: "Configure a impressora antes de imprimir o teste",
        errors: { printerName: "Nome da impressora e obrigatorio" },
      });
    }

    const html = renderTesteImpressaoHtml(impressao);
    const result = await printHtml({
      html,
      jobName: "teste-impressao-a5",
      copies: 1,
      printerConfig: impressao,
    });

    res.json({
      ok: true,
      message: "Teste de impressao A5 enviado.",
      printerName: result.printerName,
      copies: result.copies,
    });
  } catch (e) {
    res.status(500).json({
      error: "Nao foi possivel enviar o teste para a impressora do servidor.",
      detail: e.message,
    });
  }
});

router.post("/impressao/diagnostico", auth(), authPermission("configuracoes.editar_impressao"), async (_req, res, next) => {
  try {
    const impressao = getImpressaoConfig();
    if (!impressao.directPrintEnabled) {
      return res.status(400).json({
        error: "Ative a impressao direta no servidor para diagnosticar a impressora do servidor.",
      });
    }
    const validacao = validarImpressaoConfig(impressao);
    if (!validacao.ok) {
      return res.status(400).json({
        error: "Verifique a configuracao de impressao",
        errors: validacao.errors,
      });
    }
    if (impressao.status?.status !== "OK") {
      return res.status(400).json({
        error: "Configure a impressora antes de executar o diagnostico",
        errors: { printerName: "Nome da impressora e obrigatorio" },
      });
    }

    const html = renderTesteImpressaoHtml(impressao);
    const result = await diagnosePrintHtml({
      html,
      jobName: "diagnostico-impressao-a5",
      copies: 1,
      printerConfig: impressao,
    });

    res.json({
      ok: result.ok,
      message: result.ok
        ? "Diagnostico A5 enviado e pacote gerado."
        : "Diagnostico A5 gerado com erro no envio.",
      printerName: result.printerName,
      copies: result.copies,
      html,
      diagnostics: result.diagnostics,
      error: result.error || null,
    });
  } catch (e) { next(e); }
});

router.put("/whatsapp", auth(), authPermission("configuracoes.editar_whatsapp"), (req, res, next) => {
  try {
    const atual = whatsappRowAtual() || {};
    const config = normalizarWhatsappConfig(req.body || {});
    const validacao = validarWhatsappConfig(config, {
      tokenConfigurado: Boolean(atual.token),
    });

    if (!validacao.ok) {
      return res.status(400).json({
        error: "Verifique os campos do WhatsApp",
        errors: validacao.errors,
      });
    }

    const { token, webApiKey } = prepararWhatsappSecretsParaPersistencia(config, atual);
    run(
      `INSERT INTO whatsapp_config
        (id, enabled, provider, phone_id, token, template_pronto, template_confirmacao,
         mensagem_pronto, mensagem_confirmacao, web_base_url, web_instance, web_api_key,
         configurado, updatedat)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         enabled=excluded.enabled,
         provider=excluded.provider,
         phone_id=excluded.phone_id,
         token=excluded.token,
         template_pronto=excluded.template_pronto,
         template_confirmacao=excluded.template_confirmacao,
         mensagem_pronto=excluded.mensagem_pronto,
         mensagem_confirmacao=excluded.mensagem_confirmacao,
         web_base_url=excluded.web_base_url,
         web_instance=excluded.web_instance,
         web_api_key=excluded.web_api_key,
         configurado=1,
         updatedat=datetime('now','localtime')`,
      [
        config.enabled,
        config.provider,
        config.phoneId,
        token,
        config.templatePronto,
        config.templateConfirmacao,
        config.mensagemPronto,
        config.mensagemConfirmacao,
        config.webBaseUrl,
        config.webInstance,
        webApiKey,
      ]
    );

    res.json({ whatsapp: getWhatsappPublicConfig() });
  } catch (e) { next(e); }
});

router.get("/backups", auth(), authPermission("backups.ver"), (_req, res, next) => {
  try {
    res.json({ backups: backupAtual() });
  } catch (e) { next(e); }
});

router.post("/backups/manual", auth(), authPermission("backups.executar"), async (_req, res, next) => {
  try {
    await backup();
    res.json({ ok: true, backups: backupAtual() });
  } catch (e) { next(e); }
});

router.get("/seguranca", auth(), authPermission("configuracoes.seguranca"), (_req, res, next) => {
  try {
    res.json({ seguranca: segurancaAtual() });
  } catch (e) { next(e); }
});

router.get("/sistema", auth(), authPermission("configuracoes.ver"), (_req, res, next) => {
  try {
    res.json({ sistema: sistemaAtual() });
  } catch (e) { next(e); }
});

router.put("/fiscal", auth(), authPermission("configuracoes.editar_fiscal"), (req, res, next) => {
  try {
    const fiscal = normalizarFiscalConfig(req.body || {});
    const validacao = validarFiscalConfig(fiscal);

    if (!validacao.ok) {
      return res.status(400).json({
        error: "Verifique os campos fiscais",
        errors: validacao.errors,
      });
    }

    const sequencia = obterSequenciaNFe(fiscal.serie);
    const ultimoNumero = Number(sequencia?.ultimo_numero || 0);
    const currentNext = ultimoNumero + 1;

    if (fiscal.proximoNumero !== undefined) {
      if (fiscal.proximoNumero < currentNext && req.body?.confirmarReducao !== true) {
        return res.status(409).json({
          error: "Confirmacao necessaria para reduzir numeracao",
          currentNext,
        });
      }
    }

    run(
      `INSERT INTO fiscal_config (id, ambiente, serie, configurado, updatedat)
       VALUES (1, ?, ?, 1, datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         ambiente=excluded.ambiente,
         serie=excluded.serie,
         configurado=1,
         updatedat=datetime('now','localtime')`,
      [fiscal.ambiente, fiscal.serie]
    );

    garantirSequenciaNFe(fiscal.serie);

    if (fiscal.proximoNumero !== undefined) {
      run(
        "UPDATE nfe_sequencias SET ultimo_numero = ? WHERE serie = ?",
        [fiscal.proximoNumero - 1, fiscal.serie]
      );
    }

    resetNFEWizard();
    res.json(fiscalAtualComAutXml());
  } catch (e) { next(e); }
});

router.post("/fiscal/certificado", auth(), authPermission("configuracoes.editar_fiscal"), uploadCertificado, (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    run(
      `INSERT INTO fiscal_config
        (id, certificado_path, certificado_nome, certificado_updatedat, updatedat)
       VALUES (1, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         certificado_path=excluded.certificado_path,
         certificado_nome=excluded.certificado_nome,
         certificado_updatedat=datetime('now','localtime'),
         updatedat=datetime('now','localtime')`,
      [CERT_PATH, req.file.originalname || path.basename(CERT_PATH)]
    );

    resetNFEWizard();
    res.json({ fiscal: getFiscalConfig() });
  } catch (e) { next(e); }
});

router.put("/fiscal/certificado/senha", auth(), authPermission("configuracoes.editar_fiscal"), (req, res, next) => {
  try {
    const senha = String(req.body?.senha ?? "");
    if (!senha.trim()) return res.status(400).json({ error: "Senha do certificado e obrigatoria" });
    const senhaProtegida = encryptSecret(senha);

    run(
      `INSERT INTO fiscal_config (id, certificado_senha, updatedat)
       VALUES (1, ?, datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         certificado_senha=excluded.certificado_senha,
         updatedat=datetime('now','localtime')`,
      [senhaProtegida]
    );

    resetNFEWizard();
    res.json({ ok: true, certificado: getFiscalConfig().certificado });
  } catch (e) { next(e); }
});

router.get("/fiscal/autxml", auth(), authPermission("configuracoes.editar_fiscal"), (_req, res, next) => {
  try {
    res.json({ autxml: listarAutXml() });
  } catch (e) { next(e); }
});

router.post("/fiscal/autxml", auth(), authPermission("configuracoes.editar_fiscal"), (req, res, next) => {
  try {
    const item = normalizarAutXml(req.body || {});
    const validacao = validarAutXml(item, {
      emitenteDocumento: getCnpjEmitente(),
      ativosCount: contarAutXmlAtivos(),
    });

    if (!validacao.ok) {
      return res.status(400).json({
        error: "Verifique os autorizados XML",
        errors: validacao.errors,
      });
    }

    const id = runInsert(
      `INSERT INTO nfe_autxml (nome, documento, tipo, ativo, updatedat)
       VALUES (?, ?, ?, ?, datetime('now','localtime'))`,
      [item.nome, item.documento, item.tipo, item.ativo]
    );

    res.status(201).json({
      autxml: buscarAutXml(id),
      list: listarAutXml(),
    });
  } catch (e) { next(e); }
});

router.put("/fiscal/autxml/:id", auth(), authPermission("configuracoes.editar_fiscal"), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "ID invalido" });
    }

    const atual = buscarAutXml(id);
    if (!atual) return res.status(404).json({ error: "Autorizado XML nao encontrado" });

    const item = normalizarAutXml({ ...atual, ...(req.body || {}) });
    const validacao = validarAutXml(item, {
      emitenteDocumento: getCnpjEmitente(),
      currentAtivo: Number(atual.ativo) === 1,
      ativosCount: contarAutXmlAtivos(id),
    });

    if (!validacao.ok) {
      return res.status(400).json({
        error: "Verifique os autorizados XML",
        errors: validacao.errors,
      });
    }

    run(
      `UPDATE nfe_autxml
       SET nome = ?,
           documento = ?,
           tipo = ?,
           ativo = ?,
           updatedat = datetime('now','localtime')
       WHERE id = ?`,
      [item.nome, item.documento, item.tipo, item.ativo, id]
    );

    res.json({
      autxml: buscarAutXml(id),
      list: listarAutXml(),
    });
  } catch (e) { next(e); }
});

router.delete("/fiscal/autxml/:id", auth(), authPermission("configuracoes.editar_fiscal"), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "ID invalido" });
    }

    const result = run("DELETE FROM nfe_autxml WHERE id = ?", [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Autorizado XML nao encontrado" });
    }

    res.json({ ok: true, autxml: listarAutXml() });
  } catch (e) { next(e); }
});

module.exports = router;
