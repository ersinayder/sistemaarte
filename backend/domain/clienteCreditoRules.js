const { toNumber } = require("../utils/numbers");

function centavos(val) {
  return Math.round(toNumber(val, 0) * 100);
}

/**
 * Calcula o saldo atual de crédito a partir do extrato de movimentos.
 * Movimentos contêm o sinal apropriado no campo valor:
 * - positivo (+): gerado, saldo_inicial, ajuste_entrada, estorno de uso/devolução
 * - negativo (-): usado, devolvido, ajuste_saida, estorno de crédito
 *
 * @param {Array<{ valor: number }>} movimentos
 * @returns {number} Saldo em reais com 2 casas decimais
 */
function calcularSaldoCredito(movimentos) {
  if (!Array.isArray(movimentos) || movimentos.length === 0) return 0;

  const totalCentavos = movimentos.reduce((acc, m) => {
    return acc + centavos(m?.valor);
  }, 0);

  // O saldo nunca pode ser menor que zero na leitura
  const saldoPositivo = Math.max(0, totalCentavos);
  return Math.round(saldoPositivo) / 100;
}

/**
 * Valida se um valor de crédito desejado pode ser utilizado contra o saldo disponível.
 *
 * @param {{ saldoDisponivel: number, valorDesejado: number }} param0
 * @returns {{ valido: boolean, erro?: string }}
 */
function validarUsoCredito({ saldoDisponivel, valorDesejado }) {
  const v = centavos(valorDesejado);
  const s = centavos(saldoDisponivel);

  if (v <= 0) {
    return {
      valido: false,
      erro: "Valor do crédito a utilizar deve ser maior que zero.",
    };
  }

  if (v > s) {
    return {
      valido: false,
      erro: `Saldo de crédito insuficiente (disponível: R$ ${(s / 100).toFixed(2)}).`,
    };
  }

  return { valido: true };
}

/**
 * Valida a invariante contábil do sistema:
 * SUM(movimentos não-saldo_inicial) = -SUM(lancamentos CreditoLoja ativos) - SUM(saidas credito_devolvido ativas)
 *
 * @param {{
 *   totalMovimentosSemSaldoInicial: number,
 *   totalLancamentosCreditoLoja: number,
 *   totalSaidasDevolvido: number
 * }} param0
 * @returns {{ valido: boolean, diferenca: number }}
 */
function validarInvarianteCredito({
  totalMovimentosSemSaldoInicial,
  totalLancamentosCreditoLoja,
  totalSaidasDevolvido,
}) {
  const movCentavos = centavos(totalMovimentosSemSaldoInicial);
  const lancCentavos = centavos(totalLancamentosCreditoLoja);
  const saidaCentavos = centavos(totalSaidasDevolvido);

  const esperadoCentavos = -lancCentavos - saidaCentavos;
  const diferencaCentavos = movCentavos - esperadoCentavos;

  // Tolerância de 1 centavo para arredondamentos flutuantes
  const valido = Math.abs(diferencaCentavos) <= 1;

  return {
    valido,
    diferenca: Math.round(diferencaCentavos) / 100,
  };
}

module.exports = {
  centavos,
  calcularSaldoCredito,
  validarUsoCredito,
  validarInvarianteCredito,
};
