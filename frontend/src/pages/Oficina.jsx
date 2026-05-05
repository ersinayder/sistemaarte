import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const COLUNAS = [
  { status: 'Aguardando',   label: 'Aguardando',   bg:'var(--color-surface-offset)', color:'var(--color-text-muted)' },
  { status: 'Em Producao',  label: 'Em Produção',  bg:'rgba(0,100,148,0.12)',        color:'var(--color-blue)' },
  { status: 'Pronto',       label: 'Pronto',       bg:'rgba(67,122,34,0.12)',        color:'var(--color-success)' },
  { status: 'Entregue',     label: 'Entregue',     bg:'rgba(1,105,111,0.12)',        color:'var(--color-primary)' },
];

const STATUSNEXT = {
  'Aguardando': 'Em Producao',
  'Em Producao': 'Pronto',
  'Pronto': 'Entregue',
};

const TIPOBADGE = {
  'Quadro': 'primary',
  'Corte a Laser': 'blue',
  'Sublimacao': 'warning',
  'Diversos': 'secondary',
};

const fmtR = v => `R$ ${Number(v||0).toFixed(2).replace('.',',')}`;
const fmtD = d => {
  if (!d) return '';
  const [y,m,dia] = d.split('-');
  return `${dia}/${m}`;
};

export default function Oficina() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const canEdit   = user?.role === 'admin' || user?.role === 'oficina';

  const [ordens,      setOrdens]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [draggingId,  setDraggingId]  = useState(null);
  const [filterTipo,  setFilterTipo]  = useState('todos');
  const [filterPrio,  setFilterPrio]  = useState('todas');
  const [viewMode,    setViewMode]    = useState('kanban');
  const [today,       setToday]       = useState('');

  useEffect(() => {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setToday(iso);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ordens');
      const all = (data || []).filter(o => o.status !== 'Cancelado' && o.status !== 'Entregue' ||
        (o.status === 'Entregue' && o.prazoentrega >= new Date(Date.now()-7*86400000).toISOString().slice(0,10)));
      all.sort((a,b) => {
        if (!a.prazoentrega && !b.prazoentrega) return new Date(a.criadoem) - new Date(b.criadoem);
        if (!a.prazoentrega) return 1;
        if (!b.prazoentrega) return -1;
        return new Date(a.prazoentrega) - new Date(b.prazoentrega);
      });
      setOrdens(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recover = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ordens');
      const all = (data || []);
      all.sort((a,b) => {
        if (!a.prazoentrega && !b.prazoentrega) return new Date(a.criadoem) - new Date(b.criadoem);
        if (!a.prazoentrega) return 1;
        if (!b.prazoentrega) return -1;
        return new Date(a.prazoentrega) - new Date(b.prazoentrega);
      });
      setOrdens(all);
    } finally {
      setLoading(false);
    }
  }, []);

  const avancarStatus = useCallback(async (ordem) => {
    const novoStatus = STATUSNEXT[ordem.status];
    if (!novoStatus) return;
    try {
      await api.patch(`/ordens/${ordem.id}/status`, { status: novoStatus });
      load();
    } catch(e) {
      alert(e?.response?.data?.error || 'Erro ao avançar status');
    }
  }, [load]);

  const onDragStart = useCallback((e, id) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('ordemId', id);
  }, []);

  const onDrop = useCallback(async (e, novoStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('ordemId');
    if (!id) return;
    const ordem = ordens.find(o => String(o.id) === String(id));
    if (!ordem || ordem.status === novoStatus) return;
    setDraggingId(null);
    try {
      await api.patch(`/ordens/${ordem.id}/status`, { status: novoStatus });
      load();
    } catch(e) {
      alert(e?.response?.data?.error || 'Erro ao mover');
    }
  }, [ordens, load]);

  const porStatus = useCallback((col) => {
    return ordens.filter(o => {
      if (o.status !== col.status) return false;
      if (filterTipo !== 'todos' && o.servico !== filterTipo) return false;
      if (filterPrio !== 'todas' && o.prioridade !== filterPrio) return false;
      return true;
    });
  }, [ordens, filterTipo, filterPrio]);

  const tiposDisponiveis = useMemo(() => {
    const s = new Set(ordens.map(o => o.servico).filter(Boolean));
    return ['todos', ...Array.from(s)];
  }, [ordens]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--color-text-muted)' }}>
      Carregando...
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'var(--space-4) var(--space-6)', borderBottom:'1px solid var(--color-border)',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
        background:'var(--color-surface)' }}>
        <div>
          <h1 style={{ fontWeight:700, fontSize:'var(--text-lg)', margin:0 }}>Fila da Oficina</h1>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', margin:0 }}>
            {ordens.filter(o=>o.status!=='Entregue').length} ordens ativas
          </p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)', alignItems:'center', flexWrap:'wrap' }}>
          {/* Filtro tipo */}
          <select value={filterTipo} onChange={e=>setFilterTipo(e.target.value)}
            className="form-input" style={{ fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-3)', height:32 }}>
            {tiposDisponiveis.map(t => <option key={t} value={t}>{t === 'todos' ? 'Todos os tipos' : t}</option>)}
          </select>
          {/* Filtro prioridade */}
          <select value={filterPrio} onChange={e=>setFilterPrio(e.target.value)}
            className="form-input" style={{ fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-3)', height:32 }}>
            <option value="todas">Todas prioridades</option>
            <option value="Normal">Normal</option>
            <option value="Urgente">Urgente</option>
          </select>
          {/* View toggle */}
          <div style={{ display:'flex', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', overflow:'hidden' }}>
            {['kanban','lista'].map(v => (
              <button key={v} onClick={()=>setViewMode(v)}
                style={{ padding:'var(--space-1) var(--space-3)', fontSize:'var(--text-xs)', fontWeight:600,
                  background: viewMode===v ? 'var(--color-primary)' : 'transparent',
                  color: viewMode===v ? '#fff' : 'var(--color-text-muted)',
                  border:'none', cursor:'pointer', transition:'all 0.15s' }}>
                {v === 'kanban' ? '⊞ Kanban' : '☰ Lista'}
              </button>
            ))}
          </div>
          {/* Recuperar */}
          <button onClick={recover}
            style={{ padding:'var(--space-1) var(--space-3)', fontSize:'var(--text-xs)', fontWeight:600,
              background:'transparent', color:'var(--color-text-muted)', border:'1px solid var(--color-border)',
              borderRadius:'var(--radius-md)', cursor:'pointer' }}>
            ↺ Recuperar
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      {viewMode === 'kanban' ? (
        /* ===== KANBAN ===== */
        <div style={{ display:'flex', gap:'var(--space-4)', padding:'var(--space-4)', flex:1,
          overflow:'auto', alignItems:'flex-start' }}>
          {COLUNAS.map(col => {
            const cards = porStatus(col);
            return (
              <div key={col.status}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; }}
                onDrop={e => onDrop(e, col.status)}
                style={{ flex:'0 0 260px', display:'flex', flexDirection:'column',
                  background:'var(--color-surface)', borderRadius:'var(--radius-lg)',
                  border:'1px solid var(--color-border)', overflow:'hidden',
                  maxHeight:'calc(100vh - 180px)' }}>
                {/* Cabeçalho coluna */}
                <div style={{ padding:'var(--space-3) var(--space-4)',
                  borderBottom:'1px solid var(--color-border)', flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  background: col.bg }}>
                  <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color: col.color }}>
                    {col.label}
                  </span>
                  <span style={{ fontSize:11, fontWeight:700, background: col.bg,
                    color: col.color, borderRadius:'var(--radius-full)', padding:'1px 7px',
                    border:`1px solid ${col.color}33` }}>
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ flex:1, overflowY:'auto', padding:'var(--space-2)', display:'flex',
                  flexDirection:'column', gap:'var(--space-2)' }}>
                  {cards.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'var(--space-8) var(--space-4)',
                      color:'var(--color-text-faint)', fontSize:'var(--text-xs)' }}>
                      Nenhuma OS aqui
                    </div>
                  ) : cards.map(o => {
                    const vencida   = o.prazoentrega && o.prazoentrega < today && o.status !== 'Pronto' && o.status !== 'Entregue';
                    const ehHoje    = o.prazoentrega === today;
                    const isUrgente = o.prioridade === 'Urgente';
                    const diasCriado = Math.floor((Date.now() - new Date(o.criadoem)) / 86400000);
                    const saldo     = Number(o.saldoaberto ?? 0);
                    const quitado   = saldo <= 0.009;
                    const resumo    = o.itens_resumo && o.itens_resumo.trim() ? { text: o.itens_resumo, tipo: 'itens' }
                                        : o.observacoes && o.observacoes.trim() ? { text: o.observacoes, tipo: 'obs' }
                                        : null;

                    return (
                      <div key={o.id}
                        draggable={canEdit}
                        onDragStart={e => onDragStart(e, o.id)}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => navigate(`/ordens/${o.id}`)}
                        style={{
                          background: draggingId === o.id ? 'var(--color-surface-offset)' : 'var(--color-surface-2)',
                          border: vencida ? '1px solid color-mix(in oklch, var(--color-error) 40%, var(--color-border))'
                            : isUrgente ? '1px solid color-mix(in oklch, var(--color-warning) 40%, var(--color-border))'
                            : '1px solid var(--color-border)',
                          borderRadius:'var(--radius-md)',
                          padding:'var(--space-3)',
                          cursor:'pointer',
                          opacity: draggingId === o.id ? 0.5 : 1,
                          transition:'all 0.15s',
                          boxShadow: draggingId !== o.id ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        {/* Linha 1: número + badge tipo */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-1)' }}>
                          <span style={{ fontWeight:800, fontSize:11, color:'var(--color-primary)' }}>#{o.numero}</span>
                          <span className={`badge badge-${TIPOBADGE[o.servico]||'secondary'}`} style={{ fontSize:9 }}>{o.servico}</span>
                        </div>

                        {/* Linha 2: cliente */}
                        <div style={{ fontWeight:600, fontSize:'var(--text-xs)', marginBottom: resumo ? 'var(--space-1)' : 'var(--space-2)',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {o.clientenome}
                          {isUrgente && <span style={{ marginLeft:4, fontSize:8, fontWeight:700, color:'var(--color-error)',
                            background:'rgba(161,44,123,0.10)', borderRadius:'var(--radius-full)', padding:'1px 4px' }}>URGENTE</span>}
                        </div>

                        {/* Linha 3: produtos / observação do pedido */}
                        {resumo && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:'var(--space-2)',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                            fontStyle: resumo.tipo === 'obs' ? 'italic' : 'normal',
                            fontWeight: resumo.tipo === 'itens' ? 500 : 400 }}
                            title={resumo.text}>
                            {resumo.tipo === 'itens' ? '📦 ' : '📝 '}{resumo.text}
                          </div>
                        )}

                        {/* Linha 4: prazo + saldo + ação */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                            {/* prazo */}
                            {o.prazoentrega && o.status !== 'Entregue' && (
                              <span style={{ fontSize:9, fontWeight:600,
                                color: vencida ? 'var(--color-error)' : ehHoje ? 'var(--color-warning)' : 'var(--color-text-muted)',
                                display:'flex', alignItems:'center', gap:2 }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                                {vencida ? '⚠ Vencido' : ehHoje ? 'Hoje' : fmtD(o.prazoentrega)}
                              </span>
                            )}
                            {/* saldo / quitado */}
                            {o.status !== 'Entregue' && (
                              <span style={{ fontSize:9, fontWeight:600, display:'flex', alignItems:'center', gap:2,
                                color: quitado ? 'var(--color-success)' : 'var(--color-error)' }}>
                                {quitado
                                  ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Quitado</>
                                  : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Saldo {fmtR(saldo)}</>
                                }
                              </span>
                            )}
                            {diasCriado > 14 && o.status !== 'Entregue' && (
                              <span style={{ fontSize:9, color:'var(--color-text-faint)' }} title={`Criada há ${diasCriado} dias`}>⏱{diasCriado}d</span>
                            )}
                          </div>
                          {canEdit && STATUSNEXT[o.status] && (
                            <button
                              onClick={e => { e.stopPropagation(); avancarStatus(o); }}
                              style={{ fontSize:9, padding:'2px 7px', borderRadius:'var(--radius-full)',
                                background: col.bg, color: col.color,
                                border:`1px solid color-mix(in oklch, ${col.color} 30%, transparent)`,
                                cursor:'pointer', fontWeight:600, whiteSpace:'nowrap',
                                transition:'all 0.15s' }}>
                              → {STATUSNEXT[o.status]}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ===== LISTA ===== */
        <div style={{ flex:1, overflow:'auto', padding:'var(--space-4)' }}>
          <div className="card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--color-border)', background:'var(--color-surface-offset)' }}>
                  <th style={{ padding:'var(--space-2) var(--space-3)', textAlign:'left', fontSize:'var(--text-xs)', fontWeight:700, color:'var(--color-text-muted)' }}>
                    <th>No</th><th>Cliente</th><th>Tipo</th><th>Produto / Obs</th><th>Prazo</th><th>Status</th><th>Saldo</th>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordens.filter(o => {
                  if (filterTipo !== 'todos' && o.servico !== filterTipo) return false;
                  if (filterPrio !== 'todas' && o.prioridade !== filterPrio) return false;
                  return true;
                }).map(o => {
                  const vencida = o.prazoentrega && o.prazoentrega < today && o.status !== 'Pronto' && o.status !== 'Entregue';
                  const saldo = Number(o.saldoaberto ?? 0);
                  const quitado = saldo <= 0.009;
                  const resumoLista = o.itens_resumo && o.itens_resumo.trim() ? { text: o.itens_resumo, tipo: 'itens' }
                    : o.observacoes && o.observacoes.trim() ? { text: o.observacoes, tipo: 'obs' }
                    : null;
                  return (
                    <tr key={o.id} onClick={() => navigate(`/ordens/${o.id}`)}
                      style={{ cursor:'pointer', borderBottom:'1px solid var(--color-border)' }}>
                      <td style={{ padding:'var(--space-2) var(--space-3)', fontWeight:700, color:'var(--color-primary)', fontSize:'var(--text-xs)' }}>{o.numero}</td>
                      <td style={{ padding:'var(--space-2) var(--space-3)', fontWeight:600, fontSize:'var(--text-xs)' }}>{o.clientenome}</td>
                      <td style={{ padding:'var(--space-2) var(--space-3)' }}><span className={`badge badge-${TIPOBADGE[o.servico]||'secondary'}`} style={{ fontSize:10 }}>{o.servico}</span></td>
                      <td style={{ padding:'var(--space-2) var(--space-3)', maxWidth:180, fontSize:'var(--text-xs)', color:'var(--color-text-muted)',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                        title={resumoLista?.text}>
                        {resumoLista
                          ? <span style={{ fontStyle: resumoLista.tipo==='obs'?'italic':'normal', fontWeight: resumoLista.tipo==='itens'?500:400 }}>
                              {resumoLista.tipo==='itens'?'📦 ':'📝 '}{resumoLista.text}
                            </span>
                          : <span style={{ color:'var(--color-text-faint)' }}>—</span>}
                      </td>
                      <td style={{ padding:'var(--space-2) var(--space-3)', fontSize:'var(--text-xs)',
                        color: vencida?'var(--color-error)':'var(--color-text-muted)', fontWeight: vencida?700:400 }}>
                        {o.prazoentrega ? fmtD(o.prazoentrega) : '—'}
                      </td>
                      <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                        <span className={`badge badge-${o.status==='Pronto'?'success':o.status==='Em Producao'?'blue':'secondary'}`} style={{ fontSize:10 }}>{o.status}</span>
                      </td>
                      <td style={{ padding:'var(--space-2) var(--space-3)', fontSize:'var(--text-xs)',
                        color: quitado?'var(--color-success)':'var(--color-error)', fontWeight:700 }}>
                        {quitado ? 'Quitado' : fmtR(saldo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
