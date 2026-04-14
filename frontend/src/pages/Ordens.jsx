import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

const fmt   = v => `R$ ${Number(v||0).toFixed(2).replace(".",",").replace(/(\d)(?=(\d{3})+,)/g,"$1.")}`;
const fmtD  = iso => iso ? new Date(iso+"T12:00:00").toLocaleDateString("pt-BR") : "—";

const HOJE = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const STATUS_OPTS = ["Recebido","Em Produção","Pronto","Entregue","Cancelado"];
const PRIO_OPTS   = ["Normal","Alta","Urgente"];
const PAG_OPTS    = ["Pix","Dinheiro","Credito","Debito","Link"];
const TIPO_OPTS   = ["Corte a Laser","Quadro","Caixas","3D","Diversos"];
const PAG_LABEL   = { Credito:"Crédito", Debito:"Débito", Link:"Link Pag.", Pix:"Pix", Dinheiro:"Dinheiro" };
const STATUS_BADGE= { Recebido:"recebido","Em Produção":"emproducao",Pronto:"pronto",Entregue:"entregue",Cancelado:"cancelado" };

const saldoOS = o => Math.max(0,
  Number(o?.saldoaberto ?? o?.valorrestante ?? (Number(o?.valor||o?.valortotal||0) - Number(o?.entrada||o?.valorentrada||0)))
);

const BLANK = {
  clientenome:"", clientetelefone:"", clientecpf:"", clienteid:null,
  servico:TIPO_OPTS[0], descricao:"", valortotal:"", valorentrada:"",
  prazoentrega:"", prioridade:"Normal", pagamento:"Pix", observacoes:"", status:"Recebido"
};

