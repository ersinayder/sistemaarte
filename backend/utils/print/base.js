const fs = require('fs');
const path = require('path');

let logoCache = null;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(value) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, '&nbsp;');
}

function fmtDate(value) {
  if (!value) return '&mdash;';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return esc(value);
  return `${day}/${m}/${y}`;
}

function fmtDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function logoDataUri() {
  if (logoCache !== null) return logoCache;
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'dist', 'logo preta.png'),
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'logo preta.png'),
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'dist', 'logo.png'),
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'logo.png'),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    logoCache = '';
    return logoCache;
  }
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.svg'
    ? 'image/svg+xml'
    : ext === '.webp'
      ? 'image/webp'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : 'image/png';
  logoCache = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  return logoCache;
}

function renderKpis(items = []) {
  const html = items.map((item) => `
    <div class="kpi">
      <span>${esc(item.label)}</span>
      <strong class="${esc(item.tone || '')}">${item.htmlValue || esc(item.value)}</strong>
    </div>
  `).join('');
  return `<div class="kpis">${html}</div>`;
}

function renderTable({ columns = [], rows = [], empty = 'Sem registros.' }) {
  const head = columns.map((col) => `<th class="${col.align === 'right' ? 'right' : ''}">${esc(col.label)}</th>`).join('');
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((col) => {
      const raw = typeof col.render === 'function' ? col.render(row) : row[col.key];
      return `<td class="${col.align === 'right' ? 'right' : ''}">${raw == null ? '&mdash;' : raw}</td>`;
    }).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${columns.length || 1}">${esc(empty)}</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderPrintDocument({
  title,
  subtitle = '',
  body = '',
  footer = '',
  documentClass = '',
  compact = false,
} = {}) {
  const logo = logoDataUri();
  const generatedAt = fmtDateTime();
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; color: #17212b; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; font-size: ${compact ? '11px' : '12px'}; }
  .actions { width: 210mm; margin: 12px auto; display: flex; justify-content: flex-end; }
  .print-btn { border: 0; border-radius: 6px; background: #0f3460; color: #fff; padding: 9px 14px; font-weight: 800; cursor: pointer; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; padding: ${compact ? '10mm' : '12mm'}; background: #fff; }
  .doc-header { display: grid; grid-template-columns: 44mm 1fr; gap: 10mm; align-items: center; padding-bottom: 6mm; border-bottom: 2px solid #111827; }
  .brand { display: flex; align-items: center; justify-content: flex-start; min-height: 25mm; }
  .brand-logo { max-width: 40mm; max-height: 24mm; object-fit: contain; display: block; }
  .brand-fallback { font-size: 15px; font-weight: 900; letter-spacing: .02em; text-transform: uppercase; }
  .doc-title { text-align: right; }
  h1 { margin: 0; font-size: ${compact ? '18px' : '22px'}; text-transform: uppercase; letter-spacing: .08em; color: #111827; }
  .subtitle { margin-top: 4px; color: #64748b; font-weight: 700; }
  .section { margin-top: 6mm; }
  .section-title { margin: 0 0 2.5mm; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #64748b; font-weight: 900; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm 6mm; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm 5mm; }
  .field { border-bottom: 1px solid #e5e7eb; padding-bottom: 2mm; }
  .label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; font-weight: 800; }
  .value { display: block; margin-top: 1mm; font-weight: 800; color: #111827; overflow-wrap: anywhere; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-top: 5mm; }
  .kpi { border: 1px solid #dbe3ea; border-radius: 6px; padding: 3mm; background: #f8fafc; }
  .kpi span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; font-weight: 800; }
  .kpi strong { display: block; margin-top: 1.5mm; font-size: 16px; color: #111827; font-variant-numeric: tabular-nums; }
  .kpi strong.good { color: #166534; }
  .kpi strong.bad { color: #991b1b; }
  table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
  th { background: #f1f5f9; color: #334155; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; text-align: left; }
  th, td { padding: 2.2mm 2.5mm; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .right { text-align: right; }
  .empty { text-align: center; color: #94a3b8; padding: 8mm; }
  .note { border: 1px solid #dbe3ea; border-radius: 6px; padding: 3mm; background: #f8fafc; white-space: pre-wrap; line-height: 1.45; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 16mm; margin-top: 12mm; }
  .signature-line { border-top: 1px solid #111827; padding-top: 2mm; text-align: center; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .doc-footer { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid #e5e7eb; color: #64748b; font-size: 10px; text-align: center; }
  @page { size: A4; margin: 0; }
  @media print {
    html, body { background: #fff; }
    .actions, .no-print { display: none !important; }
    .sheet { width: auto; min-height: auto; margin: 0; box-shadow: none; }
  }
</style>
</head>
<body class="${esc(documentClass)}">
  <div class="actions no-print"><button class="print-btn" onclick="window.print()">Imprimir / salvar PDF</button></div>
  <main class="sheet">
    <header class="doc-header">
      <div class="brand">
        ${logo ? `<img class="brand-logo" src="${logo}" alt="Arte e Molduras">` : '<div class="brand-fallback">Arte e Molduras</div>'}
      </div>
      <div class="doc-title">
        <h1>${esc(title)}</h1>
        ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
      </div>
    </header>
    ${body}
    <footer class="doc-footer">${footer || `Gerado em ${generatedAt}`}</footer>
  </main>
</body>
</html>`;
}

module.exports = {
  esc,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  logoDataUri,
  renderKpis,
  renderPrintDocument,
  renderTable,
};
