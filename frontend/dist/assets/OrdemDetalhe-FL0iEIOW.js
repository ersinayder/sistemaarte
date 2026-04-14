import{c as I,u as L,b as F,r as l,a as j,z as c,j as e,R as U}from"./index-CpSrBjJy.js";function _(t){const d=localStorage.getItem("oficina_nome")||"Arte & Molduras",x=localStorage.getItem("oficina_end")||"",m=localStorage.getItem("oficina_tel")||"",g=t.valorrestante!==void 0?t.valorrestante:Number(t.valor||t.valortotal||0)-Number(t.entrada||t.valorentrada||0),r=v=>`R$ ${Math.abs(Number(v)||0).toFixed(2).replace(".",",").replace(/(\d)(?=(\d{3})+(?!\d))/g,"$1.")}`,f=v=>v?new Date(v+"T12:00:00").toLocaleDateString("pt-BR"):"—",u={Recebido:"#006494","Em Produção":"#da7101",Pronto:"#01696f",Entregue:"#437a22",Cancelado:"#888"}[t.status]||"#333",p=window.open("","_blank","width=600,height=900");p.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>OS ${t.numero}</title>
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
    <div class="brand-name">${d}</div>
    <div class="brand-sub">Sistema de Gestão</div>
    ${x?`<div class="brand-contact">${x}</div>`:""}
    ${m?`<div class="brand-contact">${m}</div>`:""}
  </div>
  <div class="os-badge">
    <div class="os-label">Ordem de Serviço</div>
    <div class="os-number">${t.numero}</div>
    <div class="os-date">Aberta em ${f(t.criadoem||t.createdat)}</div>
  </div>
</div>

<!-- ── STATUS / PRIORIDADE ── -->
<div class="status-row">
  <div class="status-pill" style="color:${u};border-color:${u}">
    <div class="status-dot"></div>
    ${t.status}
  </div>
  ${t.prioridade==="Urgente"?'<div class="priority-pill" style="background:#fff3cd;color:#8a5b00;border:1px solid #e9d5a0">⚡ Urgente</div>':'<div class="priority-pill" style="background:#f0f0f0;color:#555">Normal</div>'}
  ${t.prazo||t.prazoentrega?`<div style="font-size:10px;color:#666">📅 Prazo: <strong>${f(t.prazo||t.prazoentrega)}</strong></div>`:""}
</div>

<!-- ── CLIENTE ── -->
<div class="section">
  <div class="section-title">Cliente</div>
  <div class="grid-2">
    <div>
      <div class="field-label">Nome</div>
      <div class="field-value big">${t.clientenome||t.clientecontato||"—"}</div>
    </div>
    ${t.clientecpf||t.clientetelefone||t.clientecontato?`
    <div>
      ${t.clientecpf?`<div><div class="field-label">CPF / CNPJ</div><div class="field-value muted" style="font-family:monospace">${t.clientecpf}</div></div>`:""}
      ${t.clientetelefone||t.clientecontato?`<div style="margin-top:${t.clientecpf?"8px":"0"}"><div class="field-label">Telefone</div><div class="field-value muted">${t.clientetelefone||t.clientecontato}</div></div>`:""}
    </div>`:"<div></div>"}
  </div>
</div>

<!-- ── SERVIÇO ── -->
<div class="section">
  <div class="section-title">Serviço</div>
  <div class="grid-2" style="margin-bottom:8px">
    <div>
      <div class="field-label">Tipo</div>
      <div class="field-value">${t.tipo||t.servico||"—"}</div>
    </div>
    <div>
      <div class="field-label">Forma de Pagamento</div>
      <div class="field-value">${t.pagamento||"—"}</div>
    </div>
  </div>
  <div>
    <div class="field-label">Descrição</div>
    <div class="field-value muted" style="font-size:12px;margin-top:3px">${t.descricao||"—"}</div>
  </div>
</div>

${t.obs||t.observacoes?`
<!-- ── OBSERVAÇÕES ── -->
<div class="section">
  <div class="section-title">Observações</div>
  <div class="obs-box">${t.obs||t.observacoes}</div>
</div>`:""}

<!-- ── FINANCEIRO ── -->
<div class="section">
  <div class="section-title">Financeiro</div>
  <div class="finance-box">
    <div class="finance-row">
      <span>Valor Total</span>
      <span class="tabnum" style="font-weight:700">${r(t.valor||t.valortotal)}</span>
    </div>
    <div class="finance-row">
      <span>Entrada Paga</span>
      <span class="tabnum" style="color:#437a22;font-weight:600">${r(t.entrada||t.valorentrada)}</span>
    </div>
    ${t.valorrecebido!==void 0&&t.valorrecebido!==(t.entrada||t.valorentrada)?`
    <div class="finance-row">
      <span>Total Recebido</span>
      <span class="tabnum" style="color:#437a22;font-weight:600">${r(t.valorrecebido)}</span>
    </div>`:""}
    <div class="finance-row ${g<=0?"saldo-zero":"saldo"}">
      <span>Saldo a Receber</span>
      <span class="tabnum">${r(g)}</span>
    </div>
  </div>
</div>

<!-- ── ASSINATURA ── -->
<div class="sign-grid">
  <div class="sign-line">Assinatura do Cliente</div>
  <div class="sign-line">Data de Retirada</div>
</div>

<div class="footer">
  Gerado em ${new Date().toLocaleString("pt-BR")} — ${d}
</div>

<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>

</body>
</html>`),p.document.close(),p.focus(),setTimeout(()=>p.print(),600)}const C=t=>"R$ "+Number(t||0).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,"."),B=t=>t?new Date(t).toLocaleString("pt-BR"):"—",M=t=>t?new Date(`${t}T12:00:00`).toLocaleDateString("pt-BR"):"—",H=()=>new Date(Date.now()-3*60*60*1e3).toISOString().slice(0,10),w=["Recebido","Em Produção","Pronto","Entregue"],G={Recebido:"recebido","Em Produção":"emproducao",Pronto:"pronto",Entregue:"entregue",Cancelado:"cancelado"},i={Recebido:"var(--color-blue)","Em Produção":"var(--color-orange)",Pronto:"var(--color-primary)",Entregue:"var(--color-success)",Cancelado:"var(--color-text-faint)"},V={Pix:"pix",Dinheiro:"dinheiro",Credito:"credito",Debito:"debito",Link:"link"},J={Credito:"Crédito",Debito:"Débito",Link:"Link Pag."};function Q(){const{id:t}=I(),d=L(),{isCaixa:x,isAdmin:m,isOficina:g}=F(),[r,f]=l.useState(null),[S,u]=l.useState([]),[p,v]=l.useState(!0),[b,$]=l.useState(""),[k,N]=l.useState(!1),[R,h]=l.useState(!1),y=l.useCallback(async()=>{try{const a=await j.get(`/ordens/${t}`);f(a.data),u(a.data.logs||[])}catch{c.error("Erro ao carregar OS"),d("/ordens")}finally{v(!1)}},[t,d]);l.useEffect(()=>{y()},[y]);const O=async a=>{var o,s;try{await j.patch(`/ordens/${t}/status`,{status:a}),c.success(`Status → ${a}`),y()}catch(n){c.error(((s=(o=n.response)==null?void 0:o.data)==null?void 0:s.error)||"Erro ao atualizar status")}},E=async()=>{if(b.trim()){N(!0);try{await j.patch(`/ordens/${t}/status`,{status:r.status,obs:b}),$(""),c.success("Observação adicionada!"),y()}catch{c.error("Erro ao adicionar observação")}finally{N(!1)}}},A=async()=>{var a,o;try{await j.delete(`/ordens/${t}`),c.success(`OS ${r.numero} excluída.`),d("/ordens")}catch(s){c.error(((o=(a=s.response)==null?void 0:a.data)==null?void 0:o.error)||"Erro ao excluir OS"),h(!1)}};if(p)return e.jsx("div",{className:"loading-center",children:e.jsx("div",{className:"spinner"})});if(!r)return null;const z=Number(r.saldoaberto??0),D=r.prazo&&r.prazo<H()&&!["Entregue","Cancelado"].includes(r.status),T=w.indexOf(r.status),P=(x||g)&&r.status!=="Entregue"&&r.status!=="Cancelado";return e.jsxs("div",{children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"var(--space-3)",marginBottom:"var(--space-5)",flexWrap:"wrap"},children:[e.jsxs("button",{className:"btn btn-ghost btn-sm",onClick:()=>d("/ordens"),children:[e.jsx("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.5",children:e.jsx("path",{d:"M15 18l-6-6 6-6"})}),"Ordens"]}),e.jsx("span",{style:{color:"var(--color-text-faint)"},children:"/"}),e.jsx("span",{style:{fontWeight:700,color:"var(--color-primary)"},children:r.numero}),e.jsx("span",{className:`badge badge-${G[r.status]}`,children:r.status}),r.prioridade==="Urgente"&&e.jsx("span",{className:"badge badge-urgente",children:"⚡ Urgente"}),D&&e.jsx("span",{className:"badge",style:{background:"var(--color-error-hl)",color:"var(--color-error)"},children:"⚠ Prazo vencido"}),e.jsx("div",{style:{flex:1}}),e.jsxs("button",{className:"btn btn-ghost btn-sm",onClick:()=>_(r),children:[e.jsxs("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:[e.jsx("path",{d:"M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"}),e.jsx("path",{d:"M6 14h12v8H6z"})]}),"Imprimir OS"]}),m&&e.jsxs("button",{className:"btn btn-sm",onClick:()=>h(!0),style:{color:"var(--color-error)",border:"1px solid var(--color-error)",background:"transparent"},children:[e.jsx("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:e.jsx("path",{d:"M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"})}),"Excluir OS"]})]}),e.jsxs("div",{className:"card card-pad",style:{marginBottom:"var(--space-4)"},children:[e.jsx("div",{style:{fontWeight:700,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"var(--space-4)"},children:"Progresso"}),e.jsx("div",{style:{display:"flex",alignItems:"center",gap:0,marginBottom:"var(--space-4)",overflowX:"auto",paddingBottom:"var(--space-2)"},children:w.map((a,o)=>{const s=o<T||r.status==="Entregue"&&o<=T,n=a===r.status,W=s||n;return e.jsxs(U.Fragment,{children:[e.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:"var(--space-2)",minWidth:80},children:[e.jsx("div",{style:{width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:n?i[a]:s?"var(--color-success)":"var(--color-surface-dynamic)",color:W?"white":"var(--color-text-faint)",fontWeight:700,fontSize:"var(--text-sm)",border:n?`2px solid ${i[a]}`:s?"2px solid var(--color-success)":"2px solid var(--color-border)",transition:"all 0.3s ease",boxShadow:n?`0 0 0 4px color-mix(in oklab, ${i[a]} 20%, transparent)`:"none"},children:s&&!n?e.jsx("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"3",children:e.jsx("polyline",{points:"20 6 9 17 4 12"})}):o+1}),e.jsx("span",{style:{fontSize:"var(--text-xs)",fontWeight:n?700:400,color:n?i[a]:"var(--color-text-muted)",textAlign:"center",whiteSpace:"nowrap"},children:a})]}),o<w.length-1&&e.jsx("div",{style:{flex:1,height:2,background:s?"var(--color-success)":"var(--color-border)",minWidth:24,margin:"0 4px",marginBottom:28}})]},a)})}),P&&e.jsxs("div",{style:{display:"flex",gap:"var(--space-2)",flexWrap:"wrap"},children:[w.map(a=>a!==r.status&&e.jsxs("button",{className:"btn btn-ghost btn-sm",style:{borderColor:i[a],color:i[a]},onClick:()=>O(a),children:["→ ",a]},a)),x&&r.status!=="Cancelado"&&e.jsx("button",{className:"btn btn-ghost btn-sm",style:{borderColor:"var(--color-text-faint)",color:"var(--color-text-faint)"},onClick:()=>O("Cancelado"),children:"Cancelar OS"})]})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 300px",gap:"var(--space-4)",marginBottom:"var(--space-4)"},children:[e.jsxs("div",{className:"card card-pad",children:[e.jsx("div",{style:{fontWeight:700,fontSize:"var(--text-sm)",marginBottom:"var(--space-4)"},children:"Detalhes da OS"}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"var(--space-3)"},children:[[["Cliente",r.clientenome||"—"],["Contato",r.clientetelefone||r.clientecontato||"—"],["Tipo",r.servico||r.tipo||"—"],["Prioridade",r.prioridade||"—"],["Prazo",M(r.prazoentrega||r.prazo)],["Criada em",B(r.createdat||r.criadoem)]].map(([a,o])=>e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",marginBottom:2},children:a}),e.jsx("div",{style:{fontWeight:600,fontSize:"var(--text-sm)"},children:o})]},a)),r.descricao&&e.jsxs("div",{style:{gridColumn:"1 / -1"},children:[e.jsx("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",marginBottom:4},children:"Descrição"}),e.jsx("div",{style:{fontSize:"var(--text-sm)",lineHeight:1.6,background:"var(--color-surface-dynamic)",padding:"var(--space-3)",borderRadius:"var(--radius-md)"},children:r.descricao})]}),(r.observacoes||r.obs)&&e.jsxs("div",{style:{gridColumn:"1 / -1"},children:[e.jsx("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",marginBottom:4},children:"Observações"}),e.jsx("div",{style:{fontSize:"var(--text-sm)",lineHeight:1.6,background:"var(--color-surface-dynamic)",padding:"var(--space-3)",borderRadius:"var(--radius-md)"},children:r.observacoes||r.obs})]})]})]}),e.jsxs("div",{className:"card card-pad",children:[e.jsx("div",{style:{fontWeight:700,fontSize:"var(--text-sm)",marginBottom:"var(--space-4)"},children:"Financeiro"}),[["Valor Total",C(r.valortotal||r.valor)],["Entrada",C(r.valorentrada||r.entrada)]].map(([a,o])=>e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",padding:"var(--space-2) 0",borderBottom:"1px solid var(--color-divider)"},children:[e.jsx("span",{style:{fontSize:"var(--text-sm)",color:"var(--color-text-muted)"},children:a}),e.jsx("span",{className:"tabnum",style:{fontWeight:600},children:o})]},a)),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:"var(--space-3)",marginTop:"var(--space-1)"},children:[e.jsx("span",{style:{fontWeight:700},children:"Saldo"}),e.jsx("span",{className:"tabnum",style:{fontWeight:800,color:z>0?"var(--color-warning)":"var(--color-success)",fontSize:"var(--text-base)"},children:z>0?C(z):"✓ Quitado"})]}),e.jsxs("div",{style:{marginTop:"var(--space-4)",padding:"var(--space-2) 0",borderTop:"1px solid var(--color-divider)"},children:[e.jsx("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",marginBottom:4},children:"Forma de Pagamento"}),e.jsx("span",{className:`badge badge-${V[r.pagamento]||"normal"}`,children:J[r.pagamento]||r.pagamento||"—"})]})]})]}),e.jsxs("div",{className:"card card-pad",children:[e.jsx("div",{style:{fontWeight:700,fontSize:"var(--text-sm)",marginBottom:"var(--space-4)"},children:"Histórico de Atividade"}),e.jsxs("div",{style:{position:"relative",paddingLeft:"var(--space-8)",marginBottom:"var(--space-5)"},children:[e.jsx("div",{style:{position:"absolute",left:11,top:0,bottom:0,width:2,background:"var(--color-border)"}}),S.length===0&&e.jsx("p",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-faint)"},children:"Nenhuma atividade registrada."}),S.map((a,o)=>e.jsxs("div",{style:{position:"relative",marginBottom:"var(--space-4)"},children:[e.jsx("div",{style:{position:"absolute",left:"calc(-1 * var(--space-8) + 4px)",width:16,height:16,borderRadius:"50%",background:a.statusnovo?i[a.statusnovo]||"var(--color-primary)":"var(--color-surface-dynamic)",border:`2px solid ${a.statusnovo?i[a.statusnovo]||"var(--color-primary)":"var(--color-border)"}`}}),e.jsxs("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-faint)",marginBottom:2},children:[B(a.createdat)," · ",a.usuarionome||"sistema"]}),e.jsx("div",{style:{fontSize:"var(--text-sm)",fontWeight:a.obs?400:600},children:a.obs?e.jsxs("span",{style:{color:"var(--color-text-muted)"},children:["📝 ",a.obs]}):e.jsxs("span",{children:["Status alterado:",a.statusanterior&&e.jsxs("span",{style:{color:i[a.statusanterior]||"inherit"},children:[" ",a.statusanterior]}),e.jsxs("span",{style:{color:i[a.statusnovo]||"inherit",fontWeight:700},children:[" → ",a.statusnovo]})]})})]},a.id||o))]}),e.jsxs("div",{style:{borderTop:"1px solid var(--color-divider)",paddingTop:"var(--space-4)"},children:[e.jsx("div",{style:{fontWeight:600,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"var(--space-3)"},children:"Adicionar Observação"}),e.jsxs("div",{style:{display:"flex",gap:"var(--space-3)"},children:[e.jsx("input",{className:"form-input",placeholder:"Anote uma informação, atualização...",value:b,onChange:a=>$(a.target.value),onKeyDown:a=>a.key==="Enter"&&E(),style:{flex:1}}),e.jsx("button",{className:"btn btn-primary",onClick:E,disabled:k||!b.trim(),children:k?e.jsx("div",{className:"spinner",style:{width:14,height:14}}):"Adicionar"})]})]})]}),R&&e.jsx("div",{className:"modal-overlay",onClick:a=>a.target===a.currentTarget&&h(!1),children:e.jsxs("div",{className:"modal modal-sm",children:[e.jsx("div",{className:"modal-header",children:e.jsxs("span",{className:"modal-title",style:{color:"var(--color-error)"},children:["Excluir OS ",r.numero,"?"]})}),e.jsxs("div",{style:{padding:"var(--space-4) var(--space-5)",display:"flex",flexDirection:"column",gap:"var(--space-3)"},children:[e.jsxs("p",{style:{color:"var(--color-text-muted)",fontSize:"var(--text-sm)"},children:["Esta ação é ",e.jsx("strong",{children:"permanente e irreversível"}),"."]}),e.jsxs("div",{style:{fontSize:"var(--text-xs)",padding:"var(--space-2) var(--space-3)",background:"var(--color-warning-hl)",borderRadius:"var(--radius-md)",color:"var(--color-warning)"},children:["💡 Para encerrar sem apagar o histórico, use ",e.jsx("strong",{children:'"Cancelar OS"'}),"."]})]}),e.jsxs("div",{className:"modal-footer",children:[e.jsx("button",{className:"btn btn-ghost",onClick:()=>h(!1),children:"Cancelar"}),e.jsx("button",{className:"btn btn-danger",onClick:A,children:"Excluir permanentemente"})]})]})})]})}export{Q as default};
