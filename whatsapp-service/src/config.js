const path = require('path');

function parsePort(value) {
  const parsed = Number(value || 8080);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 8080;
}

function loadConfig(env = process.env) {
  return {
    host: env.WHATSAPP_SERVICE_HOST || '127.0.0.1',
    port: parsePort(env.WHATSAPP_SERVICE_PORT),
    instance: env.WHATSAPP_SERVICE_INSTANCE || env.WHATSAPP_WEB_INSTANCE || 'loja',
    sessionDir: env.WHATSAPP_SERVICE_SESSION_DIR || path.join(__dirname, '..', 'sessions'),
    apiKey: env.WHATSAPP_SERVICE_API_KEY || env.WHATSAPP_WEB_API_KEY || '',
    logLevel: env.WHATSAPP_SERVICE_LOG_LEVEL || 'info',
  };
}

module.exports = { loadConfig };
