/**
 * Converte qualquer valor para numero finito.
 * @param {*} v - Valor de entrada
 * @param {number} fallback - Retorno em caso de NaN/Infinity
 */
function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Valida se o valor e um numero finito nao-negativo.
 * @returns {string|null} mensagem de erro ou null se OK
 */
function validarNaoNegativo(valor, campo) {
  if (valor === null || valor === undefined || valor === '') return null; // opcional
  const n = Number(valor);
  if (!Number.isFinite(n)) return `${campo} deve ser um numero valido.`;
  if (n < 0)               return `${campo} nao pode ser negativo.`;
  return null;
}

module.exports = { toNumber, validarNaoNegativo };
