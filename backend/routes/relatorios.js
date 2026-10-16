const router = require("express").Router();
const { getAll, getOne } = require("../database");
const { auth, authPermission } = require("../middlewares/auth");
const { hoje } = require("../utils/dates");
const { toNumber } = require("../utils/numbers");
const { normalizarPagamento } = require("../domain/pagamentosRules");
const { renderRelatorioProducaoHtml } = require("../utils/print/producaoReport");
const { sendPrintHtml } = require("../utils/print/base");

const FILTRO_ATIVO = `
  l.deletedat IS NULL
  AND NOT EXISTS (SELECT 1 FROM ordens o WHERE o.id = l.ordemid AND o.deletedat IS NOT NULL)
`;

const COND_SAIDA = `l.tipo IN ('Saída', 'Saida', 'saida', 'saída')`;
const COND_ENTRADA = `l.tipo NOT IN ('Saída', 'Saida', 'saida', 'saída')`;

router.get("/resumo", auth(), authPermission("relatorios.ver"), (req, res, next) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: "Informe o mês YYYY-MM" });

    const hj = hoje();

    const totaisMes = getOne(
      `SELECT
         COALESCE(SUM(CASE WHEN ${COND_SAIDA} THEN -l.valor ELSE l.valor END), 0) AS total,
         COALESCE(SUM(CASE WHEN ${COND_ENTRADA} THEN l.valor ELSE 0 END), 0) AS entradas,
         COALESCE(SUM(CASE WHEN ${COND_SAIDA} THEN l.valor ELSE 0 END), 0) AS saidas
       FROM lancamentos l
       WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}`,
      [mes]
    );

    const total = Math.round((totaisMes?.total ?? 0) * 100) / 100;
    const entradas = Math.round((totaisMes?.entradas ?? 0) * 100) / 100;
    const saidas = Math.round((totaisMes?.saidas ?? 0) * 100) / 100;

    const hojeTotais = getOne(
      `SELECT
         COALESCE(SUM(CASE WHEN ${COND_SAIDA} THEN -l.valor ELSE l.valor END), 0) AS total,
         COALESCE(SUM(CASE WHEN ${COND_ENTRADA} THEN l.valor ELSE 0 END), 0) AS entradas,
         COALESCE(SUM(CASE WHEN ${COND_SAIDA} THEN l.valor ELSE 0 END), 0) AS saidas
       FROM lancamentos l
       WHERE l.data=? AND ${FILTRO_ATIVO}`,
      [hj]
    );

    const hojeV = Math.round((hojeTotais?.total ?? 0) * 100) / 100;

    const count = getOne(
      `SELECT COUNT(*) AS c FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}`,
      [mes]
    )?.c ?? 0;

    const countEntradas = getOne(
      `SELECT COUNT(*) AS c FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${COND_ENTRADA} AND ${FILTRO_ATIVO}`,
      [mes]
    )?.c ?? 0;

    const porPag = {};
    getAll(
      `SELECT l.pagamento,
              SUM(CASE WHEN ${COND_ENTRADA} THEN l.valor ELSE 0 END) AS v
       FROM lancamentos l
       WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}
       GROUP BY l.pagamento`,
      [mes]
    ).forEach(r => {
      const key = normalizarPagamento(r.pagamento);
      porPag[key] = (porPag[key] || 0) + Number(r.v || 0);
    });

    const porTipo = {};
    getAll(
      `SELECT
         CASE WHEN ${COND_SAIDA} THEN 'Saída' ELSE 'Entrada' END AS tipo_norm,
         SUM(l.valor) AS v
       FROM lancamentos l
       WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}
       GROUP BY tipo_norm`,
      [mes]
    ).forEach(r => {
      porTipo[r.tipo_norm] = Math.round(Number(r.v || 0) * 100) / 100;
    });

    const dias = getAll(
      `SELECT
         l.data,
         ROUND(SUM(CASE WHEN ${COND_SAIDA} THEN -l.valor ELSE l.valor END), 2) AS total,
         ROUND(SUM(CASE WHEN ${COND_ENTRADA} THEN l.valor ELSE 0 END), 2) AS entradas,
         ROUND(SUM(CASE WHEN ${COND_SAIDA} THEN l.valor ELSE 0 END), 2) AS saidas
       FROM lancamentos l
       WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}
       GROUP BY l.data
       ORDER BY l.data`,
      [mes]
    );

    const ordensabertas  = getOne("SELECT COUNT(*) AS c FROM ordens WHERE status NOT IN ('Entregue','Cancelado','Cancelada') AND deletedat IS NULL")?.c ?? 0;
    const ordensvencidas = getOne("SELECT COUNT(*) AS c FROM ordens WHERE prazoentrega<? AND status NOT IN ('Entregue','Cancelado','Cancelada') AND deletedat IS NULL", [hj])?.c ?? 0;

    const lancamentos = getAll(
      `SELECT l.* FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} ORDER BY l.data DESC, l.id DESC`,
      [mes]
    );

    const ticketmedio = countEntradas > 0
      ? Math.round((entradas / countEntradas) * 100) / 100
      : (count > 0 ? Math.round((toNumber(total) / count) * 100) / 100 : 0);

    res.json({
      total,
      entradas,
      saidas,
      hoje: hojeV,
      hoje_entradas: Math.round((hojeTotais?.entradas ?? 0) * 100) / 100,
      hoje_saidas: Math.round((hojeTotais?.saidas ?? 0) * 100) / 100,
      count,
      count_entradas: countEntradas,
      ticketmedio,
      ticket_medio: ticketmedio,
      ordensabertas,
      ordensvencidas,
      porpagamento: porPag,
      portipo: porTipo,
      dias,
      lancamentos
    });
  } catch(e) { next(e); }
});

// GET /api/relatorios/producao?mes=YYYY-MM
router.get("/producao", auth(), authPermission("relatorios.producao"), (req, res, next) => {
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
        AND s1.statusnovo NOT IN ('Aguardando', 'Excluida')
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

router.get("/producao/pdf", auth(), authPermission("relatorios.producao"), (req, res, next) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: "Informe o mes YYYY-MM" });
    const payload = getRelatorioProducaoPayload(mes);
    const html = renderRelatorioProducaoHtml(payload);
    sendPrintHtml(res, `relatorio-producao-${mes}.html`, html);
  } catch(e) { next(e); }
});

function getRelatorioProducaoPayload(mes) {
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
      AND s1.statusnovo NOT IN ('Aguardando', 'Excluida')
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

  return { mes, fases, porOperador, porFase };
}

module.exports = router;
