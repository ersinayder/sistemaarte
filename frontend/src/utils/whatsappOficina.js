export function buildWhatsappDesktopUrl({ phone, text }) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  return `whatsapp://send?phone=${normalizedPhone}&text=${encodeURIComponent(String(text || ''))}`;
}

export function buildWhatsappWebUrl({ phone, text }) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  return `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(String(text || ''))}`;
}

export function getWhatsappClientMode() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'web';
  }
  try {
    return localStorage.getItem('whatsapp_client_mode') || 'desktop';
  } catch {
    return 'desktop';
  }
}

export function setWhatsappClientMode(mode) {
  try {
    localStorage.setItem('whatsapp_client_mode', mode === 'web' ? 'web' : 'desktop');
  } catch {}
}

export function launchWhatsappDesktop(url) {
  try {
    const link = document.createElement('a');
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    try {
      window.location.assign(url);
      return true;
    } catch {
      return false;
    }
  }
}

function navigateWhatsappWeb(url) {
  try {
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}

export function openWhatsappConversation(payload, launcher, options = {}) {
  let mode;
  if (options?.mode) {
    mode = options.mode;
  } else if (launcher) {
    mode = 'web';
  } else {
    mode = getWhatsappClientMode();
  }

  const isDesktop = mode === 'desktop';
  const url = isDesktop
    ? buildWhatsappDesktopUrl(payload || {})
    : buildWhatsappWebUrl(payload || {});

  if (!url) return false;

  const actualLauncher = launcher || (isDesktop ? launchWhatsappDesktop : navigateWhatsappWeb);
  return Boolean(actualLauncher(url));
}

