const router  = require("express").Router();
const { getOne, getAll } = require("../database");
const { auth } = require("../middlewares/auth");

const SEL_ORDEM = `
  SELECT o.*,
    u.name AS criadopornome,
    CAST(o.valortotal - COALESCE(
      (SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0 AND l.deletedat IS NULL),0
    ) AS REAL) AS saldoaberto,
    COALESCE(
      (SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0 AND l.deletedat IS NULL),0
    ) AS valorrecebido
  FROM ordens o
  LEFT JOIN users u ON u.id = o.criadopor
`;

function fmt(val) {
  if (val == null) return "—";
  const n = Number(val);
  return isNaN(n) ? val : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(str) {
  if (!str) return "—";
  const d = str.slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function statusColor(s) {
  const map = {
    "Aguardando":    "#f59e0b",
    "Em Producao":   "#3b82f6",
    "Em Produção":   "#3b82f6",
    "Pronto":        "#10b981",
    "Entregue":      "#6366f1",
    "Cancelado":     "#ef4444",
    "Cancelada":     "#ef4444",
  };
  return map[s] || "#6b7280";
}

// GET /api/ordens/:id/pdf
router.get("/:id/pdf", auth(), (req, res) => {
  try {
    const os = getOne(SEL_ORDEM + " WHERE o.id=? AND o.deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const logs = getAll(
      `SELECT sl.statusnovo, sl.createdat, sl.obs, u.name AS usuario
       FROM statuslog sl
       LEFT JOIN users u ON u.id = sl.usuarioid
       WHERE sl.ordemid = ? ORDER BY sl.createdat ASC`,
      [req.params.id]
    );

    const saldo    = Number(os.saldoaberto)   || 0;
    const total    = Number(os.valortotal)    || 0;
    const recebido = Number(os.valorrecebido) || 0;

    const logsHtml = logs.map(l => `
      <tr>
        <td>${fmtDate(l.createdat)} ${(l.createdat || "").slice(11, 16)}</td>
        <td><span class="badge" style="background:${statusColor(l.statusnovo)}">${l.statusnovo || "—"}</span></td>
        <td>${l.usuario || "—"}</td>
        <td>${l.obs || ""}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OS ${os.numero}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  :root {
    --primary: #1a1a2e;
    --accent:  #0f3460;
    --ink:     #1f2937;
    --muted:   #6b7280;
    --border:  #e5e7eb;
    --surface: #f9fafb;
    --green:   #10b981;
    --red:     #ef4444;
  }

  body {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px;
    color: var(--ink);
    background: #fff;
    padding: 20px 40px 24px;
    max-width: 860px;
    margin: 0 auto;
  }

  /* ── Header ── */
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 0;
    gap: 0;          /* controlado via margin-bottom individual */
  }
  .brand-logo {
    height: 120px;
    width: auto;
    object-fit: contain;
    display: block;
    margin-bottom: 28px; /* espaço generoso logo → titulo */
  }
  .doc-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--primary);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    text-align: center;
    margin-bottom: 10px;
  }
  .header-divider {
    width: 100%;
    border: none;
    border-top: 2px solid var(--primary);
    margin: 0;
  }

  /* infos da OS abaixo da linha */
  .os-meta {
    display: flex;
    gap: 28px;
    align-items: center;
    width: 100%;
    padding: 8px 0 12px 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 14px;
  }
  .os-meta-item { display: flex; flex-direction: column; gap: 2px; }
  .os-meta-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--muted);
  }
  .os-meta-value {
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .os-meta-value.normal {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }

  /* ── Status pill ── */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .status-pill {
    display: inline-block;
    padding: 4px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.3px;
  }
  .prioridade-pill {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid var(--border);
    color: var(--muted);
  }

  /* ── Seções ── */
  .section { margin-bottom: 12px; }
  .section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--muted);
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }

  /* ── Grid de campos ── */
  .grid   { display: grid; grid-template-columns: 1fr 1fr;       gap: 8px 24px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr;  gap: 8px 24px; }
  .field label {
    display: block;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .field span {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    word-break: break-word;
  }

  /* ── Descricao / obs ── */
  .text-block {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    color: var(--ink);
    min-height: 36px;
  }

  /* ── Financeiro ── */
  .financeiro {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .fin-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .fin-row:last-child { border-bottom: none; }
  .fin-row.total {
    font-weight: 700;
    font-size: 15px;
    background: var(--primary);
    color: #fff;
  }
  .fin-row.saldo .amount {
    font-weight: 700;
    color: ${saldo > 0 ? "var(--red)" : "var(--green)"};
  }
  .fin-label { color: inherit; }
  .amount { font-weight: 600; font-variant-numeric: tabular-nums; }

  /* ── Historico (visivel na tela, oculto na impressao) ── */
  .historico-section { margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--muted);
    font-weight: 600;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }
  td { padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:last-child td { border-bottom: none; }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
  }

  /* ── Assinatura ── */
  .assinatura {
    display: flex;
    gap: 40px;
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  .ass-campo { flex: 1; text-align: center; }
  .ass-linha { border-bottom: 1px solid var(--ink); height: 32px; margin-bottom: 6px; }
  .ass-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; }

  /* ── Footer ── */
  .footer {
    margin-top: 16px;
    text-align: center;
    font-size: 10px;
    color: var(--muted);
  }

  /* ── Print ── */
  @media print {
    body { padding: 0; max-width: none; }
    .no-print { display: none !important; }
    .historico-section { display: none !important; }
    @page { margin: 14mm 14mm; }
  }

  /* ── Botao imprimir ── */
  .btn-print {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--primary);
    color: #fff;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 16px;
  }
  .btn-print:hover { background: var(--accent); }
</style>
</head>
<body>

<button class="btn-print no-print" onclick="window.print()">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
  Imprimir / Salvar PDF
</button>

<!-- Header -->
<div class="header">
  <img src="/logo preta.png" alt="Arte &amp; Molduras" class="brand-logo" />
  <div class="doc-title">Ordem de Servi&ccedil;o</div>
  <hr class="header-divider" />
</div>

<!-- Infos da OS abaixo da linha preta -->
<div class="os-meta">
  <div class="os-meta-item">
    <span class="os-meta-label">N&uacute;mero</span>
    <span class="os-meta-value">${os.numero}</span>
  </div>
  <div class="os-meta-item">
    <span class="os-meta-label">Abertura</span>
    <span class="os-meta-value normal">${fmtDate(os.createdat)}</span>
  </div>
  ${os.prazoentrega ? `
  <div class="os-meta-item">
    <span class="os-meta-label">Prazo</span>
    <span class="os-meta-value normal">${fmtDate(os.prazoentrega)}</span>
  </div>` : ""}
</div>

<!-- Status -->
<div class="status-bar">
  <span class="status-pill" style="background:${statusColor(os.status)}">${os.status || "—"}</span>
  <span class="prioridade-pill">${os.prioridade || "Normal"}</span>
  ${os.criadopornome ? `<span style="font-size:11px;color:#6b7280">por ${os.criadopornome}</span>` : ""}
</div>

<!-- Cliente -->
<div class="section">
  <div class="section-title">Cliente</div>
  <div class="grid">
    <div class="field"><label>Nome</label><span>${os.clientenome || "—"}</span></div>
    <div class="field"><label>Telefone</label><span>${os.clientetelefone || "—"}</span></div>
    ${os.clientecpf ? `<div class="field"><label>CPF</label><span>${os.clientecpf}</span></div>` : ""}
  </div>
</div>

<!-- Servico -->
<div class="section">
  <div class="section-title">Servi&ccedil;o</div>
  <div class="grid-3">
    <div class="field"><label>Tipo</label><span>${os.servico || "—"}</span></div>
    <div class="field"><label>Pagamento</label><span>${os.pagamento || "—"}</span></div>
    <div class="field"><label>Respons&aacute;vel</label><span>${os.criadopornome || "—"}</span></div>
  </div>
</div>

${os.descricao ? `
<div class="section">
  <div class="section-title">Descri&ccedil;&atilde;o</div>
  <div class="text-block">${os.descricao.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
</div>` : ""}

${os.observacoes ? `
<div class="section">
  <div class="section-title">Observa&ccedil;&otilde;es</div>
  <div class="text-block">${os.observacoes.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
</div>` : ""}

<!-- Financeiro -->
<div class="section">
  <div class="section-title">Financeiro</div>
  <div class="financeiro">
    <div class="fin-row total">
      <span class="fin-label">Total</span>
      <span class="amount">${fmt(total)}</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">Entrada recebida</span>
      <span class="amount">${fmt(os.valorentrada)}</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">Total recebido</span>
      <span class="amount">${fmt(recebido)}</span>
    </div>
    <div class="fin-row saldo">
      <span class="fin-label">Saldo em aberto</span>
      <span class="amount">${fmt(saldo)}</span>
    </div>
  </div>
</div>

<!-- Historico de status (visivel na tela, oculto na impressao) -->
${logs.length > 0 ? `
<div class="historico-section">
  <div class="section-title">Hist&oacute;rico de Status</div>
  <table>
    <thead>
      <tr>
        <th>Data/Hora</th>
        <th>Status</th>
        <th>Usu&aacute;rio</th>
        <th>Obs</th>
      </tr>
    </thead>
    <tbody>${logsHtml}</tbody>
  </table>
</div>` : ""}

<!-- Assinatura -->
<div class="assinatura">
  <div class="ass-campo">
    <div class="ass-linha"></div>
    <div class="ass-label">Assinatura do Cliente</div>
  </div>
  <div class="ass-campo">
    <div class="ass-linha"></div>
    <div class="ass-label">Respons&aacute;vel pela Entrega</div>
  </div>
</div>

<div class="footer">
  Gerado em ${new Date().toLocaleString("pt-BR")} &nbsp;|&nbsp; ${os.numero}
</div>

</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
