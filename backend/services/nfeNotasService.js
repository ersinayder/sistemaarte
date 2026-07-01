'use strict';

const {
  buildNfeListRow,
  isNotaAtivaParaOrdem,
} = require('../domain/nfeNotasRules');

function json(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value || {});
}

function hasTable(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function hasColumn(db, table, column) {
  if (!hasTable(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function buildClienteSnapshot(row = {}) {
  return {
    id: row.clienteid || null,
    nome: row.cliente_nome || row.clientenome || '',
    cpf: row.cpf || '',
    ie: row.ie || '',
    logradouro: row.logradouro || '',
    numero: row.endereco_numero || '',
    bairro: row.bairro || '',
    cidade: row.cidade || '',
    uf: row.uf || '',
    cep: row.cep || '',
  };
}

function backfillItensOrdem(db, nfeid, ordemid) {
  if (!hasTable(db, 'ordem_itens') || !hasTable(db, 'nfe_itens')) return;

  const itens = db.prepare(`
    SELECT
      oi.id,
      oi.produto_id,
      COALESCE(oi.nome, p.nome, 'PRODUTO') AS nome,
      COALESCE(oi.quantidade, 1) AS quantidade,
      COALESCE(oi.preco_unitario, 0) AS preco_unitario,
      COALESCE(oi.avulso, 0) AS avulso,
      COALESCE(p.ncm, '44151000') AS ncm,
      COALESCE(p.cfop, '5102') AS cfop,
      COALESCE(p.csosn, '400') AS csosn,
      COALESCE(p.origem_fiscal, 0) AS origem_fiscal,
      COALESCE(p.unidade, 'UN') AS unidade
    FROM ordem_itens oi
    LEFT JOIN produtos p ON p.id = oi.produto_id
    WHERE oi.ordemid = ?
    ORDER BY oi.id
  `).all(ordemid);

  const insert = db.prepare(`
    INSERT INTO nfe_itens
      (nfeid, ordem_item_id, produto_id, nome, quantidade, preco_unitario, avulso,
       ncm, cfop, csosn, origem_fiscal, unidade)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of itens) {
    insert.run(
      nfeid,
      item.id,
      item.produto_id || null,
      item.nome,
      Number(item.quantidade || 1),
      Number(item.preco_unitario || 0),
      item.avulso ? 1 : 0,
      String(item.ncm || '44151000'),
      String(item.cfop || '5102'),
      String(item.csosn || '400'),
      String(item.origem_fiscal ?? '0'),
      String(item.unidade || 'UN')
    );
  }
}

function linkEventosLegados(db, nota) {
  if (!hasTable(db, 'nfe_eventos') || !hasColumn(db, 'nfe_eventos', 'nfeid')) return;

  db.prepare(`
    UPDATE nfe_eventos
       SET nfeid = ?
     WHERE nfeid IS NULL
       AND (
         (chave IS NOT NULL AND chave = ?)
         OR (? IS NULL AND ordemid = ?)
       )
  `).run(nota.id, nota.chave || null, nota.chave || null, nota.ordemid || null);
}

function backfillNfeNotasFromOrdens(db) {
  if (!hasTable(db, 'ordens') || !hasTable(db, 'nfe_notas')) {
    return { inserted: 0, skipped: 0 };
  }

  const rows = db.prepare(`
    SELECT
      o.*,
      c.name AS cliente_nome,
      c.cpf,
      c.ie,
      c.logradouro,
      c.numero AS endereco_numero,
      c.bairro,
      c.cidade,
      c.uf,
      c.cep
    FROM ordens o
    LEFT JOIN clientes c ON c.id = o.clienteid
    WHERE o.nfe_status IS NOT NULL
    ORDER BY o.id
  `).all();

  const exists = db.prepare(`
    SELECT id FROM nfe_notas
    WHERE origem = 'ordem' AND ordemid = ? AND imported_legacy = 1
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO nfe_notas
      (origem, ordemid, clienteid, cliente_snapshot, emitente_snapshot, valortotal,
       descontovalor, pagamento, ambiente, numero, serie, chave, protocolo, status, xml,
       cancelado_em, cancel_protocolo, cancel_motivo, deletedat, deletedpor, deletedreason,
       imported_legacy, createdat, updatedat)
    VALUES
      ('ordem', ?, ?, ?, '{}', ?, ?, ?, 2, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, 1, COALESCE(?, datetime('now','localtime')), datetime('now','localtime'))
  `);

  let inserted = 0;
  let skipped = 0;

  const run = db.transaction(() => {
    for (const row of rows) {
      if (exists.get(row.id)) {
        skipped += 1;
        continue;
      }

      const info = insert.run(
        row.id,
        row.clienteid || null,
        json(buildClienteSnapshot(row)),
        Number(row.valortotal || 0),
        Number(row.descontovalor || 0),
        row.pagamento || 'Pix',
        row.nfe_numero || null,
        row.nfe_serie || '1',
        row.nfe_chave || null,
        row.nfe_protocolo || null,
        row.nfe_status,
        row.nfe_xml || null,
        row.nfe_cancelado_em || null,
        row.nfe_cancel_protocolo || null,
        row.nfe_cancel_motivo || null,
        row.nfe_deletedat || null,
        row.nfe_deletedpor || null,
        row.nfe_deletedreason || null,
        row.nfe_emitida_em || null
      );

      const nota = {
        id: Number(info.lastInsertRowid),
        ordemid: row.id,
        chave: row.nfe_chave || null,
      };
      backfillItensOrdem(db, nota.id, row.id);
      linkEventosLegados(db, nota);
      inserted += 1;
    }
  });

  run();
  return { inserted, skipped };
}

function listarNotasFiscais(db, options = {}) {
  if (!hasTable(db, 'nfe_notas')) return [];
  const lixeira = Boolean(options.lixeira);

  const rows = db.prepare(`
    SELECT
      n.id,
      n.origem,
      n.ordemid,
      n.clienteid,
      n.cliente_snapshot,
      n.emitente_snapshot,
      n.valortotal,
      n.descontovalor,
      n.pagamento,
      n.informacoes_complementares,
      n.ambiente,
      n.numero,
      n.serie,
      n.chave,
      n.protocolo,
      n.status,
      n.rejeicao_cstat,
      n.rejeicao_motivo,
      n.cancelado_em,
      n.cancel_protocolo,
      n.cancel_motivo,
      COALESCE(n.deletedat, CASE WHEN n.origem = 'ordem' THEN o.nfe_deletedat ELSE NULL END) AS deletedat,
      COALESCE(n.deletedpor, CASE WHEN n.origem = 'ordem' THEN o.nfe_deletedpor ELSE NULL END) AS deletedpor,
      COALESCE(n.deletedreason, CASE WHEN n.origem = 'ordem' THEN o.nfe_deletedreason ELSE NULL END) AS deletedreason,
      n.criadopor,
      n.imported_legacy,
      n.createdat,
      n.updatedat,
      n.numero AS numero_nfe,
      o.numero AS numero_os,
      o.servico,
      o.status AS ordem_status,
      c.name AS clientenome,
      COALESCE(ev.eventos_count, 0) AS nfe_eventos_count,
      COALESCE(ev.cce_count, 0) AS nfe_cce_count,
      ev.cce_ultima_em AS nfe_cce_ultima_em
    FROM nfe_notas n
    LEFT JOIN ordens o ON o.id = n.ordemid
    LEFT JOIN clientes c ON c.id = n.clienteid
    LEFT JOIN (
      SELECT
        nfeid,
        COUNT(*) AS eventos_count,
        SUM(CASE WHEN tipo = 'cce' THEN 1 ELSE 0 END) AS cce_count,
        MAX(CASE WHEN tipo = 'cce' THEN createdat ELSE NULL END) AS cce_ultima_em
      FROM nfe_eventos
      WHERE nfeid IS NOT NULL
      GROUP BY nfeid
    ) ev ON ev.nfeid = n.id
    WHERE ${lixeira
      ? "COALESCE(n.deletedat, CASE WHEN n.origem = 'ordem' THEN o.nfe_deletedat ELSE NULL END) IS NOT NULL"
      : "COALESCE(n.deletedat, CASE WHEN n.origem = 'ordem' THEN o.nfe_deletedat ELSE NULL END) IS NULL"}
    ORDER BY n.id DESC
  `).all();

  return rows.map(buildNfeListRow);
}

function resolverNotaPorChave(db, chave) {
  if (!hasTable(db, 'nfe_notas')) return null;
  return db.prepare(`
    SELECT *
    FROM nfe_notas
    WHERE chave = ? AND deletedat IS NULL
    LIMIT 1
  `).get(chave) || null;
}

function resolverNotaPorId(db, id, options = {}) {
  if (!hasTable(db, 'nfe_notas')) return null;
  const includeDeleted = Boolean(options.includeDeleted);
  const clause = includeDeleted ? 'id = ?' : 'id = ? AND deletedat IS NULL';
  return db.prepare(`
    SELECT *
    FROM nfe_notas
    WHERE ${clause}
    LIMIT 1
  `).get(id) || null;
}

function listarEventosNota(db, nota) {
  if (!nota || !hasTable(db, 'nfe_eventos')) return [];
  return db.prepare(`
    SELECT id, nfeid, ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, texto, createdat,
           CASE WHEN xml IS NOT NULL AND length(xml) > 0 THEN 1 ELSE 0 END AS tem_xml
    FROM nfe_eventos
    WHERE nfeid = ?
       OR chave = ?
       OR (? IS NOT NULL AND ordemid = ?)
    ORDER BY createdat DESC, id DESC
  `).all(nota.id, nota.chave || '', nota.ordemid || null, nota.ordemid || null);
}

function moverNotaParaLixeira(db, id, userId, reason) {
  return db.prepare(`
    UPDATE nfe_notas
    SET deletedat=datetime('now','localtime'),
        deletedpor=?,
        deletedreason=?,
        updatedat=datetime('now','localtime')
    WHERE id=?
  `).run(userId || null, reason, id);
}

function restaurarNotaDaLixeira(db, id) {
  return db.prepare(`
    UPDATE nfe_notas
    SET deletedat=NULL,
        deletedpor=NULL,
        deletedreason=NULL,
        updatedat=datetime('now','localtime')
    WHERE id=?
  `).run(id);
}

function criarNotaEmitindo(db, data = {}) {
  const info = db.prepare(`
    INSERT INTO nfe_notas
      (origem, ordemid, clienteid, cliente_snapshot, emitente_snapshot, valortotal,
       descontovalor, pagamento, informacoes_complementares, ambiente, numero, serie, status, criadopor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitindo', ?)
  `).run(
    data.origem,
    data.ordemid || null,
    data.clienteid || null,
    json(data.cliente_snapshot || {}),
    json(data.emitente_snapshot || {}),
    Number(data.valortotal || 0),
    Number(data.descontovalor || 0),
    data.pagamento || 'Pix',
    data.informacoes_complementares || null,
    Number(data.ambiente || 2),
    data.numero || null,
    data.serie || '1',
    data.criadopor || null
  );
  return resolverNotaPorId(db, Number(info.lastInsertRowid), { includeDeleted: true });
}

function substituirItensNota(db, nfeid, itens = []) {
  db.prepare('DELETE FROM nfe_itens WHERE nfeid=?').run(nfeid);
  const insert = db.prepare(`
    INSERT INTO nfe_itens
      (nfeid, ordem_item_id, produto_id, nome, quantidade, preco_unitario, avulso,
       ncm, cfop, csosn, origem_fiscal, unidade)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of itens) {
    insert.run(
      nfeid,
      item.id || item.ordem_item_id || null,
      item.produto_id || null,
      item.nome || item.produto_nome || 'PRODUTO',
      Number(item.quantidade || 1),
      Number(item.preco_unitario || 0),
      item.avulso ? 1 : 0,
      String(item.ncm || '44151000'),
      String(item.cfop || '5102'),
      String(item.csosn || '400'),
      String(item.origem_fiscal ?? '0'),
      item.unidade || 'UN'
    );
  }
}

function marcarNotaAutorizada(db, id, data = {}) {
  return db.prepare(`
    UPDATE nfe_notas
    SET status='autorizado',
        chave=?,
        protocolo=?,
        xml=?,
        rejeicao_cstat=NULL,
        rejeicao_motivo=NULL,
        cancelado_em=NULL,
        cancel_protocolo=NULL,
        cancel_motivo=NULL,
        deletedat=NULL,
        deletedpor=NULL,
        deletedreason=NULL,
        createdat=COALESCE(?, createdat),
        updatedat=datetime('now','localtime')
    WHERE id=?
  `).run(
    data.chave || null,
    data.protocolo || null,
    data.xml || null,
    data.emitida_em || null,
    id
  );
}

function marcarNotaRejeitada(db, id, data = {}) {
  return db.prepare(`
    UPDATE nfe_notas
    SET status='rejeitado',
        chave=COALESCE(?, chave),
        rejeicao_cstat=?,
        rejeicao_motivo=?,
        xml=COALESCE(?, xml),
        updatedat=datetime('now','localtime')
    WHERE id=?
  `).run(
    data.chave || null,
    data.cstat || null,
    data.motivo || null,
    data.xml || null,
    id
  );
}

function marcarNotaIncerta(db, id, data = {}) {
  return db.prepare(`
    UPDATE nfe_notas
    SET status='incerto',
        chave=COALESCE(?, chave),
        rejeicao_cstat=?,
        rejeicao_motivo=?,
        xml=COALESCE(?, xml),
        updatedat=datetime('now','localtime')
    WHERE id=?
  `).run(
    data.chave || null,
    data.cstat ?? data.cStat ?? null,
    data.motivo || null,
    data.xml || data.xmlRetorno || null,
    id
  );
}

function marcarNotaCancelada(db, id, data = {}) {
  return db.prepare(`
    UPDATE nfe_notas
    SET status='cancelado',
        cancelado_em=?,
        cancel_protocolo=?,
        cancel_motivo=?,
        updatedat=datetime('now','localtime')
    WHERE id=?
  `).run(
    data.cancelado_em || null,
    data.protocolo || null,
    data.motivo || null,
    id
  );
}

function montarDocumentoFiscalAvulso({ cliente, itens, pagamento = 'Pix' } = {}) {
  const total = (itens || []).reduce((acc, item) => (
    acc + Number(item.quantidade || 1) * Number(item.preco_unitario || 0)
  ), 0);
  return {
    valortotal: Math.round(total * 100) / 100,
    descontovalor: 0,
    pagamento,
    cliente,
    itens,
  };
}

function buscarNotaAtivaParaOrdem(db, ordemid) {
  if (!hasTable(db, 'nfe_notas')) return null;
  const rows = db.prepare(`
    SELECT *
    FROM nfe_notas
    WHERE origem = 'ordem'
      AND ordemid = ?
      AND deletedat IS NULL
    ORDER BY id DESC
  `).all(ordemid);
  return rows.find(isNotaAtivaParaOrdem) || null;
}

module.exports = {
  backfillNfeNotasFromOrdens,
  buscarNotaAtivaParaOrdem,
  criarNotaEmitindo,
  listarEventosNota,
  listarNotasFiscais,
  marcarNotaAutorizada,
  marcarNotaCancelada,
  marcarNotaIncerta,
  marcarNotaRejeitada,
  montarDocumentoFiscalAvulso,
  moverNotaParaLixeira,
  resolverNotaPorChave,
  resolverNotaPorId,
  restaurarNotaDaLixeira,
  substituirItensNota,
};