// ── Modal OS ──────────────────────────────────────────────────────────────────
function ModalOS({ open, onClose, onSaved, editData }) {
  const [form, setForm]     = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca]   = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    if (!open) return;
    if (editData) {
      setForm({
        clientenome:     editData.clientenome     || "",
        clientetelefone: editData.clientetelefone || editData.clientecontato || "",
        clientecpf:      editData.clientecpf      || "",
        clienteid:       editData.clienteid       || null,
        servico:         editData.servico         || TIPO_OPTS[0],
        descricao:       editData.descricao       || editData.obs || "",
        valortotal:      String(editData.valortotal  ?? editData.valor   ?? ""),
        valorentrada:    String(editData.valorentrada ?? editData.entrada ?? ""),
        prazoentrega:    editData.prazoentrega    || editData.prazo || "",
        prioridade:      editData.prioridade      || "Normal",
        pagamento:       editData.pagamento       || "Pix",
        observacoes:     editData.observacoes     || editData.obs || "",
        status:          editData.status          || "Recebido",
      });
      setBusca("");
    } else {
      setForm(BLANK);
      setBusca("");
    }
  }, [open, editData]);

  useEffect(()=>{
    if (busca.length < 2) { setClientes([]); return; }
    api.get(`/clientes?q=${encodeURIComponent(busca)}`).then(r=>setClientes(r.data)).catch(()=>{});
  }, [busca]);

  const selecionarCliente = c => {
    set("clienteid", c.id);
    set("clientenome", c.name);
    set("clientetelefone", c.phone||"");
    set("clientecpf", c.cpf||"");
    setBusca(c.name);
    setClientes([]);
  };

  const save = async () => {
    if (!form.clientenome.trim()) return toast.error("Nome do cliente obrigatório");
    if (!form.servico)            return toast.error("Tipo de serviço obrigatório");

    const total   = Number(form.valortotal);
    const entrada = form.valorentrada === "" ? 0 : Number(form.valorentrada);

    if (isNaN(total) || total <= 0)     return toast.error("Valor total deve ser maior que zero");
    if (isNaN(entrada) || entrada < 0)  return toast.error("Entrada não pode ser negativa");
    if (entrada > total)                return toast.error("Entrada não pode ser maior que o total");

    const payload = {
      clienteid:       form.clienteid       || null,
      clientenome:     form.clientenome.trim(),
      clientetelefone: form.clientetelefone || null,
      clientecpf:      form.clientecpf      || null,
      servico:         form.servico,
      descricao:       form.descricao       || null,
      valortotal:      total,
      valorentrada:    entrada,
      prazoentrega:    form.prazoentrega    || null,
      prioridade:      form.prioridade,
      pagamento:       form.pagamento,
      observacoes:     form.observacoes     || null,
      status:          form.status,
    };

    setSaving(true);
    try {
      if (editData) {
        await api.put(`/ordens/${editData.id}`, payload);
        toast.success("OS atualizada!");
      } else {
        await api.post("/ordens", payload);
        toast.success("OS criada!");
      }
      onSaved();
      onClose();
    } catch(e) {
      toast.error(e.response?.data?.error || "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const total      = Number(form.valortotal)  || 0;
  const entrada    = Number(form.valorentrada) || 0;
  const saldoPrev  = Math.max(0, total - entrada);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">

        {/* ── Header sticky ── */}
        <div className="modal-header">
          <span className="modal-title">{editData ? "Editar OS" : "Nova Ordem de Serviço"}</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ── Body — usa a classe CSS sem sobrescrever padding ── */}
        <div className="modal-body">

          {/* Cliente com autocomplete */}
          <div style={{position:"relative"}}>
            <div className="form-group">
              <label className="form-label">Cliente <span style={{color:"var(--color-error)"}}>*</span></label>
              <input className="form-input" placeholder="Nome do cliente ou buscar cadastrado..."
                value={busca || form.clientenome}
                onChange={e=>{ setBusca(e.target.value); set("clientenome",e.target.value); set("clienteid",null); }}
              />
            </div>
            {clientes.length>0 && (
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:"var(--radius-md)",boxShadow:"var(--shadow-md)",maxHeight:200,overflowY:"auto"}}>
                {clientes.map(c=>(
                  <div key={c.id} onClick={()=>selecionarCliente(c)}
                    style={{padding:"var(--space-2) var(--space-3)",cursor:"pointer",fontSize:"var(--text-sm)"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--color-surface-offset)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <strong>{c.name}</strong>
                    {c.cpf && <span style={{color:"var(--color-text-muted)",marginLeft:8,fontSize:"var(--text-xs)"}}>{c.cpf}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Telefone / WhatsApp</label>
              <input className="form-input" value={form.clientetelefone} onChange={e=>set("clientetelefone",e.target.value)} placeholder="31 9 0000-0000"/>
            </div>
            <div className="form-group">
              <label className="form-label">CPF / CNPJ</label>
              <input className="form-input" value={form.clientecpf} onChange={e=>set("clientecpf",e.target.value)}/>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de Serviço <span style={{color:"var(--color-error)"}}>*</span></label>
              <select className="form-input" value={form.servico} onChange={e=>set("servico",e.target.value)}>
                {TIPO_OPTS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Forma de Pagamento</label>
              <select className="form-input" value={form.pagamento} onChange={e=>set("pagamento",e.target.value)}>
                {PAG_OPTS.map(p=><option key={p} value={p}>{PAG_LABEL[p]||p}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descrição do Serviço</label>
            <textarea className="form-input" rows={2} style={{resize:"vertical"}} value={form.descricao} onChange={e=>set("descricao",e.target.value)} placeholder="Detalhe o serviço solicitado..."/>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Valor Total (R$) <span style={{color:"var(--color-error)"}}>*</span></label>
              <input className="form-input" type="number" step="0.01" min="0" value={form.valortotal} onChange={e=>set("valortotal",e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">
                Entrada (R$)
                <span style={{marginLeft:6,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",fontWeight:400}}>opcional</span>
              </label>
              <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00 (sem entrada)"
                value={form.valorentrada} onChange={e=>set("valorentrada",e.target.value)}/>
            </div>
          </div>

          {/* Preview saldo a receber */}
          {total > 0 && (
            <div style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"var(--space-3) var(--space-4)",
              background: saldoPrev > 0 ? "var(--color-warning-hl)" : "var(--color-success-hl)",
              borderRadius:"var(--radius-md)",
              fontSize:"var(--text-xs)",
            }}>
              <span style={{color:"var(--color-text-muted)"}}>Saldo a receber após entrada:</span>
              <span style={{
                fontFamily:"monospace", fontWeight:800,
                color: saldoPrev > 0 ? "var(--color-warning)" : "var(--color-success)",
              }}>
                {saldoPrev > 0 ? fmt(saldoPrev) : "✓ Quitado na entrada"}
              </span>
            </div>
          )}

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Prazo de Entrega</label>
              <input className="form-input" type="date" value={form.prazoentrega} onChange={e=>set("prazoentrega",e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-input" value={form.prioridade} onChange={e=>set("prioridade",e.target.value)}>
                {PRIO_OPTS.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {editData && (
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={e=>set("status",e.target.value)}>
                {STATUS_OPTS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Observações Internas</label>
            <textarea className="form-input" rows={2} style={{resize:"vertical"}} value={form.observacoes} onChange={e=>set("observacoes",e.target.value)} placeholder="Visível apenas internamente..."/>
          </div>

        </div>

        {/* ── Footer sticky ── */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><div className="spinner" style={{width:14,height:14}}/>Salvando...</> : "Salvar OS"}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Ordens() {
  const { isAdmin, isCaixa } = useAuth();
  const navigate = useNavigate();
  const [ordens,   setOrdens]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [statusF,  setStatusF]  = useState("todos");
  const [modal,    setModal]    = useState({ open:false, edit:null });
  const [deleteId, setDeleteId] = useState(null);
  const [deleteNum,setDeleteNum]= useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/ordens?status=${statusF}`);
      setOrdens(Array.isArray(r.data) ? r.data : []);
    } catch { toast.error("Erro ao carregar ordens"); }
    finally { setLoading(false); }
  }, [statusF]);

  useEffect(()=>{ load(); }, [load]);

  const pedirExclusao = (e,o) => { e.stopPropagation(); setDeleteId(o.id); setDeleteNum(o.numero); };
  const confirmarExclusao = async () => {
    try { await api.delete(`/ordens/${deleteId}`); toast.success("OS excluída"); setDeleteId(null); load(); }
    catch(e) { toast.error(e.response?.data?.error||"Erro ao excluir"); }
  };

  const q = search.toLowerCase();
  const filtered = useMemo(()=>
    ordens.filter(o=>!q || [o.clientenome,o.clientecontato,o.numero,o.servico,o.descricao].join(" ").toLowerCase().includes(q)),
    [ordens, q]
  );

  const vencidas = useMemo(()=>
    filtered.filter(o=> {
      const prazo = o.prazoentrega || o.prazo;
      return prazo && prazo < HOJE && !["Entregue","Cancelado"].includes(o.status);
    }),
    [filtered]
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ordens de Serviço</h1>
          {vencidas.length > 0 && (
            <span style={{fontSize:"var(--text-xs)",color:"var(--color-error)",fontWeight:600}}>
              {vencidas.length} OS vencida{vencidas.length!==1?"s":""}
            </span>
          )}
        </div>
        {isCaixa && (
          <button className="btn btn-primary" onClick={()=>setModal({open:true,edit:null})}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nova OS
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:"var(--space-3)",marginBottom:"var(--space-4)",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-2)",flex:1,minWidth:200,background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:"var(--radius-lg)",padding:"var(--space-2) var(--space-3)"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input style={{background:"none",border:"none",outline:"none",fontSize:"var(--text-sm)",width:"100%",color:"var(--color-text)"}} placeholder="Buscar cliente, número, serviço..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{width:"auto"}} value={statusF} onChange={e=>setStatusF(e.target.value)}>
          <option value="todos">Todos os status</option>
          {STATUS_OPTS.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card" style={{overflow:"hidden"}}>
        <div style={{padding:"var(--space-3) var(--space-4)",borderBottom:"1px solid var(--color-border)"}}>
          <span style={{fontSize:"var(--text-xs)",color:"var(--color-text-muted)"}}>
            {filtered.length} resultado{filtered.length!==1?"s":""}
          </span>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner"/></div>
        ) : filtered.length===0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            <h3>Nenhuma OS encontrada</h3>
            <p>{search?"Tente outros termos.":"Crie a primeira OS."}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Número</th><th>Cliente</th><th>Serviço</th>
                  <th>Total</th><th>Saldo</th><th>Prazo</th>
                  <th>Status</th><th>Prioridade</th><th/>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o=>{
                  const prazo   = o.prazoentrega || o.prazo;
                  const vencida = prazo && prazo < HOJE && !["Entregue","Cancelado"].includes(o.status);
                  const saldo   = saldoOS(o);
                  return (
                    <tr key={o.id} onClick={()=>navigate(`/ordens/${o.id}`)} style={{cursor:"pointer"}}>
                      <td style={{fontWeight:700,color:"var(--color-primary)",fontFamily:"monospace"}}>{o.numero}</td>
                      <td style={{fontWeight:600}}>
                        {o.clientenome}
                        {(o.clientetelefone||o.clientecontato) && (
                          <div style={{fontSize:"var(--text-xs)",color:"var(--color-text-muted)"}}>{o.clientetelefone||o.clientecontato}</div>
                        )}
                      </td>
                      <td>{o.servico}</td>
                      <td className="tabnum">{fmt(o.valortotal||o.valor)}</td>
                      <td className="tabnum" style={{color:saldo>0?"var(--color-warning)":"var(--color-success)",fontWeight:700}}>
                        {saldo>0 ? fmt(saldo) : "✓ Quitado"}
                      </td>
                      <td style={{fontSize:"var(--text-xs)",color:vencida?"var(--color-error)":"inherit",fontWeight:vencida?700:400}}>
                        {fmtD(prazo)}
                        {vencida && <span style={{marginLeft:4}}>⚠</span>}
                      </td>
                      <td><span className={`badge badge-${STATUS_BADGE[o.status]||"recebido"}`}>{o.status}</span></td>
                      <td>
                        <span style={{fontSize:"var(--text-xs)",color:o.prioridade==="Urgente"?"var(--color-error)":o.prioridade==="Alta"?"var(--color-warning)":"var(--color-text-muted)"}}>
                          {o.prioridade}
                        </span>
                      </td>
                      <td>
                        <div style={{display:"flex",gap:"var(--space-1)"}}>
                          {isCaixa && (
                            <button className="btn btn-icon btn-ghost btn-sm" title="Editar"
                              onClick={e=>{e.stopPropagation();setModal({open:true,edit:o})}}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          )}
                          {isAdmin && (
                            <button className="btn btn-icon btn-ghost btn-sm" title="Excluir"
                              style={{color:"var(--color-error)"}}
                              onClick={e=>pedirExclusao(e,o)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalOS open={modal.open} onClose={()=>setModal({open:false,edit:null})} onSaved={load} editData={modal.edit}/>

      {/* Modal confirmar exclusão */}
      {deleteId && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setDeleteId(null)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title" style={{color:"var(--color-error)"}}>Excluir OS</span>
            </div>
            <div className="modal-body">
              <p style={{fontSize:"var(--text-sm)"}}>
                Tem certeza que deseja excluir a <strong>{deleteNum}</strong>?
              </p>
              <div style={{padding:"var(--space-3)",background:"var(--color-error-hl)",borderRadius:"var(--radius-md)",fontSize:"var(--text-xs)",color:"var(--color-error)",fontWeight:600}}>
                Todos os lançamentos e histórico de status desta OS serão permanentemente excluídos.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setDeleteId(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmarExclusao}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
