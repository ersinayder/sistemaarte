const { extrairXmlFiscal } = require("./nfeEmissaoService");

function toMoney(value) {
  const number = Number(value || 0);
  return Math.round(number * 100) / 100;
}

function extrairVNF(xml) {
  const match = String(xml || "").match(/<vNF>([^<]+)<\/vNF>/i);
  if (!match) return null;
  const value = Number(String(match[1]).replace(",", "."));
  return Number.isFinite(value) ? toMoney(value) : null;
}

function baseNota(nota) {
  return {
    ordemId: Number(nota.id),
    numero: nota.numero || null,
    clienteNome: nota.clientenome || null,
    statusOS: nota.status || null,
    nfeStatus: nota.nfe_status || null,
    nfeChave: nota.nfe_chave || null,
    valorOS: toMoney(nota.valortotal),
  };
}

function auditarNota(nota) {
  const base = baseNota(nota);
  const statusFiscal = String(nota.nfe_status || "").toLowerCase();

  if (statusFiscal === "cancelado" && base.statusOS === "Entregue") {
    return [{
      ...base,
      tipo: "nfe_cancelada_os_entregue",
      severidade: "aviso",
      mensagem: "NF-e cancelada vinculada a OS entregue. Revise se houve reemissao ou ajuste operacional.",
    }];
  }

  if (statusFiscal !== "autorizado") return [];

  const xml = extrairXmlFiscal(nota.nfe_xml);
  if (!xml) {
    return [{
      ...base,
      tipo: "nfe_xml_ausente",
      severidade: "critico",
      mensagem: "NF-e autorizada sem XML legal local legivel.",
    }];
  }

  const valorNFe = extrairVNF(xml);
  if (valorNFe === null) {
    return [{
      ...base,
      tipo: "nfe_xml_total_invalido",
      severidade: "critico",
      mensagem: "XML da NF-e autorizada nao possui total vNF legivel.",
    }];
  }

  const diferenca = toMoney(base.valorOS - valorNFe);
  if (Math.abs(diferenca) > 0.01) {
    return [{
      ...base,
      tipo: "nfe_total_divergente",
      severidade: "critico",
      valorNFe,
      diferenca,
      mensagem: "Valor total da NF-e autorizada difere do total atual da OS.",
    }];
  }

  return [];
}

function auditarIntegridadeFiscalFinanceiraNFe(notas = []) {
  const itens = notas.flatMap(auditarNota);
  return {
    itens,
    meta: {
      total: itens.length,
      criticos: itens.filter((item) => item.severidade === "critico").length,
      avisos: itens.filter((item) => item.severidade === "aviso").length,
    },
  };
}

module.exports = {
  auditarIntegridadeFiscalFinanceiraNFe,
  extrairVNF,
};
