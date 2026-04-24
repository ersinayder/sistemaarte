const STATUSES_VALIDOS = ['Aguardando', 'Em Produção', 'Pronto', 'Entregue', 'Cancelado'];

const TRANSICOES_VALIDAS = {
  'Aguardando':  ['Em Produção', 'Cancelado'],
  'Em Produção': ['Pronto', 'Aguardando', 'Cancelado'],
  'Pronto':      ['Entregue', 'Em Produção', 'Cancelado'],
  'Entregue':    [],
  'Cancelado':   [],
};

function validarEntradaOS(total, entrada) {
  const t = Number(total);
  const e = Number(entrada ?? 0);
  if (!Number.isFinite(t) || t <= 0)
    return 'Valor total deve ser maior que zero.';
  if (!Number.isFinite(e) || e < 0)
    return 'Valor de entrada invalido.';
  if (e > t)
    return 'A entrada nao pode ser maior que o valor total.';
  return null;
}

function validarStatus(statusNovo, statusAtual = null) {
  if (!STATUSES_VALIDOS.includes(statusNovo))
    return `Status invalido. Permitidos: ${STATUSES_VALIDOS.join(', ')}`;
  if (statusAtual && TRANSICOES_VALIDAS[statusAtual] !== undefined) {
    if (!TRANSICOES_VALIDAS[statusAtual].includes(statusNovo))
      return `Transicao invalida: ${statusAtual} → ${statusNovo}`;
  }
  return null;
}

function validarPrazo(prazo) {
  if (!prazo) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo))
    return 'Prazo deve estar no formato YYYY-MM-DD.';
  return null;
}

function descricaoEntradaOS(numero, cliente, servico, total, entrada) {
  const sufixo = `${numero} – ${cliente}${servico ? ' / ' + servico : ''}`;
  const e = Number(entrada ?? 0);
  const t = Number(total ?? 0);
  const label = e <= 0 ? 'Sem entrada' : e >= t ? 'Total' : 'Entrada';
  return `${label} ${sufixo}`;
}

function descricaoRestanteOS(numero, cliente, servico) {
  return `Restante ${numero} – ${cliente}${servico ? ' / ' + servico : ''}`;
}

module.exports = { validarEntradaOS, validarStatus, validarPrazo, descricaoEntradaOS, descricaoRestanteOS, STATUSES_VALIDOS };
