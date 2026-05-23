const {
  esc,
  fmtDate,
  fmtMoney,
  renderPrintDocument,
  renderTable,
} = require('./print/base');

function subtotalItem(item) {
  return Number(item?.quantidade || 1) * Number(item?.preco_unitario || 0);
}

function renderPropostaHtml({ proposta, itens = [] }) {
  const rows = itens.map((item, idx) => ({
    ...item,
    idx: idx + 1,
    subtotal: subtotalItem(item),
  }));

  const body = `
    <section class="section">
      <div class="grid-3">
        <div class="field"><span class="label">Numero</span><span class="value">${esc(proposta.numero)}</span></div>
        <div class="field"><span class="label">Cliente</span><span class="value">${esc(proposta.clientenome)}</span></div>
        <div class="field"><span class="label">Data</span><span class="value">${fmtDate(proposta.createdat)}</span></div>
        <div class="field"><span class="label">Status</span><span class="value">${esc(proposta.status)}</span></div>
        <div class="field"><span class="label">Prazo previsto</span><span class="value">${fmtDate(proposta.prazoentrega)}</span></div>
        <div class="field"><span class="label">Origem</span><span class="value">${esc(proposta.origem || 'Balcao')}</span></div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Itens da proposta</h2>
      ${renderTable({
        columns: [
          { key: 'idx', label: '#', align: 'right', render: (item) => esc(item.idx) },
          { key: 'nome', label: 'Descricao', render: (item) => esc(item.nome) },
          { key: 'quantidade', label: 'Qtd.', align: 'right', render: (item) => esc(Number(item.quantidade || 1).toLocaleString('pt-BR')) },
          { key: 'preco_unitario', label: 'Unitario', align: 'right', render: (item) => fmtMoney(item.preco_unitario) },
          { key: 'subtotal', label: 'Subtotal', align: 'right', render: (item) => `<strong>${fmtMoney(item.subtotal)}</strong>` },
        ],
        rows,
        empty: 'Nenhum item informado.',
      })}
    </section>

    <section class="section">
      <div style="display:flex;justify-content:flex-end">
        <div style="min-width:70mm;border:2px solid #111827;border-radius:6px;padding:4mm">
          <span class="label">Total da proposta</span>
          <strong style="display:block;margin-top:2mm;text-align:right;font-size:24px;color:#111827">${fmtMoney(proposta.valortotal)}</strong>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Observacoes e condicoes</h2>
      <div class="note">${esc(proposta.observacoes || 'Proposta sujeita a confirmacao de medidas, materiais e disponibilidade.')}</div>
    </section>
  `;

  return renderPrintDocument({
    title: 'PROPOSTA COMERCIAL',
    subtitle: proposta.numero || '',
    body,
    footer: '<strong>Arte e Molduras</strong> | Proposta valida por 7 dias. A producao inicia apos aprovacao e abertura da Ordem de Servico.',
  });
}

module.exports = { renderPropostaHtml };
