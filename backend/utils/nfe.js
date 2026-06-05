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

const REJEICOES_SEFAZ_CATALOGADAS = {
  204: {
    campo: 'Numero da NF-e',
    mensagem: 'Duplicidade de NF-e: esta numeracao ja existe na SEFAZ. Atualize a tela e tente emitir novamente; se persistir, revise a sequencia fiscal.',
  },
  205: {
    campo: 'Numero da NF-e',
    mensagem: 'NF-e ja esta denegada na SEFAZ para esta numeracao. Nao reutilize esse numero; revise a sequencia fiscal antes de reemitir.',
  },
  206: {
    campo: 'Numero da NF-e',
    mensagem: 'NF-e ja esta inutilizada na SEFAZ. A numeracao nao pode ser reutilizada; revise a sequencia fiscal antes de reemitir.',
  },
  207: {
    campo: 'CNPJ do emitente',
    mensagem: 'CNPJ do emitente invalido. Revise o CNPJ configurado em Fiscal/Emitente antes de emitir novamente.',
  },
  208: {
    campo: 'CPF/CNPJ do cliente',
    mensagem: 'CNPJ do destinatario invalido. Corrija o CPF/CNPJ do cliente na emissao ou no cadastro do cliente.',
  },
  209: {
    campo: 'IE do emitente',
    mensagem: 'Inscricao Estadual do emitente invalida. Revise a IE configurada em Fiscal/Emitente.',
  },
  210: {
    campo: 'IE do cliente',
    mensagem: 'Inscricao Estadual do destinatario invalida. Corrija a IE do cliente ou deixe em branco quando ele nao for contribuinte.',
  },
  215: {
    campo: 'XML NF-e',
    mensagem: 'Falha de schema no XML da NF-e. Revise campos fiscais obrigatorios dos itens, cliente e emitente antes de reemitir.',
  },
  217: {
    campo: 'Chave da NF-e',
    mensagem: 'NF-e nao consta na base da SEFAZ. Aguarde alguns instantes e consulte novamente antes de reenviar eventos.',
  },
  218: {
    campo: 'Chave da NF-e',
    mensagem: 'NF-e nao consta na base da SEFAZ ou nao pode receber este evento. Confira a chave e o protocolo antes de tentar novamente.',
  },
  220: {
    campo: 'CPF/CNPJ do cliente',
    mensagem: 'Destinatario esta com a mesma identificacao do emitente. Corrija o CPF/CNPJ do cliente antes de emitir novamente.',
  },
  225: {
    campo: 'XML NF-e',
    mensagem: 'Falha de schema no lote da NF-e. Revise os campos fiscais obrigatorios e tente emitir novamente.',
  },
  226: {
    campo: 'UF do emitente',
    mensagem: 'UF do emitente diverge da SEFAZ autorizadora. Revise UF, municipio e ambiente configurados para o emitente.',
  },
  232: {
    campo: 'IE do cliente',
    mensagem: 'Inscricao Estadual do destinatario nao informada quando era obrigatoria. Informe a IE do cliente contribuinte.',
  },
  233: {
    campo: 'IE do cliente',
    mensagem: 'Inscricao Estadual do destinatario nao cadastrada. Confira a IE do cliente com a contabilidade ou marque como nao contribuinte quando aplicavel.',
  },
  234: {
    campo: 'IE do cliente',
    mensagem: 'Inscricao Estadual do destinatario nao vinculada ao CNPJ informado. Corrija IE ou CNPJ do cliente.',
  },
  237: {
    campo: 'CPF/CNPJ do cliente',
    mensagem: 'CPF do destinatario invalido. Corrija o CPF/CNPJ do cliente na emissao ou no cadastro do cliente.',
  },
  245: {
    campo: 'CNPJ do emitente',
    mensagem: 'CNPJ do emitente nao cadastrado na SEFAZ. Revise o credenciamento fiscal antes de emitir.',
  },
  302: {
    campo: 'Destinatario',
    mensagem: 'Uso denegado: irregularidade fiscal do destinatario. Confirme a situacao cadastral do cliente antes de tentar novamente.',
  },
  303: {
    campo: 'Destinatario',
    mensagem: 'Uso denegado: destinatario nao habilitado na UF. Confirme a situacao cadastral do cliente.',
  },
  327: {
    campo: 'CFOP',
    mensagem: 'CFOP invalido para nota com finalidade de devolucao. Corrija o CFOP do item antes de reemitir.',
  },
  328: {
    campo: 'CFOP',
    mensagem: 'CFOP de devolucao informado em NF-e que nao e de devolucao. Corrija o CFOP do item.',
  },
  386: {
    campo: 'CFOP/CSOSN',
    mensagem: 'CFOP nao permitido para o CSOSN informado. Revise CFOP e CSOSN do item; para venda interna no Simples, normalmente use CFOP 5102 e CSOSN 400/102 conforme orientacao contabilidade.',
  },
  387: {
    campo: 'Codigo de enquadramento fiscal',
    mensagem: 'Codigo de enquadramento fiscal invalido no item. Revise a tributacao do produto antes de emitir novamente.',
  },
  388: {
    campo: 'CST/CSOSN',
    mensagem: 'CST/CSOSN incompativel com a operacao. Revise a tributacao do item com a contabilidade antes de reemitir.',
  },
  471: {
    campo: 'NCM',
    mensagem: 'NCM 00 informado indevidamente. Corrija o NCM completo do produto antes de emitir novamente.',
  },
  531: {
    campo: 'Totais fiscais',
    mensagem: 'Total da base de ICMS difere do somatorio dos itens. Revise valores, desconto e tributacao dos itens.',
  },
  532: {
    campo: 'Totais fiscais',
    mensagem: 'Total do ICMS difere do somatorio dos itens. Revise tributacao e valores dos itens.',
  },
  533: {
    campo: 'Totais fiscais',
    mensagem: 'Total do ICMS ST difere do somatorio dos itens. Revise tributacao dos itens.',
  },
  539: {
    campo: 'Numero da NF-e',
    mensagem: 'Duplicidade de NF-e com diferenca na chave de acesso. Nao reenvie com os mesmos dados; revise numero, serie, ambiente e CNPJ emitente.',
  },
  564: {
    campo: 'Total dos itens',
    mensagem: 'Total dos produtos/servicos difere do somatorio dos itens. Revise quantidade, preco, desconto e total da OS.',
  },
  573: {
    campo: 'Evento fiscal',
    mensagem: 'Evento duplicado na SEFAZ. Este cancelamento ou CC-e provavelmente ja foi enviado; atualize a tela e confira o historico de eventos.',
  },
  591: {
    campo: 'CSOSN/CRT',
    mensagem: 'CSOSN informado para emitente que nao esta como Simples Nacional. Revise CRT do emitente ou CST/CSOSN do item.',
  },
  602: {
    campo: 'Totais fiscais',
    mensagem: 'Total do PIS difere do somatorio dos itens. Revise tributacao e totais fiscais dos itens.',
  },
  603: {
    campo: 'Totais fiscais',
    mensagem: 'Total do COFINS difere do somatorio dos itens. Revise tributacao e totais fiscais dos itens.',
  },
  610: {
    campo: 'Total da NF-e',
    mensagem: 'Total da NF-e difere do somatorio dos itens e totais fiscais. Revise valores, desconto e pagamento antes de reemitir.',
  },
  703: {
    campo: 'Data/hora de emissao',
    mensagem: 'Data/hora de emissao posterior ao horario da SEFAZ. Confira o relogio do servidor e tente novamente.',
  },
  704: {
    campo: 'Data/hora de emissao',
    mensagem: 'Data/hora de emissao atrasada para a SEFAZ. Confira o relogio do servidor e tente novamente.',
  },
  725: {
    campo: 'CFOP',
    mensagem: 'CFOP invalido. Corrija o CFOP do item antes de emitir novamente.',
  },
  777: {
    campo: 'NCM',
    mensagem: 'NCM completo e obrigatorio. Informe 8 digitos no NCM do item antes de emitir novamente.',
  },
  778: {
    campo: 'NCM',
    mensagem: 'NCM invalido ou inexistente na tabela oficial; corrija o NCM no item da emissao e tente novamente.',
  },
  806: {
    campo: 'Operacao interestadual',
    mensagem: 'Operacao com destinatario nao contribuinte exige revisao dos campos interestaduais. Confira UF, CFOP e tributacao.',
  },
};

