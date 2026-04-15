import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

const fmt   = v => `R$ ${Number(v||0).toFixed(2).replace(".",",").replace(/(\d)(?=(\d{3})+,)/g,"$1.")}`;
const fmtD  = iso => iso ? new Date(iso+"T12:00:00").toLocaleDateString("pt-BR") : "—";
const HOJE  = new Date(Date.now() - 3*60*60*1000).toISOString().slice(0,10);

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
  servico:TIPO_OPTS[0], valortotal:"", valorentrada:"",
  prazoentrega:"", prioridade:"Normal", pagamento:"Pix", observacoes:"", status:"Recebido"
};

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}

// ── Componente: seletor de produtos com autocomplete ──────────────────────────
function ProdutoSelector({ itens, onChange, onTotalChange }) {
  const [busca, setBusca]         = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [loading, setLoading]     = useState(false);
  const debounceRef               = useRef(null);
  const wrapRef                   = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setSugestoes([]);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (busca.trim().length < 2) { setSugestoes([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get(`/produtos?q=${encodeURIComponent(busca.trim())}`);
        setSugestoes(r.data || []);
      } catch { setSugestoes([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [busca]);

  const notificar = (novos) => {
    onChange(novos);
    const total = novos.reduce((acc, i) => acc + (Number(i.preco) || 0) * (Number(i.qtd) || 1), 0);
    if (onTotalChange) onTotalChange(total);
  };

  const adicionarProduto = (p) => {
    const idx = itens.findIndex(i => i.produtoid === p.id && !i.avulso);
    let novos;
    if (idx >= 0) {
      novos = [...itens];
      novos[idx] = { ...novos[idx], qtd: novos[idx].qtd + 1 };
    } else {
      novos = [...itens, { produtoid: p.id, nome: p.nome, preco: p.preco, unidade: p.unidade, qtd: 1, avulso: false }];
    }
    notificar(novos);
    setBusca("");
    setSugestoes([]);
  };

  const adicionarAvulso = () => {
    const texto = busca.trim();
    if (!texto) return;
    notificar([...itens, { produtoid: null, nome: texto, preco: 0, unidade: "un", qtd: 1, avulso: true }]);
    setBusca("");
    setSugestoes([]);
  };

  const remover = (idx) => notificar(itens.filter((_,i) => i !== idx));

  const setQtd = (idx, val) => {
    const novos = [...itens];
    novos[idx] = { ...novos[idx], qtd: Math.max(1, Number(val)||1) };
    notificar(novos);
  };

  const setPreco = (idx, val) => {
    const novos = [...itens];
    novos[idx] = { ...novos[idx], preco: val };
    notificar(novos);
  };

  const temExato = sugestoes.some(s => s.nome.toLowerCase() === busca.trim().toLowerCase());
  const subtotal = itens.reduce((acc, i) => acc + (Number(i.preco) || 0) * (Number(i.qtd) || 1), 0);

  return (
    <div>
      <div ref={wrapRef} style={{ position:"relative" }}>
        <div style={{ position:"relative" }}>
          <input
            className="form-input"
            placeholder="🔍 Buscar produto cadastrado ou digitar avulso..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter"){ e.preventDefault(); if(sugestoes.length===0 && busca.trim()) adicionarAvulso(); } }}
            autoComplete="off"
          />
          {loading && (
            <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)" }}>
              <div className="spinner" style={{ width:14, height:14 }}/>
            </div>
          )}
        </div>

        {(sugestoes.length > 0 || (busca.trim().length >= 2 && !loading)) && (
          <div style={{
            position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:100,
            background:"var(--color-surface)", border:"1px solid var(--color-border)",
            borderRadius:"var(--radius-md)", boxShadow:"var(--shadow-md)",
            maxHeight:220, overflowY:"auto"
          }}>
            {sugestoes.length === 0 && busca.trim().length >= 2 && (
              <div style={{ padding:"var(--space-3)", fontSize:"var(--text-xs)", color:"var(--color-text-muted)", textAlign:"center" }}>
                Nenhum produto encontrado
              </div>
            )}
            {sugestoes.map(p => (
              <div key={p.id}
                onClick={() => adicionarProduto(p)}
                onMouseEnter={e => e.currentTarget.style.background="var(--color-surface-offset)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}
                style={{ padding:"var(--space-2) var(--space-3)", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}
              >
                <div>
                  <span style={{ fontWeight:600, fontSize:"var(--text-sm)" }}>{p.nome}</span>
                  <span style={{ marginLeft:8, fontSize:"var(--text-xs)", color:"var(--color-text-muted)" }}>{p.categoria} · {p.unidade}</span>
                </div>
                <span style={{ fontFamily:"monospace", fontSize:"var(--text-xs)", color:"var(--color-primary)", fontWeight:700, whiteSpace:"nowrap" }}>{fmt(p.preco)}</span>
              </div>
            ))}
            {busca.trim().length >= 2 && !temExato && (
              <div
                onClick={adicionarAvulso}
                onMouseEnter={e => e.currentTarget.style.background="var(--color-surface-offset)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}
                style={{
                  padding:"var(--space-2) var(--space-3)", cursor:"pointer",
                  borderTop: sugestoes.length > 0 ? "1px solid var(--color-border)" : "none",
                  display:"flex", alignItems:"center", gap:6,
                  fontSize:"var(--text-sm)", color:"var(--color-text-muted)"
                }}
              >
                <span style={{ fontWeight:700, color:"var(--color-primary)", fontSize:16 }}>+</span>
                Adicionar <strong style={{ color:"var(--color-text)" }}>"{busca.trim()}"</strong> como avulso
              </div>
            )}
          </div>
        )}
      </div>

      {itens.length > 0 && (
        <div style={{ marginTop:"var(--space-3)", display:"flex", flexDirection:"column", gap:"var(--space-2)" }}>
          {itens.map((item, idx) => (
            <div key={idx} style={{
              display:"flex", alignItems:"center", gap:"var(--space-2)",
              background:"var(--color-surface-offset)", borderRadius:"var(--radius-md)",
              padding:"var(--space-2) var(--space-3)",
              border:"1px solid var(--color-border)"
            }}>
              <div style={{ flex:1, minWidth:0 }}>
                <span style={{ fontWeight:600, fontSize:"var(--text-sm)" }}>{item.nome}</span>
                {item.avulso && (
                  <span style={{
                    marginLeft:6, fontSize:"var(--text-xs)", fontWeight:600,
                    color:"var(--color-orange)", background:"var(--color-orange-highlight)",
                    borderRadius:"var(--radius-full)", padding:"1px 6px"
                  }}>avulso</span>
                )}
                {!item.avulso && (
                  <span style={{ marginLeft:6, fontSize:"var(--text-xs)", color:"var(--color-text-muted)" }}>{item.unidade}</span>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:"var(--text-xs)", color:"var(--color-text-muted)" }}>Qtd</span>
                <input
                  type="number" min="1"
                  value={item.qtd}
                  onChange={e => setQtd(idx, e.target.value)}
                  style={{
                    width:52, textAlign:"center",
                    border:"1px solid var(--color-border)",
                    borderRadius:"var(--radius-sm)",
                    padding:"2px 4px",
                    fontSize:"var(--text-sm)",
                    background:"var(--color-surface)",
                    color:"var(--color-text)"
                  }}
                />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:"var(--text-xs)", color:"var(--color-text-muted)" }}>R$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={item.preco}
                  readOnly={!item.avulso}
                  onChange={e => item.avulso && setPreco(idx, e.target.value)}
                  style={{
                    width:72, textAlign:"right",
                    border:"1px solid var(--color-border)",
                    borderRadius:"var(--radius-sm)",
                    padding:"2px 6px",
                    fontSize:"var(--text-sm)",
                    fontFamily:"monospace",
                    background: item.avulso ? "var(--color-surface)" : "var(--color-surface-offset)",
                    color: item.avulso ? "var(--color-text)" : "var(--color-text-muted)",
                    cursor: item.avulso ? "text" : "default"
                  }}
                />
              </div>
              <span style={{
                fontFamily:"monospace", fontSize:"var(--text-xs)", fontWeight:700,
                color:"var(--color-primary)", whiteSpace:"nowrap", minWidth:70, textAlign:"right"
              }}>
                {fmt((Number(item.preco)||0) * (Number(item.qtd)||1))}
              </span>
              <button
                className="btn btn-icon btn-ghost btn-sm"
                style={{ color:"var(--color-error)", flexShrink:0 }}
                onClick={() => remover(idx)}
                type="button"
                title="Remover"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}

          <div style={{
            display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"var(--space-2) var(--space-3)",
            background:"var(--color-primary-highlight)",
            borderRadius:"var(--radius-md)",
            border:"1px solid var(--color-border)"
          }}>
            <span style={{ fontSize:"var(--text-xs)", color:"var(--color-text-muted)" }}>
              {itens.length} item{itens.length!==1?"s":""} · subtotal dos produtos:
            </span>
            <span style={{ fontFamily:"monospace", fontSize:"var(--text-sm)", fontWeight:800, color:"var(--color-primary)" }}>
              {fmt(subtotal)}
            </span>
          </div>
        </div>
      )}

      {itens.length === 0 && (
        <div style={{ marginTop:"var(--space-2)", fontSize:"var(--text-xs)", color:"var(--color-text-faint)", paddingLeft:2 }}>
          Nenhum produto adicionado — a OS será salva sem produtos (ou use o campo acima)
        </div>
      )}
    </div>
  );
}

function itensToDescricao(itens) {
  if (!itens || itens.length === 0) return "";
  return itens.map(i => `${i.nome}${i.avulso ? " (avulso)" : ""} x${i.qtd}`).join(", ");
}

// ── Modal OS ────────────────────────────────────────────────────────────────
function ModalOS({ open, onClose, onSaved, editData }) {
  const [form, setForm]     = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca]   = useState("");
  const [itensProdutos, setItensProdutos] = useState([]);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(()=>{
    if (!open) return;
    if (editData) {
      setForm({
        clientenome:     editData.clientenome     || "",
        clientetelefone: editData.clientetelefone || editData.clientecontato || "",
        clientecpf:      editData.clientecpf      || "",
        clienteid:       editData.clienteid       || null,
        servico:         editData.servico         || TIPO_OPTS[0],
        valortotal:      String(editData.valortotal  ?? editData.valor   ?? ""),
        valorentrada:    String(editData.valorentrada ?? editData.entrada ?? ""),
        prazoentrega:    editData.prazoentrega    || editData.prazo || "",
        prioridade:      editData.prioridade      || "Normal",
        pagamento:       editData.pagamento       || "Pix",
        observacoes:     editData.observacoes     || editData.obs || "",
        status:          editData.status          || "Recebido",
      });
      const descAtual = editData.descricao || editData.obs || "";
      if (descAtual.trim()) {
        setItensProdutos([{ produtoid:null, nome:descAtual.trim(), preco:0, unidade:"un", qtd:1, avulso:true }]);
      } else {
        setItensProdutos([]);
      }
      setBusca("");
    } else {
      setForm(BLANK);
      setItensProdutos([]);
      setBusca("");
    }
  }, [open, editData]);

  useEffect(()=>{
    if (busca.length < 2) { setClientes([]); return; }
    api.get(`/clientes?q=${encodeURIComponent(busca)}`).then(r=>setClientes(r.data)).catch(()=>{});
  }, [busca]);

  const handleTotalChange = (novoTotal) => {
    if (novoTotal > 0) {
      setForm(f => ({ ...f, valortotal: novoTotal.toFixed(2) }));
    }
  };

  const selecionarCliente = c => {
    set("clienteid", c.id);
    set("clientenome", c.name);
    set("clientetelefone", c.phone||"");
    set("clientecpf", c.cpf||"");
    setBusca(c.name);
    setClientes([]);
  };

  const ensureCliente = async (nome, telefone, cpf) => {
    if (!nome.trim()) return null;
    try {
      const r = await api.get(`/clientes?q=${encodeURIComponent(nome.trim())}`);
      const exact = (r.data||[]).find(c => c.name?.toLowerCase()===nome.trim().toLowerCase());
      if (exact) return exact.id;
    } catch {}
    try {
      const r = await api.post('/clientes', { name:nome.trim(), phone:telefone||null, cpf:cpf||null });
      toast(`✨ Cliente "${nome.trim()}" cadastrado automaticamente`);
      return r.data?.id || null;
    } catch { return null; }
  };

  const save = async () => {
    if (!form.clientenome.trim()) return toast.error("Nome do cliente obrigatório");
    if (!form.servico)            return toast.error("Tipo de serviço obrigatório");
    const total   = Number(form.valortotal);
    const entrada = form.valorentrada === "" ? 0 : Number(form.valorentrada);
    if (isNaN(total)   || total  <= 0)  return toast.error("Valor total deve ser maior que zero");
    if (isNaN(entrada) || entrada < 0)  return toast.error("Entrada não pode ser negativa");
    if (entrada > total)                return toast.error("Entrada não pode ser maior que o total");

    setSaving(true);
    try {
      let clienteid = form.clienteid;
      if (!clienteid) clienteid = await ensureCliente(form.clientenome, form.clientetelefone, form.clientecpf);

      const descricao = itensToDescricao(itensProdutos) || null;

      const payload = {
        clienteid:       clienteid || null,
        clientenome:     form.clientenome.trim(),
        clientetelefone: form.clientetelefone || null,
        clientecpf:      form.clientecpf      || null,
        servico:         form.servico,
        descricao,
        valortotal:      total,
        valorentrada:    entrada,
        prazoentrega:    form.prazoentrega    || null,
        prioridade:      form.prioridade,
        pagamento:       form.pagamento,
        observacoes:     form.observacoes     || null,
        status:          form.status,
      };

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

  const total     = Number(form.valortotal)  || 0;
  const entrada   = Number(form.valorentrada) || 0;
  const restantePrev = Math.max(0, total - entrada);

  if (!open) return null;

  return (
    <Portal>
      <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div className="modal modal-lg">

          <div className="modal-header">
            <span className="modal-title">{editData ? "Editar OS" : "Nova Ordem de Serviço"}</span>
            <button className="btn btn-icon btn-ghost" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="modal-body">

            <div style={{position:"relative"}}>
              <div className="form-group">
                <label className="form-label">
                  Cliente <span style={{color:"var(--color-error)"}}>*</span>
                  <span style={{marginLeft:8,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",fontWeight:400}}>
                    — se não cadastrado, será registrado automaticamente
                  </span>
                </label>
                <input className="form-input"
                  placeholder="Nome do cliente ou buscar cadastrado..."
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
              <label className="form-label">
                Produtos / Materiais
                <span style={{marginLeft:8,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",fontWeight:400}}>
                  — busque no cadastro ou adicione avulso · preços atualizam o total automaticamente
                </span>
              </label>
              <ProdutoSelector
                itens={itensProdutos}
                onChange={setItensProdutos}
                onTotalChange={handleTotalChange}
              />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">
                  Valor Total (R$) <span style={{color:"var(--color-error)"}}>*</span>
                  <span style={{marginLeft:6,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",fontWeight:400}}>
                    — calculado pelos produtos, editável
                  </span>
                </label>
                <input
                  className="form-input"
                  type="number" step="0.01" min="0"
                  value={form.valortotal}
                  onChange={e=>set("valortotal",e.target.value)}
                  style={{ fontFamily:"monospace", fontWeight:700 }}
                />
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

            {total > 0 && (
              <div style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"var(--space-3) var(--space-4)",
                background: restantePrev > 0 ? "var(--color-warning-hl)" : "var(--color-success-hl, var(--color-primary-highlight))",
                borderRadius:"var(--radius-md)", fontSize:"var(--text-xs)"
              }}>
                <span style={{color:"var(--color-text-muted)"}}>Restante a receber após entrada:</span>
                <span style={{ fontFamily:"monospace", fontWeight:800, color: restantePrev > 0 ? "var(--color-warning)" : "var(--color-success)" }}>
                  {restantePrev > 0 ? fmt(restantePrev) : "✓ Quitado na entrada"}
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

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><div className="spinner" style={{width:14,height:14}}/>Salvando...</> : "Salvar OS"}
            </button>
          </div>

        </div>
      </div>
    </Portal>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
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
    filtered.filter(o=>{ const p=o.prazoentrega||o.prazo; return p && p<HOJE && !["Entregue","Cancelado"].includes(o.status); }),
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
                <tr><th>Número</th><th>Cliente</th><th>Serviço</th><th>Total</th><th>Restante</th><th>Prazo</th><th>Status</th><th>Prioridade</th><th/></tr>
              </thead>
              <tbody>
                {filtered.map(o=>{
                  const prazo   = o.prazoentrega||o.prazo;
                  const vencida = prazo && prazo<HOJE && !["Entregue","Cancelado"].includes(o.status);
                  const restante = saldoOS(o);
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
                      <td className="tabnum" style={{color:restante>0?"var(--color-warning)":"var(--color-success)",fontWeight:700}}>
                        {restante>0?fmt(restante):"✓ Quitado"}
                      </td>
                      <td style={{fontSize:"var(--text-xs)",color:vencida?"var(--color-error)":"inherit",fontWeight:vencida?700:400}}>
                        {fmtD(prazo)}{vencida&&<span style={{marginLeft:4}}>⚠</span>}
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
                              style={{color:"var(--color-error)"}} onClick={e=>pedirExclusao(e,o)}>
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

      {deleteId && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setDeleteId(null)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title" style={{color:"var(--color-error)"}}>Excluir OS</span>
              <button className="btn btn-icon btn-ghost" onClick={()=>setDeleteId(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:"var(--text-sm)"}}>Tem certeza que deseja excluir a OS <strong>{deleteNum}</strong>?</p>
              <div style={{marginTop:"var(--space-3)",padding:"var(--space-3)",background:"var(--color-error-highlight, var(--color-error-hl))",borderRadius:"var(--radius-md)",fontSize:"var(--text-xs)",color:"var(--color-error)",fontWeight:600}}>
                Todos os lançamentos e histórico de status desta OS serão permanentemente excluídos.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setDeleteId(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmarExclusao}>Excluir</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
