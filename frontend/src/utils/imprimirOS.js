/**
 * imprimirOS(ordem)
 * Substitua a função imprimirOS existente no OrdemDetalhe.jsx por este bloco.
 * Uso: imprimirOS(ordem)  — onde `ordem` é o objeto já carregado da API.
 */

export function imprimirOS(o) {
  const empresa  = localStorage.getItem('oficina_nome') || 'Arte & Molduras';
  const endereco = localStorage.getItem('oficina_end')  || '';
  const telefone = localStorage.getItem('oficina_tel')  || '';

  const saldo = o.valorrestante !== undefined
    ? o.valorrestante
    : Number(o.valor||o.valortotal||0) - Number(o.entrada||o.valorentrada||0);

  const fmtBRL = v =>
    `R$ ${Math.abs(Number(v)||0).toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.')}`;

  const fmtDate = iso =>
    iso ? new Date(iso+'T12:00:00').toLocaleDateString('pt-BR') : '—';

  const STATUS_COLOR = {
    'Recebido':    '#006494',
    'Em Produção': '#da7101',
    'Pronto':      '#01696f',
    'Entregue':    '#437a22',
    'Cancelado':   '#888',
  };
  const statusColor = STATUS_COLOR[o.status] || '#333';

  const win = window.open('', '_blank', 'width=600,height=900');
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>OS ${o.numero}</title>
<style>
  /* Reset */
  *{margin:0;padding:0;box-sizing:border-box}
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  body{
    font-family:'Inter',Arial,sans-serif;
    font-size:11px;
    background:#fff;
    color:#111;
    padding:28px 32px;
    max-width:540px;
    margin:0 auto;
    line-height:1.5;
  }

  /* ── Cabeçalho ── */
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #111}
  .brand-name{font-size:20px;font-weight:900;letter-spacing:-0.3px;line-height:1}
  .brand-sub{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1.5px;margin-top:3px}
  .brand-contact{font-size:10px;color:#555;margin-top:4px}
  .os-badge{text-align:right}
  .os-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#666;margin-bottom:4px}
  .os-number{font-size:26px;font-weight:900;letter-spacing:-0.5px;color:#111}
  .os-date{font-size:9px;color:#888;margin-top:3px}

  /* ── Status pill ── */
  .status-row{display:flex;gap:8px;align-items:center;margin-bottom:18px}
  .status-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:0.3px;border:1.5px solid}
  .status-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
  .priority-pill{padding:4px 10px;border-radius:99px;font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase}

  /* ── Seções ── */
  .section{margin-bottom:16px}
  .section-title{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#888;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #eee}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .field-label{font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#aaa;margin-bottom:2px}
  .field-value{font-size:12px;font-weight:600;color:#111}
  .field-value.muted{color:#555;font-weight:400}
  .field-value.big{font-size:14px;font-weight:700}

  /* ── Financeiro ── */
  .finance-box{border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin-top:4px}
  .finance-row{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:1px solid #f0f0f0;font-size:11px}
  .finance-row:last-child{border:none}
  .finance-row.total{background:#f8f8f8;font-weight:800;font-size:13px}
  .finance-row.saldo{background:#fff8ed;font-weight:800;font-size:13px;color:#da7101}
  .finance-row.saldo-zero{background:#f0faf3;font-weight:800;font-size:13px;color:#437a22}
  .tabnum{font-feature-settings:"tnum";font-variant-numeric:tabular-nums}

  /* ── Obs ── */
  .obs-box{background:#fafafa;border-radius:6px;border:1px solid #eee;padding:10px 12px;font-size:11px;color:#444;line-height:1.6;white-space:pre-wrap}

  /* ── Assinatura ── */
  .sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}
  .sign-line{border-top:1px solid #333;padding-top:6px;text-align:center;font-size:9px;color:#666}

  /* ── Rodapé ── */
  .footer{margin-top:20px;padding-top:10px;border-top:1px dashed #ddd;text-align:center;font-size:8px;color:#bbb}

  /* ── Botões (no-print) ── */
  .no-print{text-align:center;margin-top:20px}
  .no-print button{padding:9px 24px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;margin:0 4px;font-weight:600}
  .btn-print{background:#111;color:#fff}
  .btn-close{background:#eee;color:#333}

  @media print{
    .no-print{display:none}
    body{padding:0}
  }
</style>
</head>
<body>

<!-- ── CABEÇALHO ── -->
<div class="header">
  <div>
    <div class="brand-name">${empresa}</div>
    <div class="brand-sub">Sistema de Gestão</div>
    ${endereco ? `<div class="brand-contact">${endereco}</div>` : ''}
    ${telefone ? `<div class="brand-contact">${telefone}</div>` : ''}
  </div>
  <div class="os-badge">
    <div class="os-label">Ordem de Serviço</div>
    <div class="os-number">${o.numero}</div>
    <div class="os-date">Aberta em ${fmtDate(o.criadoem||o.createdat)}</div>
  </div>
</div>

<!-- ── STATUS / PRIORIDADE ── -->
<div class="status-row">
  <div class="status-pill" style="color:${statusColor};border-color:${statusColor}">
    <div class="status-dot"></div>
    ${o.status}
  </div>
  ${o.prioridade==='Urgente'
    ? `<div class="priority-pill" style="background:#fff3cd;color:#8a5b00;border:1px solid #e9d5a0">⚡ Urgente</div>`
    : `<div class="priority-pill" style="background:#f0f0f0;color:#555">Normal</div>`}
  ${(o.prazo||o.prazoentrega)
    ? `<div style="font-size:10px;color:#666">📅 Prazo: <strong>${fmtDate(o.prazo||o.prazoentrega)}</strong></div>`
    : ''}
</div>

<!-- ── CLIENTE ── -->
<div class="section">
  <div class="section-title">Cliente</div>
  <div class="grid-2">
    <div>
      <div class="field-label">Nome</div>
      <div class="field-value big">${o.clientenome||o.clientecontato||'—'}</div>
    </div>
    ${(o.clientecpf||o.clientetelefone||o.clientecontato) ? `
    <div>
      ${o.clientecpf ? `<div><div class="field-label">CPF / CNPJ</div><div class="field-value muted" style="font-family:monospace">${o.clientecpf}</div></div>` : ''}
      ${(o.clientetelefone||o.clientecontato) ? `<div style="margin-top:${o.clientecpf?'8px':'0'}"><div class="field-label">Telefone</div><div class="field-value muted">${o.clientetelefone||o.clientecontato}</div></div>` : ''}
    </div>` : '<div></div>'}
  </div>
</div>

<!-- ── SERVIÇO ── -->
<div class="section">
  <div class="section-title">Serviço</div>
  <div class="grid-2" style="margin-bottom:8px">
    <div>
      <div class="field-label">Tipo</div>
      <div class="field-value">${o.tipo||o.servico||'—'}</div>
    </div>
    <div>
      <div class="field-label">Forma de Pagamento</div>
      <div class="field-value">${o.pagamento||'—'}</div>
    </div>
  </div>
  <div>
    <div class="field-label">Descrição</div>
    <div class="field-value muted" style="font-size:12px;margin-top:3px">${o.descricao||'—'}</div>
  </div>
</div>

${(o.obs||o.observacoes) ? `
<!-- ── OBSERVAÇÕES ── -->
<div class="section">
  <div class="section-title">Observações</div>
  <div class="obs-box">${o.obs||o.observacoes}</div>
</div>` : ''}

<!-- ── FINANCEIRO ── -->
<div class="section">
  <div class="section-title">Financeiro</div>
  <div class="finance-box">
    <div class="finance-row">
      <span>Valor Total</span>
      <span class="tabnum" style="font-weight:700">${fmtBRL(o.valor||o.valortotal)}</span>
    </div>
    <div class="finance-row">
      <span>Entrada Paga</span>
      <span class="tabnum" style="color:#437a22;font-weight:600">${fmtBRL(o.entrada||o.valorentrada)}</span>
    </div>
    ${(o.valorrecebido !== undefined && o.valorrecebido !== (o.entrada||o.valorentrada)) ? `
    <div class="finance-row">
      <span>Total Recebido</span>
      <span class="tabnum" style="color:#437a22;font-weight:600">${fmtBRL(o.valorrecebido)}</span>
    </div>` : ''}
    <div class="finance-row ${saldo<=0?'saldo-zero':'saldo'}">
      <span>Saldo a Receber</span>
      <span class="tabnum">${fmtBRL(saldo)}</span>
    </div>
  </div>
</div>

<!-- ── ASSINATURA ── -->
<div class="sign-grid">
  <div class="sign-line">Assinatura do Cliente</div>
  <div class="sign-line">Data de Retirada</div>
</div>

<div class="footer">
  Gerado em ${new Date().toLocaleString('pt-BR')} — ${empresa}
</div>

<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>

</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}
