const { getAll } = require("../database");

function getContasReceberPayload() {
  return getAll(
    `SELECT * FROM (
      SELECT o.id, o.numero, o.clientenome, o.status, o.prazoentrega, o.valortotal,
        COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0) AS recebido,
        CASE
          WHEN (o.valortotal - COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0)) < 0
          THEN 0
          ELSE CAST(o.valortotal - COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0) AS REAL)
        END AS saldo
      FROM ordens o
      WHERE o.deletedat IS NULL AND o.status NOT IN ('Entregue','Cancelado')
    ) WHERE saldo > 0.009 ORDER BY prazoentrega ASC, id ASC`
  );
}

module.exports = {
  getContasReceberPayload,
};
