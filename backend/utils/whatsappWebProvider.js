function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeState(payload = {}) {
  const state = payload.instance?.state || payload.state || payload.status || 'unknown';
  return {
    connected: ['open', 'connected', 'CONNECTED'].includes(state),
    state,
    qr: payload.qrcode || payload.qr || null,
  };
}

function providerStatusFromError(err) {
  return {
    connected: false,
    state: 'offline',
    qr: null,
    error: String(err?.message || 'Servico local do WhatsApp indisponivel'),
  };
}

function createWhatsappWebProvider({ baseUrl, instance, apiKey = '', timeoutMs = 10000 }) {
  const root = trimSlash(baseUrl);
  const instanceName = String(instance || '').trim();

  if (!root || !instanceName) {
    throw new Error('WhatsApp Web provider requires baseUrl and instance');
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(apiKey ? { apikey: apiKey } : {}),
        ...(options.headers || {}),
      };
      const res = await fetch(`${root}${path}`, { ...options, headers, signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`WhatsApp provider HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return await res.json().catch(() => ({}));
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('WhatsApp provider timeout');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getStatus() {
      const data = await request(`/instance/connectionState/${instanceName}`, { method: 'GET' });
      return normalizeState(data);
    },
    async sendText({ phone, text }) {
      const data = await request(`/message/sendText/${instanceName}`, {
        method: 'POST',
        body: JSON.stringify({ number: phone, text }),
      });
      return { ok: true, messageId: data.key?.id || data.messageId || data.id || null };
    },
  };
}

module.exports = { createWhatsappWebProvider, normalizeState, providerStatusFromError };
