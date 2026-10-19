const TIPOS_VALIDOS = ['ordem', 'proposta', 'caixa'];
const PAPEIS_VALIDOS = ['A5', 'A4'];
const HEARTBEAT_TIMEOUT_MS = 35000;
const LEASE_TIMEOUT_MS = 120000;
const MAX_TENTATIVAS_LEASE = 3;

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return new Date(trimmed.replace(' ', 'T'));
    }
    return new Date(trimmed);
  }
  return null;
}

function validarPrintJobPayload(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Payload de impressão inválido.' };
  }

  const errors = {};

  const tipo = String(input.tipo ?? '').trim().toLowerCase();
  if (!TIPOS_VALIDOS.includes(tipo)) {
    errors.tipo = `Tipo de documento inválido (${input.tipo}). Permitidos: ${TIPOS_VALIDOS.join(', ')}.`;
  }

  const documentoNome = String(input.documentoNome ?? input.documento_nome ?? '').trim();
  if (!documentoNome) {
    errors.documentoNome = 'Nome do documento é obrigatório.';
  }

  const html = String(input.html ?? '').trim();
  if (!html) {
    errors.html = 'HTML do documento é obrigatório.';
  }

  if (input.copias !== undefined && input.copias !== null) {
    const rawCopias = Number(input.copias);
    if (!Number.isInteger(rawCopias) || (rawCopias !== 1 && rawCopias !== 2)) {
      errors.copias = 'Quantidade de cópias deve ser 1 ou 2.';
    }
  }

  if (input.papel !== undefined && input.papel !== null) {
    const rawPapel = String(input.papel).trim().toUpperCase();
    if (!PAPEIS_VALIDOS.includes(rawPapel)) {
      errors.papel = `Tamanho do papel inválido. Permitidos: ${PAPEIS_VALIDOS.join(', ')}.`;
    }
  }

  const errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    return {
      ok: false,
      error: errors[errorKeys[0]],
      errors,
    };
  }

  return { ok: true };
}

function normalizarPrintJob(input = {}) {
  const tipo = String(input.tipo ?? '').trim().toLowerCase();
  const rawRef = input.referenciaId ?? input.referencia_id;
  const parsedRef = Number(rawRef);
  const referenciaId = Number.isInteger(parsedRef) && parsedRef > 0 ? parsedRef : null;

  const documentoNome = String(input.documentoNome ?? input.documento_nome ?? '').trim();
  const html = String(input.html ?? '');

  const rawCopias = Number(input.copias ?? 1);
  const copias = rawCopias === 2 ? 2 : 1;

  const rawPapel = String(input.papel ?? 'A5').trim().toUpperCase();
  const papel = rawPapel === 'A4' ? 'A4' : 'A5';

  const rawStatus = String(input.status ?? 'pendente').trim().toLowerCase();
  const status = rawStatus || 'pendente';

  return {
    tipo,
    referenciaId,
    referencia_id: referenciaId,
    documentoNome,
    documento_nome: documentoNome,
    html,
    copias,
    papel,
    status,
  };
}

function isAgenteOnline(config = {}, now = new Date()) {
  const agentMode = Number(config.agent_mode ?? config.agentMode ?? 0);
  if (agentMode !== 1) return false;

  const rawLastSeen = config.agent_last_seen ?? config.agentLastSeen;
  if (!rawLastSeen) return false;

  const lastSeenDate = parseDate(rawLastSeen);
  const nowDate = parseDate(now) || new Date();

  if (!lastSeenDate || isNaN(lastSeenDate.getTime()) || isNaN(nowDate.getTime())) {
    return false;
  }

  const diffMs = nowDate.getTime() - lastSeenDate.getTime();
  return diffMs >= -1000 && diffMs <= HEARTBEAT_TIMEOUT_MS;
}

function avaliarLeaseTimeout(job, now = new Date()) {
  if (!job || typeof job !== 'object') return null;

  const status = String(job.status ?? '').trim().toLowerCase();
  if (status !== 'processando') return null;

  const rawUpdatedAt = job.updatedat ?? job.updated_at;
  const updatedDate = parseDate(rawUpdatedAt);
  const nowDate = parseDate(now) || new Date();

  if (!updatedDate || isNaN(updatedDate.getTime()) || isNaN(nowDate.getTime())) {
    return null;
  }

  const diffMs = nowDate.getTime() - updatedDate.getTime();
  if (diffMs <= LEASE_TIMEOUT_MS) return null;

  const tentativas = Math.max(0, Number(job.tentativas ?? 0));
  if (tentativas < MAX_TENTATIVAS_LEASE) {
    return {
      status: 'pendente',
      retry: true,
    };
  }

  return {
    status: 'falha',
    retry: false,
    erro: 'Timeout de execução',
  };
}

module.exports = {
  TIPOS_VALIDOS,
  PAPEIS_VALIDOS,
  HEARTBEAT_TIMEOUT_MS,
  LEASE_TIMEOUT_MS,
  MAX_TENTATIVAS_LEASE,
  validarPrintJobPayload,
  normalizarPrintJob,
  isAgenteOnline,
  avaliarLeaseTimeout,
};
