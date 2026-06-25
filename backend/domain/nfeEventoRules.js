'use strict';

const STATUS_ATIVOS = new Set(['processando', 'incerto']);

function estadoEventoBloqueiaReenvio(status) {
  return STATUS_ATIVOS.has(String(status || ''));
}

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
    for (const key of ['xml', 'xmlRetorno', 'procEventoNFe', 'retEvento']) {
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

function extrairRespostaEventoFiscal(raw, fallbackDhEvento) {
  const retEvento =
    raw?.[0]?.retEvento?.infEvento ||
    raw?.retEnvEvento?.retEvento?.[0]?.infEvento ||
    raw?.retEvento?.infEvento ||
    raw?.infEvento ||
    raw?.[0] ||
    raw ||
    {};

  return {
    raw,
    cStat: String(retEvento?.cStat || '').trim(),
    protocolo: String(retEvento?.nProt || '').trim(),
    motivo: String(retEvento?.xMotivo || '').trim(),
    dhEvento: retEvento?.dhRegEvento || fallbackDhEvento || new Date().toISOString(),
    xml: extrairXmlFiscal(raw),
  };
}

function classificarResultadoEventoFiscal(tipo, resposta) {
  if (!resposta || resposta.timeout) return 'incerto';
  const cStat = String(resposta.cStat || '').trim();
  if (tipo === 'cancelamento' && (cStat === '135' || cStat === '155')) return 'autorizado';
  if (tipo === 'cce' && cStat === '135') return 'autorizado';
  if (!cStat) return 'incerto';
  return 'rejeitado';
}

module.exports = {
  classificarResultadoEventoFiscal,
  estadoEventoBloqueiaReenvio,
  extrairRespostaEventoFiscal,
  extrairXmlFiscal,
};
