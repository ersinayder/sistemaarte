const { getOne } = require("../database");
const { toNumber } = require("../utils/numbers");

/**
 * Calcula o resumo financeiro de uma OS.
 * @returns {{ ordem, recebido, saldo }|null}
 */
function getResumoFinanceiroOS(ordemId) {
  const ordem = getOne(
    `SELECT id, numero, clientenome, servico, valortotal, valorentrada, pagamento
       FROM ordens WHERE id=?`,
    [ordemId]
  );
  if (!ordem) return null;

  const recebido = getOne(
    `SELECT COALESCE(SUM(valor),0) AS total
       FROM lancamentos WHERE ordemid=? AND pago=1 AND valor>0`,
    [ordemId]
  );

  const recebidoTotal = toNumber(recebido?.total, 0); // fallback sempre 0
  const total         = toNumber(ordem.valortotal, 0);

  return { ordem, recebido: recebidoTotal, saldo: Math.max(0, total - recebidoTotal) };
}

module.exports = { getResumoFinanceiroOS };
