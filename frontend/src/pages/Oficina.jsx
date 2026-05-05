import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { on } from '../services/eventBus';

const COLUNAS = [
  { status:'Aguardando',   label:'Aguardando',   color:'#6b7280', bg:'rgba(107,114,128,0.08)' },
  { status:'Em Produção',  label:'Em Produção',  color:'#d97706', bg:'rgba(217,119,6,0.08)'   },
  { status:'Pronto',       label:'Pronto',       color:'#059669', bg:'rgba(5,150,105,0.08)'   },
  { status:'Entregue',     label:'Entregue',     color:'#2563eb', bg:'rgba(37,99,235,0.08)'   },
];

const STATUS_VALIDOS   = new Set(['Aguardando', 'Em Produção', 'Pronto', 'Entregue']);
const STATUS_EXCLUIDOS = new Set(['Cancelado']);

const NORMALIZAR_STATUS = {
  'recebido':     'Aguardando',
  'Recebido':     'Aguardando',
  'aguardando':   'Aguardando',
  'em producao':  'Em Produção',
  'em produção':  'Em Produção',
  'Em Producao':  'Em Produção',
  'producao':     'Em Produção',
  'pronto':       'Pronto',
  'concluido':    'Pronto',
  'Concluido':    'Pronto',
  'Concluído':    'Pronto',
};

const STATUSNEXT = {
  'Aguardando':  'Em Produção',
  'Em Produção': 'Pronto',
  'Pronto':      'Entregue',
};

const TIPOICONE = {
  'Moldura':     'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'Tela':        'M2 3h20v14H2zM8 21h8M12 17v4',
  'Restauro':    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
  'Passepartout':'M3 3h18v18H3z',
  'Vidro':       'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  'Diversos':    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
};

const TIPOBADGE = {
  'Moldura':'primary','Tela':'secondary','Restauro':'warning',
  'Passepartout':'info','Vidro':'success','Diversos':'diversos',
};

function normalizarStatus(status) {
  if (!status) return 'Aguardando';
  if (STATUS_VALIDOS.has(status)) return status;
  return NORMALIZAR_STATUS[status] ?? 'Aguardando';
}

function inicioSemanaAtual() {
  const agora = new Date();
  agora.setHours(agora.getHours() - 3);
  const diaSemana = agora.getUTCDay();
  const diasParaSeg = diaSemana === 0 ? 6 : diaSemana - 1;
  agora.setUTCDate(agora.getUTCDate() - diasParaSeg);
  return agora.toISOString().slice(0, 10);
}

