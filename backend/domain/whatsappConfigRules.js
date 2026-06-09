const PROVIDERS_VALIDOS = ["meta", "web_local", "manual"];

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
    webBaseUrl: cleanText(input.webBaseUrl ?? input.web_base_url, 255),
    webInstance: cleanText(input.webInstance ?? input.web_instance, 80),
    webApiKey: cleanText(input.webApiKey ?? input.web_api_key, 255),
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

  if (config.enabled && config.provider === "meta") {
    if (!config.phoneId) errors.phoneId = "Phone Number ID e obrigatorio";
    if (!config.token && !tokenConfigurado) errors.token = "Token e obrigatorio";
  }

  if (config.enabled && config.provider === "web_local") {
    if (!config.webBaseUrl) errors.webBaseUrl = "URL local do WhatsApp Web e obrigatoria";
    if (!config.webInstance) errors.webInstance = "Instancia do WhatsApp Web e obrigatoria";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function statusWhatsappConfig(config = {}) {
  const enabled = config.enabled === true || Number(config.enabled) === 1;
  if (!enabled) return { status: "Inativo", missing: [] };

  const missing = [];
  const provider = cleanText(config.provider || "meta", 30).toLowerCase();
  if (provider === "meta") {
    if (!cleanText(config.phoneId ?? config.phone_id)) missing.push("phoneId");
    if (!config.tokenConfigurado && !cleanText(config.token)) missing.push("token");
  }
  if (provider === "web_local") {
    if (!cleanText(config.webBaseUrl ?? config.web_base_url)) missing.push("webBaseUrl");
    if (!cleanText(config.webInstance ?? config.web_instance)) missing.push("webInstance");
  }

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
    webBaseUrl: normalized.webBaseUrl,
    webInstance: normalized.webInstance,
    webApiKeyConfigurada: Boolean(cleanText(row.webApiKey ?? row.web_api_key)),
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
