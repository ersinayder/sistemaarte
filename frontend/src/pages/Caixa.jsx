import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TIPO_OPT = ['Entrada','Saída'];
const PAGAMENTO_OPT = ['Dinheiro','Pix','Cartão de Débito','Cartão de Crédito','Transferência','Outros'];
const CATEG_OPT = {
  Entrada: ['Pagamento OS','Adiantamento','Outros'],
  Saída:  ['Fornecedor','Despesa Fixa','Despesa Variável','Retirada','Outros'],
};

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function shiftDay(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}

function labelDay(dateStr) {
  const today = getToday();
  const yesterday = shiftDay(today, -1);
  if (dateStr === today) return 'Hoje';
  if (dateStr === yesterday) return 'Ontem';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' });
}

function Pagination({ current, total, onChange }) {
  if (total <= 1) return null;
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'var(--space-3) var(--space-4)', borderTop:'1px solid var(--color-border)',
      flexShrink:0, gap:'var(--space-2)', flexWrap:'wrap', background:'var(--color-surface)' }}>
      <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>Página {current} de {total}</span>
      <div style={{ display:'flex', gap:'var(--space-1)', alignItems:'center' }}>
        <button className="btn btn-ghost btn-xs" onClick={() => onChange(current - 1)} disabled={current === 1}>‹ Anterior</button>
        {pages.map((p, i) =>
          p === '...'
            ? <span key={'e'+i} style={{ padding:'0 var(--space-1)', color:'var(--color-text-faint)', fontSize:'var(--text-xs)' }}>…</span>
            : <button key={p} className={'btn btn-xs ' + (p === current ? 'btn-primary' : 'btn-ghost')}
                onClick={() => onChange(p)} style={{ minWidth:32 }}>{p}</button>
        )}
        <button className="btn btn-ghost btn-xs" onClick={() => onChange(current + 1)} disabled={current === total}>Próximo ›</button>
      </div>
    </div>
  );
}

