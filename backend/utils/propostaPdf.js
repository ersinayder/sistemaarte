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

const PROPOSTA_PRINT_STYLES = `
  .proposta-print .doc-header.has-brand-details { grid-template-columns: minmax(0, 118mm) minmax(0, 1fr); gap: 8mm; align-items: center; padding-bottom: 7mm; }
  .proposta-print .doc-header.has-brand-details .brand { grid-template-columns: 33mm minmax(0, 1fr); gap: 5mm; align-items: center; }
  .proposta-print .doc-header.has-brand-details .brand-logo { max-width: 31mm; max-height: 22mm; }
  .proposta-print .brand-details { color: #26364a; font-size: 10.6px; line-height: 1.46; }
  .proposta-print .brand-line { display: block; margin-top: .45mm; overflow-wrap: anywhere; }
  .proposta-print .brand-main { margin: 0 0 .8mm; color: #111827; font-size: 14px; font-weight: 900; letter-spacing: .03em; text-transform: uppercase; line-height: 1.08; }
  .proposta-print .brand-legal { color: #334155; font-size: 9.6px; font-weight: 800; }
  .proposta-print .brand-doc { color: #111827; font-size: 9.8px; font-weight: 900; }
  .proposta-print .brand-address { color: #334155; }
  .proposta-print .brand-contact { color: #111827; font-weight: 900; }
  .proposta-print .doc-title h1 { font-size: 22px; line-height: 1.14; }
  .proposta-print .doc-title .subtitle { color: #111827; font-size: 13px; font-weight: 900; }
  .proposta-print .section { margin-top: 7mm; }
  .proposta-print .note { padding: 4mm; line-height: 1.55; }
`;

function renderEmpresaHeaderDetails(empresa = {}) {
  const nome = empresa.nomefantasia || empresa.razaosocial || 'Arte e Molduras';
  const razao = empresa.razaosocial && empresa.razaosocial !== nome ? empresa.razaosocial : '';
  const cnpj = empresa.cnpj ? `CNPJ ${formatCnpj(empresa.cnpj)}` : '';
  const contato = empresa.telefone ? `Tel. ${formatPhone(empresa.telefone)}` : '';
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
    `<strong class="brand-line brand-main">${esc(nome)}</strong>`,
    razao ? `<span class="brand-line brand-legal">${esc(razao)}</span>` : '',
    cnpj ? `<span class="brand-line brand-doc">${cnpj}</span>` : '',
    endereco1 || endereco2 ? `<span class="brand-line brand-address">${esc([endereco1, endereco2].filter(Boolean).join(' - '))}</span>` : '',
    cidade || cep ? `<span class="brand-line brand-address">${esc([cidade, cep].filter(Boolean).join(' - '))}</span>` : '',
    contato ? `<span class="brand-line brand-contact">${contato}</span>` : '',
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
    documentClass: 'proposta-print',
    extraStyles: PROPOSTA_PRINT_STYLES,
    autoPrint: true,
  });
}

module.exports = { renderPropostaHtml };
