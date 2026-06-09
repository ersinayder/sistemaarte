const TIPOS_AVISO = ['confirmacao_pedido', 'pedido_pronto'];
const STATUS_AVISO = ['pendente', 'aberto', 'enviado', 'ignorado'];
const STATUS_FINAIS = ['enviado', 'ignorado'];

const TRANSICOES_AVISO = {
  pendente: ['aberto', 'enviado', 'ignorado'],
  aberto: ['enviado', 'ignorado'],
  enviado: [],
  ignorado: [],
};

const STATUS_CONFIRMACAO = ['Aguardando', 'Em Produ\u00e7\u00e3o', 'Pronto'];

const DEFAULT_TEMPLATE_CONFIRMACAO = [
  'Arte e Molduras - Confirmacao de Pedido',
  '',
  'Ola, {cliente}! Seu pedido foi registrado com sucesso.',
  'Servico: {servico}',
  'OS: {numero_os}',
  'Valor Total: {valor_total}',
  'Entrada paga: {entrada_paga}',
  'Saldo restante na retirada: {saldo}',
  '',
  'Entraremos em contato quando seu pedido estiver pronto.',
  'Arte e Molduras',
].join('\n');

const DEFAULT_TEMPLATE_PRONTO = [
  'Arte e Molduras - Pedido Pronto!',
  '',
  'Ola, {cliente}! Seu pedido esta pronto para retirada.',
  '',
  'Servico: {servico}',
  'OS: {numero_os}',
  'Saldo na retirada: {saldo}',
  '',
  'Estamos aguardando voce!',
  'Arte e Molduras',
].join('\n');

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizarTipoAviso(value) {
  const tipo = clean(value, 40).toLowerCase();
  return TIPOS_AVISO.includes(tipo) ? tipo : null;
}

function normalizarStatusAviso(value) {
  const status = clean(value, 40).toLowerCase();
  return STATUS_AVISO.includes(status) ? status : null;
}

function normalizarTelefoneWhatsapp(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length <= 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 14) return null;
  return digits;
}

function fmtVal(value) {
  return Number(value || 0)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\u00a0/g, ' ');
}

function podeUsarAviso(role, tipo) {
  const normalized = normalizarTipoAviso(tipo);
  if (!normalized) return false;
  if (role === 'admin' || role === 'caixa') return true;
  return false;
}

function avisoDisponivelParaOrdem(ordem = {}, tipo, role) {
  const normalized = normalizarTipoAviso(tipo);
  if (!normalized) return { ok: false, error: 'invalid_notice_type' };
  if (!podeUsarAviso(role, normalized)) return { ok: false, error: 'forbidden_notice_type' };
  if (!ordem || ordem.deletedat) return { ok: false, error: 'order_not_found' };

  if (normalized === 'confirmacao_pedido') {
    if (STATUS_CONFIRMACAO.includes(ordem.status)) return { ok: true };
    return { ok: false, error: 'notice_not_available_for_status' };
  }

  if (normalized === 'pedido_pronto') {
    if (ordem.status === 'Pronto') return { ok: true };
    return { ok: false, error: 'notice_not_available_for_status' };
  }

  return { ok: false, error: 'invalid_notice_type' };
}

function getSaldo(ordem = {}) {
  const total = Number(ordem.valortotal ?? ordem.valor ?? 0);
  const entrada = Number(ordem.valorentrada ?? ordem.entrada ?? 0);
  const saldo = Number(ordem.saldoaberto ?? ordem.valorrestante ?? (total - entrada));
  return Math.max(0, saldo);
}

function montarVariaveisOrdem(ordem = {}) {
  const nome = clean(ordem.clientenome, 120) || 'cliente';
  const numero = clean(ordem.numero, 40) || 'OS';
  const servico = clean(ordem.servico || ordem.tipo, 160) || 'servico';
  const total = Number(ordem.valortotal ?? ordem.valor ?? 0);
  const entrada = Number(ordem.valorentrada ?? ordem.entrada ?? 0);
  const saldo = getSaldo(ordem);
  return {
    cliente: nome,
    servico,
    numero_os: numero,
    numero,
    os: numero,
    valor_total: fmtVal(total),
    valor: fmtVal(total),
    entrada_paga: fmtVal(entrada),
    entrada: fmtVal(entrada),
    saldo: fmtVal(saldo),
  };
}

function renderTemplateMensagem(template, variaveis) {
  return clean(template, 4000).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variaveis, key)) return variaveis[key];
    return match;
  });
}

function escolherTemplate(tipo, templates = {}) {
  if (tipo === 'confirmacao_pedido') {
    return clean(
      templates.confirmacaoPedido ?? templates.mensagemConfirmacao ?? templates.confirmacao,
      4000
    ) || DEFAULT_TEMPLATE_CONFIRMACAO;
  }
  return clean(
    templates.pedidoPronto ?? templates.mensagemPronto ?? templates.pronto,
    4000
  ) || DEFAULT_TEMPLATE_PRONTO;
}

function montarMensagemAviso(ordem = {}, tipo, { role = null, templates = {} } = {}) {
  const normalized = normalizarTipoAviso(tipo);
  const disponibilidade = avisoDisponivelParaOrdem(ordem, normalized, role);
  if (!disponibilidade.ok) return disponibilidade;

  return {
    ok: true,
    text: renderTemplateMensagem(escolherTemplate(normalized, templates), montarVariaveisOrdem(ordem)),
  };
}

function validarTransicaoAviso(atual, proximo) {
  const statusAtual = normalizarStatusAviso(atual || 'pendente');
  const statusNovo = normalizarStatusAviso(proximo);
  if (!statusAtual || !statusNovo) return { ok: false, error: 'invalid_notice_status' };
  if (statusAtual === statusNovo) return { ok: true };
  if ((TRANSICOES_AVISO[statusAtual] || []).includes(statusNovo)) return { ok: true };
  return { ok: false, error: 'invalid_notice_transition' };
}

function avisoFinalizado(status) {
  return STATUS_FINAIS.includes(normalizarStatusAviso(status));
}

module.exports = {
  TIPOS_AVISO,
  STATUS_AVISO,
  normalizarTipoAviso,
  normalizarStatusAviso,
  normalizarTelefoneWhatsapp,
  podeUsarAviso,
  avisoDisponivelParaOrdem,
  montarMensagemAviso,
  montarVariaveisOrdem,
  renderTemplateMensagem,
  DEFAULT_TEMPLATE_CONFIRMACAO,
  DEFAULT_TEMPLATE_PRONTO,
  validarTransicaoAviso,
  avisoFinalizado,
};
