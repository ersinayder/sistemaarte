const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = require("express").Router();
const { getOne, getAll, run, runInsert } = require("../database");
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
  return {
    empresa: statusEmpresaConfig(empresa),
    fiscal: fiscal.status,
    whatsapp: {
      status: "Pendente",
      missing: ["provedor", "token", "telefone"],
    },
    backups: {
      status: "Pendente",
      missing: ["offsite", "monitoramento"],
    },
    seguranca: {
      status: "Pendente",
      missing: ["helmet", "rate-limit", "lockout-login"],
    },
    sistema: {
      status: "OK",
      missing: [],
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

function garantirSequenciaNFe(serie) {
  run(
    "INSERT OR IGNORE INTO nfe_sequencias (serie, ultimo_numero) VALUES (?, 0)",
    [serie]
  );
  return getOne("SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?", [serie]);
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

    run(
      `INSERT INTO fiscal_config (id, ambiente, serie, updatedat)
       VALUES (1, ?, ?, datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         ambiente=excluded.ambiente,
         serie=excluded.serie,
         updatedat=datetime('now','localtime')`,
      [fiscal.ambiente, fiscal.serie]
    );

    const sequencia = garantirSequenciaNFe(fiscal.serie);
    const ultimoNumero = Number(sequencia?.ultimo_numero || 0);
    const currentNext = ultimoNumero + 1;

    if (fiscal.proximoNumero !== undefined) {
      if (fiscal.proximoNumero < currentNext && req.body?.confirmarReducao !== true) {
        return res.status(409).json({
          error: "Confirmacao necessaria para reduzir numeracao",
          currentNext,
        });
      }

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

    run(
      `INSERT INTO fiscal_config (id, certificado_senha, updatedat)
       VALUES (1, ?, datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET
         certificado_senha=excluded.certificado_senha,
         updatedat=datetime('now','localtime')`,
      [senha]
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
