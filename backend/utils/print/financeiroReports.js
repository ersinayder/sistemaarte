const {
  esc,
  fmtDate,
  fmtMoney,
  renderKpis,
  renderPrintDocument,
  renderTable,
} = require('./base');

function mesLabel(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) return esc(mes || '');
  const [ano, month] = mes.split('-');
  return `${month}/${ano}`;
}

function renderResumoFinanceiroHtml({ mes, resumo = {} } = {}) {
  const body = `
    <section class="section">
      ${renderKpis([
        { label: 'Receita realizada', htmlValue: fmtMoney(resumo.receitaRealizada), tone: 'good' },
        { label: 'Despesas pagas', htmlValue: fmtMoney(resumo.despesasPagas), tone: Number(resumo.despesasPagas || 0) > 0 ? 'bad' : '' },
        { label: 'A pagar no mes', htmlValue: fmtMoney(resumo.contasPendentes) },
        { label: 'Saldo previsto', htmlValue: fmtMoney(resumo.saldoPrevisto), tone: Number(resumo.saldoPrevisto || 0) >= 0 ? 'good' : 'bad' },
      ])}
    </section>
    <section class="section">
      <h2 class="section-title">Despesas pagas por categoria</h2>
      ${renderTable({
        columns: [
          { key: 'categoria', label: 'Categoria', render: (row) => esc(row.categoria), html: true },
          { key: 'valor', label: 'Valor', align: 'right', render: (row) => `<strong>${fmtMoney(row.valor)}</strong>`, html: true },
        ],
        rows: resumo.despesasPorCategoria || [],
        empty: 'Nenhuma despesa paga neste mes.',
      })}
    </section>
  `;
  return renderPrintDocument({ title: 'Resumo Financeiro', subtitle: mesLabel(mes), body, compact: true });
}

function renderDreHtml({ mes, dre = {} } = {}) {
  const body = `
    <section class="section">
      ${renderKpis([
        { label: 'Receita bruta', htmlValue: fmtMoney(dre.receitaBruta), tone: 'good' },
        { label: 'Devolucoes / estornos', htmlValue: fmtMoney(dre.devolucoes) },
        { label: 'Receita liquida', htmlValue: fmtMoney(dre.receitaLiquida), tone: 'good' },
        { label: 'Resultado', htmlValue: fmtMoney(dre.resultado), tone: Number(dre.resultado || 0) >= 0 ? 'good' : 'bad' },
      ])}
    </section>
    <section class="section">
      <h2 class="section-title">Despesas operacionais</h2>
      ${renderTable({
        columns: [
          { key: 'categoria', label: 'Categoria', render: (row) => esc(row.categoria), html: true },
          { key: 'valor', label: 'Valor', align: 'right', render: (row) => `<strong>${fmtMoney(row.valor)}</strong>`, html: true },
        ],
        rows: dre.despesas || [],
        empty: 'Nenhuma despesa operacional no periodo.',
      })}
    </section>
    <section class="section">
      <div class="note">Resultado gerencial = receita liquida menos despesas operacionais pagas no periodo.</div>
    </section>
  `;
  return renderPrintDocument({ title: 'DRE Gerencial', subtitle: mesLabel(mes), body, compact: true });
}

function renderContasPagarHtml({ mes, contas = [] } = {}) {
  const total = contas.reduce((acc, conta) => acc + Number(conta.valor || 0), 0);
  const body = `
    <section class="section">
      ${renderKpis([
        { label: 'Total listado', htmlValue: fmtMoney(total), tone: total > 0 ? 'bad' : '' },
        { label: 'Quantidade', value: String(contas.length) },
      ])}
    </section>
    <section class="section">
      <h2 class="section-title">Contas</h2>
      ${renderTable({
        columns: [
          { key: 'vencimento', label: 'Vencimento', render: (row) => fmtDate(row.vencimento), html: true },
          { key: 'fornecedor', label: 'Fornecedor', render: (row) => esc(row.fornecedor), html: true },
          { key: 'descricao', label: 'Descricao', render: (row) => esc(row.descricao), html: true },
          { key: 'categoria', label: 'Categoria', render: (row) => esc(row.categoria), html: true },
          { key: 'status', label: 'Status', render: (row) => esc(row.status), html: true },
          { key: 'valor', label: 'Valor', align: 'right', render: (row) => `<strong>${fmtMoney(row.valor)}</strong>`, html: true },
        ],
        rows: contas,
        empty: 'Nenhuma conta a pagar encontrada.',
      })}
    </section>
  `;
  return renderPrintDocument({ title: 'Contas a Pagar', subtitle: mes ? mesLabel(mes) : 'Todas', body, compact: true });
}

function renderContasReceberHtml({ contas = [] } = {}) {
  const total = contas.reduce((acc, conta) => acc + Number(conta.saldo || 0), 0);
  const body = `
    <section class="section">
      ${renderKpis([
        { label: 'Saldo a receber', htmlValue: fmtMoney(total) },
        { label: 'Ordens', value: String(contas.length) },
      ])}
    </section>
    <section class="section">
      <h2 class="section-title">OS com saldo aberto</h2>
      ${renderTable({
        columns: [
          { key: 'prazoentrega', label: 'Prazo', render: (row) => fmtDate(row.prazoentrega), html: true },
          { key: 'numero', label: 'OS', render: (row) => esc(row.numero), html: true },
          { key: 'clientenome', label: 'Cliente', render: (row) => esc(row.clientenome), html: true },
          { key: 'status', label: 'Status', render: (row) => esc(row.status), html: true },
          { key: 'valortotal', label: 'Total', align: 'right', render: (row) => fmtMoney(row.valortotal), html: true },
          { key: 'recebido', label: 'Recebido', align: 'right', render: (row) => fmtMoney(row.recebido), html: true },
          { key: 'saldo', label: 'Saldo', align: 'right', render: (row) => `<strong>${fmtMoney(row.saldo)}</strong>`, html: true },
        ],
        rows: contas,
        empty: 'Nenhuma OS com saldo aberto.',
      })}
    </section>
  `;
  return renderPrintDocument({ title: 'Contas a Receber', subtitle: 'OS abertas', body, compact: true });
}

module.exports = {
  renderContasPagarHtml,
  renderContasReceberHtml,
  renderDreHtml,
  renderResumoFinanceiroHtml,
};
