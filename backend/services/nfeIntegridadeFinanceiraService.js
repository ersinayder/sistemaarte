const { extrairXmlFiscal } = require("./nfeEmissaoService");

const ORIENTACAO_DETALHE = "Conferencia manual necessaria. Esta auditoria nao altera OS, caixa ou NF-e.";

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

function conciliacaoAtual(nota) {
  if (!nota?.conciliacao_tipo || !nota?.conciliacao_motivo || !nota?.conciliacao_createdat) {
    return null;
  }
  return {
    tipo: nota.conciliacao_tipo,
    valorOS: toMoney(nota.conciliacao_valor_os),
    valorNFe: toMoney(nota.conciliacao_valor_nfe),
    motivo: String(nota.conciliacao_motivo || "").trim(),
    createdAt: nota.conciliacao_createdat,
    createdBy: nota.conciliacao_createdby ?? null,
  };
}

function valoresIguais(a, b) {
  return Math.abs(toMoney(a) - toMoney(b)) <= 0.01;
}

function apontamentoConciliado(nota, apontamento) {
  const conciliacao = conciliacaoAtual(nota);
  if (!conciliacao) return false;
  return conciliacao.tipo === apontamento.tipo
    && valoresIguais(conciliacao.valorOS, apontamento.valorOS)
    && valoresIguais(conciliacao.valorNFe, apontamento.valorNFe);
}

function auditarNota(nota, { ignorarConciliacao = false } = {}) {
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
    const apontamento = {
      ...base,
      tipo: "nfe_total_divergente",
      severidade: "critico",
      valorNFe,
      diferenca,
      mensagem: "Valor total da NF-e autorizada difere do total atual da OS.",
    };
    if (!ignorarConciliacao && apontamentoConciliado(nota, apontamento)) return [];
    return [apontamento];
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

function montarDetalheIntegridadeFiscalFinanceiraNFe(nota) {
  const base = baseNota(nota);
  const xml = extrairXmlFiscal(nota?.nfe_xml);
  const valorNFe = xml ? extrairVNF(xml) : null;
  const conciliacao = conciliacaoAtual(nota);
  const fiscal = {
    status: base.nfeStatus,
    chave: base.nfeChave,
    xmlLocal: xml ? "presente" : "ausente",
  };

  if (valorNFe !== null) {
    fiscal.valorNFe = valorNFe;
  }

  return {
    ordem: {
      id: base.ordemId,
      numero: base.numero,
      clienteNome: base.clienteNome,
      status: base.statusOS,
      valorTotal: base.valorOS,
    },
    fiscal,
    ...(conciliacao ? { conciliacao } : {}),
    apontamentos: auditarNota(nota).map(({
      ordemId,
      numero,
      clienteNome,
      statusOS,
      nfeStatus,
      nfeChave,
      ...item
    }) => item),
    orientacao: ORIENTACAO_DETALHE,
  };
}

function prepararConciliacaoIntegridadeFiscalFinanceiraNFe(nota, { motivo, userId, now = () => new Date().toISOString() } = {}) {
  const motivoNormalizado = String(motivo || "").trim().replace(/\s+/g, " ");
  if (motivoNormalizado.length < 10) {
    return { ok: false, status: 400, erro: "Informe um motivo de conciliacao com pelo menos 10 caracteres." };
  }

  const apontamento = auditarNota(nota).find((item) => item.tipo === "nfe_total_divergente");
  if (!apontamento) {
    return { ok: false, status: 422, erro: "Nao ha divergencia de total ativa para conciliar nesta NF-e." };
  }

  return {
    ok: true,
    registro: {
      ordemId: apontamento.ordemId,
      tipo: apontamento.tipo,
      valorOS: apontamento.valorOS,
      valorNFe: apontamento.valorNFe,
      motivo: motivoNormalizado,
      createdBy: userId || null,
      createdAt: now(),
    },
  };
}

function inserirConciliacaoIntegridadeFiscalFinanceiraNFe(db, registro) {
  db.prepare(`
    INSERT INTO nfe_integridade_conciliacoes
      (ordemid, tipo, valor_os, valor_nfe, motivo, createdby, createdat)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
  `).run(
    registro.ordemId,
    registro.tipo,
    registro.valorOS,
    registro.valorNFe,
    registro.motivo,
    registro.createdBy,
    registro.createdAt
  );
}

module.exports = {
  auditarIntegridadeFiscalFinanceiraNFe,
  montarDetalheIntegridadeFiscalFinanceiraNFe,
  prepararConciliacaoIntegridadeFiscalFinanceiraNFe,
  inserirConciliacaoIntegridadeFiscalFinanceiraNFe,
  extrairVNF,
};
