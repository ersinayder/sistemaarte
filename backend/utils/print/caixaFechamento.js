const { agruparPorPagamento } = require('../../domain/pagamentosRules');
const {
  esc,
  fmtDate,
  fmtMoney,
  renderKpis,
  renderPrintDocument,
  renderTable,
} = require('./base');

function tipoKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isEntrada(row) {
  return tipoKey(row?.tipo) === 'entrada';
}

function isSaida(row) {
  return tipoKey(row?.tipo) === 'saida';
}

function soma(rows) {
  return Math.round(rows.reduce((acc, row) => acc + Number(row.valor || 0), 0) * 100) / 100;
}

function montarFechamentoCaixa({ data, lancamentos = [] } = {}) {
  const rows = Array.isArray(lancamentos) ? lancamentos : [];
  const entradas = rows.filter(isEntrada);
  const saidas = rows.filter(isSaida);
  const entrada = soma(entradas);
  const saida = soma(saidas);
  return {
    data,
    lancamentos: rows,
    entradas,
    saidas,
    entrada,
    saida,
    saldo: Math.round((entrada - saida) * 100) / 100,
    entradasPorPagamento: agruparPorPagamento(entradas).sort((a, b) => b.total - a.total),
  };
}

function renderLancamentoDescricao(row) {
  const detalhes = [row.descricao, row.itens_resumo].filter(Boolean).map(esc).join('<br><small>');
  return detalhes.includes('<small>') ? `${detalhes}</small>` : detalhes || '&mdash;';
}

function renderFechamentoCaixaHtml({ data, fechamento, usuario } = {}) {
  const f = fechamento || montarFechamentoCaixa({ data, lancamentos: [] });
  const body = `
    <section class="section">
      <div class="grid-3">
        <div class="field"><span class="label">Data</span><span class="value">${fmtDate(data || f.data)}</span></div>
        <div class="field"><span class="label">Responsavel</span><span class="value">${esc(usuario?.name || usuario?.username || 'Caixa')}</span></div>
        <div class="field"><span class="label">Lancamentos</span><span class="value">${esc(f.lancamentos.length)}</span></div>
      </div>
      ${renderKpis([
        { label: 'Entradas', htmlValue: fmtMoney(f.entrada), tone: 'good' },
        { label: 'Saidas', htmlValue: fmtMoney(f.saida), tone: f.saida > 0 ? 'bad' : '' },
        { label: 'Saldo do Dia', htmlValue: fmtMoney(f.saldo), tone: f.saldo >= 0 ? 'good' : 'bad' },
        { label: 'Conferencia', value: 'Assinar' },
      ])}
    </section>

    <section class="section">
      <h2 class="section-title">Entradas por forma de pagamento</h2>
      ${renderTable({
        columns: [
          { key: 'label', label: 'Forma', render: (row) => esc(row.label) },
          { key: 'total', label: 'Total', align: 'right', render: (row) => `<strong>${fmtMoney(row.total)}</strong>` },
        ],
        rows: f.entradasPorPagamento,
        empty: 'Nenhuma entrada no periodo.',
      })}
    </section>

    <section class="section">
      <h2 class="section-title">Lancamentos do dia</h2>
      ${renderTable({
        columns: [
          { key: 'tipo', label: 'Tipo', render: (row) => esc(row.tipo) },
          { key: 'categoria', label: 'Categoria', render: (row) => esc(row.categoria || 'Outros') },
          { key: 'pagamento', label: 'Pagamento', render: (row) => esc(row.pagamento) },
          { key: 'ordemnumero', label: 'OS', render: (row) => esc(row.ordemnumero || '') },
          { key: 'descricao', label: 'Descricao', render: renderLancamentoDescricao },
          { key: 'valor', label: 'Valor', align: 'right', render: (row) => `<strong>${isEntrada(row) ? '+' : '-'} ${fmtMoney(row.valor)}</strong>` },
        ],
        rows: f.lancamentos,
        empty: 'Nenhum lancamento no dia.',
      })}
    </section>

    <section class="section">
      <div class="note">Conferir dinheiro, comprovantes de cartao/link e comprovantes Pix antes de assinar este fechamento.</div>
    </section>

    <section class="signatures">
      <div class="signature-line">Responsavel pelo Caixa</div>
      <div class="signature-line">Conferencia</div>
    </section>
  `;

  return renderPrintDocument({
    title: 'Fechamento Diario de Caixa',
    subtitle: fmtDate(data || f.data),
    body,
    footer: `Fechamento diario | ${fmtDate(data || f.data)}`,
    compact: true,
  });
}

module.exports = {
  montarFechamentoCaixa,
  renderFechamentoCaixaHtml,
};
