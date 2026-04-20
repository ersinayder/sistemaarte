/**
 * whatsapp.js — Integração Meta WhatsApp Cloud API
 * - Disparo automático ao mover OS para "Pronto"  (template: os_pronta)
 * - Disparo manual de confirmação de pedido        (template: confirmacao_pedido)
 *
 * Variáveis de ambiente necessárias:
 *   WHATSAPP_TOKEN          — Bearer token permanente (gerado no Meta for Developers)
 *   WHATSAPP_PHONE_ID       — Phone Number ID (não é o número em si)
 *   WHATSAPP_ENABLED        — "false" para desabilitar (padrão: true)
 */

const https = require('https');

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length <= 11) digits = '55' + digits;
  if (digits.length < 12) return null;
  return digits;
}

function fmtVal(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Chamada à Cloud API ─────────────────────────────────────────────────────

function postCloudAPI(phoneId, token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'graph.facebook.com',
      path: `/v19.0/${phoneId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${token}`,
      },
      timeout: 8000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

// ─── Dispatcher principal ────────────────────────────────────────────────────

async function _dispatch(phone, templateName, components) {
  const TOKEN    = process.env.WHATSAPP_TOKEN    || '';
  const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
  const ENABLED  = process.env.WHATSAPP_ENABLED !== 'false';

  if (!TOKEN || !PHONE_ID || !ENABLED) {
    console.log('[WhatsApp] Desabilitado ou variáveis não configuradas — pulando envio.');
    return { ok: false, error: 'not_configured' };
  }

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      components,
    },
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await postCloudAPI(PHONE_ID, TOKEN, body);
      console.log(`[WhatsApp] ✅ Template "${templateName}" enviado para ${phone}`);
      return { ok: true, phone };
    } catch (err) {
      console.error(`[WhatsApp] ❌ Tentativa ${attempt}/2 — ${err.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
    }
  }

  return { ok: false, error: 'send_failed' };
}

// ─── Mensagem 1: OS Pronta (disparo automático) ──────────────────────────────
// Template: os_pronta
// Parâmetros: {{1}} nome, {{2}} numero_os, {{3}} servico, {{4}} saldo (ou "quitado")

async function sendWhatsApp(os) {
  const phone   = normalizePhone(os.clientetelefone || os.clientecontato);
  if (!phone) {
    console.warn(`[WhatsApp] OS ${os.numero} — telefone inválido ou ausente`);
    return { ok: false, error: 'invalid_phone' };
  }

  const nome    = os.clientenome || 'Cliente';
  const numero  = os.numero      || '—';
  const servico = os.servico     || os.tipo || '';
  const saldo   = Number(os.saldoaberto ?? os.valorrestante ?? 0);
  const saldoTxt = saldo > 0 ? fmtVal(saldo) : 'Quitado';

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: nome },
        { type: 'text', text: numero },
        { type: 'text', text: servico },
        { type: 'text', text: saldoTxt },
      ],
    },
  ];

  return _dispatch(phone, 'os_pronta', components);
}

// ─── Mensagem 2: Confirmação de Pedido (disparo manual) ──────────────────────
// Template: confirmacao_pedido
// Parâmetros: {{1}} nome, {{2}} servico, {{3}} numero_os,
//             {{4}} valor_total, {{5}} entrada, {{6}} saldo_restante

async function sendWhatsAppConfirmacao(os) {
  const phone   = normalizePhone(os.clientetelefone || os.clientecontato);
  if (!phone) {
    console.warn(`[WhatsApp] OS ${os.numero} — telefone inválido ou ausente`);
    return { ok: false, error: 'invalid_phone' };
  }

  const nome    = os.clientenome || 'Cliente';
  const numero  = os.numero      || '—';
  const servico = os.servico     || os.tipo || '';
  const total   = Number(os.valortotal   || os.valor   || 0);
  const entrada = Number(os.valorentrada || os.entrada || 0);
  const saldo   = Number(os.saldoaberto  ?? os.valorrestante ?? (total - entrada));

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: nome },
        { type: 'text', text: servico },
        { type: 'text', text: numero },
        { type: 'text', text: fmtVal(total) },
        { type: 'text', text: fmtVal(entrada) },
        { type: 'text', text: saldo > 0 ? fmtVal(saldo) : 'Quitado' },
      ],
    },
  ];

  return _dispatch(phone, 'confirmacao_pedido', components);
}

module.exports = { sendWhatsApp, sendWhatsAppConfirmacao, normalizePhone };
