const router = require("express").Router();
const { getAll, getOne } = require("../database");
const { auth } = require("../middlewares/auth");
const { hoje } = require("../utils/dates");
const { toNumber } = require("../utils/numbers");

// Filtro reutilizavel: exclui lancamentos soft-deleted (C4) e lancamentos
// vinculados a OS que foram soft-deleted (I4).
const FILTRO_ATIVO = `
  l.deletedat IS NULL
  AND (l.ordemid IS NULL OR (SELECT deletedat FROM ordens WHERE id=l.ordemid) IS NULL)
`;

router.get("/resumo", auth(), (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: "Informe o m\u00eas YYYY-MM" });

    const hj = hoje();

    const total = getOne(
      `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}`,
      [mes]
    )?.v ?? 0;

    const hojeV = getOne(
      `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l WHERE l.data=? AND ${FILTRO_ATIVO}`,
      [hj]
    )?.v ?? 0;

    const count = getOne(
      `SELECT COUNT(*) AS c FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}`,
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

    const ordensabertas  = getOne("SELECT COUNT(*) AS c FROM ordens WHERE status NOT IN ('Entregue','Cancelado') AND deletedat IS NULL")?.c ?? 0;
    const ordensvencidas = getOne("SELECT COUNT(*) AS c FROM ordens WHERE prazoentrega<? AND status NOT IN ('Entregue','Cancelado') AND deletedat IS NULL", [hj])?.c ?? 0;

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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/relatorios/producao?mes=YYYY-MM
// Calcula metricas de producao por operador a partir do statuslog existente.
// Duracao de cada fase = diferenca entre createdat da entrada e do proximo registro da mesma OS.
// Fases ainda abertas (sem registro posterior) sao incluidas com finalizadoem=null e duracao_min=null.
router.get("/producao", auth(["admin"]), (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: "Informe o mes YYYY-MM" });

    // Todas as transicoes do mes, para OS nao deletadas
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

    // Resumo por operador: contagem de fases concluidas e media de duracao
    const porOperador = getAll(`
      SELECT
        s1.usuarioid,
        u.name         AS operador,
        COUNT(*)       AS total_fases,
        COUNT(s2.id)   AS fases_concluidas,
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

    // Resumo por status/fase: tempo medio por etapa do fluxo
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
