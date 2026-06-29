const { normalizeCnpj, validaCNPJ } = require("../domain/cnpjRules");

const CNPJ_USER_AGENT = "SistemaArte/2.0 (+https://arteemolduras.com.br)";

function serviceError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeReceitaWs(data, cnpj) {
  const telefone = String(data.telefone || "")
    .split("/")
    .map(part => onlyDigits(part))
    .filter(Boolean);

  return {
    fonte: "receitaws",
    razao_social: data.nome || data.razao_social || "",
    nome_fantasia: data.fantasia || data.nome_fantasia || data.nome || "",
    cnpj,
    email: data.email || "",
    cep: onlyDigits(data.cep),
    logradouro: data.logradouro || "",
    numero: data.numero || "",
    bairro: data.bairro || "",
    municipio: data.municipio || "",
    uf: data.uf || "",
    ddd_telefone_1: telefone[0] || "",
    ddd_telefone_2: telefone[1] || "",
  };
}

async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function consultarCnpj(rawCnpj, options = {}) {
  const cnpj = normalizeCnpj(rawCnpj);
  if (cnpj.length !== 14 || !validaCNPJ(cnpj)) {
    throw serviceError(400, "CNPJ invalido");
  }

  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    accept: "application/json",
    "User-Agent": CNPJ_USER_AGENT,
  };

  let brasilApiFailure = null;
  try {
    const { response, data } = await fetchJson(
      fetchImpl,
      `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`,
      { signal: controller.signal, headers }
    );
    if (response.ok && data?.razao_social) {
      clearTimeout(timeout);
      return { ...data, fonte: "brasilapi" };
    }
    brasilApiFailure = { status: response.status, data };
  } catch (err) {
    if (err.name === "AbortError") throw serviceError(504, "Consulta de CNPJ demorou demais");
    brasilApiFailure = err;
  }

  if (/^\d{14}$/.test(cnpj)) {
    try {
      const { response, data } = await fetchJson(
        fetchImpl,
        `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
        { signal: controller.signal, headers }
      );
      if (response.ok && data?.status !== "ERROR") {
        return normalizeReceitaWs(data, cnpj);
      }
    } catch (err) {
      if (err.name === "AbortError") throw serviceError(504, "Consulta de CNPJ demorou demais");
    } finally {
      clearTimeout(timeout);
    }
  } else {
    clearTimeout(timeout);
  }

  if (brasilApiFailure?.status === 404) {
    throw serviceError(404, "CNPJ nao encontrado");
  }
  throw serviceError(503, "Nao foi possivel consultar o CNPJ. Tente novamente.");
}

module.exports = {
  consultarCnpj,
};
