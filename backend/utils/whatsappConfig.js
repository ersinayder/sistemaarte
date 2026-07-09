const { getOne } = require("../database");
const { sanitizarWhatsappConfig } = require("../domain/whatsappConfigRules");
const { decryptSecret, encryptSecretIfPossible } = require("./secrets");

function envEnabled(env) {
  return env.WHATSAPP_ENABLED !== "false";
}

function resolverWhatsappRuntime({ row = null, env = process.env } = {}) {
  const configured = Number(row?.configurado || 0) === 1;

  if (configured) {
    return {
      enabled: Number(row.enabled || 0) === 1,
      provider: row.provider || "meta",
      phoneId: row.phone_id || "",
      token: decryptSecret(row.token || ""),
      templatePronto: row.template_pronto || "os_pronta",
      templateConfirmacao: row.template_confirmacao || "confirmacao_pedido",
      mensagemPronto: row.mensagem_pronto || "",
      mensagemConfirmacao: row.mensagem_confirmacao || "",
      webBaseUrl: row.web_base_url || "",
      webInstance: row.web_instance || "",
      webApiKey: decryptSecret(row.web_api_key || ""),
      configurado: true,
      origem: "banco",
      updatedat: row.updatedat || null,
    };
  }

  return {
    enabled: envEnabled(env),
    provider: env.WHATSAPP_PROVIDER || "meta",
    phoneId: env.WHATSAPP_PHONE_ID || "",
    token: env.WHATSAPP_TOKEN || "",
    templatePronto: env.WHATSAPP_TEMPLATE_PRONTO || "os_pronta",
    templateConfirmacao: env.WHATSAPP_TEMPLATE_CONFIRMACAO || "confirmacao_pedido",
    mensagemPronto: env.WHATSAPP_MENSAGEM_PRONTO || "",
    mensagemConfirmacao: env.WHATSAPP_MENSAGEM_CONFIRMACAO || "",
    webBaseUrl: env.WHATSAPP_WEB_BASE_URL || env.EVOLUTION_API_URL || "",
    webInstance: env.WHATSAPP_WEB_INSTANCE || env.EVOLUTION_INSTANCE || "loja",
    webApiKey: env.WHATSAPP_WEB_API_KEY || env.EVOLUTION_API_KEY || "",
    configurado: false,
    origem: "env",
    updatedat: null,
  };
}

function pickStoredSecret(incoming, current) {
  const value = String(incoming ?? "").trim();
  if (value) return value;

  const stored = String(current ?? "").trim();
  return stored || null;
}

function protectStoredSecret(value) {
  return value ? encryptSecretIfPossible(value) : null;
}

function prepararWhatsappSecretsParaPersistencia(config = {}, atual = {}) {
  return {
    token: protectStoredSecret(pickStoredSecret(config.token, atual.token)),
    webApiKey: protectStoredSecret(pickStoredSecret(config.webApiKey, atual.web_api_key)),
  };
}

function buscarWhatsappRow() {
  try {
    return getOne(`
      SELECT id, enabled, provider, phone_id, token, template_pronto,
             template_confirmacao, mensagem_pronto, mensagem_confirmacao,
             web_base_url, web_instance, web_api_key,
             configurado, updatedat
      FROM whatsapp_config
      WHERE id = 1
    `);
  } catch (_) {
    return null;
  }
}

function getWhatsappRuntimeConfig() {
  return resolverWhatsappRuntime({ row: buscarWhatsappRow() });
}

function getWhatsappPublicConfig() {
  const runtime = getWhatsappRuntimeConfig();
  return sanitizarWhatsappConfig({
    enabled: runtime.enabled ? 1 : 0,
    provider: runtime.provider,
    phone_id: runtime.phoneId,
    token: runtime.token,
    template_pronto: runtime.templatePronto,
    template_confirmacao: runtime.templateConfirmacao,
    mensagem_pronto: runtime.mensagemPronto,
    mensagem_confirmacao: runtime.mensagemConfirmacao,
    web_base_url: runtime.webBaseUrl,
    web_instance: runtime.webInstance,
    web_api_key: runtime.webApiKey,
    configurado: runtime.configurado ? 1 : 0,
    origem: runtime.origem,
    updatedat: runtime.updatedat,
  });
}

module.exports = {
  resolverWhatsappRuntime,
  prepararWhatsappSecretsParaPersistencia,
  getWhatsappRuntimeConfig,
  getWhatsappPublicConfig,
};
