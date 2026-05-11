import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const fmtD = d => { if (!d) return '—'; const [y,m,dia]=d.slice(0,10).split('-'); return `${dia}/${m}/${y}`; };

export default function OrdemLixeira() {
  const navigate = useNavigate();
  const [ordens,  setOrdens]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // backend aceita ?lixeira=1 na rota GET /ordens
      const { data } = await api.get('/ordens?lixeira=1');
      setOrdens(data || []);
    } catch {
      toast.error('Erro ao carregar lixeira');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const restaurar = async (id) => {
    setWorking(id);
    try {
      // backend usa POST /ordens/:id/restore
      await api.post(`/ordens/${id}/restore`);
      toast.success('OS restaurada');
      load();
    } catch {
      toast.error('Erro ao restaurar');
    } finally {
      setWorking(null);
    }
  };

  const excluirPermanente = async (id) => {
    if (!window.confirm('Excluir permanentemente esta OS? Não é possível desfazer.')) return;
    setWorking(id);
    try {
      // backend usa DELETE /ordens/:id/permanente
      await api.delete(`/ordens/${id}/permanente`);
      toast.success('OS excluída permanentemente');
      load();
    } catch {
      toast.error('Erro ao excluir');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'var(--space-3) var(--space-6)', borderBottom:'1px solid var(--color-border)',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
        background:'var(--color-surface)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/ordens')}
            style={{ fontSize:'var(--text-xs)', display:'flex', alignItems:'center', gap:'var(--space-1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Voltar
          </button>
          <div>
            <h1 style={{ fontWeight:700, fontSize:'var(--text-lg)', margin:0, display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
              Lixeira — Ordens de Serviço
            </h1>
            <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', margin:0 }}>
              {ordens.length} {ordens.length === 1 ? 'item' : 'itens'} na lixeira
            </p>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex:1, overflow:'auto' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--color-text-muted)' }}>
            Carregando…
          </div>
        ) : ordens.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            height:'60vh', color:'var(--color-text-faint)', gap:'var(--space-3)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
            <p style={{ fontSize:'var(--text-sm)' }}>Lixeira vazia</p>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'var(--text-xs)' }}>
            <thead style={{ position:'sticky', top:0, zIndex:10, background:'var(--color-surface-offset)' }}>
              <tr style={{ borderBottom:'1px solid var(--color-border)' }}>
                {['Nº','Cliente','Serviço','Observações','Removida em','Valor',''].map((h,i) => (
                  <th key={i} style={{ padding:'var(--space-2) var(--space-3)', textAlign:'left',
                    fontWeight:700, color:'var(--color-text-muted)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordens.map(o => (
                <tr key={o.id} style={{ borderBottom:'1px solid var(--color-border)' }}>
                  <td style={{ fontWeight:700, color:'var(--color-text-muted)', padding:'var(--space-2) var(--space-3)' }}>{o.numero}</td>
                  <td style={{ fontWeight:600, padding:'var(--space-2) var(--space-3)' }}>{o.clientenome || '—'}</td>
                  <td style={{ padding:'var(--space-2) var(--space-3)' }}>{o.servico || '—'}</td>
                  <td style={{ maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    padding:'var(--space-2) var(--space-3)', color:'var(--color-text-muted)' }}>
                    {o.observacoes || o.itens_resumo || '—'}
                  </td>
                  <td style={{ padding:'var(--space-2) var(--space-3)', color:'var(--color-text-muted)' }}>
                    {fmtD(o.deletedat || o.updatedat)}
                  </td>
                  <td style={{ padding:'var(--space-2) var(--space-3)', fontFamily:'monospace' }}>
                    R$ {Number(o.valortotal||0).toFixed(2).replace('.',',')}
                  </td>
                  <td style={{ padding:'var(--space-2) var(--space-3)' }}>
                    <div style={{ display:'flex', gap:'var(--space-2)', justifyContent:'flex-end' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize:'var(--text-xs)', display:'flex', alignItems:'center', gap:4 }}
                        onClick={() => restaurar(o.id)}
                        disabled={working === o.id}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                          <path d="M3 3v5h5"/>
                        </svg>
                        Restaurar
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize:'var(--text-xs)' }}
                        onClick={() => excluirPermanente(o.id)}
                        disabled={working === o.id}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
