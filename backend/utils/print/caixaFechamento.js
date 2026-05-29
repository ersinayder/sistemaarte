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
  const conteudo = detalhes.includes('<small>') ? `${detalhes}</small>` : detalhes || '&mdash;';
  return `<div class="daily-ledger-description">${conteudo}</div>`;
}

function renderLancamentoMovimento(row) {
  return `
    <strong>${esc(row.tipo)}</strong>
    <small>${esc(row.categoria || 'Outros')}</small>
  `;
}

const fechamentoCaixaStyles = `
  .caixa-fechamento-print { font-size: 13px; line-height: 1.38; }
  .caixa-fechamento-print .sheet { padding: 9mm 10mm; }
  .caixa-fechamento-print .doc-header { grid-template-columns: 36mm 1fr; gap: 8mm; padding-bottom: 5mm; }
  .caixa-fechamento-print .brand { min-height: 20mm; }
  .caixa-fechamento-print .brand-logo { max-width: 34mm; max-height: 20mm; }
  .caixa-fechamento-print h1 { font-size: 20px; letter-spacing: .05em; }
  .caixa-fechamento-print .section { margin-top: 5mm; }
  .caixa-fechamento-print .section-title { font-size: 11px; letter-spacing: .06em; color: #0f172a; }
  .caixa-fechamento-print .label,
  .caixa-fechamento-print th { font-size: 10px; letter-spacing: .04em; }
  .caixa-fechamento-print .value { font-size: 13px; }
  .caixa-fechamento-print .kpis { gap: 2.5mm; margin-top: 4mm; }
  .caixa-fechamento-print .kpi { padding: 2.7mm; }
  .caixa-fechamento-print .kpi strong { font-size: 17px; }
  .caixa-fechamento-print table { font-size: 12.25px; }
  .caixa-fechamento-print th,
  .caixa-fechamento-print td { padding: 2.4mm 2mm; }
  .caixa-fechamento-print .daily-ledger-table th:nth-child(1),
  .caixa-fechamento-print .daily-ledger-table td:nth-child(1) { width: 18%; }
  .caixa-fechamento-print .daily-ledger-table th:nth-child(2),
  .caixa-fechamento-print .daily-ledger-table td:nth-child(2) { width: 14%; }
  .caixa-fechamento-print .daily-ledger-table th:nth-child(3),
  .caixa-fechamento-print .daily-ledger-table td:nth-child(3) { width: 12%; }
  .caixa-fechamento-print .daily-ledger-table th:nth-child(5),
  .caixa-fechamento-print .daily-ledger-table td:nth-child(5) { width: 18%; white-space: nowrap; }
  .caixa-fechamento-print .daily-ledger-table td { page-break-inside: avoid; }
  .caixa-fechamento-print .daily-ledger-table small { display: block; margin-top: 1mm; color: #475569; font-size: 10.5px; line-height: 1.25; }
  .caixa-fechamento-print .daily-ledger-description { max-width: 100%; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
  .caixa-fechamento-print .note { font-size: 12.5px; }
  .caixa-fechamento-print .signature-line,
  .caixa-fechamento-print .doc-footer { font-size: 11px; }
`;

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
          { key: 'label', label: 'Forma', render: (row) => esc(row.label), html: true },
          { key: 'total', label: 'Total', align: 'right', render: (row) => `<strong>${fmtMoney(row.total)}</strong>`, html: true },
        ],
        rows: f.entradasPorPagamento,
        empty: 'Nenhuma entrada no periodo.',
      })}
    </section>

    <section class="section">
      <h2 class="section-title">Lancamentos do dia</h2>
      ${renderTable({
        columns: [
          { key: 'movimento', label: 'Movimento', render: renderLancamentoMovimento, html: true },
          { key: 'pagamento', label: 'Pagamento', render: (row) => esc(row.pagamento), html: true },
          { key: 'ordemnumero', label: 'OS', render: (row) => esc(row.ordemnumero || ''), html: true },
          { key: 'descricao', label: 'Descricao', render: renderLancamentoDescricao, html: true },
          { key: 'valor', label: 'Valor', align: 'right', render: (row) => `<strong>${isEntrada(row) ? '+' : '-'} ${fmtMoney(row.valor)}</strong>`, html: true },
        ],
        rows: f.lancamentos,
        empty: 'Nenhum lancamento no dia.',
        tableClass: 'daily-ledger-table',
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
    documentClass: 'caixa-fechamento-print',
    compact: true,
    extraStyles: fechamentoCaixaStyles,
  });
}

module.exports = {
  montarFechamentoCaixa,
  renderFechamentoCaixaHtml,
};
