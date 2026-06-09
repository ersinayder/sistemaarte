const { getAll, getOne, run } = require('../database');
const { calcularProximaTentativa, resumirErroEnvio } = require('../domain/whatsappQueueRules');

function marcarAvisoParaEnvio({ ordemId, tipo, phone, text, canal = 'web_local' }) {
  run(
    `INSERT INTO whatsapp_avisos
       (ordemid, tipo, status, telefone_snapshot, mensagem_snapshot, canal, auto_status, tentativas, next_attempt_at, updatedat)
     VALUES (?, ?, 'pendente', ?, ?, ?, 'pendente', 0, datetime('now','localtime'), datetime('now','localtime'))
     ON CONFLICT(ordemid, tipo) DO UPDATE SET
       telefone_snapshot=COALESCE(excluded.telefone_snapshot, whatsapp_avisos.telefone_snapshot),
       mensagem_snapshot=COALESCE(excluded.mensagem_snapshot, whatsapp_avisos.mensagem_snapshot),
       canal=CASE WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.canal ELSE excluded.canal END,
       auto_status=CASE WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.auto_status ELSE 'pendente' END,
       next_attempt_at=CASE WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.next_attempt_at ELSE datetime('now','localtime') END,
       updatedat=datetime('now','localtime')`,
    [ordemId, tipo, phone, text, canal]
  );
}

function buscarAvisoFila(id) {
  return getOne(`SELECT * FROM whatsapp_avisos WHERE id=? LIMIT 1`, [id]);
}

function listarAvisosElegiveis(limit = 5) {
  return getAll(
    `SELECT * FROM whatsapp_avisos
     WHERE canal='web_local'
       AND status='pendente'
       AND auto_status IN ('pendente','erro','aguardando_conexao')
       AND telefone_snapshot IS NOT NULL
       AND mensagem_snapshot IS NOT NULL
       AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now','localtime'))
     ORDER BY COALESCE(next_attempt_at, createdat), id
     LIMIT ?`,
    [limit]
  );
}

function tentarClaimAviso(id) {
  const result = run(
    `UPDATE whatsapp_avisos
     SET auto_status='enviando', updatedat=datetime('now','localtime')
     WHERE id=?
       AND canal='web_local'
       AND status='pendente'
       AND auto_status IN ('pendente','erro','aguardando_conexao')`,
    [id]
  );
  return result.changes === 1;
}

function marcarAguardandoConexao(id, erro) {
  run(
    `UPDATE whatsapp_avisos
     SET auto_status='aguardando_conexao',
         last_error=?,
         next_attempt_at=datetime('now','localtime','+30 seconds'),
         updatedat=datetime('now','localtime')
     WHERE id=?`,
    [resumirErroEnvio(erro), id]
  );
}

function marcarErroTemporario(id, erro, tentativas) {
  const seconds = calcularProximaTentativa(tentativas);
  run(
    `UPDATE whatsapp_avisos
     SET auto_status='erro',
         tentativas=?,
         last_error=?,
         next_attempt_at=datetime('now','localtime', ?),
         updatedat=datetime('now','localtime')
     WHERE id=?`,
    [tentativas, resumirErroEnvio(erro), `+${seconds} seconds`, id]
  );
}

function marcarEnviado(id, providerMessageId = null) {
  run(
    `UPDATE whatsapp_avisos
     SET status='enviado',
         auto_status='enviado',
         provider_message_id=?,
         enviado_em=datetime('now','localtime'),
         updatedat=datetime('now','localtime')
     WHERE id=?`,
    [providerMessageId, id]
  );
}

module.exports = {
  marcarAvisoParaEnvio,
  buscarAvisoFila,
  listarAvisosElegiveis,
  tentarClaimAviso,
  marcarAguardandoConexao,
  marcarErroTemporario,
  marcarEnviado,
};
