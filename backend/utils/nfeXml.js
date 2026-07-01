'use strict';

function extrairXmlFiscal(valor, depth = 0) {
  if (!valor || depth > 5) return null;

  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (texto.startsWith('<')) return texto;
    if (texto.startsWith('{') || texto.startsWith('[')) {
      try {
        return extrairXmlFiscal(JSON.parse(texto), depth + 1);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  if (Array.isArray(valor)) {
    for (const item of valor) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
    return null;
  }

  if (typeof valor === 'object') {
    for (const key of ['xml', 'xmlAssinado', 'xmlProc', 'nfeProc', 'procNFe']) {
      const xml = extrairXmlFiscal(valor[key], depth + 1);
      if (xml) return xml;
    }
    for (const item of Object.values(valor)) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
  }

  return null;
}

function serializarXmlFiscal(resultado) {
  return extrairXmlFiscal(resultado);
}

function filenameSeguro(value) {
  return String(value || 'nfe').replace(/[^a-zA-Z0-9._-]/g, '_');
}

module.exports = {
  extrairXmlFiscal,
  serializarXmlFiscal,
  filenameSeguro,
};
