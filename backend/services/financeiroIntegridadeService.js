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

function sanitizarLancamento(lancamento) {
  const pago = Number(lancamento.pago || 0);
  const deletedat = lancamento.deletedat || null;
  return {
    id: Number(lancamento.id),
    data: lancamento.data || null,
    tipo: lancamento.tipo || null,
    categoria: lancamento.categoria || null,
    descricao: lancamento.descricao || null,
    pagamento: lancamento.pagamento || null,
    valor: toMoney(lancamento.valor),
    pago,
    origem: lancamento.origem || null,
    deletedat,
    consideradoNoSaldo: pago === 1 && !deletedat,
  };
}

function sanitizarReceberGerencial(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    numero: row.numero || null,
    clientenome: row.clientenome || null,
    status: row.status || null,
    prazoentrega: row.prazoentrega || null,
    valortotal: toMoney(row.valortotal),
    recebido: toMoney(row.recebido),
    saldo: toMoney(row.saldo),
  };
}

function montarDetalheIntegridadeFinanceiraOS({
  ordem,
  receberGerencial = null,
  lancamentos = [],
  getResumoFinanceiroOS,
}) {
  if (!ordem) return null;
  if (typeof getResumoFinanceiroOS !== "function") {
    throw new TypeError("getResumoFinanceiroOS is required");
  }

  const resumo = getResumoFinanceiroOS(ordem.id);
  if (!resumo) return null;

  const auditoria = auditarIntegridadeFinanceiraOS({
    ordens: [ordem],
    receberGerencial: receberGerencial ? [receberGerencial] : [],
    getResumoFinanceiroOS: () => resumo,
  });
  const base = criarBaseItem(ordem, resumo);

  return {
    ordem: {
      id: Number(ordem.id),
      numero: ordem.numero || null,
      clientenome: ordem.clientenome || null,
      status: ordem.status || null,
      valortotal: toMoney(ordem.valortotal),
    },
    resumo: {
      valorTotal: base.valorTotal,
      recebidoOficial: base.recebidoOficial,
      saldoOficial: base.saldoOficial,
      excedente: Math.max(0, toMoney(base.recebidoOficial - base.valorTotal)),
    },
    receberGerencial: sanitizarReceberGerencial(receberGerencial),
    lancamentos: lancamentos.map(sanitizarLancamento),
    apontamentos: auditoria.itens.map(({ tipo, severidade, mensagem, saldoGerencial, excedente }) => ({
      tipo,
      severidade,
      mensagem,
      ...(saldoGerencial !== undefined ? { saldoGerencial } : {}),
      ...(excedente !== undefined ? { excedente } : {}),
    })),
  };
}

module.exports = {
  auditarIntegridadeFinanceiraOS,
  montarDetalheIntegridadeFinanceiraOS,
};
