import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// ------- Componente de busca de produtos -------
function ProdutoInput({ produtos, onAdd }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const sugestoes = useMemo(() => {
    if (!query.trim()) return produtos.slice(0, 8);
    return produtos.filter(p => p.nome.toLowerCase().includes(query.toLowerCase()));
  }, [query, produtos]);

  const add = (p) => {
    onAdd({ produto_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco || 0, avulso: false });
    setQuery(''); setOpen(false);
  };
  const addAvulso = () => {
    if (!query.trim()) return;
    onAdd({ produto_id: null, nome: query.trim(), quantidade: 1, preco_unitario: 0, avulso: true });
    setQuery(''); setOpen(false);
  };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div style={{ display:'flex', gap:'var(--space-2)' }}>
        <input className="form-input" value={query} onChange={e=>{setQuery(e.target.value);setOpen(true);}}
          onFocus={()=>setOpen(true)} placeholder="Buscar produto cadastrado ou digitar novo nome…"
          style={{ flex:1, fontSize:'var(--text-xs)' }} />
        <button type="button" className="btn btn-secondary" style={{ fontSize:'var(--text-xs)', whiteSpace:'nowrap' }}
          onClick={addAvulso} disabled={!query.trim()}>+ Avulso</button>
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:100,
          background:'var(--color-surface-2)', border:'1px solid var(--color-border)',
          borderRadius:'var(--radius-md)', boxShadow:'var(--shadow-lg)', maxHeight:220, overflowY:'auto' }}>
          {sugestoes.length === 0
            ? <div style={{ padding:'var(--space-3)', fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>Nenhum produto encontrado</div>
            : sugestoes.map(p => (
              <div key={p.id} onClick={()=>add(p)}
                style={{ padding:'var(--space-2) var(--space-3)', cursor:'pointer', fontSize:'var(--text-xs)',
                  borderBottom:'1px solid var(--color-border)',
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--color-surface-offset)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{ fontWeight:500 }}>{p.nome}</span>
                <span style={{ color:'var(--color-text-muted)' }}>R$ {Number(p.preco||0).toFixed(2)}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ------- Helpers -------
const fmt  = v => `R$ ${Number(v||0).toFixed(2).replace('.',',')}`;
const fmtD = d => { if (!d) return '—'; const [y,m,dia]=d.split('-'); return `${dia}/${m}/${y}`; };

const statusColor = s => ({
  'Aguardando':'secondary','Em Produção':'blue','Pronto':'success','Entregue':'primary','Cancelado':'danger'
}[s]||'secondary');

const tipoBadge = t => ({
  'Quadro':'primary','Corte a Laser':'blue','Sublimacao':'warning','Diversos':'secondary'
}[t]||'secondary');

const toDateInputValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// ------- Modal de OS -------
function ModalOS({ os, onClose, onSaved, clientes, todosProdutos, canEdit, canEditFinanceiro }) {
  const navigate = useNavigate();
  const isNew = !os;
  const [form, setForm] = useState({
    clienteid:'', clientenome:'', clientetelefone:'', clientecpf:'',
    servico:'Quadro', descricao:'',
    valortotal:'', valorentrada:'', pagamento:'Pix',
    formapagamentoentrada:'', observacoes:'', prazoentrega:'', prioridade:'Normal',
    status:'Aguardando', produtos:[], dataEntrada: toDateInputValue(), dataRecebimento: toDateInputValue(),
  });
  const [saving, setSaving] = useState(false);
  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteOpen,  setClienteOpen]  = useState(false);
  const clienteRef = useRef(null);
  const [createdOS, setCreatedOS] = useState(null);
  const overlayDownRef = useRef(false);

  useEffect(() => {
    if (os) {
      const o = os;
      setForm({
        clienteid: o.clienteid || '',
        clientenome: o.clientenome || '',
        clientetelefone: o.clientetelefone || '',
        clientecpf: o.clientecpf || '',
        servico: o.servico || 'Quadro',
        descricao: o.descricao || '',
        valortotal: o.valortotal || '',
        valorentrada: o.valorentrada || '',
        pagamento: o.pagamento || 'Pix',
        formapagamentoentrada: o.formapagamentoentrada || '',
        observacoes: o.observacoes || '',
        prazoentrega: o.prazoentrega || '',
        prioridade: o.prioridade || 'Normal',
        status: o.status || 'Aguardando',
        produtos: o.produtos || [],
        dataEntrada: o.dataEntrada || toDateInputValue(),
        dataRecebimento: o.dataRecebimento || o.datarecebimento || toDateInputValue(),
      });
      setClienteQuery(o.clientenome || '');
    }
  }, [os]);

  useEffect(() => {
    const h = e => { if (clienteRef.current && !clienteRef.current.contains(e.target)) setClienteOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const recalcTotal = (prods) => {
    const total = prods.reduce((s,p) => s + (Number(p.quantidade||1) * Number(p.preco_unitario||0)), 0);
    setForm(f => ({ ...f, valortotal: total.toFixed(2) }));
  };

  const addProduto = (prod) => { const novos = [...(form.produtos||[]), {...prod}]; set('produtos', novos); recalcTotal(novos); };
  const removeProduto = (idx) => { const novos = form.produtos.filter((_,i) => i !== idx); set('produtos', novos); recalcTotal(novos); };
  const updateProd = (idx, campo, valor) => { const novos = form.produtos.map((p,i) => i===idx ? {...p,[campo]:valor} : p); set('produtos', novos); recalcTotal(novos); };

  const clientesFiltrados = useMemo(() => {
    if (!clienteQuery.trim()) return clientes.slice(0, 8);
    return clientes.filter(c => c.name.toLowerCase().includes(clienteQuery.toLowerCase()) ||
      (c.phone && c.phone.includes(clienteQuery)));
  }, [clienteQuery, clientes]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        descricao: '',
        observacoes: form.observacoes,
        valortotal: Number(form.valortotal) || 0,
        valorentrada: Number(form.valorentrada) || 0,
        prazoentrega: form.prazoentrega || null,
        clienteid: form.clienteid || null,
        produtos: form.produtos,
        dataEntrada: form.dataEntrada,
        dataRecebimento: form.dataRecebimento,
      };
      if (isNew) {
        const { data } = await api.post('/ordens', payload);
        toast.success(`OS ${data.numero} criada!`);
        onSaved();
        setCreatedOS({ id: data.id, numero: data.numero });
        return;
      } else {
        await api.put(`/ordens/${os.id}`, payload);
        toast.success('OS atualizada!');
      }
      onSaved();
      onClose();
    } catch(err) {
      toast.error(err?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const SERVICOS = ['Quadro','Corte a Laser','Sublimacao','Diversos'];
  const PAGAMENTOS = ['Pix','Dinheiro','Cartão Crédito','Cartão Débito','Transferência'];
  const STATUS_OPTS = ['Aguardando','Em Produção','Pronto','Entregue','Cancelado'];

  const produtosSugestoes = useMemo(() =>
    todosProdutos.filter(p => !(form.produtos||[]).find(fp => fp.produto_id && fp.produto_id === p.id))
  , [todosProdutos, form.produtos]);

  const overlayProps = {
    onMouseDown: e => { overlayDownRef.current = e.target === e.currentTarget; },
    onClick: e => {
      if (overlayDownRef.current && e.target === e.currentTarget) onClose();
      overlayDownRef.current = false;
    },
  };

  if (createdOS) {
    const visualizar = () => {
      onClose();
      navigate(`/ordens/${createdOS.id}`);
    };
    const imprimir = () => {
      window.open(`/api/ordens/${createdOS.id}/pdf`, '_blank', 'noopener,noreferrer');
      onClose();
    };

    return ReactDOM.createPortal(
      <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center',
        background:'oklch(from var(--color-bg) l c h / 0.7)', backdropFilter:'blur(2px)' }} {...overlayProps}>
        <div style={{ background:'var(--color-surface)', borderRadius:'var(--radius-xl)',
          boxShadow:'var(--shadow-lg)', width:'100%', maxWidth:460,
          border:'1px solid var(--color-border)', overflow:'hidden' }}>
          <div style={{ padding:'var(--space-5) var(--space-6)', borderBottom:'1px solid var(--color-border)' }}>
            <h2 style={{ fontWeight:800, fontSize:'var(--text-lg)', margin:0 }}>OS {createdOS.numero} criada</h2>
            <p style={{ fontSize:'var(--text-sm)', color:'var(--color-text-muted)', margin:'var(--space-2) 0 0' }}>
              O que deseja fazer agora?
            </p>
          </div>
          <div style={{ padding:'var(--space-5) var(--space-6)', display:'grid', gap:'var(--space-3)' }}>
            <button type="button" className="btn btn-primary" onClick={visualizar} style={{ justifyContent:'center' }}>Visualizar OS</button>
            <button type="button" className="btn btn-secondary" onClick={imprimir} style={{ justifyContent:'center' }}>Imprimir</button>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ justifyContent:'center' }}>Fechar</button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const modalContent = (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center',
      background:'oklch(from var(--color-bg) l c h / 0.7)', backdropFilter:'blur(2px)' }}
      {...overlayProps}>
      <div style={{ background:'var(--color-surface)', borderRadius:'var(--radius-xl)',
        boxShadow:'var(--shadow-lg)', width:'100%', maxWidth:980, maxHeight:'90vh',
        display:'flex', flexDirection:'column', border:'1px solid var(--color-border)' }}>
        {/* Header */}
        <div style={{ padding:'var(--space-4) var(--space-6)', borderBottom:'1px solid var(--color-border)',
          display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <h2 style={{ fontWeight:700, fontSize:'var(--text-lg)', margin:0 }}>
              {isNew ? 'Nova Ordem de Serviço' : `Editar OS ${os?.numero}`}
            </h2>
            {!isNew && <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', margin:0 }}>
              Cliente: {os?.clientenome}
            </p>}
          </div>
          <button onClick={onClose} style={{ color:'var(--color-text-muted)', padding:'var(--space-1)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ overflowY:'auto', flex:1 }}>
          <div style={{ padding:'var(--space-5) var(--space-6)', display:'grid',
            gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'var(--space-4)', alignItems:'start' }}>

          <section className="card" style={{ padding:'var(--space-4)', display:'grid', gap:'var(--space-4)' }}>
            <div style={{ fontWeight:800, fontSize:'var(--text-sm)' }}>Cliente e servico</div>
            {/* Cliente */}
            <div ref={clienteRef} style={{ position:'relative' }}>
              <label className="form-label">Cliente *</label>
              <input className="form-input" value={clienteQuery}
                onChange={e=>{setClienteQuery(e.target.value);set('clientenome',e.target.value);set('clienteid','');setClienteOpen(true);}}
                onFocus={()=>setClienteOpen(true)}
                placeholder="Nome do cliente…" required />
              {clienteOpen && clientesFiltrados.length > 0 && (
                <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:200,
                  background:'var(--color-surface-2)', border:'1px solid var(--color-border)',
                  borderRadius:'var(--radius-md)', boxShadow:'var(--shadow-lg)', maxHeight:200, overflowY:'auto' }}>
                  {clientesFiltrados.map(c => (
                    <div key={c.id} onClick={()=>{
                      set('clienteid', c.id); set('clientenome', c.name);
                      set('clientetelefone', c.phone||''); set('clientecpf', c.cpf||'');
                      setClienteQuery(c.name); setClienteOpen(false);
                    }} style={{ padding:'var(--space-2) var(--space-3)', cursor:'pointer', fontSize:'var(--text-xs)',
                      borderBottom:'1px solid var(--color-border)' }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--color-surface-offset)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{ fontWeight:600 }}>{c.name}</div>
                      {c.phone && <div style={{ color:'var(--color-text-muted)' }}>{c.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Telefone + CPF */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <div>
                <label className="form-label">Telefone</label>
                <input className="form-input" value={form.clientetelefone}
                  onChange={e=>set('clientetelefone',e.target.value)} placeholder="(31) 9 0000-0000" />
              </div>
              <div>
                <label className="form-label">CPF</label>
                <input className="form-input" value={form.clientecpf}
                  onChange={e=>set('clientecpf',e.target.value)} placeholder="000.000.000-00" />
              </div>
            </div>

            {/* Serviço + Prioridade */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <div>
                <label className="form-label">Serviço *</label>
                <select className="form-input" value={form.servico} onChange={e=>set('servico',e.target.value)} required>
                  {SERVICOS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Prioridade</label>
                <select className="form-input" value={form.prioridade} onChange={e=>set('prioridade',e.target.value)}>
                  <option>Normal</option><option>Urgente</option>
                </select>
              </div>
            </div>

            {/* Data Recebimento + Prazo de Entrega */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <div>
                <label className="form-label">Data de Recebimento</label>
                <input className="form-input" type="date" value={form.dataRecebimento}
                  onChange={e=>set('dataRecebimento',e.target.value)} />
              </div>
              <div>
                <label className="form-label">Prazo de Entrega</label>
                <input className="form-input" type="date" value={form.prazoentrega}
                  onChange={e=>set('prazoentrega',e.target.value)} />
              </div>
            </div>

            {/* Status (edição) */}
            {!isNew && canEdit && (
              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status} onChange={e=>set('status',e.target.value)}>
                  {STATUS_OPTS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Observações */}
            <div>
              <label className="form-label">Observações</label>
              <textarea className="form-input" rows={2} value={form.observacoes}
                onChange={e=>set('observacoes',e.target.value)}
                placeholder="Medidas, cores, detalhes do pedido…" />
            </div>
          </section>

          <section style={{ display:'grid', gap:'var(--space-4)' }}>
            <div className="card" style={{ padding:'var(--space-4)', display:'grid', gap:'var(--space-4)' }}>
              <div style={{ fontWeight:800, fontSize:'var(--text-sm)' }}>Itens</div>
            <ProdutoInput produtos={produtosSugestoes} onAdd={addProduto} />
            {form.produtos && form.produtos.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
                {form.produtos.map((p, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 32px',
                    gap:'var(--space-2)', alignItems:'center',
                    background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)',
                    padding:'var(--space-2) var(--space-3)' }}>
                    <span style={{ fontSize:'var(--text-xs)', fontWeight:500, overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                      title={p.nome}>{p.nome}{p.avulso && <span style={{ marginLeft:4, fontSize:9, color:'var(--color-text-faint)' }}>avulso</span>}</span>
                    <input type="number" className="form-input" value={p.quantidade} min={1}
                      onChange={e=>updateProd(i,'quantidade',Number(e.target.value))}
                      style={{ fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-2)', textAlign:'center' }} />
                    <input type="number" className="form-input" value={p.preco_unitario} min={0} step="0.01"
                      onChange={e=>updateProd(i,'preco_unitario',Number(e.target.value))}
                      style={{ fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-2)', textAlign:'right' }} />
                    <button type="button" onClick={()=>removeProduto(i)}
                      style={{ color:'var(--color-error)', padding:'var(--space-1)', background:'none', border:'none', cursor:'pointer' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
                <div style={{ textAlign:'right', fontWeight:700, fontSize:'var(--text-sm)', color:'var(--color-primary)',
                  padding:'var(--space-2) var(--space-3)' }}>
                  Total: {fmt(form.produtos.reduce((s,p)=>s+(Number(p.quantidade||1)*Number(p.preco_unitario||0)),0))}
                </div>
              </div>
            )}
            </div>

            <div className="card" style={{ padding:'var(--space-4)', display:'grid', gap:'var(--space-4)' }}>
              <div style={{ fontWeight:800, fontSize:'var(--text-sm)' }}>Pagamento</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <div>
                <label className="form-label">Valor Total *</label>
                <input className="form-input" type="number" step="0.01" value={form.valortotal}
                  onChange={e=>set('valortotal',e.target.value)} required min={0} />
              </div>
              <div>
                <label className="form-label">Forma de Pagamento</label>
                <select className="form-input" value={form.pagamento} onChange={e=>set('pagamento',e.target.value)}>
                  {PAGAMENTOS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {isNew && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                <div>
                  <label className="form-label">Entrada</label>
                  <input className="form-input" type="number" step="0.01" value={form.valorentrada}
                    onChange={e=>set('valorentrada',e.target.value)} min={0} />
                </div>
                <div>
                  <label className="form-label">Data da Entrada</label>
                  <input className="form-input" type="date" value={form.dataEntrada}
                    onChange={e=>set('dataEntrada',e.target.value)} />
                </div>
              </div>
            )}
            </div>
          </section>

          </div>

          {/* Footer */}
          <div style={{ padding:'var(--space-4) var(--space-6)', borderTop:'1px solid var(--color-border)',
            display:'flex', justifyContent:'flex-end', gap:'var(--space-3)', flexShrink:0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : isNew ? 'Criar OS' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}

// ------- Página principal -------
export default function Ordens() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'caixa';
  const canEditFinanceiro = user?.role === 'admin' || user?.role === 'caixa';

  const [ordens,       setOrdens]       = useState([]);
  const [ordensMeta,   setOrdensMeta]   = useState({ page: 1, limit: 14, total: 0, totalPages: 1 });
  const [clientes,     setClientes]     = useState([]);
  const [todosProdutos,setTodosProdutos]= useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loaded,       setLoaded]       = useState(false);
  const [modalOS,      setModalOS]      = useState(null);
  const [showModal,    setShowModal]    = useState(false);
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterTipo,   setFilterTipo]   = useState('todos');
  const [busca,        setBusca]        = useState('');
  const [page,         setPage]         = useState(1);
  const PER_PAGE = 14;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PER_PAGE),
      });
      if (filterStatus !== 'todos') params.set('status', filterStatus);
      if (filterTipo !== 'todos') params.set('tipo', filterTipo);
      if (busca.trim()) params.set('q', busca.trim());

      const [ro, rc, rp] = await Promise.all([
        api.get(`/ordens?${params.toString()}`), api.get('/clientes'), api.get('/produtos'),
      ]);
      setOrdens(Array.isArray(ro.data) ? ro.data : (ro.data?.data || []));
      setOrdensMeta(Array.isArray(ro.data) ? { page: 1, limit: PER_PAGE, total: ro.data.length, totalPages: 1 } : (ro.data?.meta || { page: 1, limit: PER_PAGE, total: 0, totalPages: 1 }));
      setClientes(Array.isArray(rc.data) ? rc.data : (rc.data?.data || []));
      setTodosProdutos(rp.data || []);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [busca, filterStatus, filterTipo, page]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setModalOS(null); setShowModal(true); };
  const openEdit = useCallback(async (id) => {
    try {
      const { data } = await api.get(`/ordens/${id}`);
      const o = data;
      setModalOS({
        ...o,
        produtos: o.itens || o.produtos || [],
        dataEntrada: o.createdat ? o.createdat.slice(0,10) : toDateInputValue(),
        dataRecebimento: o.dataRecebimento || o.datarecebimento || (o.createdat ? o.createdat.slice(0,10) : toDateInputValue()),
      });
      setShowModal(true);
    } catch { toast.error('Erro ao carregar OS'); }
  }, []);

  const handleDelete = useCallback(async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Mover esta OS para a lixeira?')) return;
    try {
      await api.delete(`/ordens/${id}`);
      toast.success('OS removida');
      load();
    } catch { toast.error('Erro ao remover'); }
  }, [load]);

  const ordensFiltradas = ordens;
  const totalOrdens = ordensMeta.total ?? ordens.length;
  const totalAberto = ordensFiltradas.filter(o => o.status !== 'Entregue' && o.status !== 'Cancelado').length;

  const totalPages = Math.max(1, ordensMeta.totalPages || 1);
  const paginated  = ordensFiltradas;

  useEffect(() => { setPage(1); }, [filterStatus, filterTipo, busca]);

  const today = toDateInputValue();

  const tiposDisponiveis = useMemo(() => {
    return ['todos', 'Quadro', 'Corte a Laser', 'Sublimacao', 'Diversos'];
  }, []);

  if (loading && !loaded) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--color-text-muted)' }}>
      Carregando…
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'var(--space-3) var(--space-6)', borderBottom:'1px solid var(--color-border)',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
        background:'var(--color-surface)' }}>
        <div>
          <h1 style={{ fontWeight:700, fontSize:'var(--text-lg)', margin:0 }}>Ordens de Serviço</h1>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', margin:0 }}>
            {totalOrdens} ativas de {ordens.length} total
          </p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)' }}>
          {canEdit && (
            <button className="btn btn-secondary" style={{ fontSize:'var(--text-xs)', display:'flex', alignItems:'center', gap:'var(--space-2)' }}
              onClick={() => navigate('/ordens/lixeira')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
              Lixeira
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary" onClick={openNew}
              style={{ fontSize:'var(--text-xs)', display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Nova OS
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)',
        gap:'var(--space-2)', padding:'var(--space-2) var(--space-6)',
        borderBottom:'1px solid var(--color-border)', flexShrink:0 }}>
        {[
          { label:'Total filtrado', value:totalOrdens, icon:'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2', color:'var(--color-primary)' },
          { label:'Em Aberto na página', value:totalAberto, icon:'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', color:'var(--color-warning)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)',
            borderRadius:'var(--radius-md)', padding:'var(--space-2) var(--space-3)',
            display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
            <div style={{ width:28, height:28, borderRadius:'var(--radius-sm)',
              background:`color-mix(in oklch, ${k.color} 12%, var(--color-surface-offset))`,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="2">
                <path d={k.icon}/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', fontWeight:500, lineHeight:1.2 }}>{k.label}</div>
              <div style={{ fontWeight:700, fontSize:'var(--text-base)', color:'var(--color-text)', fontFamily:'monospace', lineHeight:1.2 }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ padding:'var(--space-2) var(--space-6)', display:'flex', gap:'var(--space-2)',
        alignItems:'center', borderBottom:'1px solid var(--color-border)', flexShrink:0,
        background:'var(--color-surface)' }}>
        <div style={{ position:'relative', flex:1, minWidth:160 }}>
          <svg style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-faint)', pointerEvents:'none' }}
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input className="form-input" value={busca} onChange={e=>setBusca(e.target.value)}
            placeholder="Buscar…"
            style={{ paddingLeft:26, fontSize:'var(--text-xs)', height:28, paddingTop:0, paddingBottom:0 }} />
        </div>
        <select className="form-input" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          style={{ fontSize:'var(--text-xs)', height:28, padding:'0 var(--space-2)', minWidth:130 }}>
          <option value="todos">Todos os status</option>
          {['Aguardando','Em Produção','Pronto','Entregue','Cancelado'].map(s=><option key={s}>{s}</option>)}
        </select>
        <select className="form-input" value={filterTipo} onChange={e=>setFilterTipo(e.target.value)}
          style={{ fontSize:'var(--text-xs)', height:28, padding:'0 var(--space-2)', minWidth:120 }}>
          {tiposDisponiveis.map(t=><option key={t} value={t}>{t==='todos'?'Todos os tipos':t}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'var(--text-xs)' }}>
          <thead style={{ position:'sticky', top:0, zIndex:10, background:'var(--color-surface-offset)' }}>
            <tr style={{ borderBottom:'1px solid var(--color-border)' }}>
              {['Nº','Cliente','Tipo','Descrição / Obs.','Prazo','Status','Valor','Restante',''].map((h,i) => (
                <th key={i} style={{ padding:'var(--space-2) var(--space-3)', textAlign: i>=6&&i<8?'right':'left',
                  fontWeight:700, color:'var(--color-text-muted)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign:'center', padding:'var(--space-12)', color:'var(--color-text-faint)' }}>
                Nenhuma ordem encontrada
              </td></tr>
            ) : paginated.map(o => {
              const vencida = o.prazoentrega && o.prazoentrega < today && !['Pronto', 'Entregue', 'Cancelado'].includes(o.status);
              const saldo = Number(o.saldoaberto ?? 0);
              const quitado = saldo <= 0.009;
              return (
                <tr key={o.id} style={{ cursor:'pointer', borderBottom:'1px solid var(--color-border)' }}
                  onClick={() => navigate(`/ordens/${o.id}`)}>
                  <td style={{ fontWeight:700, color:'var(--color-primary)', fontSize:'var(--text-xs)',
                    padding:'var(--space-2) var(--space-3)' }}>{o.numero}</td>
                  <td style={{ fontWeight:600, padding:'var(--space-2) var(--space-3)' }}>
                    {o.clientenome}
                    {o.prioridade==='Urgente' && <span style={{ marginLeft:4, fontSize:9, fontWeight:700, color:'var(--color-error)', background:'rgba(161,44,123,0.10)', borderRadius:'var(--radius-full)', padding:'1px 5px' }}>URGENTE</span>}
                  </td>
                  <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                    <span className={`badge badge-${tipoBadge(o.servico)}`} style={{ fontSize:10 }}>{o.servico}</span>
                  </td>
                  <td style={{ maxWidth:220, fontSize:'var(--text-xs)', color:'var(--color-text-muted)',
                    padding:'var(--space-2) var(--space-3)' }}>
                    {o.itens_resumo && o.itens_resumo.trim()
                      ? <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500 }} title={o.itens_resumo}>📦 {o.itens_resumo}</span>
                      : o.observacoes && o.observacoes.trim()
                        ? <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontStyle:'italic' }} title={o.observacoes}>📝 {o.observacoes}</span>
                        : <span style={{ color:'var(--color-text-faint)' }}>—</span>
                    }
                  </td>
                  <td style={{ fontSize:'var(--text-xs)', padding:'var(--space-2) var(--space-3)',
                    color: vencida?'var(--color-error)':'var(--color-text-muted)', fontWeight: vencida?700:400 }}>{fmtD(o.prazoentrega)}</td>
                  <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                    <span className={`badge badge-${statusColor(o.status)}`} style={{ fontSize:10 }}>{o.status}</span>
                  </td>
                  <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-xs)',
                    padding:'var(--space-2) var(--space-3)' }}>{fmt(o.valortotal||o.valor)}</td>
                  <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-xs)',
                    color: quitado ? 'var(--color-success)' : 'var(--color-warning)', fontWeight:700,
                    padding:'var(--space-2) var(--space-3)' }}>
                    {quitado ? <span style={{ fontSize:9, letterSpacing:'0.04em' }}>QUITADO</span> : fmt(saldo)}
                  </td>
                  <td style={{ padding:'var(--space-2) var(--space-3)' }} onClick={e=>e.stopPropagation()}>
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      {canEdit && (
                        <button onClick={e=>{e.stopPropagation();openEdit(o.id);}}
                          style={{ color:'var(--color-text-muted)', padding:4, borderRadius:'var(--radius-sm)',
                            background:'none', border:'none', cursor:'pointer' }} title="Editar">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={e=>handleDelete(o.id,e)}
                          style={{ color:'var(--color-error)', padding:4, borderRadius:'var(--radius-sm)',
                            background:'none', border:'none', cursor:'pointer' }} title="Remover">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                          </svg>
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

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ padding:'var(--space-2) var(--space-6)', borderTop:'1px solid var(--color-border)',
          display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
          background:'var(--color-surface)', fontSize:'var(--text-xs)' }}>
          <span style={{ color:'var(--color-text-muted)' }}>Pagina {page} de {totalPages} • {totalOrdens} registro{totalOrdens!==1?'s':''}</span>
          <div style={{ display:'flex', gap:'var(--space-2)' }}>
            <button className="btn btn-secondary" onClick={()=>setPage(p=>Math.max(1,p-1))}
              disabled={page===1} style={{ fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-3)' }}>← Anterior</button>
            {Array.from({length:totalPages},(_,i)=>i+1).map(n=>(
              <button key={n} onClick={()=>setPage(n)}
                style={{ fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-3)',
                  background: n===page ? 'var(--color-primary)' : 'transparent',
                  color: n===page ? '#fff' : 'var(--color-text-muted)',
                  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
                  cursor:'pointer', fontWeight: n===page ? 700 : 400 }}>{n}</button>
            ))}
            <button className="btn btn-secondary" onClick={()=>setPage(p=>Math.min(totalPages,p+1))}
              disabled={page===totalPages} style={{ fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-3)' }}>Próximo →</button>
          </div>
        </div>
      )}

      {showModal && (
        <ModalOS
          os={modalOS}
          onClose={() => { setShowModal(false); setModalOS(null); }}
          onSaved={load}
          clientes={clientes}
          todosProdutos={todosProdutos}
          canEdit={canEdit}
          canEditFinanceiro={canEditFinanceiro}
        />
      )}
    </div>
  );
}
