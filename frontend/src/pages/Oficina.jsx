import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLUNAS = [
  { status: 'Aguardando',  label: 'Aguardando',  slug: 'aguardando', color:'var(--status-aguardando,#9AA4B2)' },
  { status: 'Em Produção', label: 'Em Produção', slug: 'producao',   color:'var(--status-producao,#3B82F6)' },
  { status: 'Pronto',      label: 'Pronto',      slug: 'pronto',     color:'var(--status-pronto,#22C55E)' },
  { status: 'Entregue',    label: 'Entregue',    slug: 'entregue',   color:'var(--status-entregue,#5A6474)' },
];

const STATUSNEXT = {
  'Aguardando': 'Em Produção',
  'Em Produção': 'Pronto',
  'Pronto': 'Entregue',
};

const TIPOBADGE = {
  'Quadro': 'primary',
  'Corte a Laser': 'blue',
  'Sublimacao': 'warning',
  'Diversos': 'secondary',
};

const fmtR = v => `R$ ${Number(v||0).toFixed(2).replace('.',',')}` ;
const fmtD = d => {
  if (!d) return '';
  const [y,m,dia] = d.split('-');
  return `${dia}/${m}`;
};

export default function Oficina() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const canEdit    = user?.role === 'admin' || user?.role === 'oficina' || user?.role === 'caixa';
  const showValor  = user?.role !== 'oficina';

  const [ordens,      setOrdens]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [draggingId,  setDraggingId]  = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
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

  const onDragOver = useCallback((e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(status);
  }, []);

  const onDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCol(null);
    }
  }, []);

  const onDrop = useCallback(async (e, novoStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('ordemId');
    setDraggingId(null);
    setDragOverCol(null);
    if (!id) return;
    const ordem = ordens.find(o => String(o.id) === String(id));
    if (!ordem || ordem.status === novoStatus) return;
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

  const selectStyle = {
    fontSize: 11,
    padding: '0 var(--space-2)',
    height: 28,
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface-offset)',
    color: 'var(--color-text)',
    cursor: 'pointer',
    outline: 'none',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Header compacto */}
      <div style={{
        padding: '6px var(--space-4)',
        borderBottom: '1px solid var(--color-divider)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
        background: 'var(--color-surface)',
        gap: 'var(--space-3)',
        minHeight: 44,
      }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontWeight:800, fontSize:'var(--text-sm)', margin:0, color:'var(--color-text)', whiteSpace:'nowrap' }}>Fila da Oficina</h1>
          <p style={{ fontSize:10, color:'var(--color-text-faint)', margin:0 }}>
            {ordens.filter(o=>o.status!=='Entregue').length} ordens ativas
          </p>
        </div>

        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'nowrap' }}>
          <select value={filterTipo} onChange={e=>setFilterTipo(e.target.value)} style={selectStyle}>
            {tiposDisponiveis.map(t => <option key={t} value={t}>{t === 'todos' ? 'Todos os tipos' : t}</option>)}
          </select>

          <select value={filterPrio} onChange={e=>setFilterPrio(e.target.value)} style={selectStyle}>
            <option value="todas">Todas prio.</option>
            <option value="Normal">Normal</option>
            <option value="Urgente">Urgente</option>
          </select>

          <div style={{ display:'flex', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', overflow:'hidden', height:28 }}>
            {['kanban','lista'].map(v => (
              <button key={v} onClick={()=>setViewMode(v)}
                style={{ padding:'0 10px', fontSize:11, fontWeight:600,
                  background: viewMode===v ? 'var(--color-primary)' : 'transparent',
                  color: viewMode===v ? '#fff' : 'var(--color-text-muted)',
                  border:'none', cursor:'pointer', transition:'all 0.15s', height:28 }}>
                {v === 'kanban' ? '⊞ Kanban' : '☰ Lista'}
              </button>
            ))}
          </div>

          <button onClick={recover}
            style={{ padding:'0 10px', fontSize:11, fontWeight:600, height:28,
              background:'transparent', color:'var(--color-text-muted)', border:'1px solid var(--color-border)',
              borderRadius:'var(--radius-md)', cursor:'pointer', whiteSpace:'nowrap' }}>
            ↺ Recuperar
          </button>
        </div>
      </div>

      {/* Kanban */}
      {viewMode === 'kanban' ? (
        <div style={{ display:'flex', gap:'var(--space-4)', padding:'var(--space-4)', flex:1,
          overflow:'auto', alignItems:'stretch' }}>
          {COLUNAS.map(col => {
            const cards = porStatus(col);
            const isOver = dragOverCol === col.status;
            return (
              <div key={col.status}
                className={`kanban-col-${col.slug}`}
                onDragOver={e => onDragOver(e, col.status)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, col.status)}
                style={{
                  flex:'1 1 260px', minWidth:220, maxWidth:380,
                  display:'flex', flexDirection:'column',
                  background:'var(--color-surface-offset)',
                  borderRadius:'var(--radius-lg)',
                  border: isOver
                    ? `2px solid ${col.color}`
                    : '1px solid var(--color-border)',
                  overflow:'hidden',
                  minHeight: 0,
                  transition: 'border-color 0.15s',
                }}>

                <div style={{
                  padding:'var(--space-3) var(--space-4)',
                  borderBottom:'1px solid var(--color-divider)',
                  flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  borderTop:`3px solid ${col.color}`
                }}>
                  <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color: col.color, letterSpacing:'0.04em', textTransform:'uppercase' }}>
                    {col.label}
                  </span>
                  <span style={{
                    fontSize:11, fontWeight:700,
                    background:'rgba(255,255,255,0.07)',
                    color: col.color,
                    borderRadius:'var(--radius-full)',
                    padding:'2px 8px',
                    border:`1px solid ${col.color}33`
                  }}>
                    {cards.length}
                  </span>
                </div>

                {/*
                  Wrapper de scroll com flex:1 para ocupar todo o espaco da coluna.
                  O div interno tambem tem flex:1 para que a zona de drop
                  cubra ate o fundo mesmo quando ha poucos cards.
                */}
                <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
                  <div style={{
                    padding:'var(--space-2)',
                    display:'flex', flexDirection:'column', gap:'var(--space-2)',
                    flex: 1,
                    minHeight: 80,
                    background: isOver ? `${col.color}12` : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    {cards.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'var(--space-8) var(--space-4)',
                        color: isOver ? col.color : 'var(--color-text-faint)',
                        fontSize:'var(--text-xs)', transition: 'color 0.15s',
                      }}>
                        {isOver ? '⬇ Soltar aqui' : 'Nenhuma OS aqui'}
                      </div>
                    ) : cards.map(o => {
                      const vencida   = o.prazoentrega && o.prazoentrega < today && o.status !== 'Pronto' && o.status !== 'Entregue';
                      const ehHoje    = o.prazoentrega === today;
                      const isUrgente = o.prioridade === 'Urgente';
                      const diasCriado = Math.floor((Date.now() - new Date(o.criadoem)) / 86400000);
                      const saldo     = Number(o.saldoaberto ?? 0);
                      const quitado   = saldo <= 0.009;
                      const resumo    = o.itens_resumo && o.itens_resumo.trim()
                                          ? { text: o.itens_resumo, tipo: 'itens' }
                                          : o.observacoes && o.observacoes.trim()
                                            ? { text: o.observacoes, tipo: 'obs' }
                                            : null;

                      const statusSlug = col.slug;

                      return (
                        <div key={o.id}
                          className="kanban-card"
                          data-status={statusSlug}
                          draggable={canEdit}
                          onDragStart={e => onDragStart(e, o.id)}
                          onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                          onClick={() => navigate(`/ordens/${o.id}`)}
                          style={{
                            padding:'var(--space-3)',
                            opacity: draggingId === o.id ? 0.45 : 1,
                            ...(vencida ? { borderLeftColor:'#EF4444 !important' } : {}),
                          }}
                        >
                          {/* Linha 1: número + badge tipo */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-1)' }}>
                            <span style={{ fontWeight:800, fontSize:11, color:'var(--color-primary)', letterSpacing:'0.02em' }}>
                              #{o.numero}
                            </span>
                            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                              {isUrgente && (
                                <span style={{ fontSize:9, fontWeight:700, color:'#EF4444',
                                  background:'rgba(239,68,68,0.12)', borderRadius:'var(--radius-full)',
                                  padding:'1px 5px', letterSpacing:'0.03em' }}>URGENTE</span>
                              )}
                              <span className={`badge badge-${TIPOBADGE[o.servico]||'secondary'}`} style={{ fontSize:9 }}>
                                {o.servico}
                              </span>
                            </div>
                          </div>

                          {/* Linha 2: cliente */}
                          <div style={{
                            fontWeight:600, fontSize:'var(--text-xs)',
                            color:'var(--color-text)',
                            marginBottom: resumo ? 'var(--space-1)' : 'var(--space-2)',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                          }}>
                            {o.clientenome}
                          </div>

                          {/* Linha 3: resumo */}
                          {resumo && (
                            <div style={{
                              fontSize:10, color:'var(--color-text-muted)',
                              marginBottom:'var(--space-2)',
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                              fontStyle: resumo.tipo === 'obs' ? 'italic' : 'normal',
                            }} title={resumo.text}>
                              {resumo.tipo === 'itens' ? '📦 ' : '📝 '}{resumo.text}
                            </div>
                          )}

                          {/* Linha 4: prazo + saldo + ação */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'var(--space-1)' }}>
                            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                              {o.prazoentrega && o.status !== 'Entregue' && (
                                <span className={vencida ? 'urgencia-atrasado' : ehHoje ? 'urgencia-hoje' : 'urgencia-normal'}
                                  style={{ display:'flex', alignItems:'center', gap:2 }}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                                  </svg>
                                  {vencida ? '⚠ Vencido' : ehHoje ? '⏰ Hoje' : fmtD(o.prazoentrega)}
                                </span>
                              )}
                              {showValor && o.status !== 'Entregue' && (
                                <span style={{
                                  fontSize:9, fontWeight:600,
                                  display:'flex', alignItems:'center', gap:2,
                                  color: quitado ? 'var(--color-success)' : '#F59E0B'
                                }}>
                                  {quitado
                                    ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Quitado</>
                                    : <>💰 {fmtR(saldo)}</>
                                  }
                                </span>
                              )}
                              {diasCriado > 14 && o.status !== 'Entregue' && (
                                <span style={{ fontSize:9, color:'var(--color-text-faint)' }} title={`Criada há ${diasCriado} dias`}>⏱ {diasCriado}d</span>
                              )}
                            </div>
                            {canEdit && STATUSNEXT[o.status] && (
                              <button
                                onClick={e => { e.stopPropagation(); avancarStatus(o); }}
                                style={{
                                  fontSize:9, padding:'3px 8px',
                                  borderRadius:'var(--radius-full)',
                                  background:'rgba(255,255,255,0.06)',
                                  color: col.color,
                                  border:`1px solid ${col.color}44`,
                                  cursor:'pointer', fontWeight:700, whiteSpace:'nowrap',
                                  transition:'all 0.15s'
                                }}>
                                → {STATUSNEXT[o.status]}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Vista Lista */
        <div style={{ flex:1, overflow:'auto', padding:'var(--space-4)' }}>
          <div className="card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--color-border)', background:'var(--color-surface-offset)' }}>
                  {['No','Cliente','Tipo','Produto / Obs','Prazo','Status', ...(showValor ? ['Saldo'] : [])].map(h => (
                    <th key={h} style={{ padding:'var(--space-2) var(--space-3)', textAlign:'left',
                      fontSize:'var(--text-xs)', fontWeight:700, color:'var(--color-text-muted)',
                      textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordens.filter(o => {
                  if (filterTipo !== 'todos' && o.servico !== filterTipo) return false;
                  if (filterPrio !== 'todas' && o.prioridade !== filterPrio) return false;
                  return true;
                }).map((o, idx) => {
                  const vencida = o.prazoentrega && o.prazoentrega < today && o.status !== 'Pronto' && o.status !== 'Entregue';
                  const ehHoje  = o.prazoentrega === today;
                  const saldo   = Number(o.saldoaberto ?? 0);
                  const quitado = saldo <= 0.009;
                  const resumoLista = o.itens_resumo && o.itens_resumo.trim() ? { text: o.itens_resumo, tipo: 'itens' }
                    : o.observacoes && o.observacoes.trim() ? { text: o.observacoes, tipo: 'obs' } : null;

                  const statusSlugMap = { 'Aguardando':'aguardando','Em Produção':'emproducao','Pronto':'pronto','Entregue':'entregue','Cancelado':'cancelado' };

                  return (
                    <tr key={o.id}
                      className={vencida ? 'os-atrasada' : ''}
                      onClick={() => navigate(`/ordens/${o.id}`)}
                      style={{
                        cursor:'pointer',
                        borderBottom:'1px solid var(--color-divider)',
                        background: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
                        transition:'background 0.12s'
                      }}>
                      <td style={{ padding:'var(--space-2) var(--space-3)', fontWeight:700, color:'var(--color-primary)', fontSize:'var(--text-xs)' }}>{o.numero}</td>
                      <td style={{ padding:'var(--space-2) var(--space-3)', fontWeight:600, fontSize:'var(--text-xs)', color:'var(--color-text)' }}>{o.clientenome}</td>
                      <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                        <span className={`badge badge-${TIPOBADGE[o.servico]||'secondary'}`} style={{ fontSize:10 }}>{o.servico}</span>
                      </td>
                      <td style={{ padding:'var(--space-2) var(--space-3)', maxWidth:180, fontSize:'var(--text-xs)',
                        color:'var(--color-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                        title={resumoLista?.text}>
                        {resumoLista
                          ? <span style={{ fontStyle: resumoLista.tipo==='obs'?'italic':'normal' }}>
                              {resumoLista.tipo==='itens'?'📦 ':'📝 '}{resumoLista.text}
                            </span>
                          : <span style={{ color:'var(--color-text-faint)' }}>—</span>}
                      </td>
                      <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                        <span className={vencida ? 'urgencia-atrasado' : ehHoje ? 'urgencia-hoje' : 'urgencia-normal'}>
                          {o.prazoentrega ? fmtD(o.prazoentrega) : '—'}
                        </span>
                      </td>
                      <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                        <span className={`status-pill status-pill-${statusSlugMap[o.status]||'aguardando'}`}>
                          {o.status}
                        </span>
                      </td>
                      {showValor && (
                        <td style={{ padding:'var(--space-2) var(--space-3)', fontSize:'var(--text-xs)', fontWeight:700 }}>
                          <span className={quitado ? 'valor-entrada' : 'urgencia-hoje'}>
                            {quitado ? 'Quitado' : fmtR(saldo)}
                          </span>
                        </td>
                      )}
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
