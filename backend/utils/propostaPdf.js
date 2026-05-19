const fs = require('fs');
const path = require('path');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value) {
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

let logoCache = null;
function logoDataUri() {
  if (logoCache !== null) return logoCache;
  const candidates = [
    path.resolve(__dirname, '..', '..', 'frontend', 'dist', 'logo preta.png'),
    path.resolve(__dirname, '..', '..', 'frontend', 'public', 'logo preta.png'),
    path.resolve(__dirname, '..', '..', 'frontend', 'dist', 'logo.png'),
    path.resolve(__dirname, '..', '..', 'frontend', 'public', 'logo.png'),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) {
    logoCache = '';
    return logoCache;
  }
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  logoCache = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  return logoCache;
}

function renderPropostaHtml({ proposta, itens = [] }) {
  const logo = logoDataUri();
  const rows = itens.map((item, idx) => {
    const qtd = Number(item.quantidade || 1);
    const unit = Number(item.preco_unitario || 0);
    const subtotal = qtd * unit;
    return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${esc(item.nome)}</td>
        <td class="right">${qtd.toLocaleString('pt-BR')}</td>
        <td class="right">${fmt(unit)}</td>
        <td class="right strong">${fmt(subtotal)}</td>
      </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proposta ${esc(proposta.numero)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 20px 36px 28px;
    background: #fff;
    color: #1f2937;
    font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    font-size: 13px;
  }
  .sheet { max-width: 860px; margin: 0 auto; }
  .actions { position: sticky; top: 0; padding: 10px 0; text-align: right; background: #fff; }
  .print-btn {
    border: 0; border-radius: 8px; background: #0f3460; color: #fff;
    padding: 9px 14px; font-weight: 800; cursor: pointer;
  }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 14px; }
  .logo { max-height: 88px; max-width: 190px; object-fit: contain; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 22px; letter-spacing: 1.6px; color: #111827; }
  .title p { margin: 4px 0 0; color: #6b7280; font-weight: 700; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
  .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; min-height: 58px; }
  .label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; font-weight: 800; margin-bottom: 4px; }
  .value { font-weight: 800; color: #111827; }
  .section-title { margin: 18px 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #6b7280; font-weight: 900; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; }
  th { background: #f3f4f6; color: #374151; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; text-align: left; }
  th, td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .center { text-align: center; }
  .right { text-align: right; }
  .strong { font-weight: 900; }
  .total { display: flex; justify-content: flex-end; margin-top: 12px; }
  .total-box { min-width: 240px; border: 2px solid #111827; border-radius: 10px; padding: 12px 14px; }
  .total-box span { display: block; font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 800; }
  .total-box strong { display: block; margin-top: 4px; font-size: 24px; color: #111827; text-align: right; }
  .notes { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; white-space: pre-wrap; min-height: 58px; }
  .footer { margin-top: 22px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 11px; line-height: 1.5; }
  @media print {
    body { padding: 0; }
    .actions { display: none; }
    .sheet { max-width: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir / salvar PDF</button></div>
    <header class="header">
      ${logo ? `<img class="logo" src="${logo}" alt="Arte & Molduras">` : '<div></div>'}
      <div class="title">
        <h1>PROPOSTA COMERCIAL</h1>
        <p>${esc(proposta.numero)}</p>
      </div>
    </header>

    <section class="meta">
      <div class="box"><span class="label">Cliente</span><span class="value">${esc(proposta.clientenome)}</span></div>
      <div class="box"><span class="label">Data</span><span class="value">${fmtDate(proposta.createdat)}</span></div>
      <div class="box"><span class="label">Status</span><span class="value">${esc(proposta.status)}</span></div>
      <div class="box"><span class="label">Prazo previsto</span><span class="value">${fmtDate(proposta.prazoentrega)}</span></div>
    </section>

    <div class="section-title">Itens da proposta</div>
    <table>
      <thead>
        <tr><th class="center">#</th><th>Descricao</th><th class="right">Qtd.</th><th class="right">Unitario</th><th class="right">Subtotal</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5" class="center">Nenhum item informado</td></tr>'}</tbody>
    </table>

    <div class="total"><div class="total-box"><span>Total da proposta</span><strong>${fmt(proposta.valortotal)}</strong></div></div>

    <div class="section-title">Observacoes</div>
    <div class="notes">${esc(proposta.observacoes || 'Proposta sujeita a confirmacao de medidas, materiais e disponibilidade.')}</div>

    <footer class="footer">
      <strong>Arte & Molduras</strong><br>
      Proposta valida por 7 dias, salvo variacao de materiais ou alteracao de escopo. Este documento nao substitui a Ordem de Servico; a producao inicia apos aprovacao e abertura da OS.
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderPropostaHtml };
