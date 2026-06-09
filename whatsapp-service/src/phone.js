function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;

  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return withCountry.length >= 12 && withCountry.length <= 13 ? withCountry : null;
}

module.exports = { normalizePhone };
