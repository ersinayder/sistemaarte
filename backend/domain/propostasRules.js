const STATUS_PROPOSTA_VALIDOS = [
  'Novo lead',
  'Orcamento enviado',
  'Negociacao',
  'Aprovado',
  'Perdido',
];

const MAX_ITENS_PROPOSTA = 100;
const MAX_NOME_ITEM_PROPOSTA = 200;
const TOLERANCIA_TOTAL_PROPOSTA = 0.01;

const { validarPrazo } = require('./ordensRules');

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

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizarItemProposta(item = {}) {
  const nome = String(item.nome || item.name || '').trim();
  const quantidade = toFiniteNumber(item.quantidade ?? item.qty ?? 1);
  const preco_unitario = toFiniteNumber(item.preco_unitario ?? item.preco ?? item.valor ?? 0);
  const rawProdutoId = toFiniteNumber(item.produto_id ?? item.id);
  const produtoId = rawProdutoId && rawProdutoId > 0 ? rawProdutoId : null;

  return {
    produto_id: produtoId,
    nome,
    quantidade,
    preco_unitario,
    avulso: produtoId ? (item.avulso ? 1 : 0) : 1,
  };
}

function normalizarItensProposta(produtos = []) {
  if (!Array.isArray(produtos)) return [];
  return produtos.map(normalizarItemProposta);
}

function validarItensProposta(produtos = []) {
  if (!Array.isArray(produtos)) {
    return { ok: false, error: 'Itens da proposta invalidos.' };
  }
  if (produtos.length === 0) {
    return { ok: false, error: 'Informe ao menos um item' };
  }
  if (produtos.length > MAX_ITENS_PROPOSTA) {
    return { ok: false, error: `Informe no maximo ${MAX_ITENS_PROPOSTA} itens na proposta.` };
  }

  for (let i = 0; i < produtos.length; i += 1) {
    const item = normalizarItemProposta(produtos[i]);
    const label = `Item ${i + 1}`;
    if (!item.nome) return { ok: false, error: `${label}: informe o nome do item.` };
    if (item.nome.length > MAX_NOME_ITEM_PROPOSTA) {
      return { ok: false, error: `${label}: nome deve ter no maximo ${MAX_NOME_ITEM_PROPOSTA} caracteres.` };
    }
    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
      return { ok: false, error: `${label}: Quantidade deve ser maior que zero.` };
    }
    if (!Number.isFinite(item.preco_unitario) || item.preco_unitario < 0) {
      return { ok: false, error: `${label}: preco unitario invalido.` };
    }
  }

  return { ok: true, itens: normalizarItensProposta(produtos) };
}

function calcularTotalItensProposta(produtos = []) {
  return roundMoney(normalizarItensProposta(produtos)
    .reduce((acc, p) => acc + p.quantidade * p.preco_unitario, 0));
}

function validarDadosProposta(body = {}) {
  const clientenome = String(body.clientenome || '').trim();
  if (!clientenome) return { ok: false, error: 'Cliente obrigatorio' };

  const status = normalizarStatusProposta(body.status || 'Novo lead');
  const erroStatus = validarStatusProposta(status);
  if (erroStatus) return { ok: false, error: erroStatus };

  const erroPrazo = validarPrazo(body.prazoentrega || null);
  if (erroPrazo) return { ok: false, error: erroPrazo };

  const itensResult = validarItensProposta(body.produtos);
  if (!itensResult.ok) return itensResult;

  const valortotal = calcularTotalItensProposta(itensResult.itens);
  if (body.valortotal !== undefined && body.valortotal !== null && body.valortotal !== '') {
    const totalInformado = toFiniteNumber(body.valortotal);
    if (totalInformado === null) return { ok: false, error: 'Total da proposta invalido.' };
    if (Math.abs(roundMoney(totalInformado) - valortotal) > TOLERANCIA_TOTAL_PROPOSTA) {
      return { ok: false, error: 'Total da proposta diverge do total dos itens.' };
    }
  }

  return {
    ok: true,
    clientenome,
    status,
    prazoentrega: body.prazoentrega || null,
    itens: itensResult.itens,
    valortotal,
  };
}

module.exports = {
  STATUS_PROPOSTA_VALIDOS,
  MAX_ITENS_PROPOSTA,
  MAX_NOME_ITEM_PROPOSTA,
  normalizarStatusProposta,
  validarStatusProposta,
  podeGerarOS,
  normalizarItensProposta,
  calcularTotalItensProposta,
  validarDadosProposta,
};
