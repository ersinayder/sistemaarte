function toMoney(value) {
  const number = Number(value || 0);
  return Math.round(number * 100) / 100;
}

function isOpenStatus(status) {
  return !["Entregue", "Cancelado"].includes(status);
}

function criarBaseItem(ordem, resumo) {
  const resumoOrdem = resumo.ordem || {};
  return {
    ordemId: Number(ordem.id),
    numero: resumoOrdem.numero || ordem.numero || null,
    clienteNome: resumoOrdem.clientenome || ordem.clientenome || null,
    status: resumoOrdem.status || ordem.status || null,
    valorTotal: toMoney(resumoOrdem.valortotal ?? ordem.valortotal),
    recebidoOficial: toMoney(resumo.recebido),
    saldoOficial: toMoney(resumo.saldo),
  };
}

function auditarIntegridadeFinanceiraOS({ ordens = [], receberGerencial = [], getResumoFinanceiroOS }) {
  if (typeof getResumoFinanceiroOS !== "function") {
    throw new TypeError("getResumoFinanceiroOS is required");
  }

  const receberPorId = new Map(receberGerencial.map((row) => [Number(row.id), row]));
  const itens = [];

  for (const ordem of ordens) {
    const resumo = getResumoFinanceiroOS(ordem.id);
    if (!resumo) continue;

    const base = criarBaseItem(ordem, resumo);

    if (base.status === "Entregue" && base.saldoOficial > 0.01) {
      itens.push({
        ...base,
        tipo: "entregue_com_saldo",
        severidade: "critico",
        mensagem: "OS entregue ainda possui saldo oficial em aberto.",
      });
    }

    const excedente = toMoney(base.recebidoOficial - base.valorTotal);
    if (excedente > 0.01) {
      itens.push({
        ...base,
        tipo: "pagamento_excedente",
        severidade: "aviso",
        excedente,
        mensagem: "Pagamentos registrados excedem o valor total da OS.",
      });
    }

    if (isOpenStatus(base.status)) {
      const gerencial = receberPorId.get(Number(ordem.id));
      const saldoGerencial = toMoney(gerencial?.saldo);
      const deveriaAparecer = base.saldoOficial > 0.009;
      const aparece = Boolean(gerencial);
      const diverge = Math.abs(saldoGerencial - base.saldoOficial) > 0.01;

      if ((deveriaAparecer && !aparece) || (!deveriaAparecer && aparece) || diverge) {
        itens.push({
          ...base,
          tipo: "receber_divergente",
          severidade: "aviso",
          saldoGerencial,
          mensagem: "Saldo oficial da OS diverge das contas a receber gerenciais.",
        });
      }
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    total: itens.length,
    criticos: itens.filter((item) => item.severidade === "critico").length,
    avisos: itens.filter((item) => item.severidade === "aviso").length,
    itens,
  };
}

module.exports = { auditarIntegridadeFinanceiraOS };
