import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { openWhatsappConversation } from '../utils/whatsappOficina';
import { atualizarStatusOrdemOficina, filtrarOrdensOficina, ordenarOrdensOficina } from '../utils/oficinaBoard';

const COLUNAS = [
  { status: 'Aguardando',  label: 'Aguardando',  slug: 'aguardando', color:'var(--status-aguardando,#9AA4B2)' },
  { status: 'Em Produção', label: 'Em Produção', slug: 'producao',   color:'var(--status-producao,#2f677d)' },
  { status: 'Pronto',      label: 'Pronto',      slug: 'pronto',     color:'var(--status-pronto,#3f8b4a)' },
  { status: 'Entregue',    label: 'Entregue',    slug: 'entregue',   color:'var(--status-entregue,#5A6474)' },
];

const STATUSNEXT = {
  'Aguardando': 'Em Produção',
  'Em Produção': 'Pronto',
  'Pronto': 'Entregue',
};

// Cor sólida para o fill do hover de cada transição
const NEXT_COLOR = {
  'Aguardando': '#2f677d',
  'Em Produção': '#3f8b4a',
  'Pronto': '#2f6f49',
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

const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const agoraLocal = () => {
  const d = new Date();
  return `${hojeLocal()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
};

/* Botão de avançar status com hover rico via estado React */
function AvancarBtn({ ordem, colColor, onAvancar }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const next = STATUSNEXT[ordem.status];
  const hoverBg = NEXT_COLOR[ordem.status] || colColor;

  const style = {
    fontSize: 9,
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    fontWeight: 800,
    whiteSpace: 'nowrap',
    border: `1px solid ${hovered ? hoverBg : colColor + '44'}`,
    background: hovered ? hoverBg : 'var(--color-surface)',
    color: hovered ? '#fff' : colColor,
    boxShadow: hovered
      ? `0 8px 18px ${hoverBg}33`
      : 'none',
    transform: pressed ? 'translateY(1px)' : hovered ? 'translateY(-1px)' : 'translateY(0)',
    transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
    letterSpacing: 0,
  };

  return (
    <button
      onClick={e => { e.stopPropagation(); onAvancar(ordem); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={style}
    >
      → {next}
    </button>
  );
}

export default function Oficina() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const canEdit    = user?.role === 'admin' || user?.role === 'oficina' || user?.role === 'caixa';
  const showValor  = user?.role !== 'oficina';

  const [ordens,      setOrdens]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [draggingId,  setDraggingId]  = useState(null);
  const [draggingCardHeight, setDraggingCardHeight] = useState(92);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [filterTipo,  setFilterTipo]  = useState('todos');
  const [filterPrio,  setFilterPrio]  = useState('todas');
  const [viewMode,    setViewMode]    = useState('kanban');
  const [today]       = useState(hojeLocal);
  const [whatsappMenu, setWhatsappMenu] = useState(null);
  const [openingAviso, setOpeningAviso] = useState(null);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const { data } = await api.get('/ordens');
      setOrdens(ordenarOrdensOficina(filtrarOrdensOficina(data, today)));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!whatsappMenu) return undefined;
    const close = () => setWhatsappMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [whatsappMenu]);

  const updateAvisoLocal = useCallback((ordemId, aviso) => {
    if (!aviso) return;
    setOrdens(current => current.map(ordem => {
      if (String(ordem.id) !== String(ordemId)) return ordem;
      const whatsappAvisos = {
        ...(ordem.whatsappAvisos || {}),
        [aviso.tipo]: aviso,
      };
      const atualPrincipal = ordem.whatsappAvisoPrincipal;
      const whatsappAvisoPrincipal =
        atualPrincipal?.tipo === aviso.tipo || !atualPrincipal
          ? aviso
          : atualPrincipal;
      return { ...ordem, whatsappAvisos, whatsappAvisoPrincipal };
    }));
  }, []);

  const copiarMensagem = useCallback(async (text) => {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Mensagem copiada');
      return true;
    } catch {
      toast.error('Nao foi possivel copiar a mensagem');
      return false;
    }
  }, []);

  const abrirAvisoWhatsapp = useCallback(async (e, ordem, aviso) => {
    e.preventDefault();
    e.stopPropagation();
    if (!aviso?.tipo || openingAviso) return;

    setOpeningAviso(`${ordem.id}:${aviso.tipo}`);
    try {
      const { data } = await api.post(`/ordens/${ordem.id}/whatsapp-avisos/${aviso.tipo}/abrir`);
      updateAvisoLocal(ordem.id, data.aviso);
      if (!data.whatsapp?.phone) {
        toast.error('Cliente sem telefone cadastrado');
        await copiarMensagem(data.whatsapp?.text);
        return;
      }
      const opened = openWhatsappConversation(data.whatsapp);
      if (!opened) {
        toast.error('Nao foi possivel abrir o WhatsApp Web');
        await copiarMensagem(data.whatsapp.text);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir WhatsApp');
      await copiarMensagem(err.response?.data?.whatsapp?.text);
    } finally {
      setOpeningAviso(null);
    }
  }, [copiarMensagem, openingAviso, updateAvisoLocal]);

  const marcarAvisoWhatsapp = useCallback(async (e, ordem, aviso, status) => {
    e.preventDefault();
    e.stopPropagation();
    setWhatsappMenu(null);
    try {
      const { data } = await api.patch(`/ordens/${ordem.id}/whatsapp-avisos/${aviso.tipo}/status`, { status });
      updateAvisoLocal(ordem.id, data.aviso);
      toast.success(status === 'enviado' ? 'Aviso marcado como enviado' : 'Aviso ignorado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar aviso');
    }
  }, [updateAvisoLocal]);

  const recover = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ordens');
      setOrdens(ordenarOrdensOficina(data));
    } finally {
      setLoading(false);
    }
  }, []);

  const avancarStatus = useCallback(async (ordem) => {
    const novoStatus = STATUSNEXT[ordem.status];
    if (!novoStatus) return;
    const snapshot = ordens;
    setOrdens(current => atualizarStatusOrdemOficina(current, ordem.id, novoStatus, agoraLocal(), today));
    try {
      await api.patch(`/ordens/${ordem.id}/status`, { status: novoStatus });
      await load({ showLoading: false });
    } catch(e) {
      setOrdens(snapshot);
      alert(e?.response?.data?.error || 'Erro ao avançar status');
    }
  }, [load, ordens, today]);

  const onDragStart = useCallback((e, id) => {
    setDraggingId(id);
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    setDraggingCardHeight(rect.height);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('ordemId', id);

    const dragImage = card.cloneNode(true);
    dragImage.classList.add('kanban-card-drag-image');
    dragImage.style.width = `${rect.width}px`;
    dragImage.style.height = `${rect.height}px`;
    dragImage.style.position = 'fixed';
    dragImage.style.top = '-1000px';
    dragImage.style.left = '-1000px';
    dragImage.style.pointerEvents = 'none';
    dragImage.style.opacity = '1';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, rect.width * 0.45, Math.min(rect.height * 0.45, 42));
    window.setTimeout(() => dragImage.remove(), 0);
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
    const snapshot = ordens;
    setOrdens(current => atualizarStatusOrdemOficina(current, ordem.id, novoStatus, agoraLocal(), today));
    try {
      await api.patch(`/ordens/${ordem.id}/status`, { status: novoStatus });
      await load({ showLoading: false });
    } catch(e) {
      setOrdens(snapshot);
      alert(e?.response?.data?.error || 'Erro ao mover');
    }
  }, [ordens, load, today]);

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

  const WhatsappAvisoTag = ({ ordem }) => {
    const aviso = ordem.whatsappAvisoPrincipal;
    if (!aviso) return null;

    const isDone = ['enviado', 'ignorado'].includes(aviso.status);
    const label = aviso.tipo === 'pedido_pronto'
      ? aviso.status === 'enviado' ? 'Avisado' : aviso.status === 'aberto' ? 'Aberto' : 'Avisar pronto'
      : aviso.status === 'enviado' ? 'Confirmado' : aviso.status === 'aberto' ? 'Aberto' : 'Confirmar';
    const key = `${ordem.id}:${aviso.tipo}`;
    const busy = openingAviso === key;

    const openMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      setWhatsappMenu({
        x: event.clientX,
        y: event.clientY,
        ordem,
        aviso,
      });
    };

    return (
      <span
        onClick={isDone ? (e) => e.stopPropagation() : (e) => abrirAvisoWhatsapp(e, ordem, aviso)}
        onContextMenu={openMenu}
        title={isDone ? label : 'Clique para abrir WhatsApp. Clique direito para marcar.'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 9,
          fontWeight: 800,
          color: isDone ? 'var(--color-text-faint)' : 'var(--status-pronto)',
          background: isDone ? 'rgba(255,255,255,0.05)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${isDone ? 'var(--color-border)' : 'rgba(34,197,94,0.35)'}`,
          borderRadius: 'var(--radius-full)',
          padding: '1px 5px',
          cursor: isDone ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? 'Abrindo...' : label}
        {!isDone && (
          <button
            type="button"
            onClick={(e) => marcarAvisoWhatsapp(e, ordem, aviso, 'enviado')}
            title={aviso.tipo === 'pedido_pronto' ? 'Marcar avisado' : 'Marcar confirmado'}
            style={{
              width: 14,
              height: 14,
              border: 'none',
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.2)',
              color: 'var(--status-pronto)',
              fontSize: 10,
              lineHeight: '14px',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ✓
          </button>
        )}
      </span>
    );
  };

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
        background: 'linear-gradient(90deg, var(--color-surface), var(--color-surface-2))',
        gap: 'var(--space-3)',
        minHeight: 44,
      }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontWeight:900, fontSize:'var(--text-sm)', margin:0, color:'var(--color-text)', whiteSpace:'nowrap' }}>Fila da Oficina</h1>
          <p style={{ fontSize:10, color:'var(--color-text-muted)', margin:0 }}>
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

      {whatsappMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: whatsappMenu.y,
            left: whatsappMenu.x,
            zIndex: 1000,
            background: 'var(--color-surface-offset)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
            padding: 4,
          }}
        >
          <button
            type="button"
            onClick={(e) => marcarAvisoWhatsapp(e, whatsappMenu.ordem, whatsappMenu.aviso, 'enviado')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text)',
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {whatsappMenu.aviso.tipo === 'pedido_pronto' ? 'Marcar avisado' : 'Marcar confirmado'}
          </button>
        </div>
      )}

      {/* Kanban */}
      {viewMode === 'kanban' ? (
        <div style={{ display:'flex', gap:'var(--space-4)', padding:'var(--space-4)', flex:1,
          overflow:'auto', alignItems:'stretch' }}>
          {COLUNAS.map(col => {
            const cards = porStatus(col);
            const isOver = dragOverCol === col.status;
            const draggingOrdem = draggingId ? ordens.find(o => String(o.id) === String(draggingId)) : null;
            const showDropSlot = Boolean(isOver && draggingOrdem && draggingOrdem.status !== col.status);
            return (
              <div key={col.status}
                className={`kanban-col-${col.slug}${isOver ? ' kanban-column-over' : ''}`}
                onDragOver={e => onDragOver(e, col.status)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, col.status)}
                style={{
                  flex:'1 1 260px', minWidth:220, maxWidth:380,
                  display:'flex', flexDirection:'column',
                  background:'color-mix(in oklch, var(--color-surface-offset) 72%, var(--color-surface))',
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
                  background: `color-mix(in oklch, ${col.color} 10%, var(--color-surface))`,
                  borderTop:`4px solid ${col.color}`
                }}>
                  <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color: col.color, letterSpacing:'0.04em', textTransform:'uppercase' }}>
                    {col.label}
                  </span>
                  <span style={{
                    fontSize:11, fontWeight:700,
                    background:'var(--color-surface)',
                    color: col.color,
                    borderRadius:'var(--radius-full)',
                    padding:'2px 8px',
                    border:`1px solid ${col.color}33`
                  }}>
                    {cards.length}
                  </span>
                </div>

                <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
                  <div style={{
                    padding:'var(--space-2)',
                    display:'flex', flexDirection:'column', gap:'var(--space-2)',
                    flex: 1,
                    minHeight: 80,
                    background: isOver ? `${col.color}12` : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    {showDropSlot && (
                      <div
                        className="kanban-drop-placeholder"
                        style={{ minHeight: Math.max(70, draggingCardHeight), '--kanban-drop-color': col.color }}
                      >
                        <span>Soltar aqui</span>
                      </div>
                    )}

                    {cards.length === 0 && !showDropSlot ? (
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
                          className={`kanban-card${draggingId === o.id ? ' kanban-card-dragging' : ''}`}
                          data-status={statusSlug}
                          draggable={canEdit}
                          onDragStart={e => onDragStart(e, o.id)}
                          onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                          onClick={() => navigate(`/ordens/${o.id}`)}
                          style={{
                            padding:'var(--space-3)',
                            ...(vencida ? { borderLeftColor:'var(--color-error) !important' } : {}),
                          }}
                        >
                          {/* Linha 1: número + badge tipo */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-1)' }}>
                            <span style={{ fontWeight:800, fontSize:11, color:'var(--color-primary)', letterSpacing:'0.02em' }}>
                              #{o.numero}
                            </span>
                            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                              {isUrgente && (
                                <span style={{ fontSize:9, fontWeight:700, color:'var(--color-error)',
                                  background:'var(--color-error-hl)', borderRadius:'var(--radius-full)',
                                  padding:'1px 5px', letterSpacing:'0.03em' }}>URGENTE</span>
                              )}
                              <WhatsappAvisoTag ordem={o} />
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
                              <AvancarBtn
                                ordem={o}
                                colColor={col.color}
                                onAvancar={avancarStatus}
                              />
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
                      <td style={{ padding:'var(--space-2) var(--space-3)', fontWeight:600, fontSize:'var(--text-xs)', color:'var(--color-text)' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                          <span>{o.clientenome}</span>
                          <WhatsappAvisoTag ordem={o} />
                        </div>
                      </td>
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
