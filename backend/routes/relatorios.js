const router = require("express").Router();
const { getAll, getOne } = require("../database");
const { auth } = require("../middlewares/auth");
const { hoje } = require("../utils/dates");
const { toNumber } = require("../utils/numbers");

// Filtro reutilizavel: exclui lancamentos soft-deleted e lancamentos
// vinculados a OS que foram soft-deleted.
const FILTRO_ATIVO = `
  l.deletedat IS NULL
  AND (l.ordemid IS NULL OR (SELECT deletedat FROM ordens WHERE id=l.ordemid) IS NULL)
`;

router.get("/resumo", auth(), (req, res, next) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: "Informe o mês YYYY-MM" });

    const hj = hoje();

    const total = getOne(
      `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND l.valor > 0 AND ${FILTRO_ATIVO}`,
      [mes]
    )?.v ?? 0;

    const hojeV = getOne(
      `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l WHERE l.data=? AND ${FILTRO_ATIVO}`,
      [hj]
    )?.v ?? 0;

    const count = getOne(
      `SELECT COUNT(*) AS c FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND l.valor > 0 AND ${FILTRO_ATIVO}`,
      [mes]
    )?.c ?? 0;

    const porPag = { Pix:0, Dinheiro:0, Credito:0, Debito:0, Link:0 };
    getAll(
      `SELECT l.pagamento, SUM(l.valor) AS v FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} GROUP BY l.pagamento`,
      [mes]
    ).forEach(r => { if (porPag[r.pagamento] !== undefined) porPag[r.pagamento] = r.v; });

    const porTipo = {};
    getAll(
      `SELECT l.tipo, SUM(l.valor) AS v FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} GROUP BY l.tipo`,
      [mes]
    ).forEach(r => { porTipo[r.tipo] = r.v; });

    const dias = getAll(
      `SELECT l.data, SUM(l.valor) AS total FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} GROUP BY l.data ORDER BY l.data`,
      [mes]
    );

    // C-1: usar 'Cancelado' (valor gravado pelo ordensRules)
    const ordensabertas  = getOne("SELECT COUNT(*) AS c FROM ordens WHERE status NOT IN ('Entregue','Cancelado','Cancelada') AND deletedat IS NULL")?.c ?? 0;
    const ordensvencidas = getOne("SELECT COUNT(*) AS c FROM ordens WHERE prazoentrega<? AND status NOT IN ('Entregue','Cancelado','Cancelada') AND deletedat IS NULL", [hj])?.c ?? 0;

    const lancamentos = getAll(
      `SELECT l.* FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} ORDER BY l.data DESC, l.id DESC`,
      [mes]
    );

    res.json({
      total, hoje: hojeV, count,
      ticketmedio: count > 0 ? toNumber(total) / count : 0,
      ordensabertas, ordensvencidas,
      porpagamento: porPag, portipo: porTipo,
      dias, lancamentos
    });
  } catch(e) { next(e); }
});

// GET /api/relatorios/producao?mes=YYYY-MM
router.get("/producao", auth(["admin"]), (req, res, next) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: "Informe o mes YYYY-MM" });

    const fases = getAll(`
      SELECT
        s1.id,
        s1.ordemid,
        o.numero       AS osnumero,
        o.servico,
        s1.statusnovo  AS status,
        s1.usuarioid,
        u.name         AS operador,
        s1.createdat   AS iniciadoem,
        s2.createdat   AS finalizadoem,
        CASE
          WHEN s2.createdat IS NOT NULL
          THEN CAST(ROUND((julianday(s2.createdat) - julianday(s1.createdat)) * 1440) AS INTEGER)
          ELSE NULL
        END AS duracao_min
      FROM statuslog s1
      LEFT JOIN statuslog s2
        ON s2.ordemid = s1.ordemid
        AND s2.id = (
          SELECT MIN(id) FROM statuslog
          WHERE ordemid = s1.ordemid AND id > s1.id
        )
      JOIN ordens o ON o.id = s1.ordemid AND o.deletedat IS NULL
      LEFT JOIN users u ON u.id = s1.usuarioid
      WHERE strftime('%Y-%m', s1.createdat) = ?
      ORDER BY s1.createdat DESC
    `, [mes]);

    const porOperador = getAll(`
      SELECT
        s1.usuarioid,
        u.name         AS operador,
        COUNT(*)       AS total_fases,
        COUNT(s2.id)   AS fases_concluidas,
        COUNT(CASE WHEN s2.id IS NULL THEN 1 END) AS em_andamento,
        CAST(ROUND(AVG(
          CASE WHEN s2.createdat IS NOT NULL
            THEN (julianday(s2.createdat) - julianday(s1.createdat)) * 1440
          END
        )) AS INTEGER)  AS media_duracao_min
      FROM statuslog s1
      LEFT JOIN statuslog s2
        ON s2.ordemid = s1.ordemid
        AND s2.id = (
          SELECT MIN(id) FROM statuslog
          WHERE ordemid = s1.ordemid AND id > s1.id
        )
      JOIN ordens o ON o.id = s1.ordemid AND o.deletedat IS NULL
      LEFT JOIN users u ON u.id = s1.usuarioid
      WHERE strftime('%Y-%m', s1.createdat) = ?
        AND s1.statusnovo NOT IN ('Aguardando', 'Excluida')
      GROUP BY s1.usuarioid
      ORDER BY fases_concluidas DESC
    `, [mes]);

    const porFase = getAll(`
      SELECT
        s1.statusnovo  AS fase,
        COUNT(*)       AS total,
        CAST(ROUND(AVG(
          CASE WHEN s2.createdat IS NOT NULL
            THEN (julianday(s2.createdat) - julianday(s1.createdat)) * 1440
          END
        )) AS INTEGER) AS media_duracao_min
      FROM statuslog s1
      LEFT JOIN statuslog s2
        ON s2.ordemid = s1.ordemid
        AND s2.id = (
          SELECT MIN(id) FROM statuslog
          WHERE ordemid = s1.ordemid AND id > s1.id
        )
      JOIN ordens o ON o.id = s1.ordemid AND o.deletedat IS NULL
      WHERE strftime('%Y-%m', s1.createdat) = ?
        AND s1.statusnovo NOT IN ('Aguardando', 'Excluida')
      GROUP BY s1.statusnovo
      ORDER BY media_duracao_min DESC
    `, [mes]);

    res.json({ mes, fases, porOperador, porFase });
  } catch(e) { next(e); }
});

module.exports = router;
