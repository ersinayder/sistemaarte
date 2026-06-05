const CONTROL_CHARS = /[\x00-\x1F\x7F]/;
const UNSAFE_PRINTER_CHARS = /[`'";&|<>$]/;
const PRINTER_NAME_PATTERN = /^[A-Za-z0-9 _.\-()\\\/]{1,160}$/;

function cleanText(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizarImpressaoConfig(input = {}) {
  return {
    printerName: cleanText(input.printerName ?? input.printer_name),
    printerIp: cleanText(input.printerIp ?? input.printer_ip, 45),
    paperSize: 'A5',
    color: 1,
  };
}

function isValidIpv4(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255 && String(n) === String(Number(part));
  });
}

function validarImpressaoConfig(config = {}) {
  const errors = {};

  if (config.printerName && (
    CONTROL_CHARS.test(config.printerName) ||
    UNSAFE_PRINTER_CHARS.test(config.printerName) ||
    !PRINTER_NAME_PATTERN.test(config.printerName)
  )) {
    errors.printerName = 'Nome da impressora contem caracteres invalidos';
  }

  if (config.printerIp && !isValidIpv4(config.printerIp)) {
    errors.printerIp = 'IP da impressora invalido';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function statusImpressaoConfig(config = {}) {
  const missing = [];
  if (!cleanText(config.printerName ?? config.printer_name)) missing.push('printerName');
  return {
    status: missing.length === 0 ? 'OK' : 'Pendente',
    missing,
  };
}

function montarDestinoImpressora(config = {}) {
  const printerName = cleanText(config.printerName ?? config.printer_name);
  const printerIp = cleanText(config.printerIp ?? config.printer_ip, 45);
  if (!printerName) return '';
  if (printerName.startsWith('\\\\')) return printerName;
  if (printerIp) return `\\\\${printerIp}\\${printerName}`;
  return printerName;
}

function pickImpressaoConfig(row = {}) {
  const config = {
    printerName: row.printerName ?? row.printer_name ?? '',
    printerIp: row.printerIp ?? row.printer_ip ?? '',
    paperSize: row.paperSize ?? row.paper_size ?? 'A5',
    color: Boolean(Number(row.color ?? 1)),
    updatedat: row.updatedat ?? null,
  };
  return config;
}

module.exports = {
  montarDestinoImpressora,
  normalizarImpressaoConfig,
  pickImpressaoConfig,
  statusImpressaoConfig,
  validarImpressaoConfig,
};
