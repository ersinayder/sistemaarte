/**
 * whatsapp.js — Integração Evolution API
 * - Disparo automático ao mover OS para "Pronto"
 * - Disparo manual de confirmação de pedido (cliente presencial)
 */

const https = require('https');
const http  = require('http');
const url   = require('url');

function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length <= 11) digits = '55' + digits;
  if (digits.length < 12) return null;
  return digits;
}

function buildMessage(os) {
  const nome    = os.clientenome || 'Cliente';
  const numero  = os.numero      || '—';
  const servico = os.servico     || os.tipo || '';
  const saldo   = Number(os.saldoaberto ?? os.valorrestante ?? 0);
  const fmtVal  = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  let msg =
    `✅ *Arte e Molduras — OS Pronta!*\n\n` +
    `Olá, *${nome}*! 🎨\n\n` +
    `Sua ordem de serviço *${numero}* (${servico}) está *pronta para retirada*.\n\n`;

  if (saldo > 0) {
    msg += `💰 Saldo a pagar na retirada: *${fmtVal(saldo)}*\n\n`;
  } else {
    msg += `✔️ Pagamento já quitado.\n\n`;
  }

  msg += `📍 Aguardamos você em nossa loja!\n_Arte e Molduras_`;

  return msg;
}

function buildMessageConfirmacao(os) {
  const nome    = os.clientenome || 'Cliente';
  const numero  = os.numero      || '—';
  const servico = os.servico     || os.tipo || '';
  const total   = Number(os.valortotal || os.valor || 0);
  const entrada = Number(os.valorentrada || os.entrada || 0);
  const saldo   = Number(os.saldoaberto ?? os.valorrestante ?? (total - entrada));
  const fmtVal  = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  let msg =
    `📋 *Arte e Molduras — Confirmação de Pedido*\n\n` +
    `Olá, *${nome}*! Seu pedido foi registrado com sucesso. 😊\n\n` +
    `🖼️ *Serviço:* ${servico}\n` +
    `🔖 *OS:* ${numero}\n` +
    `💵 *Valor Total:* ${fmtVal(total)}\n`;

  if (entrada > 0) {
    msg += `✅ *Entrada paga:* ${fmtVal(entrada)}\n`;
  }

  if (saldo > 0) {
    msg += `💳 *Saldo restante na retirada:* ${fmtVal(saldo)}\n`;
  } else {
    msg += `✔️ *Pagamento quitado.*\n`;
  }

  msg += `\nEntraremos em contato quando seu pedido estiver pronto!\n_Arte e Molduras_ 🎨`;

  return msg;
}

function postJSON(apiUrl, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed   = url.parse(apiUrl);
    const isHttps  = parsed.protocol === 'https:';
    const lib      = isHttps ? https : http;
    const payload  = JSON.stringify(body);

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.path,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
      timeout: 8000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  ()    => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

async function _dispatch(os, message) {
  const BASE     = (process.env.EVOLUTION_API_URL  || '').replace(/\/$/, '');
  const KEY      = process.env.EVOLUTION_API_KEY   || '';
  const INSTANCE = process.env.EVOLUTION_INSTANCE  || '';
  const ENABLED  = process.env.WHATSAPP_ENABLED !== 'false';

  if (!BASE || !KEY || !INSTANCE || !ENABLED) {
    console.log('[WhatsApp] Desabilitado ou variáveis não configuradas — pulando envio.');
    return { ok: false, error: 'not_configured' };
  }

  const phone = normalizePhone(os.clientetelefone || os.clientecontato);
  if (!phone) {
    console.warn(`[WhatsApp] OS ${os.numero} — telefone inválido ou ausente: "${os.clientetelefone}"`);
    return { ok: false, error: 'invalid_phone' };
  }

  const apiUrl = `${BASE}/message/sendText/${INSTANCE}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await postJSON(apiUrl, { apikey: KEY }, { number: phone, text: message });
      console.log(`[WhatsApp] ✅ Mensagem enviada para ${phone} (OS ${os.numero})`);
      return { ok: true, phone };
    } catch (err) {
      console.error(`[WhatsApp] ❌ Tentativa ${attempt}/2 — ${err.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
    }
  }

  return { ok: false, error: 'send_failed' };
}

async function sendWhatsApp(os) {
  return _dispatch(os, buildMessage(os));
}

async function sendWhatsAppConfirmacao(os) {
  return _dispatch(os, buildMessageConfirmacao(os));
}

module.exports = { sendWhatsApp, sendWhatsAppConfirmacao, normalizePhone, buildMessage, buildMessageConfirmacao };
