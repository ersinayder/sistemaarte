import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TIPO_OPTS = ['Quadro','Caixas','Corte a Laser','Diversos'];
const STATUS_OPTS = ['Aguardando','Em Produção','Pronto','Entregue','Cancelado'];
const PRIORIDADE_OPTS = ['Normal','Urgente'];

const saldoAberto = (o) =>
  Number(o?.saldoaberto ?? o?.valorrestante ?? (Number(o?.valor||o?.valortotal||0) - Number(o?.entrada||o?.valorentrada||0))) || 0;

const tipoBadge = (servico) => ({
  'Quadro':'primary','Caixas':'warning','Corte a Laser':'success','Diversos':'primary'
})[servico] || 'primary';

// ------- Componente de busca de produtos -------
function ProdutoInput({ produtos, onAdd }) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const fmt = v => v != null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '';

  const sugestoes = useMemo(() => {
    if (!query.trim()) return produtos.slice(0, 8);
    return produtos.filter(p => p.nome.toLowerCase().includes(query.toLowerCase()));
  }, [query, produtos]);

  const handleSelect = (p) => {
    onAdd({ produto_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco || 0, avulso: false });
    setQuery(''); setOpen(false);
  };

  const handleAvulso = () => {
    if (!query.trim()) return;
    onAdd({ produto_id: null, nome: query.trim(), quantidade: 1, preco_unitario: 0, avulso: true });
    setQuery(''); setOpen(false);
  };

  const semResultado = query.trim().length > 0 && sugestoes.length === 0;
  const temSugestoes = sugestoes.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-faint)', pointerEvents:'none' }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          className="form-input"
          style={{ paddingLeft: 32 }}
          placeholder="Buscar produto cadastrado ou digitar novo nome…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter') { e.preventDefault(); if (semResultado) handleAvulso(); else if (sugestoes.length === 1) handleSelect(sugestoes[0]); }
          }}
        />
      </div>

      {open && (temSugestoes || semResultado) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          zIndex: 200, maxHeight: 220, overflowY: 'auto'
        }}>
          {temSugestoes && sugestoes.map(p => (
            <div
              key={p.id}
              style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)' }}
              onMouseDown={() => handleSelect(p)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <span style={{ fontWeight: 500 }}>{p.nome}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{fmt(p.preco)}</span>
            </div>
          ))}
          {semResultado && (
            <div
              style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-primary)', borderTop: temSugestoes ? '1px solid var(--color-divider)' : 'none' }}
              onMouseDown={handleAvulso}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Adicionar <strong style={{ marginLeft: 2 }}>"{query}"</strong> como item avulso
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// -------------------------------------------------------

export default function Ordens() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit  = user?.role !== 'viewer';
  const isAdmin  = user?.role === 'admin';

  const blankForm = {
    cliente_id:'', clientenome:'', servico:TIPO_OPTS[0], valortotal:"", valorentrada:"",
    observacoes:'', prazoentrega:'', prioridade:'Normal',
    status:'Aguardando', produtos:[]
  };

  const [ordens,        setOrdens]       = useState([]);
  const [clientes,      setClientes]     = useState([]);
  const [todosProdutos, setTodosProdutos] = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [saving,        setSaving]       = useState(false);
  const [showForm,      setShowForm]     = useState(false);
  const [editData,      setEditData]     = useState(null);
  const [form,          setForm]         = useState(blankForm);
  const [confirmDel,    setConfirmDel]   = useState(null);
  const [deleting,      setDeleting]     = useState(null);
  const [search,        setSearch]       = useState('');
  const [filterStatus,  setFilterStatus] = useState('');
  const [filterServico, setFilterServico]= useState('');
  const [sortField,     setSortField]    = useState('numero');
  const [sortDir,       setSortDir]      = useState('desc');
  const [clienteSearch, setClienteSearch]= useState('');
  const [clienteOpen,   setClienteOpen]  = useState(false);
  const clienteRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, cliRes, proRes] = await Promise.all([
        api.get('/ordens'),
        api.get('/clientes'),
        api.get('/produtos'),
      ]);
      setOrdens(ordRes.data);
      setClientes(cliRes.data);
      setTodosProdutos(proRes.data);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => { if (clienteRef.current && !clienteRef.current.contains(e.target)) setClienteOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => { setEditData(null); setForm(blankForm); setClienteSearch(''); setShowForm(true); };

  const openEdit = (o) => {
    setEditData(o);
    const cli = clientes.find(c => c.id === (o.cliente_id || o.clienteid));
    setClienteSearch(cli?.name || o.clientenome || '');
    setForm({
      cliente_id:   o.cliente_id || o.clienteid || '',
      clientenome:  o.clientenome || '',
      servico:      o.servico || TIPO_OPTS[0],
      observacoes:  o.observacoes || '',
      prazoentrega: o.prazoentrega || '',
      prioridade:   o.prioridade || 'Normal',
      status:       o.status || 'Aguardando',
      valortotal:   String(o.valortotal  ?? o.valor   ?? ""),
      valorentrada: String(o.valorentrada ?? o.entrada ?? ""),
      produtos:     o.produtos || [],
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditData(null); setForm(blankForm); setClienteSearch(''); };

  const recalcTotal = useCallback((prods) => {
    if (!prods || prods.length === 0) { setForm(f => ({ ...f, valortotal: '' })); return; }
    const novoTotal = prods.reduce((acc, p) => acc + (Number(p.quantidade||1) * Number(p.preco_unitario||0)), 0);
    setForm(f => ({ ...f, valortotal: novoTotal.toFixed(2) }));
  }, []);

  const addProduto = (prod) => {
    const novos = [...(form.produtos||[]), { ...prod }];
    set('produtos', novos);
    recalcTotal(novos);
  };

  const removeProduto = (idx) => {
    const novos = form.produtos.filter((_,i) => i !== idx);
    set('produtos', novos);
    recalcTotal(novos);
  };

  const updateProd = (idx, campo, valor) => {
    const novos = form.produtos.map((p,i) => i===idx ? {...p, [campo]: valor} : p);
    set('produtos', novos);
    recalcTotal(novos);
  };

  const handleSave = async () => {
    if (!form.cliente_id && !form.clientenome.trim()) { toast.error('Selecione um cliente'); return; }
    if (!form.valortotal) { toast.error('Valor total é obrigatório'); return; }
    const total   = Number(form.valortotal);
    const entrada = form.valorentrada === "" ? 0 : Number(form.valorentrada);
    if (isNaN(total) || total < 0) { toast.error('Valor total inválido'); return; }
    if (isNaN(entrada) || entrada < 0) { toast.error('Entrada inválida'); return; }
    if (entrada > total) { toast.error('Entrada não pode ser maior que o total'); return; }
    setSaving(true);
    try {
      const payload = {
        cliente_id:   form.cliente_id || null,
        clientenome:  form.clientenome,
        servico:      form.servico,
        descricao:    '',
        observacoes:  form.observacoes,
        prazoentrega: form.prazoentrega || null,
        prioridade:   form.prioridade,
        status:       form.status,
        valortotal:   total,
        valorentrada: entrada,
        produtos:     form.produtos,
      };
      if (editData) {
        await api.put(`/ordens/${editData.id}`, payload);
        toast.success('Ordem atualizada');
      } else {
        await api.post('/ordens', payload);
        toast.success('Ordem criada');
      }
      closeForm();
      load();
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await api.delete(`/ordens/${id}`);
      toast.success('Ordem removida');
      setConfirmDel(null);
      load();
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Erro ao remover');
    } finally { setDeleting(null); }
  };

  const fmt  = v => v != null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—';
  const fmtD = d => d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR') : '—';

  const total        = Number(form.valortotal)  || 0;
  const entrada      = Number(form.valorentrada) || 0;
  const restantePrev = total - entrada;

  const statusColor = (s) => ({
    'Aguardando':'primary','Em Produção':'warning','Pronto':'success','Entregue':'success','Cancelado':'error'
  })[s] || 'primary';

  const toggleSort = (f) => {
    if (sortField === f) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortField(f); setSortDir('desc'); }
  };

  const SortIcon = ({ f }) => sortField !== f
    ? <span style={{color:'var(--color-text-faint)',marginLeft:4}}>⇅</span>
    : <span style={{marginLeft:4}}>{sortDir==='asc'?'↑':'↓'}</span>;

  const filtered = useMemo(() => {
    let list = [...ordens];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.numero||'').toLowerCase().includes(q) ||
        (o.clientenome||'').toLowerCase().includes(q) ||
        (o.descricao||'').toLowerCase().includes(q) ||
        (o.servico||'').toLowerCase().includes(q)
      );
    }
    if (filterStatus)  list = list.filter(o => o.status === filterStatus);
    if (filterServico) list = list.filter(o => o.servico === filterServico);
    list.sort((a,b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'numero') { va = parseInt(va?.replace(/\D/g,'')||0); vb = parseInt(vb?.replace(/\D/g,'')||0); }
      else if (sortField === 'valortotal') { va = Number(va||0); vb = Number(vb||0); }
      else if (typeof va === 'string') { va = va?.toLowerCase(); vb = vb?.toLowerCase(); }
      return sortDir==='asc' ? (va>vb?1:-1) : (va<vb?1:-1);
    });
    return list;
  }, [ordens, search, filterStatus, filterServico, sortField, sortDir]);

  const cliFiltered = useMemo(() =>
    clientes.filter(c => !clienteSearch || (c.name||'').toLowerCase().includes(clienteSearch.toLowerCase())).slice(0,10)
  , [clientes, clienteSearch]);

  const produtosSugestoes = useMemo(() =>
    todosProdutos.filter(p => !(form.produtos||[]).find(fp => fp.produto_id && fp.produto_id === p.id))
  , [todosProdutos, form.produtos]);

  const totalOrdens   = ordens.length;
  const totalAberto   = ordens.filter(o => !['Entregue','Cancelado'].includes(o.status)).length;
  const totalReceitas = ordens.reduce((s,o) => s + Number(o.valortotal||o.valor||0), 0);
  const totalSaldo    = ordens.reduce((s,o) => s + saldoAberto(o), 0);

  return (
    <div style={{ height:'calc(100vh - 60px - var(--space-12))', display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:'var(--text-xl)', fontWeight:800, margin:0 }}>Ordens de Serviço</h1>
          <p style={{ margin:0, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{totalAberto} ativa{totalAberto!==1?'s':''} de {totalOrdens} total</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nova OS
          </button>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'var(--space-3)', marginBottom:'var(--space-4)', flexShrink:0 }}>
        {[
          { label:'Total OS', value:totalOrdens, icon:'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2', color:'var(--color-primary)' },
          { label:'Em Aberto', value:totalAberto, icon:'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', color:'var(--color-warning)' },
          { label:'Receita Total', value:fmt(totalReceitas), icon:'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', color:'var(--color-success)' },
          { label:'Saldo a Receber', value:fmt(totalSaldo), icon:'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z', color:'var(--color-error)' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding:'var(--space-3) var(--space-4)', display:'flex', alignItems:'center', gap:'var(--space-3)' }}>
            <div style={{ width:36, height:36, borderRadius:'var(--radius-md)', background:`color-mix(in oklch, ${k.color} 12%, var(--color-surface))`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="2"><path d={k.icon}/></svg>
            </div>
            <div>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{k.label}</div>
              <div style={{ fontWeight:800, fontSize:'var(--text-sm)', fontFamily:'monospace' }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-3)', flexShrink:0 }}>
        <div style={{ position:'relative', flex:1 }}>
          <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-faint)' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="form-input" style={{ paddingLeft:34 }} placeholder="Buscar por número, cliente, descrição…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-input" style={{ width:'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-input" style={{ width:'auto' }} value={filterServico} onChange={e => setFilterServico(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPO_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-2)' }}>
            <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-3)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontWeight:600, margin:0 }}>{search || filterStatus || filterServico ? 'Nenhuma ordem encontrada' : 'Nenhuma ordem cadastrada'}</p>
              {!search && !filterStatus && canEdit && <p style={{ fontSize:'var(--text-xs)', margin:'var(--space-1) 0 0' }}>Clique em "Nova OS" para começar</p>}
            </div>
          </div>
        ) : (
          <div style={{ overflowY:'auto', flex:1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ cursor:'pointer' }} onClick={() => toggleSort('numero')}>Nº <SortIcon f="numero"/></th>
                  <th style={{ cursor:'pointer' }} onClick={() => toggleSort('clientenome')}>Cliente <SortIcon f="clientenome"/></th>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th style={{ cursor:'pointer' }} onClick={() => toggleSort('prazoentrega')}>Prazo <SortIcon f="prazoentrega"/></th>
                  <th>Status</th>
                  <th style={{ cursor:'pointer', textAlign:'right' }} onClick={() => toggleSort('valortotal')}>Valor <SortIcon f="valortotal"/></th>
                  <th style={{ textAlign:'right' }}>Restante</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const vencida = o.prazoentrega && o.prazoentrega < new Date().toISOString().split('T')[0] && !['Entregue','Cancelado','Pronto'].includes(o.status);
                  const saldo = saldoAberto(o);
                  const quitado = saldo <= 0;
                  return (
                    <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/ordens/${o.id}`)}>
                      <td style={{ fontWeight:700, color:'var(--color-primary)', fontSize:'var(--text-xs)' }}>{o.numero}</td>
                      <td style={{ fontWeight:600 }}>
                        {o.clientenome}
                        {o.prioridade==='Urgente' && <span style={{ marginLeft:4, fontSize:9, fontWeight:700, color:'var(--color-error)', background:'rgba(161,44,123,0.10)', borderRadius:'var(--radius-full)', padding:'1px 5px' }}>URGENTE</span>}
                      </td>
                      <td><span className={`badge badge-${tipoBadge(o.servico)}`} style={{ fontSize:10 }}>{o.servico}</span></td>
                      <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{o.descricao||'—'}</td>
                      <td style={{ fontSize:'var(--text-xs)', color: vencida?'var(--color-error)':'var(--color-text-muted)', fontWeight: vencida?700:400 }}>{fmtD(o.prazoentrega)}</td>
                      <td><span className={`badge badge-${statusColor(o.status)}`} style={{ fontSize:10 }}>{o.status}</span></td>
                      <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-xs)' }}>{fmt(o.valortotal||o.valor)}</td>
                      <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-xs)', color: quitado ? 'var(--color-success)' : 'var(--color-warning)', fontWeight:700 }}>
                        {quitado ? <span style={{ fontSize:9, letterSpacing:'0.04em' }}>QUITADO</span> : fmt(saldo)}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:'var(--space-1)', justifyContent:'flex-end' }} onClick={e => e.stopPropagation()}>
                          {canEdit && (
                            <button className="btn btn-ghost btn-xs" title="Editar" onClick={() => openEdit(o)}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          )}
                          {isAdmin && (
                            <button className="btn btn-ghost btn-xs" style={{ color:'var(--color-error)' }} title="Excluir (Admin)" onClick={() => setConfirmDel(o)}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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

      {showForm && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" style={{ maxWidth:640, maxHeight:'92vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ position:'sticky', top:0, background:'var(--color-surface)', zIndex:1, borderBottom:'1px solid var(--color-divider)' }}>
              <h2 className="modal-title">{editData ? `Editar OS ${editData.numero}` : 'Nova Ordem de Serviço'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={closeForm}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn:'1/-1', position:'relative' }} ref={clienteRef}>
                  <label className="form-label">Cliente <span style={{color:"var(--color-error)"}}>*</span></label>
                  <input
                    className="form-input"
                    placeholder="Digite para buscar cliente…"
                    value={clienteSearch}
                    onChange={e => { setClienteSearch(e.target.value); set('cliente_id',''); set('clientenome', e.target.value); setClienteOpen(true); }}
                    onFocus={() => setClienteOpen(true)}
                  />
                  {clienteOpen && cliFiltered.length > 0 && (
                    <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', boxShadow:'var(--shadow-md)', zIndex:100, maxHeight:200, overflowY:'auto' }}>
                      {cliFiltered.map(c => (
                        <div key={c.id} style={{ padding:'var(--space-2) var(--space-3)', cursor:'pointer', fontSize:'var(--text-sm)' }}
                          onMouseDown={() => { set('cliente_id', c.id); set('clientenome', c.name); setClienteSearch(c.name); setClienteOpen(false); }}
                          onMouseEnter={e => e.currentTarget.style.background='var(--color-surface-offset)'}
                          onMouseLeave={e => e.currentTarget.style.background=''}>
                          <span style={{ fontWeight:600 }}>{c.name}</span>
                          {c.phone && <span style={{ marginLeft:8, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{c.phone}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo de Serviço</label>
                  <select className="form-input" value={form.servico} onChange={e=>set('servico',e.target.value)}>
                    {TIPO_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Prioridade</label>
                  <select className="form-input" value={form.prioridade} onChange={e=>set('prioridade',e.target.value)}>
                    {PRIORIDADE_OPTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Produtos</label>
                  <ProdutoInput produtos={produtosSugestoes} onAdd={addProduto} />
                  {form.produtos && form.produtos.length > 0 && (
                    <div style={{ marginTop:'var(--space-2)', display:'flex', flexDirection:'column', gap:'var(--space-1)' }}>
                      {form.produtos.map((p, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', padding:'var(--space-2) var(--space-3)', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', fontSize:'var(--text-xs)' }}>
                          <span style={{ flex:1, fontWeight:500, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {p.nome}
                            {p.avulso && <span style={{ marginLeft:6, fontSize:9, color:'var(--color-text-faint)', fontWeight:400, background:'var(--color-surface-dynamic)', borderRadius:'var(--radius-full)', padding:'1px 5px' }}>avulso</span>}
                          </span>
                          {p.avulso ? (
                            <input type="number" step="0.01" min="0" className="form-input"
                              style={{ width:90, fontFamily:'monospace', textAlign:'right', fontSize:'var(--text-xs)', padding:'2px 6px' }}
                              placeholder="R$ 0,00"
                              value={p.preco_unitario || ''}
                              onChange={e => updateProd(i, 'preco_unitario', parseFloat(e.target.value)||0)}
                              onWheel={e => e.currentTarget.blur()}
                              title="Preço unitário"
                            />
                          ) : (
                            <span style={{ fontFamily:'monospace', color:'var(--color-text-faint)', fontSize:'var(--text-xs)', minWidth:70, textAlign:'right' }}>
                              {Number(p.preco_unitario).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                            </span>
                          )}
                          <input type="number" min="1" className="form-input"
                            style={{ width:52, textAlign:'center', fontSize:'var(--text-xs)', padding:'2px 4px' }}
                            value={p.quantidade}
                            onChange={e => updateProd(i, 'quantidade', Number(e.target.value)||1)}
                            onWheel={e => e.currentTarget.blur()}
                            title="Quantidade"
                          />
                          <span style={{ fontFamily:'monospace', color:'var(--color-text-muted)', minWidth:72, textAlign:'right', fontWeight:600 }}>
                            {(Number(p.quantidade) * Number(p.preco_unitario||0)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                          </span>
                          <button className="btn btn-ghost btn-xs" style={{ color:'var(--color-error)', padding:2, flexShrink:0 }} onClick={() => removeProduto(i)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Observações internas</label>
                  <textarea className="form-input" rows={2} value={form.observacoes} onChange={e=>set('observacoes',e.target.value)} placeholder="Notas para a equipe da oficina…" />
                </div>

                <div className="form-group">
                  <label className="form-label">Prazo de Entrega</label>
                  <input className="form-input" type="date" value={form.prazoentrega} onChange={e=>set('prazoentrega',e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-input" value={form.status} onChange={e=>set('status',e.target.value)}>
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Valor Total (R$) <span style={{color:"var(--color-error)"}}>*</span>
                    <span style={{marginLeft:6,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",fontWeight:400}}>— calculado pelos produtos, editável</span>
                  </label>
                  <input className="form-input" type="number" step="0.01" min="0"
                    value={form.valortotal} onChange={e=>set("valortotal",e.target.value)}
                    onWheel={e=>e.currentTarget.blur()} style={{ fontFamily:"monospace", fontWeight:700 }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Entrada (R$)
                    <span style={{marginLeft:6,fontSize:"var(--text-xs)",color:"var(--color-text-muted)",fontWeight:400}}>opcional</span>
                  </label>
                  <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00 (sem entrada)"
                    value={form.valorentrada} onChange={e=>set("valorentrada",e.target.value)} onWheel={e=>e.currentTarget.blur()}/>
                </div>
              </div>

              {total > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"var(--space-3) var(--space-4)",
                  background: restantePrev > 0 ? 'var(--color-warning-highlight)' : 'var(--color-primary-highlight)',
                  borderRadius:"var(--radius-md)", fontSize:"var(--text-xs)", marginTop:"var(--space-3)"
                }}>
                  <span style={{color:"var(--color-text-muted)"}}>Restante a receber após entrada:</span>
                  <strong style={{fontFamily:"monospace",color: restantePrev > 0 ? "var(--color-warning)" : "var(--color-success)"}}>{fmt(restantePrev)}</strong>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ position:'sticky', bottom:0, background:'var(--color-surface)', borderTop:'1px solid var(--color-divider)' }}>
              <button className="btn btn-ghost" onClick={closeForm}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando…' : editData ? 'Salvar alterações' : 'Criar OS'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmDel && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth:400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Excluir Ordem</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Excluir a OS <strong>{confirmDel.numero}</strong> de <strong>{confirmDel.clientenome}</strong>?</p>
              <p style={{ marginTop:'var(--space-2)', fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>Esta ação não pode ser desfeita.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDel.id)} disabled={deleting === confirmDel.id}>
                {deleting === confirmDel.id ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
