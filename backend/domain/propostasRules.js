const STATUS_PROPOSTA_VALIDOS = [
  'Novo lead',
  'Orcamento enviado',
  'Negociacao',
  'Aprovado',
  'Perdido',
];

const ALIASES_STATUS_PROPOSTA = {
  'orçamento enviado': 'Orcamento enviado',
  'orcamento enviado': 'Orcamento enviado',
  'negociação': 'Negociacao',
  'negociacao': 'Negociacao',
  'novo lead': 'Novo lead',
  aprovado: 'Aprovado',
  perdida: 'Perdido',
  perdido: 'Perdido',
};

function normalizarStatusProposta(status) {
  const raw = String(status || '').trim();
  if (!raw) return raw;
  return ALIASES_STATUS_PROPOSTA[raw.toLowerCase()] || raw;
}

function validarStatusProposta(status) {
  const normalizado = normalizarStatusProposta(status);
  if (!STATUS_PROPOSTA_VALIDOS.includes(normalizado)) {
    return `Status de proposta invalido: ${status}`;
  }
  return null;
}

function podeGerarOS(proposta = {}) {
  if (proposta.ordemid) return { ok: false, error: 'Esta proposta ja gerou uma OS.' };
  if (normalizarStatusProposta(proposta.status) !== 'Aprovado') {
    return { ok: false, error: 'A proposta precisa estar aprovada para gerar OS.' };
  }
  return { ok: true };
}

module.exports = {
  STATUS_PROPOSTA_VALIDOS,
  normalizarStatusProposta,
  validarStatusProposta,
  podeGerarOS,
};
