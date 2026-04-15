import{c as L,u as U,b as M,r as d,a as w,z as p,j as e,d as F,R as I}from"./index-BXQWfV7_.js";function _(a){const c="Arte & Molduras",v=a.valorrestante!==void 0?a.valorrestante:Number(a.valor||a.valortotal||0)-Number(a.entrada||a.valorentrada||0),x=s=>`R$ ${Math.abs(Number(s)||0).toFixed(2).replace(".",",").replace(/(\d)(?=(\d{3})+(?!\d))/g,"$1.")}`,f=s=>s?new Date(s+"T12:00:00").toLocaleDateString("pt-BR"):"—",b={Recebido:"#006494","Em Produção":"#da7101",Pronto:"#01696f",Entregue:"#437a22",Cancelado:"#888"}[a.status]||"#333",m=`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>OS ${a.numero}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;background:#fff;color:#111;padding:28px 32px;max-width:540px;margin:0 auto;line-height:1.5}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #111}
  .brand-name{font-size:20px;font-weight:900;letter-spacing:-0.3px;line-height:1}
  .brand-sub{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1.5px;margin-top:3px}
  .brand-contact{font-size:10px;color:#555;margin-top:4px}
  .os-badge{text-align:right}
  .os-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#666;margin-bottom:4px}
  .os-number{font-size:26px;font-weight:900;letter-spacing:-0.5px;color:#111}
  .os-date{font-size:9px;color:#888;margin-top:3px}
  .status-row{display:flex;gap:8px;align-items:center;margin-bottom:18px}
  .status-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:0.3px;border:1.5px solid}
  .status-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
  .priority-pill{padding:4px 10px;border-radius:99px;font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase}
  .section{margin-bottom:16px}
  .section-title{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#888;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #eee}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .field-label{font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#aaa;margin-bottom:2px}
  .field-value{font-size:12px;font-weight:600;color:#111}
  .field-value.muted{color:#555;font-weight:400}
  .field-value.big{font-size:14px;font-weight:700}
  .finance-box{border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin-top:4px}
  .finance-row{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:1px solid #f0f0f0;font-size:11px}
  .finance-row:last-child{border:none}
  .finance-row.saldo{background:#fff8ed;font-weight:800;font-size:13px;color:#da7101}
  .finance-row.saldo-zero{background:#f0faf3;font-weight:800;font-size:13px;color:#437a22}
  .tabnum{font-variant-numeric:tabular-nums}
  .obs-box{background:#fafafa;border-radius:6px;border:1px solid #eee;padding:10px 12px;font-size:11px;color:#444;line-height:1.6;white-space:pre-wrap}
  .sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}
  .sign-line{border-top:1px solid #333;padding-top:6px;text-align:center;font-size:9px;color:#666}
  .footer{margin-top:20px;padding-top:10px;border-top:1px dashed #ddd;text-align:center;font-size:8px;color:#bbb}
  .no-print{text-align:center;margin-top:20px}
  .no-print button{padding:9px 24px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;margin:0 4px;font-weight:600}
  .btn-print{background:#111;color:#fff}
  .btn-close{background:#eee;color:#333}
  @media print{.no-print{display:none}body{padding:0}}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand-name">${c}</div>
    <div class="brand-sub">Sistema de Gestão</div>
    
    
  </div>
  <div class="os-badge">
    <div class="os-label">Ordem de Serviço</div>
    <div class="os-number">${a.numero}</div>
    <div class="os-date">Aberta em ${f(a.criadoem||a.createdat)}</div>
  </div>
</div>
<div class="status-row">
  <div class="status-pill" style="color:${b};border-color:${b}">
    <div class="status-dot"></div>
    ${a.status}
  </div>
  ${a.prioridade==="Urgente"?'<div class="priority-pill" style="background:#fff3cd;color:#8a5b00;border:1px solid #e9d5a0">⚡ Urgente</div>':'<div class="priority-pill" style="background:#f0f0f0;color:#555">Normal</div>'}
  ${a.prazo||a.prazoentrega?`<div style="font-size:10px;color:#666">📅 Prazo: <strong>${f(a.prazo||a.prazoentrega)}</strong></div>`:""}
</div>
<div class="section">
  <div class="section-title">Cliente</div>
  <div class="grid-2">
    <div>
      <div class="field-label">Nome</div>
      <div class="field-value big">${a.clientenome||a.clientecontato||"—"}</div>
    </div>
    <div>
      ${a.clientetelefone||a.clientecontato?`<div class="field-label">Telefone</div><div class="field-value muted">${a.clientetelefone||a.clientecontato}</div>`:""}
    </div>
  </div>
</div>
<div class="section">
  <div class="section-title">Serviço</div>
  <div class="grid-2" style="margin-bottom:8px">
    <div>
      <div class="field-label">Tipo</div>
      <div class="field-value">${a.tipo||a.servico||"—"}</div>
    </div>
    <div>
      <div class="field-label">Pagamento</div>
      <div class="field-value">${a.pagamento||"—"}</div>
    </div>
  </div>
  <div>
    <div class="field-label">Descrição</div>
    <div class="field-value muted" style="font-size:12px;margin-top:3px">${a.descricao||"—"}</div>
  </div>
</div>
${a.obs||a.observacoes?`
<div class="section">
  <div class="section-title">Observações</div>
  <div class="obs-box">${a.obs||a.observacoes}</div>
</div>`:""}
<div class="section">
  <div class="section-title">Financeiro</div>
  <div class="finance-box">
    <div class="finance-row">
      <span>Valor Total</span>
      <span class="tabnum" style="font-weight:700">${x(a.valor||a.valortotal)}</span>
    </div>
    <div class="finance-row">
      <span>Entrada Paga</span>
      <span class="tabnum" style="color:#437a22;font-weight:600">${x(a.entrada||a.valorentrada)}</span>
    </div>
    <div class="finance-row ${v<=0?"saldo-zero":"saldo"}">
      <span>Saldo a Receber</span>
      <span class="tabnum">${x(v)}</span>
    </div>
  </div>
</div>
<div class="sign-grid">
  <div class="sign-line">Assinatura do Cliente</div>
  <div class="sign-line">Data de Retirada</div>
</div>
<div class="footer">Gerado em ${new Date().toLocaleString("pt-BR")} — ${c}</div>
<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>
</body></html>`;try{const s=window.open("","_blank","width=600,height=900");if(s)s.document.write(m),s.document.close(),s.focus(),setTimeout(()=>s.print(),600);else throw new Error("bloqueado")}catch{const s=new Blob([m],{type:"text/html"}),h=URL.createObjectURL(s),g=document.createElement("a");g.href=h,g.download=`OS-${a.numero}.html`,g.click(),setTimeout(()=>URL.revokeObjectURL(h),5e3)}}const k=a=>"R$ "+Number(a||0).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,"."),R=a=>a?new Date(a).toLocaleString("pt-BR"):"—",H=a=>a?new Date(`${a}T12:00:00`).toLocaleDateString("pt-BR"):"—",G=()=>new Date(Date.now()-3*60*60*1e3).toISOString().slice(0,10),S=["Recebido","Em Produção","Pronto","Entregue"],V={Recebido:"recebido","Em Produção":"emproducao",Pronto:"pronto",Entregue:"entregue",Cancelado:"cancelado"},n={Recebido:"var(--color-blue)","Em Produção":"var(--color-orange)",Pronto:"var(--color-primary)",Entregue:"var(--color-success)",Cancelado:"var(--color-text-faint)"},q={Pix:"pix",Dinheiro:"dinheiro",Credito:"credito",Debito:"debito",Link:"link"},K={Credito:"Crédito",Debito:"Débito",Link:"Link Pag."};function X(){const{id:a}=L(),c=U(),{isCaixa:v,isAdmin:x,isOficina:f}=M(),[r,b]=d.useState(null),[m,s]=d.useState([]),[h,g]=d.useState(!0),[y,$]=d.useState(""),[O,N]=d.useState(!1),[z,u]=d.useState(!1);d.useEffect(()=>(z?document.body.style.overflow="hidden":document.body.style.overflow="",()=>{document.body.style.overflow=""}),[z]);const j=d.useCallback(async()=>{try{const t=await w.get(`/ordens/${a}`);b(t.data),s(t.data.logs||[])}catch{p.error("Erro ao carregar OS"),c("/ordens")}finally{g(!1)}},[a,c]);d.useEffect(()=>{j()},[j]);const B=async t=>{var o,i;try{await w.patch(`/ordens/${a}/status`,{status:t}),p.success(`Status → ${t}`),j()}catch(l){p.error(((i=(o=l.response)==null?void 0:o.data)==null?void 0:i.error)||"Erro ao atualizar status")}},T=async()=>{if(y.trim()){N(!0);try{await w.patch(`/ordens/${a}/status`,{status:r.status,obs:y}),$(""),p.success("Observação adicionada!"),j()}catch{p.error("Erro ao adicionar observação")}finally{N(!1)}}},D=async()=>{var t,o;try{await w.delete(`/ordens/${a}`),p.success(`OS ${r.numero} excluída.`),c("/ordens")}catch(i){p.error(((o=(t=i.response)==null?void 0:t.data)==null?void 0:o.error)||"Erro ao excluir OS"),u(!1)}};if(h)return e.jsx("div",{className:"loading-center",children:e.jsx("div",{className:"spinner"})});if(!r)return null;const C=Number(r.saldoaberto??0),P=r.prazo&&r.prazo<G()&&!["Entregue","Cancelado"].includes(r.status),E=S.indexOf(r.status),W=(v||f)&&r.status!=="Entregue"&&r.status!=="Cancelado";return e.jsxs("div",{children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"var(--space-3)",marginBottom:"var(--space-5)",flexWrap:"wrap"},children:[e.jsxs("button",{className:"btn btn-ghost btn-sm",onClick:()=>c("/ordens"),children:[e.jsx("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.5",children:e.jsx("path",{d:"M15 18l-6-6 6-6"})}),"Ordens"]}),e.jsx("span",{style:{color:"var(--color-text-faint)"},children:"/"}),e.jsx("span",{style:{fontWeight:700,color:"var(--color-primary)"},children:r.numero}),e.jsx("span",{className:`badge badge-${V[r.status]}`,children:r.status}),r.prioridade==="Urgente"&&e.jsx("span",{className:"badge badge-urgente",children:"⚡ Urgente"}),P&&e.jsx("span",{className:"badge",style:{background:"var(--color-error-hl)",color:"var(--color-error)"},children:"⚠ Prazo vencido"}),e.jsx("div",{style:{flex:1}}),e.jsxs("button",{className:"btn btn-ghost btn-sm",onClick:()=>_(r),children:[e.jsxs("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:[e.jsx("path",{d:"M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"}),e.jsx("path",{d:"M6 14h12v8H6z"})]}),"Imprimir OS"]}),x&&e.jsxs("button",{className:"btn btn-sm",onClick:()=>u(!0),style:{color:"var(--color-error)",border:"1px solid var(--color-error)",background:"transparent"},children:[e.jsx("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:e.jsx("path",{d:"M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"})}),"Excluir OS"]})]}),e.jsxs("div",{className:"card card-pad",style:{marginBottom:"var(--space-4)"},children:[e.jsx("div",{style:{fontWeight:700,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"var(--space-4)"},children:"Progresso"}),e.jsx("div",{style:{display:"flex",alignItems:"center",gap:0,marginBottom:"var(--space-4)",overflowX:"auto",paddingBottom:"var(--space-2)"},children:S.map((t,o)=>{const i=o<E||r.status==="Entregue"&&o<=E,l=t===r.status,A=i||l;return e.jsxs(F.Fragment,{children:[e.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:"var(--space-2)",minWidth:80},children:[e.jsx("div",{style:{width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:l?n[t]:i?"var(--color-success)":"var(--color-surface-dynamic)",color:A?"white":"var(--color-text-faint)",fontWeight:700,fontSize:"var(--text-sm)",border:l?`2px solid ${n[t]}`:i?"2px solid var(--color-success)":"2px solid var(--color-border)",transition:"all 0.3s ease",boxShadow:l?`0 0 0 4px color-mix(in oklab, ${n[t]} 20%, transparent)`:"none"},children:i&&!l?e.jsx("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"3",children:e.jsx("polyline",{points:"20 6 9 17 4 12"})}):o+1}),e.jsx("span",{style:{fontSize:"var(--text-xs)",fontWeight:l?700:400,color:l?n[t]:"var(--color-text-muted)",textAlign:"center",whiteSpace:"nowrap"},children:t})]}),o<S.length-1&&e.jsx("div",{style:{flex:1,height:2,background:i?"var(--color-success)":"var(--color-border)",minWidth:24,margin:"0 4px",marginBottom:28}})]},t)})}),W&&e.jsxs("div",{style:{display:"flex",gap:"var(--space-2)",flexWrap:"wrap"},children:[S.map(t=>t!==r.status&&e.jsxs("button",{className:"btn btn-ghost btn-sm",style:{borderColor:n[t],color:n[t]},onClick:()=>B(t),children:["→ ",t]},t)),v&&r.status!=="Cancelado"&&e.jsx("button",{className:"btn btn-ghost btn-sm",style:{borderColor:"var(--color-text-faint)",color:"var(--color-text-faint)"},onClick:()=>B("Cancelado"),children:"Cancelar OS"})]})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 300px",gap:"var(--space-4)",marginBottom:"var(--space-4)"},children:[e.jsxs("div",{className:"card card-pad",children:[e.jsx("div",{style:{fontWeight:700,fontSize:"var(--text-sm)",marginBottom:"var(--space-4)"},children:"Detalhes da OS"}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"var(--space-3)"},children:[[["Cliente",r.clientenome||"—"],["Contato",r.clientetelefone||r.clientecontato||"—"],["Tipo",r.servico||r.tipo||"—"],["Prioridade",r.prioridade||"—"],["Prazo",H(r.prazoentrega||r.prazo)],["Criada em",R(r.createdat||r.criadoem)]].map(([t,o])=>e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",marginBottom:2},children:t}),e.jsx("div",{style:{fontWeight:600,fontSize:"var(--text-sm)"},children:o})]},t)),r.descricao&&e.jsxs("div",{style:{gridColumn:"1 / -1"},children:[e.jsx("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",marginBottom:4},children:"Descrição"}),e.jsx("div",{style:{fontSize:"var(--text-sm)",lineHeight:1.6,background:"var(--color-surface-dynamic)",padding:"var(--space-3)",borderRadius:"var(--radius-md)"},children:r.descricao})]}),(r.observacoes||r.obs)&&e.jsxs("div",{style:{gridColumn:"1 / -1"},children:[e.jsx("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",marginBottom:4},children:"Observações"}),e.jsx("div",{style:{fontSize:"var(--text-sm)",lineHeight:1.6,background:"var(--color-surface-dynamic)",padding:"var(--space-3)",borderRadius:"var(--radius-md)"},children:r.observacoes||r.obs})]})]})]}),e.jsxs("div",{className:"card card-pad",children:[e.jsx("div",{style:{fontWeight:700,fontSize:"var(--text-sm)",marginBottom:"var(--space-4)"},children:"Financeiro"}),[["Valor Total",k(r.valortotal||r.valor)],["Entrada",k(r.valorentrada||r.entrada)]].map(([t,o])=>e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",padding:"var(--space-2) 0",borderBottom:"1px solid var(--color-divider)"},children:[e.jsx("span",{style:{fontSize:"var(--text-sm)",color:"var(--color-text-muted)"},children:t}),e.jsx("span",{className:"tabnum",style:{fontWeight:600},children:o})]},t)),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:"var(--space-3)",marginTop:"var(--space-1)"},children:[e.jsx("span",{style:{fontWeight:700},children:"Restante"}),e.jsx("span",{className:"tabnum",style:{fontWeight:800,color:C>0?"var(--color-warning)":"var(--color-success)",fontSize:"var(--text-base)"},children:C>0?k(C):"✓ Quitado"})]}),e.jsxs("div",{style:{marginTop:"var(--space-4)",padding:"var(--space-2) 0",borderTop:"1px solid var(--color-divider)"},children:[e.jsx("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",marginBottom:4},children:"Forma de Pagamento"}),e.jsx("span",{className:`badge badge-${q[r.pagamento]||"normal"}`,children:K[r.pagamento]||r.pagamento||"—"})]})]})]}),e.jsxs("div",{className:"card card-pad",children:[e.jsx("div",{style:{fontWeight:700,fontSize:"var(--text-sm)",marginBottom:"var(--space-4)"},children:"Histórico de Atividade"}),e.jsxs("div",{style:{position:"relative",paddingLeft:"var(--space-8)",marginBottom:"var(--space-5)"},children:[e.jsx("div",{style:{position:"absolute",left:11,top:0,bottom:0,width:2,background:"var(--color-border)"}}),m.length===0&&e.jsx("p",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-faint)"},children:"Nenhuma atividade registrada."}),m.map((t,o)=>e.jsxs("div",{style:{position:"relative",marginBottom:"var(--space-4)"},children:[e.jsx("div",{style:{position:"absolute",left:"calc(-1 * var(--space-8) + 4px)",width:16,height:16,borderRadius:"50%",background:t.statusnovo?n[t.statusnovo]||"var(--color-primary)":"var(--color-surface-dynamic)",border:`2px solid ${t.statusnovo?n[t.statusnovo]||"var(--color-primary)":"var(--color-border)"}`}}),e.jsxs("div",{style:{fontSize:"var(--text-xs)",color:"var(--color-text-faint)",marginBottom:2},children:[R(t.createdat)," · ",t.usuarionome||"sistema"]}),e.jsx("div",{style:{fontSize:"var(--text-sm)",fontWeight:t.obs?400:600},children:t.obs?e.jsxs("span",{style:{color:"var(--color-text-muted)"},children:["📝 ",t.obs]}):e.jsxs("span",{children:["Status alterado:",t.statusanterior&&e.jsxs("span",{style:{color:n[t.statusanterior]||"inherit"},children:[" ",t.statusanterior]}),e.jsxs("span",{style:{color:n[t.statusnovo]||"inherit",fontWeight:700},children:[" → ",t.statusnovo]})]})})]},t.id||o))]}),e.jsxs("div",{style:{borderTop:"1px solid var(--color-divider)",paddingTop:"var(--space-4)"},children:[e.jsx("div",{style:{fontWeight:600,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"var(--space-3)"},children:"Adicionar Observação"}),e.jsxs("div",{style:{display:"flex",gap:"var(--space-3)"},children:[e.jsx("input",{className:"form-input",placeholder:"Anote uma informação, atualização...",value:y,onChange:t=>$(t.target.value),onKeyDown:t=>t.key==="Enter"&&T(),style:{flex:1}}),e.jsx("button",{className:"btn btn-primary",onClick:T,disabled:O||!y.trim(),children:O?e.jsx("div",{className:"spinner",style:{width:14,height:14}}):"Adicionar"})]})]})]}),z&&I.createPortal(e.jsx("div",{className:"modal-overlay",onClick:t=>t.target===t.currentTarget&&u(!1),children:e.jsxs("div",{className:"modal modal-sm",children:[e.jsxs("div",{className:"modal-header",children:[e.jsxs("span",{className:"modal-title",style:{color:"var(--color-error)"},children:["Excluir OS ",r.numero,"?"]}),e.jsx("button",{className:"btn btn-icon btn-ghost",onClick:()=>u(!1),children:e.jsx("svg",{width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:e.jsx("path",{d:"M18 6L6 18M6 6l12 12"})})})]}),e.jsxs("div",{style:{padding:"var(--space-4) var(--space-5)",display:"flex",flexDirection:"column",gap:"var(--space-3)"},children:[e.jsxs("p",{style:{color:"var(--color-text-muted)",fontSize:"var(--text-sm)"},children:["Esta ação é ",e.jsx("strong",{children:"permanente e irreversível"}),"."]}),e.jsxs("div",{style:{fontSize:"var(--text-xs)",padding:"var(--space-2) var(--space-3)",background:"var(--color-warning-hl)",borderRadius:"var(--radius-md)",color:"var(--color-warning)"},children:["💡 Para encerrar sem apagar o histórico, use ",e.jsx("strong",{children:'"Cancelar OS"'}),"."]})]}),e.jsxs("div",{className:"modal-footer",children:[e.jsx("button",{className:"btn btn-ghost",onClick:()=>u(!1),children:"Cancelar"}),e.jsx("button",{className:"btn btn-danger",onClick:D,children:"Excluir permanentemente"})]})]})}),document.body)]})}export{X as default};
