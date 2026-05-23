const {
  esc,
  fmtDate,
  fmtMoney,
  renderKpis,
  renderPrintDocument,
  renderTable,
} = require('./base');

function itemSubtotal(item) {
  return Number(item?.subtotal ?? Number(item?.quantidade || 0) * Number(item?.preco_unitario || 0)) || 0;
}

function renderField(label, value) {
  return `
    <div class="field">
      <span class="label">${esc(label)}</span>
      <span class="value">${value == null || value === '' ? '&mdash;' : esc(value)}</span>
    </div>
  `;
}

function renderTextSection(title, text) {
  if (!text) return '';
  return `
    <section class="section">
      <h2 class="section-title">${esc(title)}</h2>
      <div class="note">${esc(text)}</div>
    </section>
  `;
}

function renderOrdemServicoHtml({ ordem = {}, itens = [], resumo = {} } = {}) {
  const total = Number(resumo.total ?? ordem.valortotal ?? 0);
  const recebido = Number(resumo.recebido ?? ordem.valorrecebido ?? 0);
  const saldo = Number(resumo.saldo ?? ordem.saldoaberto ?? Math.max(0, total - recebido));

  const body = `
    <section class="section">
      <div class="grid-3">
        ${renderField('Numero', ordem.numero)}
        ${renderField('Status', ordem.status)}
        ${renderField('Prioridade', ordem.prioridade || 'Normal')}
        ${renderField('Abertura', fmtDate(ordem.createdat))}
        ${renderField('Prazo', fmtDate(ordem.prazoentrega))}
        ${renderField('Responsavel', ordem.criadopornome)}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Cliente</h2>
      <div class="grid-3">
        ${renderField('Nome', ordem.clientenome)}
        ${renderField('Telefone', ordem.clientetelefone)}
        ${renderField('CPF/CNPJ', ordem.clientecpf)}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Servico</h2>
      <div class="grid">
        ${renderField('Tipo', ordem.servico)}
        ${renderField('Pagamento previsto', ordem.pagamento)}
      </div>
    </section>

    ${renderTextSection('Descricao', ordem.descricao)}

    <section class="section">
      <h2 class="section-title">Itens</h2>
      ${renderTable({
        columns: [
          { key: 'nome', label: 'Item', render: (item) => esc(item.nome) },
          { key: 'quantidade', label: 'Qtd.', align: 'right', render: (item) => esc(Number(item.quantidade || 0).toLocaleString('pt-BR')) },
          { key: 'preco_unitario', label: 'Unitario', align: 'right', render: (item) => fmtMoney(item.preco_unitario) },
          { key: 'subtotal', label: 'Subtotal', align: 'right', render: (item) => fmtMoney(itemSubtotal(item)) },
        ],
        rows: itens,
        empty: 'Nenhum item informado.',
      })}
    </section>

    <section class="section">
      <h2 class="section-title">Financeiro</h2>
      ${renderKpis([
        { label: 'Total', htmlValue: fmtMoney(total) },
        { label: 'Recebido', htmlValue: fmtMoney(recebido), tone: recebido > 0 ? 'good' : '' },
        { label: 'Saldo', htmlValue: fmtMoney(saldo), tone: saldo > 0 ? 'bad' : 'good' },
        { label: 'Entrada', htmlValue: fmtMoney(ordem.valorentrada || 0) },
      ])}
    </section>

    ${renderTextSection('Observacoes', ordem.observacoes)}

    <section class="signatures">
      <div class="signature-line">Assinatura do Cliente</div>
      <div class="signature-line">Responsavel pela Entrega</div>
    </section>
  `;

  return renderPrintDocument({
    title: 'Ordem de Servico',
    subtitle: ordem.numero || '',
    body,
    footer: `${esc(ordem.numero || 'OS')} | Documento para conferencia e assinatura`,
  });
}

module.exports = { renderOrdemServicoHtml };
