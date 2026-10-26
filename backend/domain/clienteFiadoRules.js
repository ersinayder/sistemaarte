const { toNumber } = require("../utils/numbers");
const { hasPermission } = require("./permissionRules");

function centavos(val) {
  return Math.round(toNumber(val, 0) * 100);
}

/**
 * Valida se uma OS com saldo em aberto pode transicionar para o status "Entregue".
 *
 * @param {{
 *   ordem?: object,
 *   saldoOrdem: number,
 *   cliente?: object,
 *   dividaAtualCliente?: number,
 *   usuario?: object,
 *   confirmarAcimaLimite?: boolean
 * }} param0
 * @returns {{ ok: boolean, code?: string, error?: string, acimaLimite?: boolean, novaDivida?: number, limite?: number }}
 */
function validarEntregaComSaldo({
  ordem,
  saldoOrdem,
  cliente,
  dividaAtualCliente = 0,
  usuario,
  confirmarAcimaLimite = false,
}) {
  const saldoCent = centavos(saldoOrdem);
  if (saldoCent <= 1) {
    return { ok: true };
  }

  const clienteId = ordem?.clienteid || cliente?.id;
  if (!clienteId || !cliente) {
    return {
      ok: false,
      code: "CLIENTE_NAO_IDENTIFICADO",
      error: "Para entregar com saldo, a OS deve estar vinculada a um cliente cadastrado.",
    };
  }

  if (cliente.fiado_ativo !== 1 || !(toNumber(cliente.fiado_limite, 0) > 0)) {
    return {
      ok: false,
      code: "FIADO_NAO_PERMITIDO",
      error: "Cliente não possui fiado ativo ou limite cadastrado.",
    };
  }

  if (!hasPermission(usuario, "ordens.entregar_fiado")) {
    return {
      ok: false,
      code: "SEM_PERMISSAO",
      error: "Usuário não tem permissão para entregar OS no fiado.",
    };
  }

  const limiteCent = centavos(cliente.fiado_limite);
  const dividaCent = centavos(dividaAtualCliente);
  const novaDividaCent = dividaCent + saldoCent;

  if (novaDividaCent > limiteCent) {
    const podeLiberarAcima = hasPermission(usuario, "ordens.entregar_acima_limite");
    if (podeLiberarAcima && Boolean(confirmarAcimaLimite)) {
      return {
        ok: true,
        acimaLimite: true,
        limite: cliente.fiado_limite,
        novaDivida: Math.round(novaDividaCent) / 100,
      };
    }

    return {
      ok: false,
      code: "FIADO_LIMITE_EXCEDIDO",
      error: `Limite de fiado excedido (Limite: R$ ${toNumber(cliente.fiado_limite).toFixed(2)}, Dívida total ficaria em R$ ${(novaDividaCent / 100).toFixed(2)}).`,
      limite: cliente.fiado_limite,
      dividaAtual: dividaAtualCliente,
      saldoOrdem,
    };
  }

  return { ok: true, acimaLimite: false };
}

module.exports = {
  validarEntregaComSaldo,
  centavos,
};
