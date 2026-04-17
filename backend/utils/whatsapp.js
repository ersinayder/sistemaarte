/**
 * whatsapp.js — Integração Evolution API
 * Dispara mensagem automática ao cliente quando OS muda para "Pronto"
 *
 * Variáveis de ambiente necessárias (.env):
 *   EVOLUTION_API_URL      = https://sua-evolution.exemplo.com
 *   EVOLUTION_API_KEY      = sua_api_key_aqui
 *   EVOLUTION_INSTANCE     = nome_da_instancia
 *   WHATSAPP_ENABLED       = true   (default: true se URL estiver configurada)
 */

const https = require('https');
const http  = require('http');
const url   = require('url');

/**
 * Normaliza número de telefone para formato internacional (55XXXXXXXXXXX)
 * Aceita: (31) 99999-9999 | 31999999999 | +5531999999999 | etc.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  // Remove o 0 inicial de DDI caso o usuário tenha digitado 0XX
  if (digits.startsWith('0')) digits = digits.slice(1);
  // Se não tem DDI (menos de 12 dígitos), adiciona 55
  if (digits.length <= 11) digits = '55' + digits;
  // Garante pelo menos 12 dígitos (55 + DDD + número)
  if (digits.length < 12) return null;
  return digits;
}

/**
 * Monta a mensagem enviada ao cliente
 */
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

/**
 * Faz POST JSON via http/https nativo (sem dependências externas)
 */
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

/**
 * Envia mensagem WhatsApp via Evolution API
 * Retorna { ok: true } ou { ok: false, error: string }
 * Nunca lança exceção — falha silenciosa (não bloqueia o fluxo da OS)
 */
async function sendWhatsApp(os) {
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
    console.warn(`[WhatsApp] OS ${os.numero} — telefone inválido ou ausente: "${os.clientetelefone}"`)
    return { ok: false, error: 'invalid_phone' };
  }

  const message = buildMessage(os);
  const apiUrl  = `${BASE}/message/sendText/${INSTANCE}`;

  // Tenta até 2 vezes com delay de 3s
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await postJSON(
        apiUrl,
        { apikey: KEY },
        { number: phone, text: message }
      );
      console.log(`[WhatsApp] ✅ Mensagem enviada para ${phone} (OS ${os.numero})`);
      return { ok: true, phone };
    } catch (err) {
      console.error(`[WhatsApp] ❌ Tentativa ${attempt}/2 — ${err.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
    }
  }

  return { ok: false, error: 'send_failed' };
}

module.exports = { sendWhatsApp, normalizePhone, buildMessage };
