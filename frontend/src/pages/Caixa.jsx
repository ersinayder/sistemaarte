import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'react-hot-toast';
import { useParams } from 'react-router-dom';
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
  const { id: paramId } = useParams();
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

  useEffect(() => {
    if (paramId && lancamentos.length > 0) {
      const found = lancamentos.find(l => String(l.id) === String(paramId));
      if (found) openEdit(found);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, lancamentos]);

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

  const handleOrdemChange = (val) => {
    set('ordem_id', val);
    if (val) {
      const osSel = ordensPendentes.find(o => String(o.id) === String(val));
      if (osSel) {
        setForm(f => ({
          ...f,
          ordem_id: val,
          descricao: f.descricao.trim() === '' || f.descricao.startsWith('Restante ')
            ? `Restante ${osSel.numero}`
            : f.descricao,
        }));
      }
    } else {
      set('ordem_id', '');
    }
  };

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

  // Exclui OS canceladas (ambas grafias) e entregues da lista de vínculo de pagamento
  const ordensPendentes = useMemo(() =>
    ordens.filter(o => !['Cancelada', 'Cancelado', 'Entregue'].includes(o.status) && Number(o.saldoaberto || 0) > 0),
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

  const osSelecionada = form.ordem_id
    ? ordensPendentes.find(o => String(o.id) === String(form.ordem_id))
    : null;

  return (
    <div style={{ height:'calc(100vh - 60px - var(--space-12))', display:'flex', flexDirection:'column', minHeight:0 }}>

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

      {/* Restante do JSX inalterado — apenas o filtro ordensPendentes foi corrigido acima */}
    </div>
  );
}
