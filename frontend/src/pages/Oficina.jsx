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

  // Zera coluna Entregue todo domingo
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
      all.sort((a, b) => new Date(a.criadoem) - new Date(b.criadoem));
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
      ativas.sort((a, b) => new Date(a.criadoem) - new Date(b.criadoem));
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

  // Recarrega quando o Caixa registra um lançamento (mesma aba, SPA)
  useEffect(() => {
    const off = on('lancamento:salvo', () => load());
    return off;
  }, [load]);

  // Recarrega quando o usuário volta para esta aba/página (ex: veio do Caixa)
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [load]);

  const byStatus = (s) => ordens.filter(o => {
    if (o.status !== s) return false;
    if (filterServico    && o.servico    !== filterServico)    return false;
    if (filterPrioridade && o.prioridade !== filterPrioridade) return false;
    if (s === 'Entregue') {
      if (recentEntregues.has(o.id)) return true;
      const entregueEm = o.entregueem || o.updatedat || o.criadoem;
      if (!entregueEm) return false;
      return entregueEm.slice(0, 10) >= inicioSemana;
    }
    return true;
  });

  const mudarStatus = async (id, novoStatus) => {
    if (novoStatus === 'Entregue') {
      setRecentEntregues(prev => new Set([...prev, id]));
    }
    try {
      await api.patch(`/ordens/${id}/status`, { status: novoStatus });
      toast.success(`Status → ${novoStatus}`);
      load();
    } catch (err) {
      if (novoStatus === 'Entregue') {
        setRecentEntregues(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
      const msg = err.response?.data?.error || 'Erro ao atualizar status';
      toast.error(msg, { duration: 6000 });
    }
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

  const fmt  = v => v != null ? Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) : '—';
  const fmtD = d => d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : null;

  const tiposServico = [...new Set(ordens.map(o => o.servico).filter(Boolean))];

  const labelEntregue = (() => {
    const [, mes, dia] = inicioSemana.split('-');
    return `Entregue (desde ${dia}/${mes})`;
  })();

  return (
    <div style={{ height:'calc(100vh - 60px - var(--space-12))', display:'flex', flexDirection:'column', minHeight:0 }}>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:'var(--text-xl)', fontWeight:800, margin:0 }}>Fila da Oficina</h1>
          <p style={{ margin:0, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
            {ordens.filter(o => o.status !== 'Entregue').length} ordem{ordens.filter(o => o.status !== 'Entregue').length !== 1 ? 's' : ''} ativa{ordens.filter(o => o.status !== 'Entregue').length !== 1 ? 's' : ''}
          </p>
        </div>

        <div style={{ display:'flex', gap:'var(--space-2)', alignItems:'center' }}>
          <select className="form-input"
            style={{ width:'auto', fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-2)' }}
            value={filterServico} onChange={e => setFilterServico(e.target.value)}>
            <option value="">Todos os tipos</option>
            {tiposServico.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select className="form-input"
            style={{ width:'auto', fontSize:'var(--text-xs)', padding:'var(--space-1) var(--space-2)' }}
            value={filterPrioridade} onChange={e => setFilterPrioridade(e.target.value)}>
            <option value="">Todas prioridades</option>
            <option value="Normal">Normal</option>
            <option value="Urgente">Urgente</option>
          </select>

          <div style={{ display:'flex', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:2 }}>
            <button className={`btn btn-xs ${view==='kanban'?'btn-primary':'btn-ghost'}`} onClick={() => setView('kanban')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="11"/>
              </svg>
            </button>
            <button className={`btn btn-xs ${view==='list'?'btn-primary':'btn-ghost'}`} onClick={() => setView('list')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>

          <button className="btn btn-ghost btn-xs" onClick={load} disabled={loading||recovering} title="Atualizar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>

          <button className="btn btn-secondary btn-xs" onClick={recover}
            disabled={recovering||loading}
            title="Recuperar todas as OS ativas — normaliza status inconsistentes"
            style={{ gap:'var(--space-1)' }}>
            {recovering
              ? <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            }
            Recuperar OS
          </button>
        </div>
      </div>

      {(loading || recovering) ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-2)' }}>
          <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          {recovering ? 'Recuperando OS…' : 'Carregando fila…'}
        </div>
      ) : view === 'kanban' ? (
        <div style={{ display:'flex', gap:'var(--space-4)', flex:1, overflowX:'auto', overflowY:'auto', minHeight:0, paddingBottom:'var(--space-2)' }}>
          {COLUNAS.map(col => {
            const isEntregue = col.status === 'Entregue';
            const colLabel   = isEntregue ? labelEntregue : col.label;
            return (
            <div key={col.status}
              onDragOver={e => { e.preventDefault(); setDragOver(col.status); }}
              onDrop={e => { e.preventDefault(); handleDrop(col.status); }}
              style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)', minWidth:260, flex:1,
                background: dragOver===col.status ? col.bg : 'transparent',
                borderRadius:'var(--radius-xl)', padding:'var(--space-2)',
                transition:'background 0.2s ease', overflowY:'auto', maxHeight:'calc(100vh - 160px)' }}
            >
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'var(--space-2) var(--space-3)', background:col.bg,
                borderRadius:'var(--radius-lg)', border:`1px solid ${col.color}40` }}>
                <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:col.color }}/>
                  <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color:col.color }}>{colLabel}</span>
                </div>
                <span style={{ background:col.color, color:'white', width:22, height:22, borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>
                  {byStatus(col.status).length}
                </span>
              </div>

              {byStatus(col.status).length === 0
                ? <div style={{ border:'2px dashed var(--color-border)', borderRadius:'var(--radius-lg)',
                    padding:'var(--space-8) var(--space-4)', textAlign:'center',
                    color:'var(--color-text-faint)', fontSize:'var(--text-xs)',
                    minHeight:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'var(--space-1)' }}>
                    {isEntregue
                      ? <><span>Nenhuma entrega esta semana</span><span style={{ fontSize:9, opacity:0.7 }}>Zera todo domingo</span></>
                      : canEdit ? 'Arraste uma OS aqui' : 'Nenhuma OS'}
                  </div>
                : byStatus(col.status).map(o => {
                    const vencida    = o.prazoentrega && o.prazoentrega < today && o.status !== 'Entregue';
                    const ehHoje     = o.prazoentrega === today;
                    const saldo      = (o.valortotal||o.valor||0) - (o.valorentrada||o.entrada||0);
                    const diasCriado = Math.floor((Date.now() - new Date(o.criadoem)) / 86400000);
                    const next       = STATUSNEXT[o.status];
                    const isRecent   = recentEntregues.has(o.id);
                    return (
                      <div key={o.id}
                        draggable={canEdit && o.status !== 'Entregue'}
                        onDragStart={() => handleDragStart(o.id)}
                        onDragEnd={handleDragEnd}
                        style={{ background: o.status === 'Entregue' ? 'var(--color-surface-offset)' : 'var(--color-surface)',
                          border:`1px solid ${
                            o.status === 'Entregue' ? 'rgba(37,99,235,0.20)'
                            : vencida ? 'var(--color-error)' : 'var(--color-border)'
                          }`,
                          borderRadius:'var(--radius-lg)', padding:'var(--space-3)',
                          cursor: canEdit && o.status !== 'Entregue' ? 'grab' : 'default',
                          opacity: draggingId===o.id ? 0.5 : o.status === 'Entregue' ? 0.75 : 1,
                          transition:'all 0.4s ease',
                          animation: isRecent ? 'slideInEntregue 0.4s ease' : 'none',
                          boxShadow:'var(--shadow-sm)' }}
                      >
                        {o.status === 'Entregue' && (
                          <div style={{ marginBottom:'var(--space-1)' }}>
                            <span style={{ fontSize:9, fontWeight:700, color:'#2563eb',
                              background:'rgba(37,99,235,0.10)', borderRadius:'var(--radius-full)', padding:'1px 6px', letterSpacing:'0.03em' }}>
                              ✓ ENTREGUE
                            </span>
                          </div>
                        )}

                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'var(--space-2)' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                            <div style={{ width:28, height:28, borderRadius:'var(--radius-md)',
                              background:'rgba(1,105,111,0.10)', display:'flex', alignItems:'center',
                              justifyContent:'center', flexShrink:0 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                                <path d={TIPOICONE[o.servico]||TIPOICONE['Diversos']}/>
                              </svg>
                            </div>
                            <div style={{ fontWeight:800, fontSize:'var(--text-xs)', color:'var(--color-primary)', lineHeight:1.2 }}>{o.numero}</div>
                          </div>
                          <div style={{ fontSize:10, color:'var(--color-text-faint)' }}>
                            {diasCriado===0?'hoje':`${diasCriado}d`}
                          </div>
                        </div>

                        {o.prioridade==='Urgente' && o.status !== 'Entregue' && (
                          <div style={{ marginBottom:'var(--space-1)' }}>
                            <span style={{ fontSize:10, fontWeight:700, color:'var(--color-error)',
                              background:'rgba(161,44,123,0.10)', borderRadius:'var(--radius-full)', padding:'1px 6px' }}>
                              ⚡ Urgente
                            </span>
                          </div>
                        )}

                        <div style={{ fontWeight:600, fontSize:'var(--text-sm)', marginBottom:2, lineHeight:1.3 }}>{o.clientenome}</div>

                        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-1)', marginBottom:'var(--space-2)' }}>
                          <span className={`badge badge-${TIPOBADGE[o.servico]||'diversos'}`} style={{ fontSize:10 }}>{o.servico}</span>
                          {o.descricao && <span style={{ fontSize:10, color:'var(--color-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110 }}>{o.descricao}</span>}
                        </div>

                        {o.observacoes && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:'var(--space-2)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            💬 {o.observacoes}
                          </div>
                        )}

                        {o.prazoentrega && o.status !== 'Entregue' && (
                          <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:'var(--space-2)', fontSize:10,
                            color: vencida?'var(--color-error)':ehHoje?'#d19900':'var(--color-text-muted)',
                            fontWeight: vencida||ehHoje?700:400 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                            </svg>
                            {vencida?'⚠ Vencido':ehHoje?'Hoje':fmtD(o.prazoentrega)}
                          </div>
                        )}

                        {/* Saldo: para OS não-entregues mostra saldo financeiro; para entregues mostra valor total */}
                        {o.status !== 'Entregue' && saldo > 0 && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:'var(--space-2)' }}>
                            Saldo <strong style={{ color:'var(--color-warning)' }}>{fmt(saldo)}</strong>
                          </div>
                        )}
                        {o.status === 'Entregue' && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:'var(--space-2)' }}>
                            Total <strong style={{ color:'var(--color-text)' }}>{fmt(o.valortotal||o.valor)}</strong>
                          </div>
                        )}

                        <div style={{ display:'flex', gap:'var(--space-1)', marginTop:'var(--space-2)', borderTop:'1px solid var(--color-divider)', paddingTop:'var(--space-2)' }}>
                          <button className="btn btn-ghost btn-xs" style={{ flex:1, justifyContent:'center', fontSize:10 }}
                            onClick={() => navigate(`/ordens/${o.id}`)}>Detalhes</button>
                          {canEdit && next && o.status !== 'Entregue' && (
                            <button className="btn btn-primary btn-xs" style={{ flex:1, justifyContent:'center', fontSize:10 }}
                              onClick={() => mudarStatus(o.id, next)}>
                              {next==='Em Produção'?'Produzir':next==='Pronto'?'Concluir':'Entregar'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden', flex:1 }}>
          <div style={{ overflowY:'auto', height:'100%' }}>
            <table className="table">
              <thead>
                <tr><th>Nº</th><th>Cliente</th><th>Serviço</th><th>Descrição</th><th>Prazo</th><th>Status</th><th>Valor</th></tr>
              </thead>
              <tbody>
                {ordens.length===0
                  ? <tr><td colSpan={7} style={{ textAlign:'center', padding:'var(--space-8)', color:'var(--color-text-muted)' }}>Nenhuma ordem na fila</td></tr>
                  : ordens.filter(o => {
                      if (o.status !== 'Entregue') return true;
                      const entregueEm = o.entregueem || o.updatedat || o.criadoem;
                      return entregueEm && entregueEm.slice(0,10) >= inicioSemana;
                    }).map(o => {
                    const vencida = o.prazoentrega && o.prazoentrega < today && o.status !== 'Entregue';
                    return (
                      <tr key={o.id} style={{ cursor:'pointer', opacity: o.status==='Entregue' ? 0.7 : 1 }}
                        onClick={() => navigate(`/ordens/${o.id}`)}
                      >
                        <td style={{ fontWeight:700, color:'var(--color-primary)', fontSize:'var(--text-xs)' }}>{o.numero}</td>
                        <td style={{ fontWeight:600 }}>{o.clientenome}</td>
                        <td><span className={`badge badge-${TIPOBADGE[o.servico]||'diversos'}`} style={{ fontSize:10 }}>{o.servico}</span></td>
                        <td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'var(--text-xs)' }}>{o.descricao}</td>
                        <td style={{ fontSize:'var(--text-xs)', color:vencida?'var(--color-error)':'var(--color-text-muted)', fontWeight:vencida?700:400 }}>
                          {o.prazoentrega?fmtD(o.prazoentrega):'—'}
                        </td>
                        <td>
                          <span className={`badge badge-${
                            o.status==='Em Produção'?'warning':o.status==='Pronto'?'success':
                            o.status==='Entregue'?'primary':'secondary'
                          }`} style={{ fontSize:10 }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-xs)' }}>
                          {fmt(o.valortotal||o.valor)}
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInEntregue {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 0.75; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
