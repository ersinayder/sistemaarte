'use strict';

/**
 * utils/nfe.js
 * Singleton do NFEWizard para nfewizard-io v1.0.4.
 *
 * Estrutura de config descoberta lendo @nfewizard/shared/dist/index.cjs:
 *   config.dfe.pathCertificado, config.dfe.senhaCertificado, config.dfe.UF
 *   config.nfe.ambiente  (1=producao, 2=homologacao)
 *   config.nfe.versaoDF  ('4.00')
 *   config.lib.useOpenSSL = false  (usa node-forge, sem openssl do sistema)
 *   config.lib.connection.timeout
 */

const fs   = require('fs');
const path = require('path');
const { getCertificadoConfig, tpAmbAtual } = require('./nfeConfig');

let _wizard = null;

const SEFAZ_TIMEOUT_MS = 60_000;
const SEFAZ_RETRY_MESSAGE =
  'SEFAZ demorou demais ou encerrou a conexao. Aguarde alguns instantes, atualize a tela e tente reemitir.';
const SEFAZ_ENDPOINT_MESSAGE =
  'SEFAZ retornou erro HTTP no webservice de autorizacao. Verifique o status do servico fiscal, atualize a tela e tente novamente.';
const NFE_AUTORIZACAO_SOAP_ACTION =
  'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote';

async function getNFEWizard() {
  if (_wizard) return _wizard;

  const certConfig = getCertificadoConfig();
  const certPath = certConfig.pathCertificado;
  const certPass = certConfig.senhaCertificado;

  if (!certPath || !certPass)
    throw new Error('Certificado NF-e nao configurado. Configure na tela fiscal ou no .env.');

  const resolvedPath = path.resolve(certPath);
  if (!fs.existsSync(resolvedPath))
    throw new Error(`Certificado nao encontrado: ${resolvedPath}`);

  let nfewizardModule;
  try {
    nfewizardModule = require('nfewizard-io');
  } catch (e) {
    throw new Error(`nfewizard-io nao instalado ou com erro de import: ${e.message}`);
  }

  const NFEWizard = nfewizardModule.NFeWizard
    || nfewizardModule.default?.NFeWizard
    || nfewizardModule.default;

  if (typeof NFEWizard !== 'function')
    throw new Error(`Erro ao inicializar a lib: NFeWizard nao e uma funcao. Exports: ${Object.keys(nfewizardModule).join(', ')}`);

  let libVersion = '0.0.0';
  try { libVersion = require('nfewizard-io/package.json').version; } catch (_) {}
  console.log('[NF-e] nfewizard-io versao:', libVersion);

  const wizard = new NFEWizard();
  const tpAmb  = tpAmbAtual();

  const configObj = {
    dfe: {
      pathCertificado:  resolvedPath,
      senhaCertificado: certPass,
      UF:               'MG',
      idCSC:            process.env.NFE_ID_CSC || '',
      CSC:              process.env.NFE_CSC    || '',
    },
    nfe: {
      ambiente: tpAmb,
      versaoDF: '4.00',
    },
    lib: {
      useOpenSSL: false,
      connection: { timeout: SEFAZ_TIMEOUT_MS },
    },
  };

  try {
    await wizard.NFE_LoadEnvironment({ config: configObj });
  } catch (e) {
    throw new Error(`Erro ao inicializar a lib: ${e.message}`);
  }

  configureSefazHttpClient(wizard);

  _wizard = wizard;
  console.log('[NF-e] NFEWizard singleton criado e ambiente carregado. tpAmb=',
    tpAmb === 1 ? '1(PROD)' : '2(HOMOL)');
  return _wizard;
}

