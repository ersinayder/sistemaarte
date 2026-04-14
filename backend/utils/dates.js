
/** Retorna a data de hoje no fuso de Brasília (UTC-3) como YYYY-MM-DD */
function hoje() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

module.exports = { hoje };
