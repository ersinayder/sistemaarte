
const STATUSES_VALIDOS = ["Recebido","Em Produção","Pronto","Entregue","Cancelado"];

/**
 * Valida regras de entrada da OS.
 * @returns {string|null} mensagem de erro ou null se OK
 */
function validarEntradaOS(total, entrada) {
  if (!(entrada > 0))   return "Toda OS precisa de uma entrada inicial maior que zero.";
  if (entrada > total)  return "A entrada não pode ser maior que o valor total.";
  return null;
}

function validarStatus(status) {
  if (!STATUSES_VALIDOS.includes(status))
    return `Status inválido. Permitidos: ${STATUSES_VALIDOS.join(", ")}`;
  return null;
}

/**
 * Gera a descrição do lançamento automático ao criar/editar OS.
 * - Se entrada == total  → "Total OS-XXXX – Cliente / Serviço"
 * - Se entrada <  total  → "Entrada OS-XXXX – Cliente / Serviço"
 */
function descricaoEntradaOS(numero, cliente, servico, total, entrada) {
  const sufixo = `${numero} – ${cliente}${servico ? " / " + servico : ""}`;
  const isPagamentoTotal = entrada != null && total != null && Number(entrada) >= Number(total);
  return `${isPagamentoTotal ? "Total" : "Entrada"} ${sufixo}`;
}

/**
 * Gera a descrição do lançamento de restante (pago posteriormente via caixa).
 * "Restante OS-XXXX – Cliente / Serviço"
 */
function descricaoRestanteOS(numero, cliente, servico) {
  return `Restante ${numero} – ${cliente}${servico ? " / " + servico : ""}`;
}

module.exports = { validarEntradaOS, validarStatus, descricaoEntradaOS, descricaoRestanteOS, STATUSES_VALIDOS };
