'use strict';

const libxml = require('libxmljs2');

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
    if (!CSOSN_VALIDOS_NFE.has(csosn)) {
      return { ok: false, erro: 'CSOSN invalido. Use 101, 102, 103, 300, 400, 500 ou 900.' };
    }
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
    ncm: onlyDigits(valorFiscal(item, 'ncm', '44151000')).padStart(8, '0').slice(-8),
    cfop: onlyDigits(valorFiscal(item, 'cfop', '5101')).slice(0, 4) || '5101',
    csosn: onlyDigits(valorFiscal(item, 'csosn', '102')).padStart(3, '0').slice(-3),
    origem_fiscal: onlyDigits(valorFiscal(item, 'origem_fiscal', '0')).slice(0, 1) || '0',
    unidade: valorFiscal(item, 'unidade', 'UN').trim().toUpperCase().slice(0, 6) || 'UN',
  };
}

function normalizarTexto(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

const CSOSN_VALIDOS_NFE = new Set(['101', '102', '103', '300', '400', '500', '900']);
const CSTAT_AUTORIZADO = '100';
const CSTATS_REJEICAO_CONHECIDA = new Set([
  '204',
  '205',
  '206',
  '207',
  '208',
  '209',
  '210',
  '215',
  '217',
  '218',
  '220',
  '225',
  '226',
  '232',
  '233',
  '234',
  '237',
  '245',
  '302',
  '303',
  '327',
  '328',
  '386',
  '387',
  '388',
  '471',
  '531',
  '532',
  '533',
  '539',
  '564',
  '573',
  '591',
  '602',
  '603',
  '610',
  '703',
  '704',
  '725',
  '777',
  '778',
  '806',
]);
const CSTATS_REJEICAO_DEVOLVE_NUMERO = new Set([
  '386',
]);
const ESTADOS_EMISSAO_BLOQUEANTES = new Set(['processando', 'incerto']);

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

function montarMensagemCamposFaltandoCliente(campos) {
  if (!campos.length) return '';
  if (campos.length === 1) return `Preencha os dados fiscais do cliente: ${campos[0]}.`;
  return `Preencha os dados fiscais do cliente: ${campos.slice(0, -1).join(', ')} e ${campos[campos.length - 1]}.`;
}

function validarClienteFiscalNFe(cliente = {}) {
  const nome = normalizarTexto(cliente.clientenome ?? cliente.name, 200);
  const documento = onlyDigits(cliente.cpf);
  const cep = onlyDigits(cliente.cep);
  const uf = normalizarTexto(cliente.uf, 2).toUpperCase();
  const camposFaltando = [];

  if (!nome) camposFaltando.push('nome');
  if (!documento) camposFaltando.push('CPF/CNPJ');
  if (!String(cliente.logradouro || '').trim()) camposFaltando.push('logradouro');
  if (!String(cliente.c_numero ?? cliente.numero ?? '').trim()) camposFaltando.push('numero');
  if (!String(cliente.bairro || '').trim()) camposFaltando.push('bairro');
  if (!String(cliente.cidade || '').trim()) camposFaltando.push('cidade');
  if (!uf) camposFaltando.push('UF');
  if (!cep) camposFaltando.push('CEP');

  if (camposFaltando.length) {
    return { ok: false, erro: montarMensagemCamposFaltandoCliente(camposFaltando) };
  }

  if (documento && documento.length !== 11 && documento.length !== 14) {
    return { ok: false, erro: 'CPF/CNPJ do cliente deve ter 11 ou 14 digitos.' };
  }
  if (!/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: 'UF do cliente deve ter 2 letras.' };
  if (cep.length !== 8) return { ok: false, erro: 'CEP do cliente deve ter 8 digitos.' };

  return { ok: true };
}

function nomeItemFiscal(item, index) {
  return String(item?.nome || item?.produto_nome || `item ${index + 1}`).trim();
}

function validarItensFiscaisNFe(itens = []) {
  if (!Array.isArray(itens) || itens.length === 0) {
    return { ok: false, erro: 'NF-e precisa de pelo menos um item.' };
  }

  for (const [index, item] of itens.entries()) {
    const nome = nomeItemFiscal(item, index);
    const ncm = onlyDigits(item?.ncm);
    const cfop = onlyDigits(item?.cfop);
    const csosn = onlyDigits(item?.csosn);
    const origem = onlyDigits(item?.origem_fiscal);
    const unidade = normalizarTexto(item?.unidade, 6).toUpperCase();
    const quantidade = Number(item?.quantidade);
    const precoUnitario = Number(item?.preco_unitario);

    if (!nome) return { ok: false, erro: `Item ${index + 1}: nome do produto e obrigatorio.` };
    if (!(quantidade > 0)) return { ok: false, erro: `Item "${nome}": quantidade deve ser maior que zero.` };
    if (!(precoUnitario > 0)) return { ok: false, erro: `Item "${nome}": preco unitario deve ser maior que zero.` };
    if (ncm.length !== 8) return { ok: false, erro: `Item "${nome}": NCM deve ter 8 digitos.` };
    if (cfop.length !== 4) return { ok: false, erro: `Item "${nome}": CFOP deve ter 4 digitos.` };
    if (!CSOSN_VALIDOS_NFE.has(csosn)) {
      return { ok: false, erro: `Item "${nome}": CSOSN invalido. Use 101, 102, 103, 300, 400, 500 ou 900.` };
    }
    if (!/^[0-8]$/.test(origem)) return { ok: false, erro: `Item "${nome}": origem fiscal deve ser um digito de 0 a 8.` };
    if (!unidade) return { ok: false, erro: `Item "${nome}": unidade fiscal e obrigatoria.` };
  }

  return { ok: true };
}

function validarEmitenteFiscalNFe(emitente = {}) {
  const end = emitente.enderEmit || {};
  const cnpj = onlyDigits(emitente.CNPJ);
  const cep = onlyDigits(end.CEP);
  if (cnpj.length !== 14) return { ok: false, erro: 'CNPJ do emitente deve ter 14 digitos. Revise Configuracoes > Empresa.' };
  if (!String(emitente.xNome || '').trim()) return { ok: false, erro: 'Razao social do emitente e obrigatoria. Revise Configuracoes > Empresa.' };
  if (!String(emitente.IE || '').trim()) return { ok: false, erro: 'IE do emitente e obrigatoria. Revise Configuracoes > Empresa.' };
  if (!['1', '2', '3'].includes(String(emitente.CRT || '').trim())) {
    return { ok: false, erro: 'CRT do emitente deve ser 1, 2 ou 3. Revise Configuracoes > Empresa.' };
  }
  if (cep.length !== 8) {
    return { ok: false, erro: 'CEP do emitente deve ter 8 digitos. Revise Configuracoes > Empresa.' };
  }
  if (!String(end.xLgr || '').trim()) return { ok: false, erro: 'Logradouro do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!String(end.nro || '').trim()) return { ok: false, erro: 'Numero do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!String(end.xBairro || '').trim()) return { ok: false, erro: 'Bairro do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!/^\d{7}$/.test(String(end.cMun || '').trim())) return { ok: false, erro: 'Codigo do municipio do emitente deve ter 7 digitos. Revise Configuracoes > Empresa.' };
  if (!String(end.xMun || '').trim()) return { ok: false, erro: 'Municipio do emitente e obrigatorio. Revise Configuracoes > Empresa.' };
  if (!/^[A-Z]{2}$/.test(String(end.UF || '').trim().toUpperCase())) {
    return { ok: false, erro: 'UF do emitente deve ter 2 letras. Revise Configuracoes > Empresa.' };
  }

  return { ok: true };
}

function normalizarCStat(value) {
  return String(value ?? '').trim();
}

function classificarResultadoEmissao(resultado) {
  if (!resultado || resultado.timeout === true) return 'incerto';

  const cStat = normalizarCStat(resultado.cStat ?? resultado.cstat);
  if (cStat === CSTAT_AUTORIZADO) return 'autorizado';
  if (CSTATS_REJEICAO_CONHECIDA.has(cStat)) return 'rejeitado';
  return 'incerto';
}

function estadoEmissaoBloqueiaReenvio(status) {
  return ESTADOS_EMISSAO_BLOQUEANTES.has(String(status ?? '').trim().toLowerCase());
}

function rejeicaoPermiteDevolverNumero(cStat) {
  return CSTATS_REJEICAO_DEVOLVE_NUMERO.has(normalizarCStat(cStat));
}

function validarXmlAutorizacao(value, chaveEsperada) {
  if (typeof value !== 'string') return false;

  const xml = value.trim();
  const chave = String(chaveEsperada ?? '').trim();
  if (!xml.startsWith('<') || !/^\d{44}$/.test(chave)) return false;

  try {
    const doc = libxml.parseXml(xml, {
      nonet: true,
      recover: false,
    });
    const root = doc.root();
    if (!root || root.name() !== 'nfeProc') return false;

    const infNFeNodes = root.find('./*[local-name()="NFe"]/*[local-name()="infNFe"]');
    const chNFeNodes = root.find('./*[local-name()="protNFe"]/*[local-name()="infProt"]/*[local-name()="chNFe"]');
    const identificadores = [];

    for (const infNFe of infNFeNodes) {
      const idAttr = infNFe.attr('Id');
      if (idAttr) {
        const id = idAttr.value();
        identificadores.push(id.startsWith('NFe') ? id.slice(3) : id);
      }
    }

    for (const chNFe of chNFeNodes) {
      identificadores.push(chNFe.text().trim());
    }

    return identificadores.length > 0
      && identificadores.every(identificador => identificador === chave);
  } catch (_) {
    return false;
  }
}

module.exports = {
  aplicarOverridesItensNFe,
  aplicarOverrideClienteNFe,
  classificarResultadoEmissao,
  estadoEmissaoBloqueiaReenvio,
  normalizarItemFiscalOverride,
  normalizarClienteOverride,
  rejeicaoPermiteDevolverNumero,
  validarClienteFiscalNFe,
  validarEmitenteFiscalNFe,
  validarItensFiscaisNFe,
  validarXmlAutorizacao,
  serializarItemPreviaNFe,
};
