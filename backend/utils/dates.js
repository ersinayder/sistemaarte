/** Retorna a data de hoje no fuso de Brasília (America/Sao_Paulo) como YYYY-MM-DD */
function hoje() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).split('/').reverse().join('-');
}

module.exports = { hoje };