export default function Oficina() {
  const navigate = useNavigate();
  const { user }  = useAuth();
  const canEdit   = user?.role !== 'viewer';

  const [ordens,           setOrdens]           = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [recovering,       setRecovering]       = useState(false);
  const [view,             setView]             = useState('kanban');
  const [draggingId,       setDraggingId]       = useState(null);
  const [dragOver,         setDragOver]         = useState(null);
  const [filterServico,    setFilterServico]    = useState('');
  const [filterPrioridade, setFilterPrioridade] = useState('');
  const [recentEntregues,  setRecentEntregues]  = useState(new Set());
  const [inicioSemana,     setInicioSemana]     = useState(inicioSemanaAtual);
  const semanaRef = useRef(inicioSemana);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const id = setInterval(() => {
      const nova = inicioSemanaAtual();
      if (nova !== semanaRef.current) {
        semanaRef.current = nova;
        setInicioSemana(nova);
        setRecentEntregues(new Set());
        toast('Semana nova — coluna Entregue zerada 🗓', { icon: '🔄', duration: 4000 });
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = ['Aguardando', 'Em Produção', 'Pronto', 'Entregue'];
      const results  = await Promise.all(
        statuses.map(s => api.get(`/ordens?status=${encodeURIComponent(s)}`))
      );
      const all = results.flatMap(r => r.data);
      all.sort((a, b) => {
        if (!a.prazoentrega && !b.prazoentrega) return new Date(a.criadoem) - new Date(b.criadoem);
        if (!a.prazoentrega) return 1;
        if (!b.prazoentrega) return -1;
        return new Date(a.prazoentrega) - new Date(b.prazoentrega);
      });
      setOrdens(all);
    } catch {
      toast.error('Erro ao carregar fila');
    } finally {
      setLoading(false);
    }
  }, []);

  const recover = useCallback(async () => {
    setRecovering(true);
    try {
      const { data } = await api.get('/ordens');
      const ativas = data
        .filter(o => !STATUS_EXCLUIDOS.has(o.status))
        .map(o => ({ ...o, status: normalizarStatus(o.status) }));
      ativas.sort((a, b) => {
        if (!a.prazoentrega && !b.prazoentrega) return new Date(a.criadoem) - new Date(b.criadoem);
        if (!a.prazoentrega) return 1;
        if (!b.prazoentrega) return -1;
        return new Date(a.prazoentrega) - new Date(b.prazoentrega);
      });
      setOrdens(ativas);
      const normalizadas = data.filter(
        o => !STATUS_EXCLUIDOS.has(o.status) && !STATUS_VALIDOS.has(o.status)
      ).length;
      toast.success(
        `Recuperação concluída — ${ativas.length} OS carregada${ativas.length !== 1 ? 's' : ''}` +
        (normalizadas > 0 ? ` (${normalizadas} status corrigido${normalizadas !== 1 ? 's' : ''})` : ''),
        { icon: '🔄', duration: 4000 }
      );
    } catch {
      toast.error('Erro na recuperação — tente novamente');
    } finally {
      setRecovering(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = on('lancamento:salvo', () => load());
    return off;
  }, [load]);

  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [load]);

  const onDragStart = (e, id) => {
    if (!canEdit) return;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(status);
  };

  const onDrop = async (e, novoStatus) => {
    e.preventDefault();
    setDragOver(null);
    if (!draggingId || !canEdit) return;
    const ordem = ordens.find(o => o.id === draggingId);
    if (!ordem || ordem.status === novoStatus) { setDraggingId(null); return; }
    setOrdens(prev => prev.map(o => o.id === draggingId ? { ...o, status: novoStatus } : o));
    try {
      await api.patch(`/ordens/${draggingId}`, { status: novoStatus });
      if (novoStatus === 'Entregue') {
        setRecentEntregues(prev => new Set([...prev, draggingId]));
      }
    } catch {
      toast.error('Erro ao mover OS');
      setOrdens(prev => prev.map(o => o.id === draggingId ? { ...o, status: ordem.status } : o));
    }
    setDraggingId(null);
  };

  const avancarStatus = async (ordem) => {
    if (!canEdit) return;
    const proximo = STATUSNEXT[ordem.status];
    if (!proximo) return;
    setOrdens(prev => prev.map(o => o.id === ordem.id ? { ...o, status: proximo } : o));
    try {
      await api.patch(`/ordens/${ordem.id}`, { status: proximo });
      if (proximo === 'Entregue') {
        setRecentEntregues(prev => new Set([...prev, ordem.id]));
      }
      toast.success(`OS #${ordem.numero} → ${proximo}`);
    } catch {
      toast.error('Erro ao atualizar status');
      setOrdens(prev => prev.map(o => o.id === ordem.id ? { ...o, status: ordem.status } : o));
    }
  };

  const fmtD = d => {
    if (!d) return '';
    const [y, m, dia] = d.split('-');
    return `${dia}/${m}/${y}`;
  };

  const fmtR = v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filtradas = ordens.filter(o => {
    if (filterServico    && o.servico    !== filterServico)    return false;
    if (filterPrioridade && o.prioridade !== filterPrioridade) return false;
    return true;
  });

  const porStatus = col => filtradas.filter(o => o.status === col.status);

  const TIPO_OPTS       = ['Moldura','Tela','Restauro','Passepartout','Vidro','Diversos'];
  const PRIORIDADE_OPTS = ['Normal','Urgente'];

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', gap:'var(--space-3)', color:'var(--color-text-muted)' }}>
      <svg className="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      Carregando fila…
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px - var(--space-12))', minHeight:0 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:'var(--text-xl)', fontWeight:800, margin:0 }}>Fila de Oficina</h1>
          <p style={{ margin:0, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
            {filtradas.length} ordem{filtradas.length !== 1 ? 's' : ''} ativa{filtradas.length !== 1 ? 's' : ''}
            {(filterServico || filterPrioridade) && ' (filtradas)'}
          </p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)', alignItems:'center' }}>
          <select className="form-input" style={{ width:'auto', fontSize:'var(--text-xs)' }}
            value={filterServico} onChange={e => setFilterServico(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TIPO_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-input" style={{ width:'auto', fontSize:'var(--text-xs)' }}
            value={filterPrioridade} onChange={e => setFilterPrioridade(e.target.value)}>
            <option value="">Todas prioridades</option>
            {PRIORIDADE_OPTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={{ display:'flex', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', overflow:'hidden' }}>
            {[{v:'kanban',icon:'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zM14 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5z'},
               {v:'lista', icon:'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h4'}]
              .map(({ v, icon }) => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding:'6px 10px', background: view === v ? 'var(--color-surface-offset)' : 'transparent',
                  border:'none', cursor:'pointer', color: view === v ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  transition:'all 0.15s' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={icon}/></svg>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={recover} disabled={recovering}
            title="Recuperar todas as ordens (corrige status inválidos)">
            {recovering
              ? <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            }
            Recuperar
          </button>
        </div>
      </div>

      {/* Kanban */}
      {view === 'kanban' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'var(--space-3)', flex:1, minHeight:0, overflow:'hidden' }}>
          {COLUNAS.map(col => {
            const cards = porStatus(col);
            return (
              <div key={col.status}
                onDragOver={e => onDragOver(e, col.status)}
                onDrop={e => onDrop(e, col.status)}
                onDragLeave={() => setDragOver(null)}
                style={{ display:'flex', flexDirection:'column', background: dragOver === col.status ? `color-mix(in oklch, ${col.color} 10%, var(--color-surface))` : 'var(--color-surface)',
                  borderRadius:'var(--radius-lg)', border:`1px solid ${dragOver === col.status ? col.color : 'var(--color-border)'}`,
                  transition:'all 0.15s', overflow:'hidden' }}>
                {/* Coluna header */}
                <div style={{ padding:'var(--space-3) var(--space-4)', borderBottom:'1px solid var(--color-border)',
                  background: col.bg, flexShrink:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontWeight:700, fontSize:'var(--text-sm)', color: col.color }}>{col.label}</span>
                    <span style={{ fontSize:11, fontWeight:700, background:`color-mix(in oklch, ${col.color} 15%, var(--color-surface))`,
                      color: col.color, borderRadius:'var(--radius-full)', padding:'1px 8px', minWidth:22, textAlign:'center' }}>
                      {cards.length}
                    </span>
                  </div>
                </div>
                {/* Cards */}
                <div style={{ flex:1, overflowY:'auto', padding:'var(--space-2)', display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
                  {cards.length === 0 ? (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      flex:1, color:'var(--color-text-faint)', gap:'var(--space-2)', padding:'var(--space-8) var(--space-4)', textAlign:'center', fontSize:'var(--text-xs)' }}>
                      {col.status === 'Entregue'
                        ? <><span>Nenhuma entrega esta semana</span><span style={{ fontSize:9, opacity:0.7 }}>Zera todo domingo</span></>
                        : <span>Nenhuma OS aqui</span>
                      }
                    </div>
                  ) : cards.map(o => {
                    const vencida   = o.prazoentrega && o.prazoentrega < today && o.status !== 'Pronto' && o.status !== 'Entregue';
                    const ehHoje    = o.prazoentrega === today;
                    const isUrgente = o.prioridade === 'Urgente';
                    const diasCriado = Math.floor((Date.now() - new Date(o.criadoem)) / 86400000);
                    const saldo     = Number(o.saldoaberto ?? 0);
                    const quitado   = saldo <= 0.009;
                    const resumo    = o.descricao || o.observacoes || o.obs || null;

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

                        {/* Linha 3: descrição / observação do pedido */}
                        {resumo && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:'var(--space-2)',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                            fontStyle: !o.descricao ? 'italic' : 'normal' }}
                            title={resumo}>
                            {resumo}
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
                                transition:'all 0.15s', flexShrink:0 }}
                              title={`Mover para ${STATUSNEXT[o.status]}`}
                            >
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
      )}

      {/* Lista */}
      {view === 'lista' && (
        <div className="card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div style={{ overflowY:'auto', flex:1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nº</th><th>Cliente</th><th>Tipo</th><th>Prazo</th><th>Status</th><th>Saldo</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(o => {
                  const vencida = o.prazoentrega && o.prazoentrega < today && o.status !== 'Pronto' && o.status !== 'Entregue';
                  const saldo   = Number(o.saldoaberto ?? 0);
                  const quitado = saldo <= 0.009;
                  return (
                    <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/ordens/${o.id}`)}>
                      <td style={{ fontWeight:700, color:'var(--color-primary)', fontSize:'var(--text-xs)' }}>{o.numero}</td>
                      <td style={{ fontWeight:600, fontSize:'var(--text-xs)' }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:150 }}>{o.clientenome}</div>
                        {(o.descricao || o.observacoes || o.obs) && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:150 }}>
                            {o.descricao || o.observacoes || o.obs}
                          </div>
                        )}
                        {o.prioridade==='Urgente' && <span style={{ fontSize:9, fontWeight:700, color:'var(--color-error)', background:'rgba(161,44,123,0.10)', borderRadius:'var(--radius-full)', padding:'1px 5px' }}>URGENTE</span>}
                      </td>
                      <td><span className={`badge badge-${TIPOBADGE[o.servico]||'secondary'}`} style={{ fontSize:9 }}>{o.servico}</span></td>
                      <td style={{ fontSize:'var(--text-xs)', color: vencida?'var(--color-error)':'var(--color-text-muted)' }}>
                        {o.prazoentrega?fmtD(o.prazoentrega):'—'}
                      </td>
                      <td>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:'var(--radius-full)',
                          background: COLUNAS.find(c=>c.status===o.status)?.bg||'var(--color-surface-offset)',
                          color: COLUNAS.find(c=>c.status===o.status)?.color||'var(--color-text-muted)' }}>
                          {o.status}
                        </span>
                      </td>
                      <td style={{ fontSize:'var(--text-xs)', fontWeight:600, textAlign:'right',
                        color: quitado ? 'var(--color-success)' : 'var(--color-error)' }}>
                        {quitado ? '✓ Quitado' : fmtR(saldo)}
                      </td>
                      <td style={{ textAlign:'right' }}>
                        {canEdit && STATUSNEXT[o.status] && (
                          <button className="btn btn-ghost btn-xs"
                            onClick={e => { e.stopPropagation(); avancarStatus(o); }}
                            style={{ fontSize:10, whiteSpace:'nowrap' }}>
                            → {STATUSNEXT[o.status]}
                          </button>
                        )}
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
