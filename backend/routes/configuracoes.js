const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = require("express").Router();
const { getOne, getAll, run, runInsert, backup } = require("../database");
const { auth } = require("../middlewares/auth");
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
const { getWhatsappPublicConfig } = require("../utils/whatsappConfig");
const { buildBackupStatus } = require("../utils/backupStatus");
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
  const backups = backupAtual();
  const seguranca = segurancaAtual();
  return {
    empresa: statusEmpresaConfig(empresa),
    fiscal: fiscal.status,
    whatsapp: whatsapp.status,
    backups: backups.status,
    seguranca: seguranca.status,
    sistema: sistemaAtual().status,
  };
}

function backupAtual() {
  return buildBackupStatus(BACKUPS_DIR);
}

function whatsappRowAtual() {
  return getOne(`
    SELECT id, enabled, provider, phone_id, token, template_pronto,
           template_confirmacao, configurado, updatedat
    FROM whatsapp_config
    WHERE id = 1
  `);
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

router.get("/", auth(["admin"]), (_req, res, next) => {
  try {
    const empresa = empresaAtual();
    res.json({ empresa, status: statusConfiguracoes(empresa) });
  } catch (e) { next(e); }
});

router.get("/empresa", auth(["admin"]), (_req, res, next) => {
  try {
    const empresa = empresaAtual();
    res.json({ empresa, status: statusEmpresaConfig(empresa) });
  } catch (e) { next(e); }
});

router.put("/empresa", auth(["admin"]), (req, res, next) => {
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

router.get("/fiscal", auth(["admin"]), (_req, res, next) => {
  try {
    res.json(fiscalAtualComAutXml());
  } catch (e) { next(e); }
});

router.get("/whatsapp", auth(["admin"]), (_req, res, next) => {
  try {
    res.json({ whatsapp: getWhatsappPublicConfig() });
  } catch (e) { next(e); }
});

router.put("/whatsapp", auth(["admin"]), (req, res, next) => {
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

    const token = config.token || atual.token || null;
    run(
      `INSERT INTO whatsapp_config
        (id, enabled, provider, phone_id, token, template_pronto, template_confirmacao, configurado, updatedat)
       VALUES (1, ?, ?, ?, ?, ?, ?, 1, datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         enabled=excluded.enabled,
         provider=excluded.provider,
         phone_id=excluded.phone_id,
         token=excluded.token,
         template_pronto=excluded.template_pronto,
         template_confirmacao=excluded.template_confirmacao,
         configurado=1,
         updatedat=datetime('now','localtime')`,
      [
        config.enabled,
        config.provider,
        config.phoneId,
        token,
        config.templatePronto,
        config.templateConfirmacao,
      ]
    );

    res.json({ whatsapp: getWhatsappPublicConfig() });
  } catch (e) { next(e); }
});

router.get("/backups", auth(["admin"]), (_req, res, next) => {
  try {
    res.json({ backups: backupAtual() });
  } catch (e) { next(e); }
});

router.post("/backups/manual", auth(["admin"]), async (_req, res, next) => {
  try {
    await backup();
    res.json({ ok: true, backups: backupAtual() });
  } catch (e) { next(e); }
});

router.get("/seguranca", auth(["admin"]), (_req, res, next) => {
  try {
    res.json({ seguranca: segurancaAtual() });
  } catch (e) { next(e); }
});

router.get("/sistema", auth(["admin"]), (_req, res, next) => {
  try {
    res.json({ sistema: sistemaAtual() });
  } catch (e) { next(e); }
});

router.put("/fiscal", auth(["admin"]), (req, res, next) => {
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

router.post("/fiscal/certificado", auth(["admin"]), uploadCertificado, (req, res, next) => {
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

router.put("/fiscal/certificado/senha", auth(["admin"]), (req, res, next) => {
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

router.get("/fiscal/autxml", auth(["admin"]), (_req, res, next) => {
  try {
    res.json({ autxml: listarAutXml() });
  } catch (e) { next(e); }
});

router.post("/fiscal/autxml", auth(["admin"]), (req, res, next) => {
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

router.put("/fiscal/autxml/:id", auth(["admin"]), (req, res, next) => {
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

router.delete("/fiscal/autxml/:id", auth(["admin"]), (req, res, next) => {
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
