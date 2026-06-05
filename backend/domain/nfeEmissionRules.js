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

function normalizarTexto(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function hasOwn(obj, field) {
  return Object.prototype.hasOwnProperty.call(obj, field);
}

function normalizarClienteOverride(raw = {}) {
  const override = {};
  const nome = raw.nome ?? raw.name ?? raw.clientenome;
  const documento = raw.documento ?? raw.cpf ?? raw.clientecpf;

  if (nome !== undefined) {
    const name = normalizarTexto(nome, 200);
    if (!name) return { ok: false, erro: 'Nome do cliente e obrigatorio.' };
    override.clientenome = name;
  }

  if (documento !== undefined) {
    const cpf = onlyDigits(documento);
    if (cpf && cpf.length !== 11 && cpf.length !== 14) {
      return { ok: false, erro: 'CPF/CNPJ do cliente deve ter 11 ou 14 digitos.' };
    }
    override.cpf = cpf;
  }

  if (hasOwn(raw, 'ie')) override.ie = normalizarTexto(raw.ie, 30);
  if (hasOwn(raw, 'logradouro')) override.logradouro = normalizarTexto(raw.logradouro, 200);
  if (hasOwn(raw, 'numero')) override.c_numero = normalizarTexto(raw.numero, 20);
  if (hasOwn(raw, 'c_numero')) override.c_numero = normalizarTexto(raw.c_numero, 20);
  if (hasOwn(raw, 'bairro')) override.bairro = normalizarTexto(raw.bairro, 80);
  if (hasOwn(raw, 'cidade')) override.cidade = normalizarTexto(raw.cidade, 80);

  if (hasOwn(raw, 'uf')) {
    const uf = normalizarTexto(raw.uf, 2).toUpperCase();
    if (uf && !/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: 'UF do cliente deve ter 2 letras.' };
    override.uf = uf;
  }

  if (hasOwn(raw, 'cep')) {
    const cep = onlyDigits(raw.cep);
    if (cep && cep.length !== 8) return { ok: false, erro: 'CEP do cliente deve ter 8 digitos.' };
    override.cep = cep;
  }

  return { ok: true, cliente: override };
}

function aplicarOverrideClienteNFe(os, raw) {
  if (!raw || typeof raw !== 'object') return { ok: true, cliente: { ...os } };

  const resultado = normalizarClienteOverride(raw);
  if (!resultado.ok) return resultado;

  return {
    ok: true,
    cliente: {
      ...os,
      ...resultado.cliente,
    },
  };
}

function primeiroErroEnderecoCliente(cliente = {}) {
  const enderecoCampos = [
    cliente.logradouro,
    cliente.c_numero ?? cliente.numero,
    cliente.bairro,
    cliente.cidade,
    cliente.uf,
    cliente.cep,
  ];
  const temEndereco = enderecoCampos.some(value => String(value ?? '').trim());
  if (!temEndereco) return null;

  if (!String(cliente.logradouro || '').trim()) return 'Logradouro do cliente e obrigatorio quando o endereco fiscal e informado.';
  if (!String(cliente.c_numero ?? cliente.numero ?? '').trim()) return 'Numero do endereco do cliente e obrigatorio quando o endereco fiscal e informado.';
  if (!String(cliente.bairro || '').trim()) return 'Bairro do cliente e obrigatorio quando o endereco fiscal e informado.';
  if (!String(cliente.cidade || '').trim()) return 'Cidade do cliente e obrigatoria quando o endereco fiscal e informado.';
  if (!/^[A-Z]{2}$/.test(String(cliente.uf || '').trim().toUpperCase())) return 'UF do cliente deve ter 2 letras.';

  const cep = onlyDigits(cliente.cep);
  if (!cep) return 'CEP do cliente e obrigatorio quando o endereco fiscal e informado.';
  if (cep.length !== 8) return 'CEP do cliente deve ter 8 digitos.';

  return null;
}

function validarClienteFiscalNFe(cliente = {}) {
  const documento = onlyDigits(cliente.cpf);
  if (documento && documento.length !== 11 && documento.length !== 14) {
    return { ok: false, erro: 'CPF/CNPJ do cliente deve ter 11 ou 14 digitos.' };
  }

  const erroEndereco = primeiroErroEnderecoCliente(cliente);
  if (erroEndereco) return { ok: false, erro: erroEndereco };

  return { ok: true };
}

function validarEmitenteFiscalNFe(emitente = {}) {
  const end = emitente.enderEmit || {};
  const cep = onlyDigits(end.CEP);
  if (cep.length !== 8) {
    return { ok: false, erro: 'CEP do emitente deve ter 8 digitos. Revise Configuracoes > Empresa.' };
  }
  if (!String(end.xLgr || '').trim()) return { ok: false, erro: 'Logradouro do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!String(end.nro || '').trim()) return { ok: false, erro: 'Numero do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!String(end.xBairro || '').trim()) return { ok: false, erro: 'Bairro do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!String(end.cMun || '').trim()) return { ok: false, erro: 'Codigo do municipio do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!String(end.xMun || '').trim()) return { ok: false, erro: 'Municipio do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!/^[A-Z]{2}$/.test(String(end.UF || '').trim().toUpperCase())) {
    return { ok: false, erro: 'UF do emitente deve ter 2 letras. Revise Configuracoes > Empresa.' };
  }

  return { ok: true };
}

module.exports = {
  aplicarOverridesItensNFe,
  aplicarOverrideClienteNFe,
  normalizarItemFiscalOverride,
  normalizarClienteOverride,
  validarClienteFiscalNFe,
  validarEmitenteFiscalNFe,
  serializarItemPreviaNFe,
};
