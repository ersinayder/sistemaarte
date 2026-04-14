
/**
 * Converte qualquer valor para número finito.
 * @param {*} v - Valor de entrada
 * @param {number} fallback - Retorno em caso de NaN/Infinity
 */
function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { toNumber };
