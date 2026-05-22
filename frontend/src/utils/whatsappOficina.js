export const WHATSAPP_TARGET = 'sistema_whatsapp';

export function buildWhatsappWebUrl({ phone, text }) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  return `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(String(text || ''))}`;
}

export function openWhatsappConversation(payload, opener = window.open) {
  const url = buildWhatsappWebUrl(payload || {});
  if (!url) return false;

  // Named target is intentional: it lets the browser reuse the WhatsApp tab created by the system.
  const opened = opener(url, WHATSAPP_TARGET);
  return Boolean(opened);
}
