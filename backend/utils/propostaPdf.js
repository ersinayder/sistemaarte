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

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return esc(value);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatPhone(value) {
  const digits = onlyDigits(value);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return esc(value);
}

function formatCep(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 8) return esc(value);
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function numeroPropostaPrint(numero) {
  return String(numero || '').replace(/^PROP-/i, '');
}

function fmtPrazoProposta(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? fmtDate(raw) : esc(raw);
}

function renderEmpresaHeaderDetails(empresa = {}) {
  const nome = empresa.nomefantasia || empresa.razaosocial || 'Arte e Molduras';
  const razao = empresa.razaosocial && empresa.razaosocial !== nome ? empresa.razaosocial : '';
  const cnpj = empresa.cnpj ? `CNPJ ${formatCnpj(empresa.cnpj)}` : '';
  const contato = [
    empresa.telefone ? `Tel. ${formatPhone(empresa.telefone)}` : '',
    empresa.email ? esc(empresa.email) : '',
  ].filter(Boolean).join(' | ');
  const endereco1 = [
    empresa.logradouro,
    empresa.numero,
  ].filter(Boolean).join(', ');
  const endereco2 = [
    empresa.bairro,
  ].filter(Boolean).join('');
  const cidade = [
    empresa.municipio,
    empresa.uf,
  ].filter(Boolean).join('/');
  const cep = empresa.cep ? `CEP ${formatCep(empresa.cep)}` : '';

  const lines = [
    `<strong>${esc(nome)}</strong>`,
    razao ? `<span>${esc(razao)}</span>` : '',
    cnpj ? `<span>${cnpj}</span>` : '',
    endereco1 || endereco2 ? `<span>${esc([endereco1, endereco2].filter(Boolean).join(' - '))}</span>` : '',
    cidade || cep ? `<span>${esc([cidade, cep].filter(Boolean).join(' - '))}</span>` : '',
    contato ? `<span>${contato}</span>` : '',
  ].filter(Boolean);

  return lines.length ? lines.join('') : '';
}

function renderPropostaHtml({ proposta, itens = [], empresa = {} }) {
  const numero = numeroPropostaPrint(proposta.numero);
  const rows = itens.map((item, idx) => ({
    ...item,
    idx: idx + 1,
    subtotal: subtotalItem(item),
  }));

  const body = `
    <section class="section">
      <div class="grid-3">
        <div class="field"><span class="label">Numero</span><span class="value">${esc(numero)}</span></div>
        <div class="field"><span class="label">Cliente</span><span class="value">${esc(proposta.clientenome)}</span></div>
        <div class="field"><span class="label">Data</span><span class="value">${fmtDate(proposta.createdat)}</span></div>
        <div class="field"><span class="label">Prazo previsto</span><span class="value">${fmtPrazoProposta(proposta.prazoentrega)}</span></div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Itens da proposta</h2>
      ${renderTable({
        columns: [
          { key: 'idx', label: '#', align: 'right', render: (item) => esc(item.idx), html: true },
          { key: 'nome', label: 'Descricao', render: (item) => esc(item.nome), html: true },
          { key: 'quantidade', label: 'Qtd.', align: 'right', render: (item) => esc(Number(item.quantidade || 1).toLocaleString('pt-BR')), html: true },
          { key: 'preco_unitario', label: 'Unitario', align: 'right', render: (item) => fmtMoney(item.preco_unitario), html: true },
          { key: 'subtotal', label: 'Subtotal', align: 'right', render: (item) => `<strong>${fmtMoney(item.subtotal)}</strong>`, html: true },
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
    subtitle: numero,
    body,
    footer: '<strong>Arte e Molduras</strong> | Proposta valida por 7 dias. A producao inicia apos aprovacao e abertura da Ordem de Servico.',
    brandDetails: renderEmpresaHeaderDetails(empresa),
    autoPrint: true,
  });
}

module.exports = { renderPropostaHtml };
