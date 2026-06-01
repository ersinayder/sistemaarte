import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { buildPropostaWhatsappUrl } from '../utils/propostaWhatsapp';

const STATUS = [
  { id: 'Novo lead', label: 'Novo lead', slug: 'proposta-novo', color: '#38BDF8' },
  { id: 'Orcamento enviado', label: 'Orcamento enviado', slug: 'proposta-enviado', color: '#A78BFA' },
  { id: 'Negociacao', label: 'Negociacao', slug: 'proposta-negociacao', color: '#F59E0B' },
  { id: 'Aprovado', label: 'Aprovado', slug: 'proposta-aprovado', color: '#22C55E' },
  { id: 'Perdido', label: 'Perdido', slug: 'proposta-perdido', color: '#94A3B8' },
];

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => {
  if (!d) return '';
  const date = new Date(String(d).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
};
const fmtPrazo = (value) => fmtDate(value) || String(value || '').trim();

function StatusBadge({ status }) {
  const item = STATUS.find((s) => s.id === status) || STATUS[0];
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, color: item.color,
      border: `1px solid ${item.color}55`, borderRadius: 'var(--radius-full)',
      padding: '2px 7px', whiteSpace: 'nowrap',
    }}>
      {item.label}
    </span>
  );
}

function PropostaModal({ proposta, onClose, onMove, onGerarOS, onOpenPdf, onOpenWhatsapp }) {
  if (!proposta) return null;
  const podeGerar = proposta.status === 'Aprovado' && !proposta.ordemid;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{proposta.numero}</h2>
            <p>{proposta.clientenome}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>x</button>
        </div>

        <div className="modal-body" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div className="proposal-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Status</div>
              <StatusBadge status={proposta.status} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Valor</div>
              <div style={{ fontWeight: 800 }}>{fmt(proposta.valortotal)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Criada</div>
              <div>{fmtDate(proposta.createdat)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Prazo</div>
              <div>{fmtPrazo(proposta.prazoentrega) || 'A definir'}</div>
            </div>
          </div>

          {proposta.descricao && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Descricao</div>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text)' }}>{proposta.descricao}</p>
            </div>
          )}

          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 6 }}>Itens</div>
            <div className="proposal-items-list" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              {(proposta.itens || []).map((item) => (
                <div className="proposal-item-row" key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 108px', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--color-divider)', alignItems: 'start' }}>
                  <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>{item.nome}</span>
                  <span style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>{Number(item.quantidade || 1).toLocaleString('pt-BR')}</span>
                  <strong style={{ textAlign: 'right' }}>{fmt(Number(item.quantidade || 1) * Number(item.preco_unitario || 0))}</strong>
                </div>
              ))}
              {(!proposta.itens || proposta.itens.length === 0) && (
                <div style={{ padding: 'var(--space-4)', color: 'var(--color-text-faint)', textAlign: 'center', fontSize: 'var(--text-sm)' }}>Nenhum item cadastrado</div>
              )}
            </div>
          </div>

          {proposta.observacoes && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Observacoes</div>
              <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{proposta.observacoes}</p>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS.map((s) => (
              <button key={s.id} className="btn btn-secondary btn-sm" disabled={s.id === proposta.status} onClick={() => onMove(proposta, s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => onOpenWhatsapp(proposta)}>WhatsApp</button>
            <button className="btn btn-secondary" onClick={() => onOpenPdf(proposta)}>PDF</button>
            <button className="btn btn-primary" disabled={!podeGerar} onClick={() => onGerarOS(proposta)}>Gerar OS</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Propostas() {
  const navigate = useNavigate();
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [draggingCardHeight, setDraggingCardHeight] = useState(86);
  const [dragOverCol, setDragOverCol] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const { data } = await api.get(`/propostas${params.toString() ? `?${params}` : ''}`);
      setPropostas(data || []);
    } catch {
      toast.error('Erro ao carregar propostas');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const totais = useMemo(() => ({
    quantidade: propostas.length,
    valor: propostas.reduce((acc, p) => acc + Number(p.valortotal || 0), 0),
    aprovadas: propostas.filter((p) => p.status === 'Aprovado').length,
  }), [propostas]);

  const porStatus = useCallback((status) => propostas.filter((p) => p.status === status), [propostas]);

  const openDetail = async (proposta) => {
    try {
      const { data } = await api.get(`/propostas/${proposta.id}`);
      setDetail(data);
    } catch {
      toast.error('Erro ao abrir proposta');
    }
  };

  const move = useCallback(async (proposta, status) => {
    try {
      const { data } = await api.patch(`/propostas/${proposta.id}/status`, { status });
      setPropostas((prev) => prev.map((p) => p.id === proposta.id ? data : p));
      setDetail((current) => current?.id === proposta.id ? data : current);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao mover proposta');
    }
  }, []);

  const onDragStart = useCallback((e, proposta) => {
    setDraggingId(proposta.id);
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    setDraggingCardHeight(rect.height);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('propostaId', String(proposta.id));

    const dragImage = card.cloneNode(true);
    dragImage.classList.add('kanban-card-drag-image');
    dragImage.style.width = `${rect.width}px`;
    dragImage.style.height = `${rect.height}px`;
    dragImage.style.position = 'fixed';
    dragImage.style.top = '-1000px';
    dragImage.style.left = '-1000px';
    dragImage.style.pointerEvents = 'none';
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
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null);
  }, []);

  const onDrop = useCallback(async (e, status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('propostaId');
    setDraggingId(null);
    setDragOverCol(null);
    if (!id) return;
    const proposta = propostas.find((p) => String(p.id) === String(id));
    if (!proposta || proposta.status === status) return;
    await move(proposta, status);
  }, [move, propostas]);

  const gerarOS = async (proposta) => {
    try {
      const { data } = await api.post(`/propostas/${proposta.id}/gerar-os`);
      toast.success('OS gerada');
      navigate(`/ordens/${data.ordemid}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao gerar OS');
    }
  };

  const openPdf = (proposta) => {
    window.open(`/api/propostas/${proposta.id}/pdf`, '_blank', 'noopener,noreferrer');
  };

  const openWhatsapp = (proposta) => {
    const url = buildPropostaWhatsappUrl(proposta);
    if (!url) {
      toast.error('Cliente sem telefone cadastrado.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="erp-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="erp-page-header" style={{
        padding: '6px var(--space-4)',
        borderBottom: '1px solid var(--color-divider)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        flexShrink: 0,
        background: 'var(--color-surface)',
        minHeight: 44,
      }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>Propostas</h1>
          <p style={{ margin: 0, color: 'var(--color-text-faint)', fontSize: 10 }}>
            {totais.quantidade} em funil - {fmt(totais.valor)} - {totais.aprovadas} aprovadas
          </p>
        </div>
        <div className="erp-page-actions proposal-header-actions" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proposta ou cliente"
            style={{ width: 260, height: 28, fontSize: 11, padding: '0 var(--space-2)' }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/orcamento/calculadora')}
            style={{ height: 28, fontSize: 11, padding: '0 10px', whiteSpace: 'nowrap' }}
          >
            Calculadora
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/orcamento')}
            style={{ height: 28, fontSize: 11, padding: '0 10px', whiteSpace: 'nowrap' }}
          >
            Nova proposta
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-text-muted)' }}>Carregando...</div>
      ) : (
        <div className="kanban-board-scroll" style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-4)', overflow: 'auto', flex: 1, alignItems: 'stretch' }}>
          {STATUS.map((col) => {
            const cards = porStatus(col.id);
            const isOver = dragOverCol === col.id;
            const draggingProposta = draggingId ? propostas.find((p) => String(p.id) === String(draggingId)) : null;
            const showDropSlot = Boolean(isOver && draggingProposta && draggingProposta.status !== col.id);

            return (
              <section
                key={col.id}
                className={`${col.slug}${isOver ? ' kanban-column-over' : ''}`}
                onDragOver={(e) => onDragOver(e, col.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, col.id)}
                style={{
                  minWidth: 220,
                  maxWidth: 380,
                  flex: '1 1 260px',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--color-surface-offset)',
                  borderRadius: 'var(--radius-lg)',
                  border: isOver ? `2px solid ${col.color}` : '1px solid var(--color-border)',
                  overflow: 'hidden',
                  minHeight: 0,
                  transition: 'border-color 0.15s',
                }}
              >
                <header style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderBottom: '1px solid var(--color-divider)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: `3px solid ${col.color}`,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: col.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {col.label}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'rgba(255,255,255,0.07)',
                    color: col.color,
                    borderRadius: 'var(--radius-full)',
                    padding: '2px 8px',
                    border: `1px solid ${col.color}33`,
                  }}>
                    {cards.length}
                  </span>
                </header>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    padding: 'var(--space-2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
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
                      <div style={{
                        textAlign: 'center',
                        padding: 'var(--space-8) var(--space-4)',
                        color: isOver ? col.color : 'var(--color-text-faint)',
                        fontSize: 'var(--text-xs)',
                        transition: 'color 0.15s',
                      }}>
                        {isOver ? 'Soltar aqui' : 'Sem propostas'}
                      </div>
                    ) : cards.map((p) => (
                      <button
                        key={p.id}
                        className={`kanban-card${draggingId === p.id ? ' kanban-card-dragging' : ''}`}
                        data-status={col.slug}
                        draggable
                        onDragStart={(e) => onDragStart(e, p)}
                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                        onClick={() => openDetail(p)}
                        style={{ textAlign: 'left', borderLeft: `3px solid ${col.color}`, padding: 'var(--space-3)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 'var(--space-1)' }}>
                          <span style={{ fontWeight: 800, fontSize: 11, color: 'var(--color-primary)', letterSpacing: '0.02em' }}>{p.numero}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace' }}>{fmt(p.valortotal)}</span>
                        </div>

                        <div style={{
                          fontWeight: 700,
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text)',
                          marginBottom: p.descricao ? 'var(--space-1)' : 'var(--space-2)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {p.clientenome}
                        </div>

                        {p.descricao && (
                          <div style={{
                            fontSize: 10,
                            color: 'var(--color-text-muted)',
                            marginBottom: 'var(--space-2)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }} title={p.descricao}>
                            {p.descricao}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                            {p.totalitens || 0} item{Number(p.totalitens || 0) === 1 ? '' : 's'} - {fmtDate(p.createdat)}
                          </span>
                          {p.ordemid && (
                            <span style={{ fontSize: 9, color: 'var(--color-success)', fontWeight: 800, whiteSpace: 'nowrap' }}>
                              OS gerada
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <PropostaModal proposta={detail} onClose={() => setDetail(null)} onMove={move} onGerarOS={gerarOS} onOpenPdf={openPdf} onOpenWhatsapp={openWhatsapp} />
    </div>
  );
}
