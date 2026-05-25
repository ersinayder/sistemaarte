const {
  esc,
  fmtDate,
  fmtMoney,
  logoDataUri,
  renderPrintDocument,
} = require('./base');

function itemSubtotal(item) {
  return Number(item?.subtotal ?? Number(item?.quantidade || 0) * Number(item?.preco_unitario || 0)) || 0;
}

function renderBoxField(label, value, className = '') {
  return `
    <div class="os-box-field ${esc(className)}">
      <span class="label">${esc(label)}</span>
      <div class="os-box-value">${value == null || value === '' ? '&nbsp;' : esc(value)}</div>
    </div>
  `;
}

function renderMoneyCard(label, value, tone = '') {
  return `
    <div class="finance-card">
      <span>${esc(label)}</span>
      <strong class="${esc(tone)}">${fmtMoney(value)}</strong>
    </div>
  `;
}

function renderItemsBox(itens = []) {
  const rows = itens.length
    ? itens.map((item) => `
      <tr>
        <td>${esc(item.nome)}</td>
        <td class="right">${esc(Number(item.quantidade || 0).toLocaleString('pt-BR'))}</td>
        <td class="right">${fmtMoney(item.preco_unitario)}</td>
        <td class="right">${fmtMoney(itemSubtotal(item))}</td>
      </tr>
    `).join('')
    : '<tr><td class="empty" colspan="4">Nenhum item informado.</td></tr>';

  return `
    <div class="os-items-box">
      <table class="os-items-table">
        <thead>
          <tr>
            <th>Descricao</th>
            <th class="right">Qtd.</th>
            <th class="right">Unit.</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

const ORDEM_SERVICO_A5_STYLES = `
  .ordem-servico-print { font-size: 13px; line-height: 1.34; }
  .ordem-servico-print .actions { width: 148mm; margin: 8px auto; }
  .ordem-servico-print .sheet { width: 148mm; min-height: 210mm; padding: 6mm; }
  .ordem-servico-print .sheet > .doc-header,
  .ordem-servico-print .sheet > .doc-footer { display: none; }
  .ordem-servico-print h1 { font-size: 17px; letter-spacing: .06em; }
  .ordem-servico-print .section { margin-top: 4mm; }
  .ordem-servico-print .section-title { margin-bottom: 1.5mm; font-size: 9.5px; letter-spacing: .06em; color: #475569; }
  .ordem-servico-print .grid,
  .ordem-servico-print .grid-3 { grid-template-columns: repeat(2, 1fr); gap: 2.3mm 4mm; }
  .ordem-servico-print .field { padding-bottom: 1.4mm; }
  .ordem-servico-print .label,
  .ordem-servico-print th,
  .ordem-servico-print .kpi span { font-size: 8.5px; letter-spacing: .04em; }
  .ordem-servico-print .value { font-size: 13px; margin-top: .5mm; }
  .ordem-servico-print .kpis { grid-template-columns: repeat(2, 1fr); gap: 2mm; margin-top: 2.5mm; }
  .ordem-servico-print .kpi { padding: 2mm 2.3mm; border-radius: 5px; }
  .ordem-servico-print .kpi strong { font-size: 15px; margin-top: .8mm; }
  .ordem-servico-print table { font-size: 11.5px; margin-top: 1.5mm; }
  .ordem-servico-print th,
  .ordem-servico-print td { padding: 1.7mm 1.8mm; }
  .ordem-servico-print th:nth-child(1),
  .ordem-servico-print td:nth-child(1) { width: 55%; }
  .ordem-servico-print th:nth-child(2),
  .ordem-servico-print td:nth-child(2) { width: 10%; white-space: nowrap; }
  .ordem-servico-print th:nth-child(3),
  .ordem-servico-print td:nth-child(3),
  .ordem-servico-print th:nth-child(4),
  .ordem-servico-print td:nth-child(4) { width: 17.5%; white-space: nowrap; }
  .ordem-servico-print .note { padding: 2mm; line-height: 1.32; }
  .ordem-servico-print .signatures { gap: 10mm; margin-top: 8mm; }
  .ordem-servico-print .signature-line { font-size: 8.5px; padding-top: 1.5mm; letter-spacing: .04em; }
  .ordem-servico-print .doc-footer { margin-top: 5mm; padding-top: 2mm; font-size: 8.5px; }
  .ordem-servico-print .os-form-frame { border: 1px solid #cbd5e1; border-top: 4px solid #111827; border-radius: 8px; min-height: 198mm; padding: 6.5mm 7mm 4.5mm; display: flex; flex-direction: column; }
  .ordem-servico-print .os-form-header { display: grid; grid-template-columns: 35mm minmax(0, 1fr); gap: 5mm; align-items: center; padding-bottom: 4mm; border-bottom: 1px solid #dbe3ea; }
  .ordem-servico-print .os-logo { display: flex; align-items: center; justify-content: flex-start; min-height: 25mm; }
  .ordem-servico-print .brand-logo { max-width: 34mm; max-height: 23mm; object-fit: contain; display: block; }
  .ordem-servico-print .brand-fallback { font-size: 15px; font-weight: 900; text-transform: uppercase; }
  .ordem-servico-print .os-form-title { text-align: right; }
  .ordem-servico-print .os-title-band { display: flex; align-items: center; justify-content: flex-end; gap: 2mm; margin-bottom: 2.5mm; white-space: nowrap; }
  .ordem-servico-print .os-form-title h1 { flex: 0 1 auto; margin: 0; font-size: 16px; line-height: 1.05; letter-spacing: .045em; white-space: nowrap; color: #111827; }
  .ordem-servico-print .os-number-badge { flex: 0 0 auto; display: inline-block; min-width: 26mm; border-radius: 6px; background: #111827; padding: 1.3mm 2.5mm; text-align: center; font-size: 16px; font-weight: 900; color: #fff; }
  .ordem-servico-print .os-date-row { display: grid; grid-template-columns: 1fr 1fr; gap: 2.2mm; margin-top: 1mm; }
  .ordem-servico-print .os-mini-field .label { text-align: left; }
  .ordem-servico-print .os-mini-field .os-box-value { min-height: 7mm; text-align: center; font-weight: 900; }
  .ordem-servico-print .os-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.45mm 2.5mm; margin-top: 2.6mm; }
  .ordem-servico-print .os-box-field { position: relative; padding-top: 3mm; }
  .ordem-servico-print .os-box-field .label { position: absolute; top: 0; left: .6mm; color: #475569; }
  .ordem-servico-print .os-box-value { min-height: 6.2mm; border: 1px solid #d7dee8; border-radius: 6px; background: #f8fafc; padding: 1mm 1.6mm; font-size: 12.2px; font-weight: 800; color: #111827; overflow-wrap: anywhere; }
  .ordem-servico-print .os-client-name { grid-column: 1 / -1; }
  .ordem-servico-print .os-items-field { margin-top: 3mm; padding-top: 3.4mm; position: relative; }
  .ordem-servico-print .os-items-field > .label { position: absolute; top: 0; left: .6mm; color: #475569; }
  .ordem-servico-print .os-items-box { border: 1px solid #d7dee8; border-radius: 7px; min-height: 50mm; overflow: hidden; }
  .ordem-servico-print .os-items-table { margin: 0; font-size: 10.4px; table-layout: fixed; }
  .ordem-servico-print .os-items-table th { background: #eef2f7; color: #334155; }
  .ordem-servico-print .os-items-table th,
  .ordem-servico-print .os-items-table td { padding: 1.55mm 1.2mm; }
  .ordem-servico-print .os-items-table th:first-child,
  .ordem-servico-print .os-items-table td:first-child { width: 65%; white-space: nowrap; font-size: 9px; }
  .ordem-servico-print .os-items-table th:nth-child(2),
  .ordem-servico-print .os-items-table td:nth-child(2) { width: 7%; white-space: nowrap; }
  .ordem-servico-print .os-items-table th:nth-child(3),
  .ordem-servico-print .os-items-table td:nth-child(3) { width: 14%; white-space: nowrap; }
  .ordem-servico-print .os-items-table th:nth-child(4),
  .ordem-servico-print .os-items-table td:nth-child(4) { width: 14%; white-space: nowrap; }
  .ordem-servico-print .finance-grid { display: grid; gap: 3mm; margin-top: 3.6mm; }
  .ordem-servico-print .finance-grid-3 { grid-template-columns: repeat(3, 1fr); }
  .ordem-servico-print .finance-card { border: 1px solid #d7dee8; border-top: 3px solid #111827; border-radius: 7px; background: #fff; padding: 2.2mm 2.3mm; min-height: 13mm; }
  .ordem-servico-print .finance-card span { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; color: #475569; font-weight: 900; }
  .ordem-servico-print .finance-card strong { display: block; margin-top: 1mm; font-size: 16px; line-height: 1; color: #111827; font-variant-numeric: tabular-nums; }
  .ordem-servico-print .finance-card strong.good { color: #009246; }
  .ordem-servico-print .finance-card strong.bad { color: #991b1b; }
  .ordem-servico-print .os-observations { margin-top: 3mm; padding-top: 3.4mm; position: relative; }
  .ordem-servico-print .os-observations > .label { position: absolute; top: 0; left: .6mm; color: #475569; }
  .ordem-servico-print .os-observations-box { border: 1px solid #d7dee8; border-radius: 7px; background: #f8fafc; min-height: 11mm; padding: 1.7mm 2mm; white-space: pre-wrap; font-weight: 700; }
  .ordem-servico-print .os-signature { margin: auto auto 4.5mm; padding-top: 8mm; text-align: center; }
  .ordem-servico-print .os-signature-line { width: 58mm; margin: 0 auto; border-top: 1.5px solid #111827; padding-top: 1.4mm; font-size: 10px; font-weight: 800; }
  .ordem-servico-print .os-legal-footer { margin: 0 -7mm -4.5mm; padding: 2.5mm 5mm; border-top: 1px solid #d7dee8; background: #f8fafc; text-align: center; font-size: 7px; line-height: 1.35; color: #334155; }
  @page { size: A5; margin: 0; }
  @media print {
    .ordem-servico-print .sheet { width: 148mm; min-height: 210mm; padding: 6mm; }
  }
`;

function renderOrdemServicoHtml({ ordem = {}, itens = [], resumo = {} } = {}) {
  const total = Number(resumo.total ?? ordem.valortotal ?? 0);
  const recebido = Number(resumo.recebido ?? ordem.valorrecebido ?? 0);
  const saldo = Number(resumo.saldo ?? ordem.saldoaberto ?? Math.max(0, total - recebido));
  const entrada = Number(ordem.valorentrada ?? resumo.entrada ?? ordem.valorrecebido ?? resumo.recebido ?? 0);
  const logo = logoDataUri();

  const body = `
    <section class="os-form-frame">
      <header class="os-form-header">
        <div class="os-logo">
          ${logo ? `<img class="brand-logo" src="${logo}" alt="Arte e Molduras">` : '<div class="brand-fallback">Arte e Molduras</div>'}
        </div>
        <div class="os-form-title">
          <div class="os-title-band">
            <h1>Ordem de Servico</h1>
            <div class="os-number-badge">${esc(ordem.numero || 'OS')}</div>
          </div>
          <div class="os-date-row">
            ${renderBoxField('Data', fmtDate(ordem.createdat), 'os-mini-field')}
            ${renderBoxField('Prazo', fmtDate(ordem.prazoentrega), 'os-mini-field')}
          </div>
        </div>
      </header>

      <div class="os-row">
        ${renderBoxField('Cliente', ordem.clientenome, 'os-client-name')}
        ${renderBoxField('CPF/CNPJ', ordem.clientecpf)}
        ${renderBoxField('Telefone', ordem.clientetelefone)}
        ${renderBoxField('Pagamento previsto', ordem.pagamento)}
        ${renderBoxField('Responsavel', ordem.criadopornome)}
      </div>

      <div class="os-items-field">
        <span class="label">Itens</span>
        ${renderItemsBox(itens)}
      </div>

      <div class="finance-grid finance-grid-3">
        ${renderMoneyCard('Total', total)}
        ${renderMoneyCard('Entrada', entrada, entrada > 0 ? 'good' : '')}
        ${renderMoneyCard('Restante', saldo, saldo > 0 ? 'bad' : 'good')}
      </div>

      <div class="os-observations">
        <span class="label">Obs</span>
        <div class="os-observations-box">${ordem.observacoes || ordem.descricao ? esc(ordem.observacoes || ordem.descricao) : '&nbsp;'}</div>
      </div>

      <div class="os-signature">
        <div class="os-signature-line">Assinatura do Cliente</div>
      </div>

      <footer class="os-legal-footer">
        Ao aprovar esta Ordem de Servico, o cliente reconhece que o servico/produto e personalizado e sob encomenda.
        A entrada/sinal cobre reserva, materiais e inicio da producao, nao sendo reembolsavel em caso de cancelamento pelo cliente apos a aprovacao.
      </footer>
    </section>
  `;

  return renderPrintDocument({
    title: 'Ordem de Servico',
    subtitle: ordem.numero || '',
    body,
    footer: `${esc(ordem.numero || 'OS')} | Documento para conferencia e assinatura`,
    documentClass: 'ordem-servico-print',
    extraStyles: ORDEM_SERVICO_A5_STYLES,
  });
}

module.exports = { renderOrdemServicoHtml };