const PADROES_REJEICAO_SEFAZ = [
  {
    campo: 'NCM',
    regex: /\bncm\b/i,
    mensagem: 'Erro no NCM do item. Confira se o produto tem NCM com 8 digitos, valido e vigente na tabela oficial.',
  },
  {
    campo: 'CFOP/CSOSN',
    regex: /\bcfop\b.*\b(csosn|cst)\b|\b(csosn|cst)\b.*\bcfop\b/i,
    mensagem: 'Erro na combinacao CFOP/CSOSN do item. Corrija os campos fiscais do produto antes de reemitir.',
  },
  {
    campo: 'CFOP',
    regex: /\bcfop\b/i,
    mensagem: 'Erro no CFOP do item. Corrija o CFOP conforme a operacao fiscal antes de reemitir.',
  },
  {
    campo: 'CSOSN/CST',
    regex: /\bcsosn\b|\bcst\b/i,
    mensagem: 'Erro no CSOSN/CST do item. Revise a tributacao do produto antes de reemitir.',
  },
  {
    campo: 'CPF/CNPJ do cliente',
    regex: /\bcpf\b|\bcnpj\b|\bdestinatario\b/i,
    mensagem: 'Erro nos dados do cliente. Corrija CPF/CNPJ, IE e cadastro do destinatario antes de reemitir.',
  },
  {
    campo: 'IE do cliente',
    regex: /inscricao estadual|\bie\b/i,
    mensagem: 'Erro na Inscricao Estadual. Corrija a IE do cliente ou do emitente conforme indicado pela SEFAZ.',
  },
  {
    campo: 'Endereco do cliente',
    regex: /\bcep\b|\buf\b|municipio|endereco|bairro|logradouro/i,
    mensagem: 'Erro no endereco fiscal. Corrija CEP, UF, municipio, bairro ou logradouro do cliente/emitente.',
  },
  {
    campo: 'Totais fiscais',
    regex: /total|somatorio|valor|pagamento/i,
    mensagem: 'Erro nos totais da NF-e. Revise quantidade, preco, desconto, total da OS e forma de pagamento.',
  },
  {
    campo: 'Numero da NF-e',
    regex: /duplicidade|numero|numeracao/i,
    mensagem: 'Erro de numeracao fiscal. Atualize a tela e tente novamente; se persistir, revise serie e sequencia da NF-e.',
  },
  {
    campo: 'Certificado/ambiente',
    regex: /certificado|assinatura|ambiente|credenciamento/i,
    mensagem: 'Erro de certificado, assinatura ou ambiente fiscal. Revise certificado, senha, credenciamento e ambiente da NF-e.',
  },
];

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
  const rawMessage = String(err?.message || err || '');
  const normalizedMessage = semAcentos(rawMessage).toLowerCase();
  const isXmlValidationError = normalizedMessage.includes('validacao do xml') ||
    normalizedMessage.includes('cvc-') ||
    normalizedMessage.includes('facet-valid') ||
    normalizedMessage.includes('anontype');

  if (
    normalizedMessage.includes('cvc-pattern-valid') &&
    (normalizedMessage.includes('ceptendereco') || normalizedMessage.includes('[0-9]{8}'))
  ) {
    return {
      tipo: 'validacao_xml',
      cstat: 'xml_cep',
      mensagem: 'CEP do cliente ou do emitente esta vazio/invalido. Informe um CEP com 8 digitos antes de emitir a NF-e.',
    };
  }

  if (
    isXmlValidationError &&
    (normalizedMessage.includes('cnpjcpf') || normalizedMessage.includes('cpf') || normalizedMessage.includes('cnpj'))
  ) {
    return {
      tipo: 'validacao_xml',
      cstat: 'xml_documento_cliente',
      mensagem: 'CPF/CNPJ do cliente esta vazio/invalido. Informe CPF com 11 digitos ou CNPJ com 14 digitos antes de emitir a NF-e.',
    };
  }

  if (
    isXmlValidationError &&
    (
      normalizedMessage.includes('tendereco') ||
      normalizedMessage.includes('xlgr') ||
      normalizedMessage.includes('nro') ||
      normalizedMessage.includes('xbairro') ||
      normalizedMessage.includes('xmun') ||
      normalizedMessage.includes('uf')
    )
  ) {
    return {
      tipo: 'validacao_xml',
      cstat: 'xml_endereco',
      mensagem: 'Endereco fiscal do cliente ou do emitente esta incompleto. Preencha logradouro, numero, bairro, cidade, UF e CEP antes de emitir a NF-e.',
    };
  }

  if (isXmlValidationError && normalizedMessage.includes('ncm')) {
    return {
      tipo: 'validacao_xml',
      cstat: 'xml_ncm',
      mensagem: 'NCM do item esta vazio/invalido. Informe NCM com 8 digitos e valido na tabela oficial antes de emitir a NF-e.',
    };
  }

  if (isXmlValidationError && normalizedMessage.includes('cfop')) {
    return {
      tipo: 'validacao_xml',
      cstat: 'xml_cfop',
      mensagem: 'CFOP do item esta vazio/invalido. Informe CFOP com 4 digitos coerente com a operacao antes de emitir a NF-e.',
    };
  }

  if (isXmlValidationError && (normalizedMessage.includes('csosn') || normalizedMessage.includes('cst'))) {
    return {
      tipo: 'validacao_xml',
      cstat: 'xml_tributacao_item',
      mensagem: 'Tributacao do item esta invalida. Revise CSOSN/CST, PIS e COFINS antes de emitir a NF-e.',
    };
  }

  if (isXmlValidationError) {
    return {
      tipo: 'validacao_xml',
      cstat: 'xml_schema',
      mensagem: 'XML da NF-e ficou invalido por dados fiscais ausentes ou incorretos. Revise cliente, emitente e itens antes de emitir.',
    };
  }

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

