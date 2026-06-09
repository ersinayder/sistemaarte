const AVISO_AUTO_STATUS = ['pendente', 'enviando', 'aguardando_conexao', 'erro', 'enviado'];

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizarAutoStatus(value) {
  const status = clean(value, 40).toLowerCase();
  return AVISO_AUTO_STATUS.includes(status) ? status : null;
}

function podeProcessarAvisoAutomatico(aviso = {}) {
  const statusManual = clean(aviso.status || 'pendente', 40).toLowerCase();
  const autoStatus = normalizarAutoStatus(aviso.auto_status || 'pendente');
  return statusManual === 'pendente' && ['pendente', 'erro', 'aguardando_conexao'].includes(autoStatus);
}

function calcularProximaTentativa(tentativas = 0) {
  const attempts = Math.max(0, Number(tentativas || 0));
  return Math.min(1800, 30 * (2 ** attempts));
}

function resumirErroEnvio(err) {
  const raw = typeof err === 'string' ? err : err?.message;
  return clean(raw || 'Erro desconhecido no envio do WhatsApp', 500);
}

module.exports = {
  AVISO_AUTO_STATUS,
  normalizarAutoStatus,
  podeProcessarAvisoAutomatico,
  calcularProximaTentativa,
  resumirErroEnvio,
};
