'use strict';

const path = require('path');
const { getDB } = require('../database');
const { statusFiscalConfig, formatarAutXmlParaNFe } = require('../domain/fiscalConfigRules');
const { decryptSecret } = require('./secrets');

const COD_MUNICIPIO_IPATINGA = '3131307';
const COD_MUNICIPIO_IPATINGA_ANTIGO = '3127701';

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function onlyDigits(value) {
  return cleanText(value).replace(/\D/g, '');
}

function validTpAmb(value) {
  const n = Number(value);
  return n === 1 || n === 2 ? n : null;
}

function fiscalConfigurado(fiscal) {
  return Number(fiscal?.configurado || 0) === 1;
}

function warnSQL(label, err) {
  const msg = err?.message || String(err);
  if (/no such table/i.test(msg)) return;
  console.warn(`[NF-e config] ${label}: ${msg}`);
}

function dbAtual() {
  try {
    return getDB?.() || null;
  } catch (_) {
    return null;
  }
}

function getOneSafe(sql, params = [], label = 'consulta') {
  const db = dbAtual();
  if (!db) return null;

  try {
    return db.prepare(sql).get(...params) || null;
  } catch (err) {
    warnSQL(label, err);
    return null;
  }
}

function getAllSafe(sql, params = [], label = 'consulta') {
  const db = dbAtual();
  if (!db) return [];

  try {
    return db.prepare(sql).all(...params);
  } catch (err) {
    warnSQL(label, err);
    return [];
  }
}

function fiscalRow() {
  return getOneSafe(
    `SELECT ambiente, serie, configurado, certificado_path, certificado_nome,
            certificado_senha, certificado_updatedat, updatedat
       FROM fiscal_config
      WHERE id = 1`,
    [],
    'fiscal_config'
  );
}

function empresaRow() {
  return getOneSafe(
    `SELECT razaosocial, nomefantasia, cnpj, inscricaoestadual, crt,
            telefone, email, logradouro, numero, bairro, municipio,
            codigomunicipio, uf, cep, updatedat
       FROM empresa_config
      WHERE id = 1`,
    [],
    'empresa_config'
  );
}

function tpAmbAtual() {
  return resolverAmbiente().ambiente;
}

function ambienteEnvAtual() {
  const envAmbienteNum = validTpAmb(process.env.NFE_AMBIENTE_NUM);
  if (envAmbienteNum) return envAmbienteNum;

  if (process.env.NFE_AMBIENTE === 'producao') return 1;
  if (process.env.NFE_AMBIENTE === 'homologacao') return 2;

  return null;
}

function resolverAmbiente(fiscal = fiscalRow()) {
  const dbAmbiente = validTpAmb(fiscal?.ambiente);
  if (fiscalConfigurado(fiscal) && dbAmbiente) {
    return { ambiente: dbAmbiente, origem: 'banco' };
  }

  const envAmbiente = ambienteEnvAtual();
  if (envAmbiente) return { ambiente: envAmbiente, origem: 'env' };

  return { ambiente: 2, origem: 'padrao' };
}

function getSerieNFe() {
  const fiscal = fiscalRow();
  return cleanText(fiscal?.serie, '1');
}

function getProximoNumero(serie) {
  const row = getOneSafe(
    'SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?',
    [serie],
    'nfe_sequencias'
  );
  const ultimo = Number(row?.ultimo_numero);
  return Number.isInteger(ultimo) && ultimo >= 0 ? ultimo + 1 : 1;
}

function getCertificadoConfig() {
  const fiscal = fiscalRow();
  if (cleanText(fiscal?.certificado_path) && cleanText(fiscal?.certificado_senha)) {
    return {
      pathCertificado: path.resolve(fiscal.certificado_path),
      senhaCertificado: decryptSecret(fiscal.certificado_senha),
      nome: cleanText(fiscal.certificado_nome),
      updatedat: fiscal.certificado_updatedat || fiscal.updatedat || null,
      origem: 'banco',
    };
  }

  const envPath = cleanText(process.env.NFE_CERT_PATH);
  const envPass = cleanText(process.env.NFE_CERT_PASSWORD);
  if (envPath && envPass) {
    return {
      pathCertificado: path.resolve(envPath),
      senhaCertificado: envPass,
      nome: path.basename(envPath),
      updatedat: null,
      origem: 'env',
    };
  }

  return {
    pathCertificado: '',
    senhaCertificado: '',
    nome: '',
    updatedat: null,
    origem: 'nenhuma',
  };
}

