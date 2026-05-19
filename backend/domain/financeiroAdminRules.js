const STATUS_CONTA_PAGAR = ["Pendente", "Pago", "Cancelado"];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizarStatusContaPagar(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return "Pendente";
  if (["pago", "paga", "quitado", "quitada"].includes(s)) return "Pago";
  if (["cancelado", "cancelada"].includes(s)) return "Cancelado";
  if (["pendente", "aberto", "aberta"].includes(s)) return "Pendente";
  return status;
}

function validarContaPagar(input = {}) {
  const errors = [];
  if (!String(input.fornecedor || "").trim()) errors.push("fornecedor obrigatorio");
  if (!String(input.descricao || "").trim()) errors.push("descricao obrigatoria");
  if (!(toNumber(input.valor) > 0)) errors.push("valor deve ser maior que zero");
  if (!String(input.vencimento || "").trim()) errors.push("vencimento obrigatorio");

  const status = normalizarStatusContaPagar(input.status || "Pendente");
  if (!STATUS_CONTA_PAGAR.includes(status)) errors.push("status invalido");
  return errors;
}

function calcularResumoFinanceiroAdmin({
  receitaRealizada = 0,
  saidasPagas = 0,
  contasPendentes = 0,
  contasVencidas = 0,
} = {}) {
  const receita = toNumber(receitaRealizada);
  const despesas = toNumber(saidasPagas);
  const pendentes = toNumber(contasPendentes);
  const vencidas = toNumber(contasVencidas);
  const saldoRealizado = Math.round((receita - despesas) * 100) / 100;
  const saldoPrevisto = Math.round((saldoRealizado - pendentes) * 100) / 100;
  return {
    receitaRealizada: receita,
    despesasPagas: despesas,
    contasPendentes: pendentes,
    contasVencidas: vencidas,
    saldoRealizado,
    saldoPrevisto,
    resultadoGerencial: saldoRealizado,
  };
}

module.exports = {
  STATUS_CONTA_PAGAR,
  calcularResumoFinanceiroAdmin,
  normalizarStatusContaPagar,
  validarContaPagar,
};
