'use strict';

const TRANSICOES_PERMITIDAS = {
  processando: new Set(['incerto', 'autorizado', 'rejeitado', 'falha_local']),
  incerto: new Set(['autorizado', 'rejeitado']),
};
const STATUS_FINAIS = new Set(['autorizado', 'rejeitado', 'falha_local']);

function repositoryError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sanitizePayload(payload) {
  if (!payload) return null;
  return JSON.stringify(payload).slice(0, 20000);
}

function createNfeEventoAttemptRepository(db, deps = {}) {
  const agora = deps.agora || (() => new Date().toISOString());

  function buscarPorId(id) {
    return db.prepare('SELECT * FROM nfe_evento_tentativas WHERE id = ?').get(id) || null;
  }

  function buscarAtiva({ chave, tipo, nSeqEvento }) {
    return db.prepare(`
      SELECT *
      FROM nfe_evento_tentativas
      WHERE chave = ?
        AND tipo = ?
        AND nseqevento = ?
        AND status IN ('processando','incerto')
      ORDER BY id DESC
      LIMIT 1
    `).get(String(chave), String(tipo), Number(nSeqEvento || 1)) || null;
  }

  const criarTx = db.transaction((input) => {
    const chave = String(input.chave || '').trim();
    const tipo = String(input.tipo || '').trim();
    const nSeqEvento = Number(input.nSeqEvento || input.nseqevento || 1);
    const ativa = buscarAtiva({ chave, tipo, nSeqEvento });
    if (ativa) {
      throw repositoryError(409, 'nfe_evento_tentativa_ativa', 'Ja existe tentativa ativa para este evento fiscal.');
    }

    const timestamp = agora();
    const idempotencyBase = `${tipo}:${chave}:${nSeqEvento}`;
    const historico = db.prepare(`
      SELECT MAX(CAST(substr(idempotency_key, length(?) + 3) AS INTEGER)) AS maior_ordinal
      FROM nfe_evento_tentativas
      WHERE substr(idempotency_key, 1, length(?)) = ?
        AND substr(idempotency_key, length(?) + 1, 2) = ':a'
    `).get(idempotencyBase, idempotencyBase, idempotencyBase, idempotencyBase);
    const idempotencyKey = `${idempotencyBase}:a${Number(historico.maior_ordinal || 0) + 1}`;
    const insert = db.prepare(`
      INSERT INTO nfe_evento_tentativas
        (ordemid, chave, tipo, nseqevento, idempotency_key, status, payload_json, solicitado_por, createdat, updatedat)
      VALUES (?, ?, ?, ?, ?, 'processando', ?, ?, ?, ?)
    `).run(
      Number(input.ordemId),
      chave,
      tipo,
      nSeqEvento,
      idempotencyKey,
      sanitizePayload(input.payload),
      input.usuarioId ?? null,
      timestamp,
      timestamp
    );

    db.prepare(`
      INSERT INTO nfe_evento_transicoes
        (tentativaid, ordemid, chave, tipo, nseqevento, status, estado_anterior, estado_novo, createdat)
      VALUES (?, ?, ?, ?, ?, 'processando', NULL, 'processando', ?)
    `).run(insert.lastInsertRowid, Number(input.ordemId), chave, tipo, nSeqEvento, timestamp);

    return buscarPorId(insert.lastInsertRowid);
  });

  function criar(input) {
    return criarTx.immediate(input);
  }

  function transicionarNaTransacao(id, status, dados = {}) {
    if (!db.inTransaction) {
      throw repositoryError(500, 'nfe_evento_transacao_obrigatoria', 'transicionarNaTransacao exige transacao ativa.');
    }
    const atual = buscarPorId(id);
    if (!atual) {
      throw repositoryError(404, 'nfe_evento_tentativa_nao_encontrada', 'Tentativa de evento fiscal nao encontrada.');
    }
    if (status === atual.status) return atual;
    if (!TRANSICOES_PERMITIDAS[atual.status]?.has(status)) {
      throw repositoryError(409, 'nfe_evento_transicao_invalida', 'Transicao de evento fiscal invalida.');
    }

    const timestamp = agora();
    const concluidoEm = STATUS_FINAIS.has(status) ? timestamp : atual.concluido_em;
    db.prepare(`
      UPDATE nfe_evento_tentativas
      SET status = ?,
          cstat = ?,
          motivo = ?,
          protocolo = ?,
          xml_retorno = ?,
          erro_local = ?,
          updatedat = ?,
          concluido_em = ?
      WHERE id = ?
    `).run(
      status,
      dados.cStat ?? dados.cstat ?? atual.cstat,
      dados.motivo ?? atual.motivo,
      dados.protocolo ?? atual.protocolo,
      dados.xmlRetorno ?? dados.xml_retorno ?? atual.xml_retorno,
      dados.erroLocal ?? dados.erro_local ?? atual.erro_local,
      timestamp,
      concluidoEm,
      id
    );

    db.prepare(`
      INSERT INTO nfe_evento_transicoes
        (tentativaid, ordemid, chave, tipo, nseqevento, status, estado_anterior, estado_novo, cstat, motivo, createdat)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      atual.ordemid,
      atual.chave,
      atual.tipo,
      atual.nseqevento,
      status,
      atual.status,
      status,
      dados.cStat ?? dados.cstat ?? null,
      dados.motivo ?? null,
      timestamp
    );

    return buscarPorId(id);
  }

  const transicionarTx = db.transaction(transicionarNaTransacao);

  function transicionar(id, status, dados = {}) {
    return transicionarTx.immediate(id, status, dados);
  }

  return {
    criar,
    buscarPorId,
    buscarAtiva,
    transicionar,
    transicionarNaTransacao,
  };
}

module.exports = { createNfeEventoAttemptRepository };
