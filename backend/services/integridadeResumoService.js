function countStatus(rows, status) {
  return rows.filter((row) => row.status === status).length;
}

function toCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function montarResumoIntegridade({
  pendenciasFiscais = [],
  integridadeFinanceira = {},
  integridadeFiscalFinanceira = {},
  now = Date.now,
} = {}) {
  const fiscal = {
    pendencias: pendenciasFiscais.length,
    incertas: countStatus(pendenciasFiscais, "incerto"),
    processando: countStatus(pendenciasFiscais, "processando"),
  };
  const financeiro = {
    apontamentos: toCount(integridadeFinanceira.total),
    criticos: toCount(integridadeFinanceira.criticos),
    avisos: toCount(integridadeFinanceira.avisos),
  };
  const metaFiscalFinanceiro = integridadeFiscalFinanceira.meta || {};
  const fiscalFinanceiro = {
    apontamentos: toCount(metaFiscalFinanceiro.total),
    criticos: toCount(metaFiscalFinanceiro.criticos),
    avisos: toCount(metaFiscalFinanceiro.avisos),
  };

  return {
    fiscal,
    financeiro,
    fiscalFinanceiro,
    meta: {
      total: fiscal.pendencias + financeiro.apontamentos + fiscalFinanceiro.apontamentos,
      criticos: financeiro.criticos + fiscalFinanceiro.criticos,
      avisos: fiscal.incertas + financeiro.avisos + fiscalFinanceiro.avisos,
      ts: now(),
    },
  };
}

module.exports = { montarResumoIntegridade };
