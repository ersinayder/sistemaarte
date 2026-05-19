const PROVIDERS_VALIDOS = ["meta"];

function cleanText(value, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizarWhatsappConfig(input = {}) {
  return {
    enabled: input.enabled === true || input.enabled === 1 || input.enabled === "1" ? 1 : 0,
    provider: cleanText(input.provider ?? input.provedor ?? "meta", 30).toLowerCase() || "meta",
    phoneId: cleanText(input.phoneId ?? input.phone_id, 80),
    token: cleanText(input.token, 500),
    templatePronto: cleanText(input.templatePronto ?? input.template_pronto ?? "os_pronta", 80).toLowerCase() || "os_pronta",
    templateConfirmacao: cleanText(input.templateConfirmacao ?? input.template_confirmacao ?? "confirmacao_pedido", 80).toLowerCase() || "confirmacao_pedido",
  };
}

function validarWhatsappConfig(config, { tokenConfigurado = false } = {}) {
  const errors = {};

  if (!PROVIDERS_VALIDOS.includes(config.provider)) {
    errors.provider = "Provedor invalido";
  }

  if (!config.templatePronto) {
    errors.templatePronto = "Template de OS pronta e obrigatorio";
  }

  if (!config.templateConfirmacao) {
    errors.templateConfirmacao = "Template de confirmacao e obrigatorio";
  }

  if (config.enabled) {
    if (!config.phoneId) errors.phoneId = "Phone Number ID e obrigatorio";
    if (!config.token && !tokenConfigurado) errors.token = "Token e obrigatorio";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function statusWhatsappConfig(config = {}) {
  const enabled = config.enabled === true || Number(config.enabled) === 1;
  if (!enabled) return { status: "Inativo", missing: [] };

  const missing = [];
  if (!cleanText(config.phoneId ?? config.phone_id)) missing.push("phoneId");
  if (!config.tokenConfigurado && !cleanText(config.token)) missing.push("token");

  return {
    status: missing.length ? "Pendente" : "OK",
    missing,
  };
}

function sanitizarWhatsappConfig(row = {}) {
  const normalized = normalizarWhatsappConfig(row);
  const tokenConfigurado = Boolean(cleanText(row.token));
  const out = {
    enabled: Boolean(normalized.enabled),
    provider: normalized.provider,
    phoneId: normalized.phoneId,
    tokenConfigurado,
    templatePronto: normalized.templatePronto,
    templateConfirmacao: normalized.templateConfirmacao,
    configurado: Number(row.configurado || 0) === 1,
    origem: row.origem || (Number(row.configurado || 0) === 1 ? "banco" : "env"),
    updatedat: row.updatedat || null,
  };
  out.status = statusWhatsappConfig(out);
  return out;
}

module.exports = {
  normalizarWhatsappConfig,
  validarWhatsappConfig,
  sanitizarWhatsappConfig,
  statusWhatsappConfig,
};
