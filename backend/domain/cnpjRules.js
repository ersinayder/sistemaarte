function normalizeCnpj(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14);
}

function cnpjCharValue(char) {
  return char.charCodeAt(0) - 48;
}

function calcularDigitoCnpj(base) {
  const weights = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = base
    .split('')
    .reduce((total, char, index) => total + cnpjCharValue(char) * weights[index], 0);
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

function validaCNPJ(cnpj) {
  const n = normalizeCnpj(cnpj);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(n)) return false;
  if (/^(\d)\1{13}$/.test(n)) return false;
  return calcularDigitoCnpj(n.slice(0, 12)) === Number(n[12])
    && calcularDigitoCnpj(n.slice(0, 13)) === Number(n[13]);
}

module.exports = {
  normalizeCnpj,
  validaCNPJ,
};
