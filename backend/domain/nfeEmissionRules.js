'use strict';

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function moeda(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizarItemFiscalOverride(raw = {}) {
  const id = raw.id ?? raw.item_id ?? raw.ordem_item_id;
  const produtoId = raw.produto_id ?? raw.produtoId;
  const override = {};

  if (id !== undefined && id !== null && id !== '') override.id = Number(id);
  if (produtoId !== undefined && produtoId !== null && produtoId !== '') override.produto_id = Number(produtoId);

  if (Object.prototype.hasOwnProperty.call(raw, 'ncm')) {
    const ncm = onlyDigits(raw.ncm);
    if (ncm.length !== 8) return { ok: false, erro: 'NCM deve ter 8 digitos.' };
    override.ncm = ncm;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'cfop')) {
    const cfop = onlyDigits(raw.cfop);
    if (cfop.length !== 4) return { ok: false, erro: 'CFOP deve ter 4 digitos.' };
    override.cfop = cfop;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'csosn')) {
    const csosn = onlyDigits(raw.csosn);
    if (csosn.length !== 3) return { ok: false, erro: 'CSOSN deve ter 3 digitos.' };
    override.csosn = csosn;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'origem_fiscal')) {
    const origem = onlyDigits(raw.origem_fiscal);
    if (!/^[0-8]$/.test(origem)) return { ok: false, erro: 'Origem fiscal deve ser um digito de 0 a 8.' };
    override.origem_fiscal = origem;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'unidade')) {
    const unidade = String(raw.unidade || '').trim().toUpperCase().slice(0, 6);
    if (!unidade) return { ok: false, erro: 'Unidade fiscal e obrigatoria.' };
    override.unidade = unidade;
  }

  if (!override.id && !override.produto_id) {
    return { ok: false, erro: 'Item fiscal sem identificador.' };
  }

  return { ok: true, item: override };
}

function itemMatchesOverride(item, override) {
  if (override.id && Number(item.id) === Number(override.id)) return true;
  if (override.produto_id && Number(item.produto_id) === Number(override.produto_id)) return true;
  return false;
}

function aplicarOverridesItensNFe(itens, overrides = []) {
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return { ok: true, itens: itens.map(item => ({ ...item })) };
  }

  const normalizados = [];
  for (const raw of overrides) {
    const resultado = normalizarItemFiscalOverride(raw);
    if (!resultado.ok) return resultado;
    normalizados.push(resultado.item);
  }

  return {
    ok: true,
    itens: itens.map(item => {
      const override = normalizados.find(entry => itemMatchesOverride(item, entry));
      if (!override) return { ...item };
      const { id, produto_id, ...camposFiscais } = override;
      return { ...item, ...camposFiscais };
    }),
  };
}

function valorFiscal(item, field, fallback) {
  const value = item?.[field];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function serializarItemPreviaNFe(item) {
  const quantidade = Number(item.quantidade) || 1;
  const precoUnitario = Number(item.preco_unitario) || 0;

  return {
    id: item.id,
    produto_id: item.produto_id,
    nome: item.nome || item.produto_nome || 'PRODUTO',
    quantidade,
    preco_unitario: precoUnitario,
    subtotal: moeda(quantidade * precoUnitario),
    ncm: onlyDigits(valorFiscal(item, 'ncm', '49119900')).padStart(8, '0').slice(-8),
    cfop: onlyDigits(valorFiscal(item, 'cfop', '5102')).slice(0, 4) || '5102',
    csosn: onlyDigits(valorFiscal(item, 'csosn', '400')).padStart(3, '0').slice(-3),
    origem_fiscal: onlyDigits(valorFiscal(item, 'origem_fiscal', '0')).slice(0, 1) || '0',
    unidade: valorFiscal(item, 'unidade', 'UN').trim().toUpperCase().slice(0, 6) || 'UN',
  };
}

module.exports = {
  aplicarOverridesItensNFe,
  normalizarItemFiscalOverride,
  serializarItemPreviaNFe,
};
