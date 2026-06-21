'use strict';

const TRANSICOES_PERMITIDAS = {
  processando: new Set(['incerto', 'autorizado', 'rejeitado', 'falha_local']),
  incerto: new Set(['autorizado', 'rejeitado']),
};
const STATUS_FINAIS = new Set(['autorizado', 'rejeitado', 'falha_local']);
const CAMPOS_TRANSICAO = [
  'cstat',
  'motivo',
  'chave',
  'protocolo',
  'xml_envio',
  'xml_retorno',
  'erro_local',
];

function repositoryError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function createNfeAttemptRepository(db, deps = {}) {
  const agora = deps.agora || (() => new Date().toISOString());

  function buscarAtivaPorOrdem(ordemId, operacao = 'emissao') {
    return db.prepare(`
      SELECT *
      FROM nfe_emissao_tentativas
      WHERE ordemid = ?
        AND operacao = ?
        AND status IN ('processando', 'incerto')
      ORDER BY id DESC
      LIMIT 1
    `).get(ordemId, operacao) || null;
  }

  const reservarTransaction = db.transaction(({ ordemId, serie, usuarioId }) => {
    if (buscarAtivaPorOrdem(ordemId)) {
      throw repositoryError(409, 'nfe_tentativa_ativa', 'Ja existe uma tentativa ativa para esta OS.');
    }

    const serieNormalizada = String(serie);
    db.prepare(`
      INSERT OR IGNORE INTO nfe_sequencias (serie, ultimo_numero)
      VALUES (?, 0)
    `).run(serieNormalizada);

    const sequencia = db.prepare(`
      UPDATE nfe_sequencias
      SET ultimo_numero = ultimo_numero + 1
      WHERE serie = ?
      RETURNING ultimo_numero
    `).get(serieNormalizada);

    const numero = sequencia.ultimo_numero;
    const lote = String(numero).padStart(9, '0');
    const idempotencyKey = `emissao:${ordemId}:${serieNormalizada}:${numero}`;
    const timestamp = agora();

    let insert;
    try {
      insert = db.prepare(`
        INSERT INTO nfe_emissao_tentativas
          (ordemid, operacao, idempotency_key, numero, serie, lote, status,
           solicitado_por, createdat, updatedat)
        VALUES (?, 'emissao', ?, ?, ?, ?, 'processando', ?, ?, ?)
      `).run(
        ordemId,
        idempotencyKey,
        numero,
        serieNormalizada,
        lote,
        usuarioId ?? null,
        timestamp,
        timestamp
      );
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw repositoryError(409, 'nfe_tentativa_ativa', 'Ja existe uma tentativa ativa para esta OS.');
      }
      throw error;
    }

    db.prepare(`
      INSERT INTO nfe_emissao_transicoes
        (tentativaid, ordemid, status, createdat)
      VALUES (?, ?, 'processando', ?)
    `).run(insert.lastInsertRowid, ordemId, timestamp);

    return db.prepare('SELECT * FROM nfe_emissao_tentativas WHERE id = ?')
      .get(insert.lastInsertRowid);
  });

  function reservar(input) {
    return reservarTransaction(input);
  }

  function buscarPorId(id) {
    return db.prepare('SELECT * FROM nfe_emissao_tentativas WHERE id = ?').get(id) || null;
  }

  function transicionarNaTransacao(id, status, dados = {}) {
    const atual = buscarPorId(id);
    if (!atual) {
      throw repositoryError(404, 'nfe_tentativa_nao_encontrada', 'Tentativa de emissao nao encontrada.');
    }
    if (status === atual.status) return atual;
    if (!TRANSICOES_PERMITIDAS[atual.status]?.has(status)) {
      throw repositoryError(409, 'nfe_transicao_invalida', 'Transicao de tentativa de emissao invalida.');
    }

    const timestamp = agora();
    const valores = CAMPOS_TRANSICAO.map((campo) => (
      Object.prototype.hasOwnProperty.call(dados, campo) ? dados[campo] : atual[campo]
    ));
    const concluidoEm = STATUS_FINAIS.has(status)
      ? (dados.concluido_em ?? timestamp)
      : atual.concluido_em;
    db.prepare(`
      UPDATE nfe_emissao_tentativas
      SET status = ?,
          cstat = ?,
          motivo = ?,
          chave = ?,
          protocolo = ?,
          xml_envio = ?,
          xml_retorno = ?,
          erro_local = ?,
          updatedat = ?,
          concluido_em = ?
      WHERE id = ?
    `).run(status, ...valores, timestamp, concluidoEm, id);
    db.prepare(`
      INSERT INTO nfe_emissao_transicoes
        (tentativaid, ordemid, status, cstat, motivo, createdat)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, atual.ordemid, status, dados.cstat ?? null, dados.motivo ?? null, timestamp);

    return buscarPorId(id);
  }

  const transicionarTransaction = db.transaction(transicionarNaTransacao);

  function transicionar(id, status, dados = {}) {
    return transicionarTransaction(id, status, dados);
  }

  const devolverNumeroTransaction = db.transaction((id) => {
    const tentativa = buscarPorId(id);
    if (!tentativa) {
      throw repositoryError(404, 'nfe_tentativa_nao_encontrada', 'Tentativa de emissao nao encontrada.');
    }
    if (!['rejeitado', 'falha_local'].includes(tentativa.status)) return false;

    const result = db.prepare(`
      UPDATE nfe_sequencias
      SET ultimo_numero = ultimo_numero - 1
      WHERE serie = ?
        AND ultimo_numero = ?
    `).run(tentativa.serie, tentativa.numero);
    return result.changes === 1;
  });

  function devolverNumero(id) {
    return devolverNumeroTransaction(id);
  }

  return {
    reservar,
    buscarPorId,
    buscarAtivaPorOrdem,
    devolverNumero,
    transicionar,
    // Assumes the caller already owns the surrounding database transaction.
    transicionarNaTransacao,
  };
}

module.exports = {
  createNfeAttemptRepository,
};
