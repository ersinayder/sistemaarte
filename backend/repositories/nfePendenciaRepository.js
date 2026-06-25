'use strict';

const STATUS_ATIVOS = ['processando', 'incerto'];

function listarPendenciasFiscais(db) {
  return db.prepare(`
    SELECT *
    FROM (
      SELECT
        t.id AS id,
        'emissao' AS origem,
        'emissao' AS tipo,
        t.status AS status,
        t.ordemid AS ordemid,
        o.numero AS numero_os,
        COALESCE(c.name, o.clientenome) AS cliente,
        t.chave AS chave,
        t.numero AS numero_nfe,
        t.serie AS serie,
        NULL AS nseqevento,
        t.cstat AS cstat,
        t.motivo AS motivo,
        t.createdat AS createdat,
        t.updatedat AS updatedat
      FROM nfe_emissao_tentativas t
      LEFT JOIN ordens o ON o.id = t.ordemid
      LEFT JOIN clientes c ON c.id = o.clienteid
      WHERE t.status IN (?, ?)
        AND o.deletedat IS NULL

      UNION ALL

      SELECT
        t.id AS id,
        'evento' AS origem,
        t.tipo AS tipo,
        t.status AS status,
        t.ordemid AS ordemid,
        o.numero AS numero_os,
        COALESCE(c.name, o.clientenome) AS cliente,
        t.chave AS chave,
        NULL AS numero_nfe,
        NULL AS serie,
        t.nseqevento AS nseqevento,
        t.cstat AS cstat,
        t.motivo AS motivo,
        t.createdat AS createdat,
        t.updatedat AS updatedat
      FROM nfe_evento_tentativas t
      LEFT JOIN ordens o ON o.id = t.ordemid
      LEFT JOIN clientes c ON c.id = o.clienteid
      WHERE t.status IN (?, ?)
        AND o.deletedat IS NULL
    )
    ORDER BY updatedat DESC, id DESC
    LIMIT 50
  `).all(...STATUS_ATIVOS, ...STATUS_ATIVOS);
}

module.exports = {
  listarPendenciasFiscais,
};