export default function Caixa() {
  const { user } = useAuth();
  const canEdit  = user?.role !== 'viewer';

  const today = getToday();
  const blankForm = { tipo:'Entrada', categoria:'Pagamento OS', pagamento:'Pix', descricao:'', valor:'', data:today, ordem_id:'' };

  const [lancamentos,   setLancamentos]   = useState([]);
  const [ordens,        setOrdens]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState(blankForm);
  const [editData,      setEditData]      = useState(null);
  const [confirmDel,    setConfirmDel]    = useState(null);
  const [deleting,      setDeleting]      = useState(null);
  const [search,        setSearch]        = useState('');
  const [date,          setDate]          = useState(today);
  const [currentPage,   setCurrentPage]   = useState(1);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, oRes] = await Promise.all([api.get('/caixa'), api.get('/ordens')]);
      setLancamentos(cRes.data);
      setOrdens(oRes.data);
    } catch { toast.error('Erro ao carregar caixa'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCurrentPage(1); }, [search, date]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openNew  = () => { setEditData(null); setForm(blankForm); setShowForm(true); };
  const openEdit = (l) => {
    setEditData(l);
    setForm({
      tipo: l.tipo,
      categoria: l.categoria || '',
      pagamento: l.pagamento || 'Pix',
      descricao: l.descricao || '',
      valor: String(l.valor || ''),
      data: l.data?.slice(0,10) || today,
      ordem_id: l.ordemid || l.ordem_id || ''
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditData(null); setForm(blankForm); };

  const handleSave = async () => {
    if (!form.valor || isNaN(Number(form.valor)) || Number(form.valor) <= 0) { toast.error('Valor inválido'); return; }
    if (!form.pagamento) { toast.error('Selecione a forma de pagamento'); return; }
    setSaving(true);
    try {
      const payload = {
        tipo: form.tipo,
        categoria: form.categoria,
        pagamento: form.pagamento,
        descricao: form.descricao,
        valor: Number(form.valor),
        data: form.data || today,
        pago: true,
        ordemid: form.ordem_id || null,
      };
      if (editData) {
        await api.put(`/caixa/${editData.id}`, payload);
        toast.success('Lançamento atualizado');
      } else {
        await api.post('/caixa', payload);
        toast.success('Lançamento registrado');
      }
      closeForm(); load();
    } catch(e) { toast.error(e?.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await api.delete(`/caixa/${id}`);
      toast.success('Lançamento removido');
      setConfirmDel(null); load();
    } catch(e) { toast.error(e?.response?.data?.error || 'Erro ao remover'); }
    finally { setDeleting(null); }
  };

  const fmt  = v => v != null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—';
  const fmtD = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';

  // OS com saldo pendente (saldoaberto > 0) e não canceladas
  const ordensPendentes = useMemo(() =>
    ordens.filter(o => !['Cancelada'].includes(o.status) && Number(o.saldoaberto || 0) > 0),
    [ordens]
  );

  const filtered = useMemo(() => {
    let list = [...lancamentos];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        (l.descricao||'').toLowerCase().includes(q) ||
        (l.categoria||'').toLowerCase().includes(q) ||
        (l.pagamento||'').toLowerCase().includes(q) ||
        (l.tipo||'').toLowerCase().includes(q) ||
        (l.ordemnumero||l.ordem_numero||'').toLowerCase().includes(q)
      );
    }
    if (date) list = list.filter(l => l.data?.slice(0,10) === date);
    list.sort((a,b) => new Date(b.data||0) - new Date(a.data||0) || b.id - a.id);
    return list;
  }, [lancamentos, search, date]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const diaEntrada = filtered.filter(l => l.tipo==='Entrada').reduce((s,l) => s+Number(l.valor||0), 0);
  const diaSaida   = filtered.filter(l => l.tipo==='Saída').reduce((s,l)   => s+Number(l.valor||0), 0);
  const diaSaldo   = diaEntrada - diaSaida;

  const totalEntrada = lancamentos.filter(l => l.tipo==='Entrada').reduce((s,l) => s+Number(l.valor||0), 0);
  const totalSaida   = lancamentos.filter(l => l.tipo==='Saída').reduce((s,l)   => s+Number(l.valor||0), 0);
  const saldoFinal   = totalEntrada - totalSaida;

  const isToday = date === today;

  return (
    <div style={{ height:'calc(100vh - 60px - var(--space-12))', display:'flex', flexDirection:'column', minHeight:0 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:'var(--text-xl)', fontWeight:800, margin:0 }}>Caixa</h1>
          <p style={{ margin:0, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{lancamentos.length} lançamento{lancamentos.length!==1?'s':''} no total</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Novo Lançamento
          </button>
        )}
      </div>

      {/* ── Navegador de dias ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', marginBottom:'var(--space-3)', flexShrink:0 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setDate(d => shiftDay(d, -1))}
          title="Dia anterior"
          style={{ flexShrink:0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <div style={{
          flex:1,
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          gap:'var(--space-3)',
          background: isToday
            ? 'color-mix(in oklch, var(--color-primary) 10%, var(--color-surface))'
            : 'var(--color-surface-offset)',
          border: isToday
            ? '2px solid color-mix(in oklch, var(--color-primary) 45%, var(--color-border))'
            : '1px solid var(--color-border)',
          borderRadius:'var(--radius-lg)',
          padding:'var(--space-2) var(--space-5)',
          transition:'background 200ms, border-color 200ms',
          boxShadow: isToday ? '0 0 0 3px color-mix(in oklch, var(--color-primary) 12%, transparent)' : 'none',
        }}>
          <span style={{
            fontWeight: isToday ? 800 : 600,
            fontSize: isToday ? 'var(--text-base)' : 'var(--text-sm)',
            color: isToday ? 'var(--color-primary)' : 'var(--color-text)',
            letterSpacing: isToday ? '0.01em' : 'normal',
          }}>
            {labelDay(date)}
          </span>

          <span style={{ color:'var(--color-border)', fontSize:'var(--text-sm)' }}>|</span>

          <span style={{
            fontSize:'var(--text-xs)',
            color: isToday ? 'color-mix(in oklch, var(--color-primary) 70%, var(--color-text-muted))' : 'var(--color-text-muted)',
            fontVariantNumeric:'tabular-nums',
            fontWeight: isToday ? 600 : 400,
          }}>
            {new Date(date+'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })}
          </span>
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setDate(d => shiftDay(d, +1))}
          disabled={date >= today}
          title="Próximo dia"
          style={{ flexShrink:0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>

        <input
          className="form-input"
          type="date"
          style={{ width:'auto', flexShrink:0 }}
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          title="Selecionar data"
        />

        {date !== today && (
          <button
            className="btn btn-sm"
            onClick={() => setDate(today)}
            title="Voltar para hoje"
            style={{
              flexShrink:0,
              background:'color-mix(in oklch, var(--color-primary) 12%, var(--color-surface))',
              color:'var(--color-primary)',
              border:'1px solid color-mix(in oklch, var(--color-primary) 30%, var(--color-border))',
              fontWeight:700,
            }}
          >
            Hoje
          </button>
        )}
      </div>

      {/* KPIs do dia filtrado */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'var(--space-3)', marginBottom:'var(--space-4)', flexShrink:0 }}>
        {[
          { label: isToday ? 'Entradas hoje' : 'Entradas do dia', value:fmt(diaEntrada), color:'var(--color-success)', icon:'M12 5v14M5 12h14' },
          { label: isToday ? 'Saídas hoje'   : 'Saídas do dia',   value:fmt(diaSaida),   color:'var(--color-error)',   icon:'M5 12h14' },
          { label: isToday ? 'Saldo hoje'    : 'Saldo do dia',    value:fmt(diaSaldo),   color: diaSaldo>=0 ? 'var(--color-primary)' : 'var(--color-error)', icon:'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding:'var(--space-3) var(--space-4)', display:'flex', alignItems:'center', gap:'var(--space-3)' }}>
            <div style={{ width:36, height:36, borderRadius:'var(--radius-md)', background:`color-mix(in oklch, ${k.color} 12%, var(--color-surface))`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="2"><path d={k.icon}/></svg>
            </div>
            <div>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{k.label}</div>
              <div style={{ fontWeight:800, fontSize:'var(--text-sm)', fontFamily:'monospace', color:k.color }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Busca */}
      <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-3)', flexShrink:0 }}>
        <div style={{ position:'relative', flex:1 }}>
          <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-faint)' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="form-input" style={{ paddingLeft:34 }} placeholder="Buscar por descrição, categoria, OS…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', padding:'0 var(--space-3)', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', fontSize:'var(--text-xs)', color:'var(--color-text-muted)', whiteSpace:'nowrap', flexShrink:0 }}>
          Saldo total: <strong style={{ fontFamily:'monospace', color: saldoFinal>=0 ? 'var(--color-success)' : 'var(--color-error)', marginLeft:'var(--space-1)' }}>{fmt(saldoFinal)}</strong>
        </div>
      </div>

      <div className="card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-2)' }}>
            <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-3)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontWeight:600, margin:0 }}>{search ? 'Nenhum lançamento encontrado' : `Sem lançamentos em ${labelDay(date)}`}</p>
              {!search && canEdit && <p style={{ fontSize:'var(--text-xs)', margin:'var(--space-1) 0 0' }}>Clique em "Novo Lançamento" para registrar uma movimentação</p>}
            </div>
          </div>
        ) : (
          <>
            <div style={{ overflowY:'auto', flex:1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Categoria</th>
                    <th>Pagamento</th>
                    <th>Descrição</th>
                    <th>OS vinculada</th>
                    <th style={{ textAlign:'right' }}>Valor</th>
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', whiteSpace:'nowrap' }}>{fmtD(l.data)}</td>
                      <td>
                        <span className={`badge badge-${l.tipo==='Entrada'?'success':'error'}`} style={{ fontSize:10 }}>
                          {l.tipo==='Entrada' ? '↑ ' : '↓ '}{l.tipo}
                        </span>
                      </td>
                      <td style={{ fontSize:'var(--text-xs)' }}>{l.categoria||'—'}</td>
                      <td style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{l.pagamento||'—'}</td>
                      <td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'var(--text-xs)' }}>{l.descricao||'—'}</td>
                      <td style={{ fontSize:'var(--text-xs)', color:'var(--color-primary)', fontWeight:600 }}>
                        {l.ordemnumero || l.ordem_numero || (l.ordemid || l.ordem_id ? `#${l.ordemid||l.ordem_id}` : '—')}
                      </td>
                      <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-sm)', fontWeight:700,
                        color: l.tipo==='Entrada' ? 'var(--color-success)' : 'var(--color-error)' }}>
                        {l.tipo==='Entrada' ? '+' : '-'}{fmt(l.valor)}
                      </td>
                      {canEdit && (
                        <td>
                          <div style={{ display:'flex', gap:'var(--space-1)', justifyContent:'flex-end' }}>
                            <button className="btn btn-ghost btn-xs" title="Editar" onClick={() => openEdit(l)}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button className="btn btn-ghost btn-xs" style={{ color:'var(--color-error)' }} title="Excluir" onClick={() => setConfirmDel(l)}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination current={currentPage} total={totalPages} onChange={setCurrentPage} />
          </>
        )}
      </div>

      {!loading && lancamentos.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'var(--space-3)', marginTop:'var(--space-3)', flexShrink:0 }}>
          <div className="card" style={{ padding:'var(--space-3) var(--space-4)' }}>
            <h3 style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:'var(--space-2)', fontWeight:500 }}>Por Categoria — Entradas</h3>
            {CATEG_OPT['Entrada'].map(cat => {
              const tot = filtered.filter(l => l.tipo==='Entrada' && l.categoria===cat).reduce((s,l)=>s+Number(l.valor||0),0);
              if (!tot) return null;
              return (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', fontSize:'var(--text-xs)', marginBottom:'var(--space-1)' }}>
                  <span style={{ color:'var(--color-text-muted)' }}>{cat}</span>
                  <strong style={{ fontFamily:'monospace', color:'var(--color-success)' }}>{fmt(tot)}</strong>
                </div>
              );
            })}
          </div>
          <div className="card" style={{ padding:'var(--space-3) var(--space-4)' }}>
            <h3 style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:'var(--space-2)', fontWeight:500 }}>Por Categoria — Saídas</h3>
            {CATEG_OPT['Saída'].map(cat => {
              const tot = filtered.filter(l => l.tipo==='Saída' && l.categoria===cat).reduce((s,l)=>s+Number(l.valor||0),0);
              if (!tot) return null;
              return (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', fontSize:'var(--text-xs)', marginBottom:'var(--space-1)' }}>
                  <span style={{ color:'var(--color-text-muted)' }}>{cat}</span>
                  <strong style={{ fontFamily:'monospace', color:'var(--color-error)' }}>{fmt(tot)}</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showForm && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" style={{ maxWidth:480 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editData ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={closeForm}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-input" value={form.tipo}
                    onChange={e=>{ set('tipo',e.target.value); set('categoria',CATEG_OPT[e.target.value][0]); }}>
                    {TIPO_OPT.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <select className="form-input" value={form.categoria} onChange={e=>set('categoria',e.target.value)}>
                    {(CATEG_OPT[form.tipo]||[]).map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Forma de Pagamento <span style={{color:'var(--color-error)'}}>*</span></label>
                  <select className="form-input" value={form.pagamento} onChange={e=>set('pagamento',e.target.value)}>
                    {PAGAMENTO_OPT.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Descrição</label>
                  <input className="form-input" value={form.descricao} onChange={e=>set('descricao',e.target.value)} placeholder="Ex: Pagamento OS-0042, Conta de luz…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Valor (R$) <span style={{color:'var(--color-error)'}}>*</span></label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.valor} onChange={e=>set('valor',e.target.value)} onWheel={e=>e.currentTarget.blur()} style={{ fontFamily:'monospace', fontWeight:700 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={form.data} onChange={e=>set('data',e.target.value)} />
                </div>
                {form.tipo==='Entrada' && (
                  <div className="form-group" style={{ gridColumn:'1/-1' }}>
                    <label className="form-label">
                      Vincular a uma OS
                      <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', fontWeight:400, marginLeft:'var(--space-2)' }}>
                        (opcional — apenas OS com saldo pendente)
                      </span>
                    </label>
                    <select
                      className="form-input"
                      value={form.ordem_id}
                      onChange={e => set('ordem_id', e.target.value)}
                      style={{ fontFamily:'monospace' }}
                    >
                      <option value="">Sem vínculo</option>
                      {ordensPendentes.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.numero} — {o.clientenome}{'    '}⚠ {Number(o.saldoaberto).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} pendente
                        </option>
                      ))}
                    </select>
                    {/* Indicador visual do saldo pendente da OS selecionada */}
                    {form.ordem_id && (() => {
                      const osSel = ordensPendentes.find(o => String(o.id) === String(form.ordem_id));
                      if (!osSel) return null;
                      return (
                        <div style={{
                          marginTop:'var(--space-2)',
                          padding:'var(--space-2) var(--space-3)',
                          borderRadius:'var(--radius-md)',
                          background:'color-mix(in oklch, var(--color-error) 8%, var(--color-surface))',
                          border:'1px solid color-mix(in oklch, var(--color-error) 25%, var(--color-border))',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:'var(--space-2)',
                        }}>
                          <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
                            Saldo pendente desta OS:
                          </span>
                          <strong style={{
                            fontFamily:'monospace',
                            fontSize:'var(--text-sm)',
                            color:'var(--color-error)',
                            fontWeight:800,
                          }}>
                            {Number(osSel.saldoaberto).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                          </strong>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeForm}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando…' : editData ? 'Salvar alterações' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmDel && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={()=>setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth:380 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Excluir Lançamento</h2>
              <button className="btn btn-ghost btn-sm" onClick={()=>setConfirmDel(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Excluir o lançamento de <strong>{fmt(confirmDel.valor)}</strong> ({confirmDel.tipo})?</p>
              <p style={{ marginTop:'var(--space-2)', fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>Esta ação não pode ser desfeita.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setConfirmDel(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={()=>handleDelete(confirmDel.id)} disabled={deleting===confirmDel.id}>
                {deleting===confirmDel.id ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
