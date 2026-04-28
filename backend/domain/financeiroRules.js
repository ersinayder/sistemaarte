const { getOne } = require("../database");
const { toNumber } = require("../utils/numbers");

/**
 * Calcula o resumo financeiro de uma OS.
 * Ignora OS soft-deleted (deletedat IS NULL) e lan\u00e7amentos soft-deleted.
 * Saldo arredondado para 2 casas para evitar imprecis\u00e3o de ponto flutuante.
 * @returns {{ ordem, recebido, saldo }|null}
 */
function getResumoFinanceiroOS(ordemId) {
  const ordem = getOne(
    `SELECT id, numero, clientenome, servico, valortotal, valorentrada, pagamento
       FROM ordens WHERE id=? AND deletedat IS NULL`,
    [ordemId]
  );
  if (!ordem) return null;

  const recebido = getOne(
    `SELECT COALESCE(SUM(valor),0) AS total
       FROM lancamentos WHERE ordemid=? AND pago=1 AND valor>0 AND deletedat IS NULL`,
    [ordemId]
  );

  const recebidoTotal = toNumber(recebido?.total, 0);
  const total         = toNumber(ordem.valortotal, 0);

  // I-4: round para 2 casas evita 100.00 - 100.00 = 0.00000000001
  const saldo = Math.max(0, Math.round((total - recebidoTotal) * 100) / 100);

  return { ordem, recebido: recebidoTotal, saldo };
}

module.exports = { getResumoFinanceiroOS };
