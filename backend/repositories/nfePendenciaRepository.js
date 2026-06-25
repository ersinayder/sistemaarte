'use strict';

const STATUS_ATIVOS = ['processando', 'incerto'];

function normalizarId(id) {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

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

function buscarPendenciaEmissao(db, id) {
  const pendencia = db.prepare(`
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
    WHERE t.id = ?
      AND t.status IN (?, ?)
      AND o.deletedat IS NULL
  `).get(id, ...STATUS_ATIVOS);

  if (!pendencia) return null;
  const transicoes = db.prepare(`
    SELECT id, status, estado_anterior, estado_novo, cstat, motivo, createdat
    FROM nfe_emissao_transicoes
    WHERE tentativaid = ?
    ORDER BY id ASC
  `).all(id);

  return { pendencia, transicoes };
}

function buscarPendenciaEvento(db, id) {
  const pendencia = db.prepare(`
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
    WHERE t.id = ?
      AND t.status IN (?, ?)
      AND o.deletedat IS NULL
  `).get(id, ...STATUS_ATIVOS);

  if (!pendencia) return null;
  const transicoes = db.prepare(`
    SELECT id, status, estado_anterior, estado_novo, cstat, motivo, createdat
    FROM nfe_evento_transicoes
    WHERE tentativaid = ?
    ORDER BY id ASC
  `).all(id);

  return { pendencia, transicoes };
}

function buscarPendenciaFiscalComTransicoes(db, input = {}) {
  const origem = String(input.origem || '').trim();
  const id = normalizarId(input.id);
  if (!id) return null;
  if (origem === 'emissao') return buscarPendenciaEmissao(db, id);
  if (origem === 'evento') return buscarPendenciaEvento(db, id);
  return null;
}

module.exports = {
  buscarPendenciaFiscalComTransicoes,
  listarPendenciasFiscais,
};
