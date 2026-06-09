const fs = require('fs');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

function getDisconnectStatusCode(lastDisconnect) {
  return lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || null;
}

function buildSocketOptions({ version, auth, logger }) {
  return {
    version,
    auth,
    logger,
    printQRInTerminal: false,
    browser: ['Sistema Arte', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: undefined,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: false,
    markOnlineOnConnect: false,
  };
}

async function resolveRecipientJid(sock, number) {
  const matches = await sock.onWhatsApp(number);
  const found = Array.isArray(matches) ? matches.find((item) => item?.exists && item?.jid) : null;
  if (!found) {
    throw new Error(`Numero nao encontrado no WhatsApp: ${number}`);
  }
  return found.jid;
}

function createBaileysClient({ instance, sessionDir, logLevel = 'info', reconnectMs = 5000 }) {
  let sock = null;
  let starting = null;
  let reconnectTimer = null;
  let stopped = false;
  let state = {
    state: 'close',
    connected: false,
    qr: null,
    lastError: null,
  };

  const logger = pino({ level: logLevel });

  function setState(patch) {
    state = { ...state, ...patch };
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void start();
    }, reconnectMs);
    reconnectTimer.unref?.();
  }

  async function start() {
    if (starting) return starting;
    stopped = false;
    starting = (async () => {
      const baileys = await import('@whiskeysockets/baileys');
      const makeWASocket = baileys.default;
      const { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys;

      fs.mkdirSync(sessionDir, { recursive: true });
      const authPath = path.join(sessionDir, instance);
      const { state: authState, saveCreds } = await useMultiFileAuthState(authPath);
      const { version } = await fetchLatestBaileysVersion();

      setState({ state: 'connecting', connected: false, lastError: null });
      sock = makeWASocket(buildSocketOptions({
        version,
        auth: authState,
        logger,
      }));

      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', (update) => {
        if (update.qr) {
          setState({ state: 'qr', connected: false, qr: update.qr });
          logger.info('QR Code recebido. Escaneie no WhatsApp da loja.');
          qrcode.generate(update.qr, { small: true });
        }

        if (update.connection === 'connecting') {
          setState({ state: 'connecting', connected: false });
        }

        if (update.connection === 'open') {
          setState({ state: 'open', connected: true, qr: null, lastError: null });
          logger.info({ instance }, 'WhatsApp conectado');
        }

        if (update.connection === 'close') {
          const statusCode = getDisconnectStatusCode(update.lastDisconnect);
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          const errorMessage = update.lastDisconnect?.error?.message || `Conexao fechada (${statusCode || 'sem codigo'})`;
          setState({ state: 'close', connected: false, qr: null, lastError: errorMessage });
          logger.warn({ instance, statusCode, loggedOut, errorMessage }, 'WhatsApp desconectado');
          sock = null;
          if (!loggedOut) scheduleReconnect();
        }
      });
    })().finally(() => {
      starting = null;
    });
    return starting;
  }

  async function stop() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    sock = null;
    setState({ state: 'close', connected: false });
  }

  async function sendText({ number, text }) {
    if (!sock || !state.connected) {
      throw new Error(`Sessao WhatsApp desconectada: ${state.state}`);
    }
    const jid = await resolveRecipientJid(sock, number);
    return sock.sendMessage(jid, { text });
  }

  return {
    start,
    stop,
    sendText,
    getState: () => ({ ...state }),
  };
}

module.exports = { buildSocketOptions, createBaileysClient, getDisconnectStatusCode, resolveRecipientJid };
