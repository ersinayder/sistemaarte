const {
  esc,
  fmtDate,
  fmtMoney,
  renderKpis,
  renderPrintDocument,
  renderTable,
} = require("./base");

const extratoStyles = `
  .cliente-extrato-print { font-size: 13px; line-height: 1.38; }
  .cliente-extrato-print .sheet { padding: 9mm 10mm; }
  .cliente-extrato-print .doc-header { grid-template-columns: 36mm 1fr; gap: 8mm; padding-bottom: 5mm; }
  .cliente-extrato-print h1 { font-size: 20px; letter-spacing: .05em; }
  .cliente-extrato-print .section { margin-top: 5mm; }
  .cliente-extrato-print .section-title { font-size: 11px; letter-spacing: .06em; color: #0f172a; margin-bottom: 2mm; }
  .cliente-extrato-print .label,
  .cliente-extrato-print th { font-size: 10px; letter-spacing: .04em; }
  .cliente-extrato-print .value { font-size: 13px; }
  .cliente-extrato-print .kpis { gap: 2.5mm; margin-top: 4mm; }
  .cliente-extrato-print .kpi { padding: 2.7mm; }
  .cliente-extrato-print .kpi strong { font-size: 17px; }
  .cliente-extrato-print table { font-size: 12.25px; }
  .cliente-extrato-print th,
  .cliente-extrato-print td { padding: 2.4mm 2mm; }
  .cliente-extrato-print .pix-box {
    margin-top: 5mm;
    padding: 3mm 4mm;
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 4px;
    font-size: 12px;
  }
`;

function renderExtratoContaHtml({ cliente, ordens = [], totalEmAberto = 0, chavePix, usuario } = {}) {
  const body = `
    <section class="section">
      <div class="grid-3">
        <div class="field"><span class="label">Cliente</span><span class="value">${esc(cliente?.name || '')}</span></div>
        <div class="field"><span class="label">Telefone</span><span class="value">${esc(cliente?.phone || 'Não informado')}</span></div>
        <div class="field"><span class="label">Emissor</span><span class="value">${esc(usuario?.name || usuario?.username || 'Sistema')}</span></div>
      </div>
      ${renderKpis([
        { label: 'Ordens em Aberto', value: String(ordens.length) },
        { label: 'Total Devido', htmlValue: fmtMoney(totalEmAberto), tone: 'bad' },
      ])}
    </section>

    <section class="section">
      <h2 class="section-title">Detalhamento dos Serviços Entregues</h2>
      ${renderTable({
        columns: [
          { key: 'numero', label: 'OS', render: (row) => `<strong>${esc(row.numero)}</strong>`, html: true },
          { key: 'createdat', label: 'Data', render: (row) => fmtDate(row.createdat) },
          { key: 'servico', label: 'Serviço', render: (row) => esc(row.servico) },
          { key: 'valortotal', label: 'Total', align: 'right', render: (row) => fmtMoney(row.valortotal) },
          { key: 'recebido', label: 'Pago', align: 'right', render: (row) => fmtMoney(row.recebido) },
          { key: 'saldo', label: 'Saldo Devedor', align: 'right', render: (row) => `<strong>${fmtMoney(row.saldo)}</strong>`, html: true },
        ],
        rows: ordens,
      })}
    </section>

    ${chavePix ? `
      <div class="pix-box">
        <strong>Chave Pix para Pagamento:</strong> ${esc(chavePix)}
      </div>
    ` : ''}

    <div style="margin-top: 10mm; font-size: 11px; text-align: center; color: #64748b;">
      Documento operacional emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.
    </div>
  `;

  return renderPrintDocument({
    title: `Extrato de Conta - ${cliente?.name || 'Cliente'}`,
    documentType: 'EXTRATO DE CONTA EM ABERTO',
    documentId: `CLI-${cliente?.id || ''}`,
    extraStyles: extratoStyles,
    body,
  });
}

function renderReciboAcertoHtml({ cliente, acerto, ordensQuitadas = [], usuario } = {}) {
  const body = `
    <section class="section">
      <div class="grid-3">
        <div class="field"><span class="label">Cliente</span><span class="value">${esc(cliente?.name || '')}</span></div>
        <div class="field"><span class="label">Data do Acerto</span><span class="value">${fmtDate(acerto?.createdat || new Date())}</span></div>
        <div class="field"><span class="label">Operador</span><span class="value">${esc(usuario?.name || usuario?.username || 'Caixa')}</span></div>
      </div>
      ${renderKpis([
        { label: 'Forma de Pagamento', value: esc(acerto?.pagamento || '') },
        { label: 'Total Quitado', htmlValue: fmtMoney(acerto?.valor_total || 0), tone: 'good' },
      ])}
    </section>

    <section class="section">
      <h2 class="section-title">Ordens de Serviço Quitadas no Acerto #${esc(acerto?.id || '')}</h2>
      ${renderTable({
        columns: [
          { key: 'numero', label: 'OS', render: (row) => `<strong>${esc(row.numero)}</strong>`, html: true },
          { key: 'servico', label: 'Serviço', render: (row) => esc(row.servico) },
          { key: 'valor', label: 'Valor Quitado', align: 'right', render: (row) => fmtMoney(row.valor || row.saldo), html: true },
        ],
        rows: ordensQuitadas,
      })}
    </section>

    <div style="margin-top: 10mm; font-size: 11px; text-align: center; color: #64748b;">
      Recibo de quitação de fiado emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.
    </div>
  `;

  return renderPrintDocument({
    title: `Recibo de Acerto #${acerto?.id || ''} - ${cliente?.name || 'Cliente'}`,
    documentType: 'RECIBO DE ACERTO DE CONTAS',
    documentId: `ACERTO-${acerto?.id || ''}`,
    extraStyles: extratoStyles,
    body,
  });
}

module.exports = {
  renderExtratoContaHtml,
  renderReciboAcertoHtml,
};