function getFiscalConfig() {
  const fiscal = fiscalRow() || {};
  const ambienteResolvido = resolverAmbiente(fiscal);
  const ambiente = ambienteResolvido.ambiente;
  const serie = cleanText(fiscal.serie, '1');
  const proximoNumero = getProximoNumero(serie);
  const cert = getCertificadoConfig();
  const certificado = {
    configurado: Boolean(cert.pathCertificado && cert.senhaCertificado),
    nome: cert.nome || '',
    updatedat: cert.updatedat || null,
    origem: cert.origem,
  };
  const status = statusFiscalConfig(
    { ambiente, serie, proximoNumero },
    { certificadoConfigurado: certificado.configurado }
  );

  return {
    ambiente,
    ambienteOrigem: ambienteResolvido.origem,
    configurado: fiscalConfigurado(fiscal),
    serie,
    proximoNumero,
    certificado,
    status,
  };
}

function getCnpjEmitente() {
  const empresa = empresaRow();
  return onlyDigits(empresa?.cnpj || process.env.NFE_CNPJ_EMITENTE);
}

function getEmitenteConfig() {
  const empresa = empresaRow() || {};
  const municipio = cleanText(empresa.municipio || process.env.NFE_MUNICIPIO, 'IPATINGA');
  const municipioUpper = municipio.toUpperCase();
  const codigoMunicipioRaw = onlyDigits(empresa.codigomunicipio || process.env.NFE_COD_MUNICIPIO);
  const codigoMunicipio = municipioUpper === 'IPATINGA' &&
    (!codigoMunicipioRaw || codigoMunicipioRaw === COD_MUNICIPIO_IPATINGA_ANTIGO)
    ? COD_MUNICIPIO_IPATINGA
    : (codigoMunicipioRaw || COD_MUNICIPIO_IPATINGA);

  return {
    CNPJ: onlyDigits(empresa.cnpj || process.env.NFE_CNPJ_EMITENTE),
    xNome: cleanText(empresa.razaosocial || process.env.NFE_RAZAO_SOCIAL, 'EMITENTE').toUpperCase(),
    xFant: cleanText(empresa.nomefantasia || process.env.NFE_NOME_FANTASIA).toUpperCase(),
    enderEmit: {
      xLgr: cleanText(empresa.logradouro || process.env.NFE_LOGRADOURO),
      nro: cleanText(empresa.numero || process.env.NFE_NUMERO, 'S/N'),
      xBairro: cleanText(empresa.bairro || process.env.NFE_BAIRRO),
      cMun: codigoMunicipio,
      xMun: municipio,
      UF: cleanText(empresa.uf || process.env.NFE_UF, 'MG').toUpperCase(),
      CEP: onlyDigits(empresa.cep || process.env.NFE_CEP),
      fone: onlyDigits(empresa.telefone || process.env.NFE_FONE),
    },
    IE: onlyDigits(empresa.inscricaoestadual || process.env.NFE_IE_EMITENTE),
    CRT: cleanText(empresa.crt || process.env.NFE_CRT, '1'),
  };
}

function getAutXmlAtivos() {
  return getAllSafe(
    `SELECT id, nome, documento, tipo, ativo, createdat, updatedat
       FROM nfe_autxml
      WHERE ativo = 1
      ORDER BY id`,
    [],
    'nfe_autxml'
  );
}

function getAutXmlParaNFe(destinatarioDocumento) {
  return formatarAutXmlParaNFe(getAutXmlAtivos(), destinatarioDocumento);
}

module.exports = {
  tpAmbAtual,
  resolverAmbiente,
  getFiscalConfig,
  getCertificadoConfig,
  getEmitenteConfig,
  getAutXmlAtivos,
  getAutXmlParaNFe,
  getCnpjEmitente,
  getSerieNFe,
};
