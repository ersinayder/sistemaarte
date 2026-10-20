import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { emit } from '../services/eventBus';

const TIPO_OPT = ['Entrada','Saída'];
const PAGAMENTO_OPT = ['Dinheiro','Pix','Cartão de Débito','Cartão de Crédito','Transferência','Outros'];
const CATEG_OPT = {
  Entrada: ['Pagamento OS','Adiantamento','Outros'],
  Saída:  ['Fornecedor','Despesa Fixa','Despesa Variável','Retirada','Outros'],
};

// Retorna "YYYY-MM-DD" no fuso local do navegador
function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Normaliza qualquer valor de data para "YYYY-MM-DD" local
function normalizeDate(val) {
  if (!val) return '';
  // Se já é YYYY-MM-DD sem hora, retorna direto
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // Tem hora/timezone — converte para local
  const d = new Date(val);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function shiftDay(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function labelDay(dateStr) {
  const today = getToday();
  const yesterday = shiftDay(today, -1);
  if (dateStr === today) return 'Hoje';
  if (dateStr === yesterday) return 'Ontem';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' });
}

async function abrirFechamentoCaixa(date) {
  try {
    const res = await api.post(`/caixa/fechamento/print?data=${encodeURIComponent(date)}`, {}, { skipGlobalErrorToast: true });
    if (res.data?.mode === 'queue') {
      toast.success(res.data.message || 'Fechamento enviado para a impressora.');
    } else if (res.data?.mode === 'browser' && res.data?.printUrl) {
      window.open(res.data.printUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`/api/caixa/fechamento?data=${encodeURIComponent(date)}`, '_blank', 'noopener,noreferrer');
    }
  } catch (err) {
    toast.error(err.response?.data?.error || err.message || 'Erro ao imprimir fechamento');
  }
}

function isEntrada(row) {
  const t = String(typeof row === 'object' ? row?.tipo : row || '').trim().toLowerCase();
  return t === 'entrada';
}

function isSaida(row) {
  const t = String(typeof row === 'object' ? row?.tipo : row || '').trim().toLowerCase();
  return t === 'saida' || t === 'saída';
}

function Pagination({ current, total, onChange }) {
  if (total <= 1) return null;
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'var(--space-3) var(--space-4)', borderTop:'1px solid var(--color-border)',
      flexShrink:0, gap:'var(--space-2)', flexWrap:'wrap' }}>
      <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
        Página {current} de {total}
      </span>
      <div style={{ display:'flex', gap:'var(--space-1)', alignItems:'center' }}>
        <button onClick={() => onChange(Math.max(1, current - 1))} disabled={current === 1}
          className="btn btn-secondary" style={{ fontSize:'var(--text-xs)', padding:'2px 8px' }}>‹</button>
        {pages.map((p, i) => (
          <button key={i} onClick={() => typeof p === 'number' && onChange(p)} disabled={p === '...'}
            style={{ fontSize:'var(--text-xs)', padding:'2px 8px', minWidth:28,
              background: p === current ? 'var(--color-primary)' : 'transparent',
              color: p === current ? '#fff' : 'var(--color-text-muted)',
              border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', cursor: p === '...' ? 'default' : 'pointer' }}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(Math.min(total, current + 1))} disabled={current === total}
          className="btn btn-secondary" style={{ fontSize:'var(--text-xs)', padding:'2px 8px' }}>›</button>
      </div>
    </div>
  );
}

export default function Caixa() {
  const { can } = useAuth();
  const canCreate = typeof can === 'function' && can('caixa.criar_lancamento');
  const canEdit = typeof can === 'function' && can('caixa.editar_lancamento');
  const canDelete = typeof can === 'function' && can('caixa.excluir_lancamento');
  const canPrintFechamento = typeof can === 'function' && can('caixa.fechamento');

  const [lancamentos, setLancamentos] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [editItem,    setEditItem]    = useState(null);
  const [filterTipo,  setFilterTipo]  = useState('todos');
  const [filterPag,   setFilterPag]   = useState('todos');
  const [filterCat,   setFilterCat]   = useState('todos');
  const [filterOrigem,setFilterOrigem]= useState('todos');
  const [busca,       setBusca]       = useState('');
  const [page,        setPage]        = useState(1);
  const [selectedDay, setSelectedDay] = useState(getToday());
  const [viewMode,    setViewMode]    = useState('dia');
  const PER_PAGE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const param = viewMode === 'dia'
        ? `?data=${selectedDay}`
        : `?mes=${selectedDay.slice(0,7)}`;
      const { data } = await api.get(`/caixa${param}`);
      setLancamentos(data || []);
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedDay]);

  useEffect(() => { load(); }, [load]);

  const lancamentosFiltrados = useMemo(() => {
    let items = lancamentos;
    if (filterTipo !== 'todos') items = items.filter(l => (filterTipo === 'Saída' ? isSaida(l) : isEntrada(l)));
    if (filterPag  !== 'todos') items = items.filter(l => l.pagamento === filterPag);
    if (filterCat  !== 'todos') items = items.filter(l => l.categoria === filterCat);
    if (filterOrigem !== 'todos') items = items.filter(l => (l.origem || 'manual') === filterOrigem);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      items = items.filter(l =>
        (l.descricao||'').toLowerCase().includes(q) ||
        (l.itens_resumo||'').toLowerCase().includes(q) ||
        (l.categoria||'').toLowerCase().includes(q) ||
        (l.ordemnumero||'').toLowerCase().includes(q)
      );
    }
    return items.sort((a,b) => normalizeDate(b.data).localeCompare(normalizeDate(a.data)));
  }, [lancamentos, filterTipo, filterPag, filterCat, filterOrigem, busca]);

  const { entrada, saida, saldo } = useMemo(() => {
    const e  = lancamentosFiltrados.filter(isEntrada).reduce((s,l) => s+Number(l.valor||0), 0);
    const s2 = lancamentosFiltrados.filter(isSaida).reduce((s,l) => s+Number(l.valor||0), 0);
    return { entrada: e, saida: s2, saldo: e - s2 };
  }, [lancamentosFiltrados]);

  const totalPages = Math.max(1, Math.ceil(lancamentosFiltrados.length / PER_PAGE));
  const paginated  = lancamentosFiltrados.slice((page-1)*PER_PAGE, page*PER_PAGE);

  useEffect(() => { setPage(1); }, [filterTipo, filterPag, filterCat, filterOrigem, busca, selectedDay, viewMode]);

  const handleSave = async (form) => {
    if (editItem && !canEdit) return toast.error('Sem permissao para editar lancamento');
    if (!editItem && !canCreate) return toast.error('Sem permissao para criar lancamento');
    try {
      if (editItem) {
        await api.put(`/caixa/${editItem.id}`, form);
        toast.success('Lançamento atualizado');
      } else {
        await api.post('/caixa', form);
        toast.success('Lançamento registrado');
        emit('caixaUpdated');
      }
      load();
      setShowModal(false);
      setEditItem(null);
    } catch(err) {
      toast.error(err?.response?.data?.error || 'Erro ao salvar');
    }
  };

  const handleDelete = async (id) => {
    if (!canDelete) return toast.error('Sem permissao para excluir lancamento');
    if (!window.confirm('Excluir este lançamento?')) return;
    try {
      await api.delete(`/caixa/${id}`);
      toast.success('Lançamento excluído');
      load();
    } catch { toast.error('Erro ao excluir'); }
  };

  const fmt = v => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

  const categorias = useMemo(() => {
    const set = new Set(lancamentosFiltrados.map(l => l.categoria).filter(Boolean));
    return ['todos', ...Array.from(set)];
  }, [lancamentosFiltrados]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--color-text-muted)' }}>
      Carregando…
    </div>
  );

  return (
    <div className="erp-page">

      {/* Header */}
      <div className="erp-page-header" style={{ padding:'var(--space-3) var(--space-6)', borderBottom:'1px solid var(--color-border)',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
        background:'var(--color-surface)' }}>
        <div>
          <h1 style={{ fontWeight:700, fontSize:'var(--text-lg)', margin:0 }}>Caixa</h1>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', margin:0 }}>
            {lancamentosFiltrados.length} lançamentos
          </p>
        </div>
        <div className="erp-page-actions" style={{ display:'flex', gap:'var(--space-2)', alignItems:'center' }}>
          <div style={{ display:'flex', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)',
            border:'1px solid var(--color-border)', overflow:'hidden' }}>
            {[['dia','Dia'],['mes','Mês']].map(([v,l]) => (
              <button key={v} onClick={()=>setViewMode(v)}
                style={{ padding:'4px 12px', fontSize:'var(--text-xs)', fontWeight:600,
                  background: viewMode===v ? 'var(--color-primary)' : 'transparent',
                  color: viewMode===v ? '#fff' : 'var(--color-text-muted)',
                  border:'none', cursor:'pointer', transition:'all 0.15s' }}>
                {l}
              </button>
            ))}
          </div>
          {viewMode === 'dia' && (
            <div style={{ display:'flex', alignItems:'center', gap:'var(--space-1)' }}>
              <button onClick={()=>setSelectedDay(d=>shiftDay(d,-1))}
                style={{ padding:'4px 8px', fontSize:'var(--text-xs)', background:'var(--color-surface-offset)',
                  border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', cursor:'pointer' }}>‹</button>
              <input type="date" value={selectedDay} onChange={e=>setSelectedDay(e.target.value)}
                style={{ fontSize:'var(--text-xs)', padding:'3px 6px', background:'var(--color-surface-offset)',
                  border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)',
                  color:'var(--color-text)', cursor:'pointer' }} />
              <button onClick={()=>setSelectedDay(d=>shiftDay(d,1))}
                style={{ padding:'4px 8px', fontSize:'var(--text-xs)', background:'var(--color-surface-offset)',
                  border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', cursor:'pointer' }}>›</button>
              <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginLeft:4 }}>
                {labelDay(selectedDay)}
              </span>
            </div>
          )}
          {canPrintFechamento && viewMode === 'dia' && (
            <button className="btn btn-secondary"
              style={{ fontSize:'var(--text-xs)', display:'flex', alignItems:'center', gap:'var(--space-1)' }}
              onClick={() => abrirFechamentoCaixa(selectedDay)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              PDF
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="erp-kpi-grid cols-3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',
        gap:'var(--space-2)', padding:'var(--space-2) var(--space-4)',
        borderBottom:'1px solid var(--color-border)', flexShrink:0 }}>
        {[
          { label:'Entradas', value:fmt(entrada), color:'var(--color-success)', icon:'M12 2v20M17 7H9.5a3.5 3.5 0 0 0 0 7h5' },
          { label:'Saídas',   value:fmt(saida),   color:'var(--color-error)',   icon:'M12 2v20M17 12H6' },
          { label:'Saldo',    value:fmt(saldo),   color: saldo>=0 ? 'var(--color-primary)' : 'var(--color-error)', icon:'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
        ].map(k => (
          <div key={k.label} className="erp-kpi-card" style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)',
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
              <div style={{ fontWeight:700, fontSize:'var(--text-base)', color:k.color, fontFamily:'monospace', lineHeight:1.2 }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Formulário Embutido de Lançamento Direto */}
      {canCreate && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-surface-offset)', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
              {editItem ? 'Editar Lançamento' : 'Novo Lançamento Manual'}
            </span>
            {editItem && (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditItem(null)}>✕ Cancelar edição</button>
            )}
          </div>
          <ModalLancamento
            inline
            item={editItem}
            onClose={() => setEditItem(null)}
            onSave={handleSave}
            defaultDate={selectedDay}
          />
        </div>
      )}

      {/* Filtros Compactos em Linha Única */}
      <div className="erp-filter-bar" style={{ padding:'var(--space-2) var(--space-4)', display:'grid',
        gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'var(--space-2)',
        alignItems:'center', borderBottom:'1px solid var(--color-border)', flexShrink:0,
        background:'var(--color-surface)' }}>
        <div className="erp-search" style={{ position:'relative', minWidth:140 }}>
          <svg style={{ position:'absolute', left:7, top:'50%', transform:'translateY(-50%)',
            color:'var(--color-text-faint)', pointerEvents:'none' }}
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input className="form-input" value={busca} onChange={e=>setBusca(e.target.value)}
            placeholder="Buscar lançamentos…"
            style={{ paddingLeft:24, fontSize:'var(--text-xs)', height:28, paddingTop:0, paddingBottom:0, width:'100%' }} />
        </div>
        <select className="form-input" value={filterTipo} onChange={e=>setFilterTipo(e.target.value)}
          style={{ fontSize:'var(--text-xs)', height:28, padding:'0 var(--space-2)', width:'100%' }}>
          <option value="todos">Tipo: Todos</option>
          {TIPO_OPT.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select className="form-input" value={filterPag} onChange={e=>setFilterPag(e.target.value)}
          style={{ fontSize:'var(--text-xs)', height:28, padding:'0 var(--space-2)', width:'100%' }}>
          <option value="todos">Pagamento: Todos</option>
          {PAGAMENTO_OPT.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <select className="form-input" value={filterCat} onChange={e=>setFilterCat(e.target.value)}
          style={{ fontSize:'var(--text-xs)', height:28, padding:'0 var(--space-2)', width:'100%' }}>
          <option value="todos">Categoria: Todas</option>
          {categorias.filter(c=>c!=='todos').map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-input" value={filterOrigem} onChange={e=>setFilterOrigem(e.target.value)}
          style={{ fontSize:'var(--text-xs)', height:28, padding:'0 var(--space-2)', width:'100%' }}>
          <option value="todos">Origem: Todas</option>
          <option value="manual">Manual</option>
          <option value="entradaos">Entrada OS</option>
          <option value="saldoos">Recebimento OS</option>
          <option value="vendaavulsa">Venda avulsa</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="mobile-list">
        {paginated.length === 0 ? (
          <div className="empty-state" style={{ background:'var(--color-surface)', borderRadius:'var(--radius-lg)' }}>
            <h3>Nenhum lançamento encontrado</h3>
            <p>Ajuste os filtros ou registre um novo lançamento manual.</p>
          </div>
        ) : paginated.map(l => (
          <article key={l.id} className="mobile-record-card">
            <div className="mobile-record-top">
              <div style={{ minWidth:0 }}>
                <div className="mobile-record-code">
                  {l.data ? new Date(normalizeDate(l.data)+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : 'Sem data'}
                </div>
                <div className="mobile-record-title">{l.descricao || l.categoria || 'Lançamento'}</div>
                {l.itens_resumo && <div className="mobile-record-sub truncate" title={l.itens_resumo}>{l.itens_resumo}</div>}
              </div>
              <div className="mobile-record-value" style={{ color: isEntrada(l) ? 'var(--color-success)' : 'var(--color-error)' }}>
                {isEntrada(l) ? '+' : '-'} {fmt(l.valor)}
              </div>
            </div>
            <div className="mobile-record-row">
              <div className="mobile-record-meta">
                <span className={`badge ${isEntrada(l) ? 'badge-success' : 'badge-error'}`}>{isEntrada(l) ? 'Entrada' : 'Saída'}</span>
                {l.pagamento && <span className={`badge badge-${String(l.pagamento).toLowerCase()}`}>{l.pagamento}</span>}
                {l.categoria && <span className="badge badge-secondary">{l.categoria}</span>}
              </div>
              <div className="mobile-record-sub">{l.ordemnumero || 'Manual'}</div>
            </div>
            {(canEdit || canDelete) && (
              <div className="mobile-record-footer">
                <div />
                <div className="mobile-record-actions">
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={()=>{ setEditItem(l); setShowModal(true); }}>Editar</button>}
                  {canDelete && <button className="btn btn-ghost btn-sm inline-danger" onClick={()=>handleDelete(l.id)}>Excluir</button>}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="desktop-table-area mobile-cards-hidden" style={{ flex:1, overflow:'auto' }}>
        <table className="data-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:'var(--text-xs)' }}>
          <thead style={{ position:'sticky', top:0, zIndex:10, background:'var(--color-surface-offset)' }}>
            <tr style={{ borderBottom:'1px solid var(--color-border)' }}>
              {['Data','Tipo','Categoria','Pagamento','OS','Descrição','Valor',''].map((h,i) => (
                <th key={i} style={{ padding:'var(--space-2) var(--space-3)',
                  textAlign: i===6?'right':'left', fontWeight:700,
                  color:'var(--color-text-muted)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign:'center', padding:'var(--space-12)',
                color:'var(--color-text-faint)' }}>Nenhum lançamento encontrado</td></tr>
            ) : paginated.map(l => (
              <tr key={l.id} style={{ borderBottom:'1px solid var(--color-border)' }}>
                <td style={{ padding:'var(--space-2) var(--space-3)', whiteSpace:'nowrap',
                  color:'var(--color-text-muted)' }}>
                  {l.data ? new Date(normalizeDate(l.data)+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '—'}
                </td>
                <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:'var(--radius-full)',
                    background: isEntrada(l) ? 'rgba(67,122,34,0.12)' : 'rgba(161,44,123,0.10)',
                    color: isEntrada(l) ? 'var(--color-success)' : 'var(--color-error)' }}>
                    {isEntrada(l) ? '↑ Entrada' : '↓ Saída'}
                  </span>
                </td>
                <td style={{ padding:'var(--space-2) var(--space-3)', color:'var(--color-text-muted)' }}>{l.categoria||'—'}</td>
                <td style={{ padding:'var(--space-2) var(--space-3)', color:'var(--color-text-muted)' }}>{l.pagamento||'—'}</td>
                <td style={{ padding:'var(--space-2) var(--space-3)', color:'var(--color-primary)', fontWeight:600 }}>
                  {l.ordemnumero ? <span style={{ cursor:'pointer' }}>{l.ordemnumero}</span> : '—'}
                </td>
                <td style={{ padding:'var(--space-2) var(--space-3)', maxWidth:240, color:'var(--color-text-muted)' }}
                  title={[l.descricao, l.itens_resumo].filter(Boolean).join(' - ')}>
                  <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.descricao||'—'}</div>
                  {l.itens_resumo && (
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                       fontSize:10, color:'var(--color-text-faint)', marginTop:2 }}>{l.itens_resumo}</div>
                  )}
                </td>
                <td style={{ padding:'var(--space-2) var(--space-3)', textAlign:'right', fontFamily:'monospace',
                  fontWeight:700, color: isEntrada(l) ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {isEntrada(l) ? '+' : '−'} {fmt(l.valor)}
                </td>
                <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                  <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                    {canEdit && (
                      <button onClick={()=>{ setEditItem(l); setShowModal(true); }}
                        style={{ color:'var(--color-text-muted)', padding:4, background:'none', border:'none', cursor:'pointer',
                          borderRadius:'var(--radius-sm)' }} title="Editar">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={()=>handleDelete(l.id)}
                        style={{ color:'var(--color-error)', padding:4, background:'none', border:'none', cursor:'pointer',
                          borderRadius:'var(--radius-sm)' }} title="Excluir">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination current={page} total={totalPages} onChange={setPage} />
    </div>
  );
}

function ModalLancamento({ inline, item, onClose, onSave, defaultDate }) {
  const [ordens, setOrdens] = useState([]);
  const [form, setForm] = useState({
    tipo:'Entrada', pagamento:'Pix', categoria:'Pagamento OS',
    descricao:'', valor:'', data: defaultDate || getToday(),
    ordemid:'',
  });

  useEffect(() => {
    api.get('/ordens').then(r => {
      const ativas = (r.data||[]).filter(o =>
        o.status !== 'Cancelado' && o.status !== 'Entregue' && Number(o.saldoaberto||0) > 0.009
      );
      setOrdens(ativas);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (item) {
      setForm({
        tipo: item.tipo || 'Entrada',
        pagamento: item.pagamento || 'Pix',
        categoria: item.categoria || 'Pagamento OS',
        descricao: item.descricao || '',
        valor: item.valor || '',
        data: item.data ? normalizeDate(item.data) : getToday(),
        ordemid: item.ordemid || '',
      });
    }
  }, [item]);

  const set = (k,v) => setForm(f => ({...f, [k]:v}));

  const handleOsChange = (e) => {
    const id = e.target.value;
    if (!id) { set('ordemid',''); set('descricao',''); return; }
    const os = ordens.find(o => String(o.id) === String(id));
    if (os) {
      set('ordemid', os.id);
      set('descricao', `Pagamento OS ${os.numero} - ${os.clientenome||''}`.trim());
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, valor: Number(form.valor)||0, ordemid: form.ordemid||null, pago: 1 });
  };

  const handleReset = () => {
    setForm({
      tipo:'Entrada', pagamento:'Pix', categoria:'Pagamento OS',
      descricao:'', valor:'', data: defaultDate || getToday(),
      ordemid:'',
    });
    if (onClose) onClose();
  };

  const cats = CATEG_OPT[form.tipo] || [];

  const formContent = (
    <form onSubmit={(e) => {
      handleSubmit(e);
      if (!item) {
        setForm(f => ({ ...f, descricao:'', valor:'', ordemid:'' }));
      }
    }} style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:'var(--space-2)' }}>
        {/* Tipo */}
        <div style={{ display:'flex', gap:'var(--space-2)' }}>
          {TIPO_OPT.map(t => (
            <button key={t} type="button" onClick={()=>set('tipo',t)}
              style={{ flex:1, padding:'6px var(--space-2)', fontSize:'var(--text-xs)', fontWeight:700,
                borderRadius:'var(--radius-md)', border:'2px solid',
                borderColor: form.tipo===t ? (t==='Entrada'?'var(--color-success)':'var(--color-error)') : 'var(--color-border)',
                background: form.tipo===t ? (t==='Entrada'?'rgba(67,122,34,0.12)':'rgba(161,44,123,0.12)') : 'transparent',
                color: form.tipo===t ? (t==='Entrada'?'var(--color-success)':'var(--color-error)') : 'var(--color-text-muted)',
                cursor:'pointer' }}>
              {t==='Entrada' ? '↑ Entrada' : '↓ Saída'}
            </button>
          ))}
        </div>

        {/* Forma de Pagamento */}
        <div>
          <select className="form-input" value={form.pagamento} onChange={e=>set('pagamento',e.target.value)}
            style={{ fontSize:'var(--text-xs)', height:32 }}>
            {PAGAMENTO_OPT.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>

        {/* Categoria */}
        <div>
          <select className="form-input" value={form.categoria} onChange={e=>set('categoria',e.target.value)}
            style={{ fontSize:'var(--text-xs)', height:32 }}>
            {cats.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>

        {/* Data */}
        <div>
          <input className="form-input" type="date" value={form.data}
            onChange={e=>set('data',e.target.value)}
            style={{ fontSize:'var(--text-xs)', height:32 }} required />
        </div>

        {/* Valor */}
        <div>
          <input className="form-input" type="number" step="0.01" value={form.valor}
            placeholder="Valor R$ *"
            onChange={e=>set('valor',e.target.value)}
            style={{ fontSize:'var(--text-xs)', height:32, fontWeight:700 }} required min={0.01} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: form.tipo==='Entrada' ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr', gap:'var(--space-2)' }}>
        {/* OS (apenas Entrada) */}
        {form.tipo === 'Entrada' && (
          <div>
            <select className="form-input" value={form.ordemid} onChange={handleOsChange}
              style={{ fontSize:'var(--text-xs)', height:32 }}>
              <option value="">Sem OS vinculada (opcional)</option>
              {ordens.map(o => (
                <option key={o.id} value={o.id}>
                  {o.numero} — {o.clientenome} (saldo: {Number(o.saldoaberto||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Descrição */}
        <div>
          <input className="form-input" value={form.descricao} onChange={e=>set('descricao',e.target.value)}
            placeholder="Descrição (ex: Pagamento quadro 60x45, Fornecedor X...)"
            style={{ fontSize:'var(--text-xs)', height:32 }} />
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', gap:'var(--space-2)', marginTop:2 }}>
        {item && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset}>Cancelar edição</button>
        )}
        <button type="submit" className="btn btn-primary btn-sm">{item ? 'Salvar Alteração' : 'Registrar Lançamento'}</button>
      </div>
    </form>
  );

  if (inline) {
    return formContent;
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <h2 className="modal-title" style={{ fontWeight:700, fontSize:'var(--text-base)', margin:0 }}>
            {item ? 'Editar Lançamento' : 'Novo Lançamento'}
          </h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="modal-body modal-body-dense">
          {formContent}
        </div>
      </div>
    </div>
  );
}
