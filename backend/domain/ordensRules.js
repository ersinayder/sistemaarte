
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

function descricaoEntradaOS(numero, cliente, servico) {
  return `Entrada ${numero} – ${cliente}${servico ? " / " + servico : ""}`;
}

module.exports = { validarEntradaOS, validarStatus, descricaoEntradaOS, STATUSES_VALIDOS };
