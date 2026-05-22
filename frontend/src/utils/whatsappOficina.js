export function buildWhatsappWebUrl({ phone, text }) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  return `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(String(text || ''))}`;
}

export function buildWhatsappAppUrl({ phone, text }) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  return `whatsapp://send?phone=${normalizedPhone}&text=${encodeURIComponent(String(text || ''))}`;
}

function launchWhatsappApp(url) {
  try {
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}

export function openWhatsappConversation(payload, launcher = launchWhatsappApp) {
  const url = buildWhatsappAppUrl(payload || {});
  if (!url) return false;

  return Boolean(launcher(url));
}
