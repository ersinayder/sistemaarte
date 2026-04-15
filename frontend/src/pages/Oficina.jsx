import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLUNAS = [
  { status:'Aguardando',   label:'Aguardando',   color:'#6b7280', bg:'rgba(107,114,128,0.08)' },
  { status:'Em Produção',  label:'Em Produção',  color:'#d97706', bg:'rgba(217,119,6,0.08)'   },
  { status:'Pronto',       label:'Pronto',       color:'#059669', bg:'rgba(5,150,105,0.08)'   },
  { status:'Entregue',     label:'Entregue',     color:'#2563eb', bg:'rgba(37,99,235,0.08)'   },
];

const STATUSNEXT = {
  'Aguardando':  'Em Produção',
  'Em Produção': 'Pronto',
  'Pronto':      'Entregue',
};

const TIPOICONE = {
  'Moldura':    'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'Tela':       'M2 3h20v14H2zM8 21h8M12 17v4',
  'Restauro':   'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
  'Passepartout':'M3 3h18v18H3z',
  'Vidro':      'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  'Diversos':   'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
};

const TIPOBADGE = {
  'Moldura':'primary','Tela':'secondary','Restauro':'warning','Passepartout':'info','Vidro':'success','Diversos':'diversos'
};

export default function Oficina() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [ordens,     setOrdens]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [view,       setView]       = useState('kanban');
  const [draggingId, setDraggingId] = useState(null);
  const [dragOver,   setDragOver]   = useState(null);
  const [filterServico, setFilterServico] = useState('');
  const [filterPrioridade, setFilterPrioridade] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = ['Aguardando','Em Produção','Pronto'];
      const results = await Promise.all(statuses.map(s => api.get(`/ordens?status=${encodeURIComponent(s)}`)));
      const all = results.flatMap(r => r.data);
      all.sort((a,b) => new Date(a.criadoem) - new Date(b.criadoem));
      setOrdens(all);
    } catch { toast.error('Erro ao carregar fila'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byStatus = (s) => ordens.filter(o => {
    if (o.status !== s) return false;
    if (filterServico && o.servico !== filterServico) return false;
    if (filterPrioridade && o.prioridade !== filterPrioridade) return false;
    return true;
  });

  const mudarStatus = async (id, novoStatus) => {
    try {
      await api.patch(`/ordens/${id}/status`, { status: novoStatus });
      toast.success(`Status → ${novoStatus}`);
      load();
    } catch { toast.error('Erro ao atualizar status'); }
  };

  const handleDragStart = (id) => setDraggingId(id);
  const handleDragEnd   = ()   => { setDraggingId(null); setDragOver(null); };
  const handleDrop      = (status) => {
    if (!draggingId) return;
    const ordem = ordens.find(o => o.id === draggingId);
    if (ordem && ordem.status !== status) mudarStatus(draggingId, status);
    setDraggingId(null);
    setDragOver(null);
  };

  const fmt  = v => v != null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—';
  const fmtD = d => d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : null;

  const tiposServico = [...new Set(ordens.map(o => o.servico).filter(Boolean))];

  return (
    <div style={{ height:'calc(100vh - 60px - var(--space-12))', display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:'var(--text-xl)', fontWeight:800, margin:0 }}>Fila da Oficina</h1>
          <p style={{ margin:0, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
            {ordens.length} ordem{ordens.length!==1?'s':''} ativa{ordens.length!==1?'s':''}
          </p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)', alignItems:'center' }}>
          {/* Filters */}
          <select className="form-input" style={{ width:'auto', fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-2)' }}
            value={filterServico} onChange={e => setFilterServico(e.target.value)}>
            <option value="">Todos os tipos</option>
            {tiposServico.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-input" style={{ width:'auto', fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-2)' }}
            value={filterPrioridade} onChange={e => setFilterPrioridade(e.target.value)}>
            <option value="">Todas prioridades</option>
            <option value="Normal">Normal</option>
            <option value="Urgente">Urgente</option>
          </select>
          {/* View toggle */}
          <div style={{ display:'flex', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:2 }}>
            <button className={`btn btn-xs ${view === 'kanban' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('kanban')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="11"/></svg>
            </button>
            <button className={`btn btn-xs ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('list')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={load} title="Atualizar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-2)' }}>
          <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Carregando fila…
        </div>
      ) : view === 'kanban' ? (
        <div style={{ display:'flex', gap:'var(--space-4)', flex:1, overflowX:'auto', overflowY:'auto', minHeight:0, paddingBottom:'var(--space-2)' }}>
          {COLUNAS.map(col => (
            <div
              key={col.status}
              onDragOver={e => { e.preventDefault(); setDragOver(col.status) }}
              onDrop={e => { e.preventDefault(); handleDrop(col.status) }}
              style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)', minWidth:260, flex:1, background: dragOver === col.status ? col.bg : 'transparent', borderRadius:'var(--radius-xl)', padding:'var(--space-2)', transition:'background 0.2s ease', overflowY:'auto', maxHeight:'calc(100vh - 160px)' }}
            >
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'var(--space-2) var(--space-3)', background: col.bg, borderRadius:'var(--radius-lg)', border:`1px solid ${col.color}40` }}>
                <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: col.color }}/>
                  <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color: col.color }}>{col.label}</span>
                </div>
                <span style={{ background: col.color, color:'white', width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>
                  {byStatus(col.status).length}
                </span>
              </div>

              {byStatus(col.status).length === 0
                ? <div style={{ border:'2px dashed var(--color-border)', borderRadius:'var(--radius-lg)', padding:'var(--space-8) var(--space-4)', textAlign:'center', color:'var(--color-text-faint)', fontSize:'var(--text-xs)', minHeight:80, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {canEdit ? 'Arraste uma OS aqui' : 'Nenhuma OS'}
                  </div>
                : byStatus(col.status).map(o => {
                    const vencida  = o.prazoentrega && o.prazoentrega < today && !['Entregue','Cancelado'].includes(o.status)
                    const ehHoje   = o.prazoentrega === today
                    const saldo    = (o.valortotal || o.valor || 0) - (o.valorentrada || o.entrada || 0)
                    const diasCriado = Math.floor((Date.now() - new Date(o.criadoem)) / 86400000)
                    const next     = STATUSNEXT[o.status]
                    return (
                      <div
                        key={o.id}
                        draggable={canEdit}
                        onDragStart={() => handleDragStart(o.id)}
                        onDragEnd={handleDragEnd}
                        style={{ background:'var(--color-surface)', border:`1px solid ${vencida ? 'var(--color-error)' : 'var(--color-border)'}`, borderRadius:'var(--radius-lg)', padding:'var(--space-3)', cursor: canEdit ? 'grab' : 'default', opacity: draggingId === o.id ? 0.5 : 1, transition:'all 0.2s ease', boxShadow:'var(--shadow-sm)' }}
                      >
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'var(--space-2)' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                            <div style={{ width:28, height:28, borderRadius:'var(--radius-md)', background:'rgba(1,105,111,0.10)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2"><path d={TIPOICONE[o.servico] || TIPOICONE['Diversos']}/></svg>
                            </div>
                            <div style={{ fontWeight:800, fontSize:'var(--text-xs)', color:'var(--color-primary)', lineHeight:1.2 }}>{o.numero}</div>
                          </div>
                          <div style={{ fontSize:10, color:'var(--color-text-faint)' }}>{diasCriado === 0 ? 'hoje' : `${diasCriado}d`}</div>
                        </div>

                        {o.prioridade === 'Urgente' && (
                          <div style={{ marginBottom:'var(--space-1)' }}>
                            <span style={{ fontSize:10, fontWeight:700, color:'var(--color-error)', background:'rgba(161,44,123,0.10)', borderRadius:'var(--radius-full)', padding:'1px 6px' }}>Urgente</span>
                          </div>
                        )}

                        <div style={{ fontWeight:600, fontSize:'var(--text-sm)', marginBottom:2, lineHeight:1.3 }}>{o.clientenome}</div>

                        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-1)', marginBottom:'var(--space-2)' }}>
                          <span className={`badge badge-${TIPOBADGE[o.servico] || 'diversos'}`} style={{ fontSize:10 }}>{o.servico}</span>
                          {o.descricao && <span style={{ fontSize:10, color:'var(--color-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110 }}>{o.descricao}</span>}
                        </div>
                        {o.observacoes && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:'var(--space-2)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            💬 {o.observacoes}
                          </div>
                        )}

                        {o.prazoentrega && (
                          <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:'var(--space-2)', fontSize:10, color: vencida ? 'var(--color-error)' : ehHoje ? '#d19900' : 'var(--color-text-muted)', fontWeight: vencida || ehHoje ? 700 : 400 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                            {vencida ? 'Vencido' : ehHoje ? 'Hoje' : fmtD(o.prazoentrega)}
                          </div>
                        )}

                        {saldo > 0 && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:'var(--space-2)' }}>
                            Saldo <strong style={{ color:'var(--color-warning)' }}>{fmt(saldo)}</strong>
                          </div>
                        )}

                        <div style={{ display:'flex', gap:'var(--space-1)', marginTop:'var(--space-2)', borderTop:'1px solid var(--color-divider)', paddingTop:'var(--space-2)' }}>
                          <button className="btn btn-ghost btn-xs" style={{ flex:1, justifyContent:'center', fontSize:10 }} onClick={() => navigate(`/ordens/${o.id}`)}>
                            Detalhes
                          </button>
                          {canEdit && next && (
                            <button className="btn btn-primary btn-xs" style={{ flex:1, justifyContent:'center', fontSize:10 }} onClick={() => mudarStatus(o.id, next)}>
                              {next === 'Em Produção' ? 'Produzir' : next === 'Pronto' ? 'Concluir' : 'Entregar'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden', flex:1 }}>
          <div style={{ overflowY:'auto', height:'100%' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nº</th><th>Cliente</th><th>Serviço</th><th>Prazo</th><th>Status</th><th>Valor</th><th></th>
                </tr>
              </thead>
              <tbody>
                {ordens.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:'var(--space-8)', color:'var(--color-text-muted)' }}>Nenhuma ordem na fila</td></tr>
                ) : ordens.map(o => {
                  const vencida = o.prazoentrega && o.prazoentrega < today;
                  return (
                    <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/ordens/${o.id}`)}>
                      <td style={{ fontWeight:700, color:'var(--color-primary)', fontSize:'var(--text-xs)' }}>{o.numero}</td>
                      <td style={{ fontWeight:600 }}>{o.clientenome}</td>
                      <td><span className={`badge badge-${TIPOBADGE[o.servico]||'diversos'}`} style={{ fontSize:10 }}>{o.servico}</span></td>
                      <td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'var(--text-xs)' }}>{o.descricao}</td>
                      <td style={{ fontSize:'var(--text-xs)', color: vencida ? 'var(--color-error)' : 'var(--color-text-muted)', fontWeight: vencida ? 700 : 400 }}>
                        {o.prazoentrega ? fmtD(o.prazoentrega) : '—'}
                      </td>
                      <td><span className={`badge badge-${o.status==='Em Produção'?'warning':o.status==='Pronto'?'success':'primary'}`} style={{ fontSize:10 }}>{o.status}</span></td>
                      <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-xs)' }}>{fmt(o.valortotal||o.valor)}</td>
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
