export function buildWhatsappWebUrl({ phone, text }) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  return `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(String(text || ''))}`;
}

function navigateWhatsappWeb(url) {
  try {
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}

export function openWhatsappConversation(payload, launcher = navigateWhatsappWeb) {
  const url = buildWhatsappWebUrl(payload || {});
  if (!url) return false;

  return Boolean(launcher(url));
}