function extrairItemRejeicaoSefaz(motivo) {
  const texto = String(motivo || '');
  const match = texto.match(/\[?\s*nItem\s*:?\s*(\d+)\s*\]?/i)
    || texto.match(/\bitem\s*:?\s*(\d+)\b/i);
  return match ? match[1] : null;
}

function comItemNaMensagem(mensagem, item, campo) {
  if (!item) return mensagem;
  const campoLabel = campo || 'campo fiscal';
  const lower = mensagem.toLowerCase();
  if (lower.includes(`item ${item}`)) return mensagem;
  if (campoLabel === 'NCM' && lower.includes('invalido ou inexistente')) {
    return `NCM do item ${item} invalido ou inexistente. ${mensagem}`;
  }
  return `${campoLabel} do item ${item} invalido ou inconsistente. ${mensagem}`;
}

function semAcentos(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function encontrarRejeicaoPorPalavraChave(xMotivo) {
  const motivo = semAcentos(xMotivo).toLowerCase();
  return PADROES_REJEICAO_SEFAZ.find((padrao) => padrao.regex.test(motivo)) || null;
}

function formatarRejeicaoSefaz({ cStat, cstat, xMotivo, motivo, contexto = 'autorizacao' } = {}) {
  const codigo = String(cStat || cstat || '').trim();
  const motivoOriginal = String(xMotivo || motivo || '').trim() || `cStat ${codigo || 'desconhecido'}`;
  const item = extrairItemRejeicaoSefaz(motivoOriginal);
  const catalogada = REJEICOES_SEFAZ_CATALOGADAS[codigo];
  const porPalavra = catalogada ? null : encontrarRejeicaoPorPalavraChave(motivoOriginal);
  const regra = catalogada || porPalavra;
  const contextoLabel = contexto === 'cce'
    ? 'Carta de Correcao'
    : contexto === 'cancelamento'
      ? 'cancelamento'
      : 'emissao';

  if (regra) {
    const mensagemBase = comItemNaMensagem(regra.mensagem, item, regra.campo);
    return {
      cstat: codigo || null,
      campo: regra.campo,
      item,
      origem: catalogada ? 'catalogo' : 'palavra-chave',
      motivoOriginal,
      mensagem: `SEFAZ rejeitou a ${contextoLabel}: ${mensagemBase} Retorno original: ${motivoOriginal}`,
    };
  }

  return {
    cstat: codigo || null,
    campo: 'Rejeicao SEFAZ',
    item,
    origem: 'sefaz',
    motivoOriginal,
    mensagem: `SEFAZ rejeitou a ${contextoLabel}: ${motivoOriginal}. Revise os dados fiscais da nota e tente novamente.`,
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
  formatarRejeicaoSefaz,
  getNfeSoapActionForUrl,
  normalizeSefazRequestHeaders,
  configureSefazHttpClient,
};
