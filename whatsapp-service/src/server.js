const express = require('express');
const { normalizePhone } = require('./phone');

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function requireApiKey(apiKey) {
  return (req, res, next) => {
    if (!apiKey) return next();
    const received = req.get('apikey') || getBearerToken(req);
    if (received !== apiKey) return res.status(401).json({ error: 'API key invalida' });
    return next();
  };
}

function requireInstance(instance) {
  return (req, res, next) => {
    if (req.params.instance !== instance) {
      return res.status(404).json({ error: 'Instancia nao encontrada' });
    }
    return next();
  };
}

function createApp({ instance, apiKey = '', client }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(requireApiKey(apiKey));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'whatsapp-service', instance });
  });

  app.get('/instance/connectionState/:instance', requireInstance(instance), (_req, res) => {
    const status = client.getState();
    res.json({
      instance: { instanceName: instance, state: status.state },
      state: status.state,
      connected: Boolean(status.connected),
      qrcode: status.qr || null,
      qr: status.qr || null,
      lastError: status.lastError || null,
    });
  });

  app.post('/message/sendText/:instance', requireInstance(instance), async (req, res, next) => {
    try {
      const number = normalizePhone(req.body?.number);
      const text = String(req.body?.text || '').trim();
      if (!number) return res.status(400).json({ error: 'Numero de WhatsApp invalido' });
      if (!text) return res.status(400).json({ error: 'Mensagem de WhatsApp vazia' });

      const status = client.getState();
      if (!status.connected) {
        return res.status(503).json({ error: `Sessao WhatsApp desconectada: ${status.state}` });
      }

      const result = await client.sendText({ number, text });
      const key = result?.key || null;
      res.json({ key, messageId: key?.id || result?.messageId || result?.id || null });
    } catch (err) {
      next(err);
    }
  });

  app.use((err, _req, res, _next) => {
    res.status(502).json({ error: err.message || 'Falha no servico WhatsApp' });
  });

  return app;
}

module.exports = { createApp };
