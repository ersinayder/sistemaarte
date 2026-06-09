require('dotenv').config({ override: true });

const { loadConfig } = require('./config');
const { createBaileysClient } = require('./baileysClient');
const { createApp } = require('./server');

const config = loadConfig();
const client = createBaileysClient(config);
const app = createApp({
  instance: config.instance,
  apiKey: config.apiKey,
  client,
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[WhatsAppService] HTTP em http://${config.host}:${config.port}`);
  console.log(`[WhatsAppService] Instancia: ${config.instance}`);
  void client.start().catch((err) => {
    console.error('[WhatsAppService] Falha ao iniciar Baileys:', err.message);
  });
});

async function shutdown(signal) {
  console.log(`[WhatsAppService] Encerrando (${signal})...`);
  server.close();
  await client.stop();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