async function callSEFAZ(fn) {
  const GUARD = SEFAZ_TIMEOUT_MS + 5_000;
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Timeout SEFAZ (${SEFAZ_TIMEOUT_MS / 1000}s) - sem resposta da SEFAZ-MG`)),
      GUARD
    )
  );
  return Promise.race([fn(), timeout]);
}

function isSefazCommunicationError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  return [
    'econnreset',
    'etimedout',
    'econnrefused',
    'enotfound',
    'socket hang up',
    'timeout sefaz',
    'sem resposta',
    'network',
  ].some((term) => message.includes(term));
}

function getSefazCommunicationMessage() {
  return SEFAZ_RETRY_MESSAGE;
}

function getSefazHttpStatus(err) {
  const message = String(err?.message || err || '');
  const match = message.match(/status code (\d{3})/i) || message.match(/\bHTTP\s+(\d{3})\b/i);
  return match ? Number(match[1]) : null;
}

function getSefazErrorInfo(err) {
  const httpStatus = getSefazHttpStatus(err);
  if (httpStatus) {
    return {
      tipo: 'endpoint',
      cstat: `http_${httpStatus}`,
      mensagem: httpStatus === 404
        ? 'SEFAZ retornou HTTP 404 no webservice de autorizacao. Isso normalmente indica problema de endpoint, roteamento ou headers SOAP; confira o status do servico e tente novamente.'
        : SEFAZ_ENDPOINT_MESSAGE,
    };
  }

  if (isSefazCommunicationError(err)) {
    return {
      tipo: 'comunicacao',
      cstat: 'comunicacao',
      mensagem: SEFAZ_RETRY_MESSAGE,
    };
  }

  return {
    tipo: 'sefaz',
    cstat: 'timeout',
    mensagem: err?.message || 'Sem resposta da SEFAZ',
  };
}

function getHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return found ? headers[found] : '';
}

function setHeader(headers, name, value) {
  if (typeof headers.set === 'function') headers.set(name, value);
  else headers[name] = value;
}

function getNfeSoapActionForUrl(url) {
  const value = String(url || '');
  if (/\/NFeAutorizacao4(?:$|\?)/i.test(value)) return NFE_AUTORIZACAO_SOAP_ACTION;
  return '';
}

function normalizeSefazRequestHeaders(headers = {}, url = '') {
  const action = getNfeSoapActionForUrl(url);
  if (!action) return headers;

  if (!getHeader(headers, 'SOAPAction')) {
    setHeader(headers, 'SOAPAction', action);
  }

  const contentType = getHeader(headers, 'Content-Type') || 'application/soap+xml';
  if (/^application\/soap\+xml/i.test(contentType) && !/;\s*action=/i.test(contentType)) {
    const withCharset = /;\s*charset=/i.test(contentType)
      ? contentType
      : `${contentType}; charset=utf-8`;
    setHeader(headers, 'Content-Type', `${withCharset}; action="${action}"`);
  }

  return headers;
}

function configureSefazHttpClient(wizard) {
  if (!wizard?.axios?.interceptors || wizard.__sistemaNfeInterceptorsConfigured) return;
  wizard.__sistemaNfeInterceptorsConfigured = true;

  wizard.axios.interceptors.request.use((config) => {
    const url = config?.url || '';
    if (url.includes('fazenda') || url.includes('sefaz')) {
      config.headers = normalizeSefazRequestHeaders(config.headers || {}, url);
      const soapAction = getHeader(config.headers, 'SOAPAction') ? 'set' : 'unset';
      console.log(`[NF-e] SEFAZ request ${String(config.method || 'POST').toUpperCase()} ${url} soapAction=${soapAction}`);
    }
    return config;
  });

  wizard.axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status || '-';
      const url = error?.config?.url || '-';
      console.error(`[NF-e] SEFAZ HTTP erro status=${status} url=${url} message=${error?.message || error}`);
      return Promise.reject(error);
    }
  );
}

function resetNFEWizard() {
  _wizard = null;
  console.log('[NF-e] Singleton resetado.');
}

module.exports = {
  getNFEWizard,
  resetNFEWizard,
  callSEFAZ,
  isSefazCommunicationError,
  getSefazCommunicationMessage,
  getSefazErrorInfo,
  getNfeSoapActionForUrl,
  normalizeSefazRequestHeaders,
  configureSefazHttpClient,
};
