'use strict';

const DIGITS = /\D/g;
const MAX_NFE_NUMBER = 999999999;
const MAX_AUTXML_ATIVOS = 10;

function cleanText(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function onlyDigits(value, max = 32) {
  return cleanText(value).replace(DIGITS, '').slice(0, max);
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }
  return Number(value);
}

function documentoValido(documento) {
  return documento.length === 11 || documento.length === 14;
}

function normalizarFiscalConfig(input = {}) {
  const ambienteRaw = input.ambiente === undefined || input.ambiente === null || String(input.ambiente).trim() === ''
    ? 2
    : input.ambiente;
  const serie = cleanText(input.serie || '1', 20);
  const proximoNumero = normalizeOptionalNumber(input.proximoNumero);

  const out = {
    ambiente: Number(ambienteRaw),
    serie,
  };

  if (proximoNumero !== undefined) out.proximoNumero = proximoNumero;

  return out;
}

function validarFiscalConfig(config = {}) {
  const errors = {};

  if (![1, 2].includes(config.ambiente)) {
    errors.ambiente = 'Ambiente deve ser 1 ou 2';
  }

  if (!/^\d{1,3}$/.test(String(config.serie || ''))) {
    errors.serie = 'Serie deve conter de 1 a 3 digitos';
  }

  if (config.proximoNumero !== undefined) {
    if (!Number.isInteger(config.proximoNumero) || config.proximoNumero < 1 || config.proximoNumero > MAX_NFE_NUMBER) {
      errors.proximoNumero = 'Proximo numero deve ser inteiro entre 1 e 999999999';
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function statusFiscalConfig(config = {}, contexto = {}) {
  const missing = [];
  const certificadoConfigurado = Boolean(contexto.certificadoConfigurado ?? config.certificadoConfigurado);

  if (![1, 2].includes(config.ambiente)) missing.push('ambiente');
  if (!/^\d{1,3}$/.test(String(config.serie || ''))) missing.push('serie');
  if (!Number.isInteger(config.proximoNumero) || config.proximoNumero < 1 || config.proximoNumero > MAX_NFE_NUMBER) {
    missing.push('proximoNumero');
  }
  if (!certificadoConfigurado) missing.push('certificadoConfigurado');

  return {
    status: missing.length === 0 ? 'OK' : 'Pendente',
    missing,
  };
}

function normalizarAutXml(input = {}) {
  const ativoRaw = input.ativo;
  const ativo = ativoRaw === undefined || ativoRaw === null || ativoRaw === ''
    ? 1
    : (ativoRaw === true || ativoRaw === 1 || ativoRaw === '1' ? 1 : 0);

  return {
    nome: cleanText(input.nome, 200),
    documento: onlyDigits(input.documento, 14),
    tipo: cleanText(input.tipo || 'contador', 50) || 'contador',
    ativo,
  };
}

function validarAutXml(item = {}, contexto = {}) {
  const errors = {};
  const documento = onlyDigits(item.documento, 14);
  const emitenteDocumento = onlyDigits(contexto.emitenteDocumento, 14);
  const ativo = Number(item.ativo) === 1;
  const currentAtivo = Boolean(contexto.currentAtivo);
  const ativosCount = Number(contexto.ativosCount || 0);

  if (!cleanText(item.nome)) errors.nome = 'Nome e obrigatorio';
  if (!documentoValido(documento)) {
    errors.documento = 'Documento deve ser CPF com 11 digitos ou CNPJ com 14 digitos';
  } else if (emitenteDocumento && documento === emitenteDocumento) {
    errors.documento = 'AutXML nao pode ser igual ao documento do emitente';
  }

  if (ativo && !currentAtivo && !contexto.ignoreLimit && ativosCount >= MAX_AUTXML_ATIVOS) {
    errors.ativo = 'Limite de 10 autorizados XML ativos atingido';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function formatarAutXmlParaNFe(items = [], destinatarioDocumento) {
  const destinatario = onlyDigits(destinatarioDocumento, 14);
  const out = [];

  for (const item of items || []) {
    if (out.length >= MAX_AUTXML_ATIVOS) break;
    if (Number(item?.ativo) !== 1) continue;

    const documento = onlyDigits(item.documento, 14);
    if (!documentoValido(documento)) continue;
    if (destinatario && documento === destinatario) continue;

    out.push(documento.length === 11 ? { CPF: documento } : { CNPJ: documento });
  }

  return out;
}

module.exports = {
  normalizarFiscalConfig,
  validarFiscalConfig,
  statusFiscalConfig,
  normalizarAutXml,
  validarAutXml,
  formatarAutXmlParaNFe,
};
