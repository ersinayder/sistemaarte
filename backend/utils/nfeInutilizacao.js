'use strict';

const { createNFEWizard } = require('./nfe');

function isInutilizacaoRequest(config) {
  return String(config?.data || '').includes('<inutNFe');
}

async function transmitirInutilizacaoNFe(payload, deps = {}) {
  const criarWizard = deps.criarWizard || createNFEWizard;
  const wizard = await criarWizard();
  const service = wizard?.nfeWizardService;
  const xmlBuilder = service?.xmlBuilder;
  const responseInterceptors = service?.axios?.interceptors?.response;

  if (typeof wizard?.NFE_Inutilizacao !== 'function') {
    const error = new Error('NFE_Inutilizacao: metodo fiscal indisponivel na biblioteca.');
    error.code = 'falha_local_pre_transmissao';
    throw error;
  }

  let xmlEnvio = '';
  let xmlRetorno = '';
  let assinarOriginal = null;
  let interceptorId = null;

  if (typeof xmlBuilder?.assinarXML === 'function') {
    assinarOriginal = xmlBuilder.assinarXML;
    const assinarBound = assinarOriginal.bind(xmlBuilder);

    xmlBuilder.assinarXML = (xml, tag) => {
      const assinado = assinarBound(xml, tag);
      if (tag === 'infInut') xmlEnvio = assinado;
      return assinado;
    };
  }

  if (responseInterceptors?.use && responseInterceptors?.eject) {
    interceptorId = responseInterceptors.use(
      (response) => {
        if (isInutilizacaoRequest(response?.config)) {
          xmlRetorno = typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data || '');
        }
        return response;
      },
      (error) => {
        if (isInutilizacaoRequest(error?.config)) {
          const raw = error?.response?.data;
          xmlRetorno = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
        }
        return Promise.reject(error);
      }
    );
  }

  try {
    const retorno = await wizard.NFE_Inutilizacao(payload);
    return {
      cStat: String(retorno?.cStat || ''),
      xMotivo: retorno?.xMotivo || '',
      nProt: retorno?.nProt || '',
      dhRecbto: retorno?.dhRecbto || '',
      xmlEnvio,
      xmlRetorno: xmlRetorno || retorno?.xml || '',
    };
  } catch (error) {
    error.xmlEnvio = xmlEnvio;
    error.xmlRetorno = xmlRetorno || error?.xml || '';
    throw error;
  } finally {
    if (assinarOriginal) xmlBuilder.assinarXML = assinarOriginal;
    if (interceptorId !== null) responseInterceptors.eject(interceptorId);
  }
}

module.exports = {
  transmitirInutilizacaoNFe,
};
