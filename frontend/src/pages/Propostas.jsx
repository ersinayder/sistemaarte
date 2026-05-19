import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { buildPropostaWhatsappUrl } from '../utils/propostaWhatsapp';

const STATUS = [
  { id: 'Novo lead', label: 'Novo lead', color: '#38BDF8' },
  { id: 'Orcamento enviado', label: 'Orcamento enviado', color: '#A78BFA' },
  { id: 'Negociacao', label: 'Negociacao', color: '#F59E0B' },
  { id: 'Aprovado', label: 'Aprovado', color: '#22C55E' },
  { id: 'Perdido', label: 'Perdido', color: '#94A3B8' },
];

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => {
  if (!d) return '';
  const date = new Date(String(d).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
};

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
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{proposta.numero}</h2>
            <p>{proposta.clientenome}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>x</button>
        </div>

        <div className="modal-body" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
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
          </div>

          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 6 }}>Itens</div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              {(proposta.itens || []).map((item) => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 96px', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--color-divider)' }}>
                  <span>{item.nome}</span>
                  <span style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>{Number(item.quantidade || 1).toLocaleString('pt-BR')}</span>
                  <strong style={{ textAlign: 'right' }}>{fmt(Number(item.quantidade || 1) * Number(item.preco_unitario || 0))}</strong>
                </div>
              ))}
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
            <button className="btn btn-secondary" onClick={() => onOpenWhatsapp(proposta)}>
              WhatsApp
            </button>
            <button className="btn btn-secondary" onClick={() => onOpenPdf(proposta)}>
              PDF
            </button>
            <button className="btn btn-primary" disabled={!podeGerar} onClick={() => onGerarOS(proposta)}>
              Gerar OS
            </button>
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

  const move = async (proposta, status) => {
    try {
      const { data } = await api.patch(`/propostas/${proposta.id}/status`, { status });
      setPropostas((prev) => prev.map((p) => p.id === proposta.id ? data : p));
      setDetail(data);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao mover proposta');
    }
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: 'var(--space-4)', borderBottom: '1px solid var(--color-divider)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800 }}>Propostas</h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
            {totais.quantidade} em funil • {fmt(totais.valor)} • {totais.aprovadas} aprovadas
          </p>
        </div>
        <input
          className="form-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proposta ou cliente"
          style={{ width: 260 }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-text-muted)' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4)', overflow: 'auto', flex: 1 }}>
          {STATUS.map((col) => {
            const cards = porStatus(col.id);
            return (
              <section key={col.id} style={{
                minWidth: 245, flex: '1 1 260px', background: 'var(--color-surface-offset)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}>
                <header style={{ padding: 'var(--space-3)', borderTop: `3px solid ${col.color}`, borderBottom: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ color: col.color, fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>{col.label}</strong>
                  <span style={{ fontSize: 11, color: col.color, fontWeight: 800 }}>{cards.length}</span>
                </header>
                <div style={{ padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', overflowY: 'auto' }}>
                  {cards.length === 0 ? (
                    <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>Sem propostas</div>
                  ) : cards.map((p) => (
                    <button key={p.id} className="kanban-card" onClick={() => openDetail(p)} style={{ textAlign: 'left', borderLeft: `3px solid ${col.color}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <strong style={{ color: 'var(--color-primary)' }}>{p.numero}</strong>
                        <span style={{ fontSize: 11, fontWeight: 800 }}>{fmt(p.valortotal)}</span>
                      </div>
                      <div style={{ fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.clientenome}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {p.totalitens || 0} item{Number(p.totalitens || 0) === 1 ? '' : 's'} • {fmtDate(p.createdat)}
                      </div>
                      {p.ordemid && <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-success)', fontWeight: 800 }}>OS gerada</div>}
                    </button>
                  ))}
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
