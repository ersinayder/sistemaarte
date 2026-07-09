const { toNumber } = require("../utils/numbers");

function centavos(value) {
  return Math.round(toNumber(value) * 100);
}

function normalizarOrdemId(ordemid) {
  const n = Number(ordemid);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function contribuicaoRecebida(lancamento) {
  if (!normalizarOrdemId(lancamento?.ordemid)) return 0;
  if (Number(lancamento?.pago) !== 1) return 0;
  if (lancamento?.deletedat) return 0;
  return centavos(lancamento?.valor);
}

function ordensAfetadas(antigo, novo) {
  return Array.from(new Set([
    normalizarOrdemId(antigo?.ordemid),
    normalizarOrdemId(novo?.ordemid),
  ].filter(Boolean))).sort((a, b) => a - b);
}

function contribuicaoParaOrdem(lancamento, ordemId) {
  return normalizarOrdemId(lancamento?.ordemid) === normalizarOrdemId(ordemId)
    ? contribuicaoRecebida(lancamento)
    : 0;
}

function projetarSaldoCentavos({ total, recebidoAtual, antigo, novo, ordemId }) {
  const totalCentavos = centavos(total);
  const recebidoProjetado =
    centavos(recebidoAtual)
    - contribuicaoParaOrdem(antigo, ordemId)
    + contribuicaoParaOrdem(novo, ordemId);

  return Math.max(0, totalCentavos - recebidoProjetado);
}

module.exports = {
  centavos,
  contribuicaoRecebida,
  ordensAfetadas,
  projetarSaldoCentavos,
};
