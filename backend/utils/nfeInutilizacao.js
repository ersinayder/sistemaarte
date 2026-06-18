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

  if (!xmlBuilder?.assinarXML || !responseInterceptors?.use || !responseInterceptors?.eject) {
    throw new Error('NFE_Inutilizacao: estrutura interna da biblioteca fiscal incompativel.');
  }

  let xmlEnvio = '';
  let xmlRetorno = '';
  const assinarOriginal = xmlBuilder.assinarXML;
  const assinarBound = assinarOriginal.bind(xmlBuilder);

  xmlBuilder.assinarXML = (xml, tag) => {
    const assinado = assinarBound(xml, tag);
    if (tag === 'infInut') xmlEnvio = assinado;
    return assinado;
  };

  const interceptorId = responseInterceptors.use(
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
    xmlBuilder.assinarXML = assinarOriginal;
    responseInterceptors.eject(interceptorId);
  }
}

module.exports = {
  transmitirInutilizacaoNFe,
};
