const router = require("express").Router();
const { getOne, run } = require("../database");
const { auth } = require("../middlewares/auth");
const {
  normalizarEmpresaConfig,
  validarEmpresaConfig,
  statusEmpresaConfig,
  pickEmpresaConfig,
} = require("../domain/configuracoesRules");

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

function empresaAtual() {
  return pickEmpresaConfig(getOne(SEL_EMPRESA) || {});
}

function statusConfiguracoes(empresa) {
  return {
    empresa: statusEmpresaConfig(empresa),
    fiscal: {
      status: "Pendente",
      missing: ["certificado", "ambiente", "serie", "numero"],
    },
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
      `UPDATE empresa_config
       SET ${EMPRESA_COLUMNS.map((column) => `${column}=?`).join(", ")},
           updatedat=datetime('now','localtime')
       WHERE id=1`,
      EMPRESA_COLUMNS.map((column) => empresa[column])
    );

    const saved = empresaAtual();
    res.json({ empresa: saved, status: statusEmpresaConfig(saved) });
  } catch (e) { next(e); }
});

module.exports = router;
