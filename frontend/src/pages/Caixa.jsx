import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt  = v => `R$ ${Math.abs(Number(v)||0).toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.')}`;
const fmtS = v => `${Number(v)>=0?'+ ':' \u2212 '}${fmt(v)}`;
const today= new Date(Date.now()-3*60*60*1000).toISOString().slice(0,10);
const fmtDate = iso => { if(!iso) return ''; const [y,m,d]=iso.split('-'); const dn=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']; const dow=new Date(iso+'T12:00:00').getDay(); return `${dn[dow]}, ${d}/${m}`; };
const addDays= (iso,n) => { const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return d.toLocaleDateString('sv-SE'); };

const PAGOPTS = ['Pix','Dinheiro','Credito','Debito','Link'];
const TIPOOPTS = ['Corte a Laser','Quadro','Caixas','3D','Diversos'];
const PAGLABEL = {Credito:'Crédito',Debito:'Débito',Link:'Link Pag.',Pix:'Pix',Dinheiro:'Dinheiro'};
const PAGBADGE = {Pix:'pix',Dinheiro:'dinheiro',Credito:'credito',Debito:'debito',Link:'link'};
const TIPOBADGE = {'Corte a Laser':'laser',Quadro:'quadro',Caixas:'caixas','3D':'3d',Diversos:'diversos'};
const saldoOS = o => Math.max(0, Number(o?.saldoaberto ?? o?.valorrestante ?? (Number(o?.valor||o?.valortotal||0) - Number(o?.entrada||o?.valorentrada||0))) );
const descricaoOS = (o) => {
  const total   = Number(o?.valor || o?.valortotal || 0);
  const entrada = Number(o?.entrada || o?.valorentrada || 0);
  if (entrada > 0 && entrada >= total) return `Total ${o.numero}`;
  if (entrada > 0 && entrada < total)  return `Entrada ${o.numero}`;
  return `Restante ${o.numero}`;
};

function imprimirRecibo(lanc, empresa='Oficina') {
  const win = window.open('','_blank','width=380,height=620');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Recibo</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;padding:24px 28px;color:#111;max-width:360px;margin:0 auto}
    .logo{text-align:center;font-size:18px;font-weight:800;letter-spacing:1px;margin-bottom:2px}
    .sub{text-align:center;font-size:10px;color:#666;margin-bottom:14px}
    .title{text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;
      border-top:2px solid #111;border-bottom:2px solid #111;padding:6px 0;margin-bottom:14px}
    .row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid #eee}
    .row:last-child{border:none}
    .label{color:#666;font-size:11px}
    .valor-box{text-align:center;margin:16px 0;padding:12px;background:#f5f5f5;border-radius:6px;border:1px dashed #bbb}
    .valor-num{font-size:26px;font-weight:900;letter-spacing:-0.5px}
    .sign{margin-top:32px;padding-top:10px;border-top:1px solid #333;text-align:center;font-size:10px;color:#666}
    .footer{text-align:center;font-size:9px;color:#aaa;margin-top:12px}
    .no-print{text-align:center;margin-top:14px}
    button{padding:8px 22px;background:#111;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;margin:0 4px}
    button.sec{background:#eee;color:#111}
    @media print{.no-print{display:none}body{padding:0}}
  </style></head><body>
  <div class="logo">${empresa.toUpperCase()}</div>
  <div class="sub">Comprovante de Pagamento</div>
  <div class="title">Recibo</div>
  <div style="margin-bottom:14px">
    <div class="row"><span class="label">N\u00ba</span><span>#${lanc.id}</span></div>
    <div class="row"><span class="label">Data</span><span>${new Date().toLocaleString('pt-BR')}</span></div>
    ${lanc.ordemnumero?`<div class="row"><span class="label">OS</span><span style="font-weight:700;color:#01696f">${lanc.ordemnumero}</span></div>`:''}
    <div class="row"><span class="label">Tipo</span><span>${lanc.tipo||'\u2014'}</span></div>
    <div class="row"><span class="label">Pagamento</span><span>${PAGLABEL[lanc.pagamento]||lanc.pagamento}</span></div>
    <div class="row"><span class="label">Descri\u00e7\u00e3o</span><span style="max-width:200px;text-align:right">${lanc.descricao}</span></div>
  </div>
  <div class="valor-box">
    <div class="label" style="margin-bottom:4px">VALOR</div>
    <div class="valor-num">R$ ${Number(lanc.valor||0).toFixed(2).replace('.',',')}</div>
  </div>
  <div class="sign">
    <div style="height:36px"></div>
    <div>Assinatura / Recebido por</div>
  </div>
  <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
  <div class="no-print">
    <button onclick="window.print()">Imprimir</button>
    <button class="sec" onclick="window.close()">Fechar</button>
  </div>
  </body></html>`);
  win.document.close();
  setTimeout(()=>{ win.focus(); win.print(); }, 400);
}

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}

// \u2500\u2500 Modal Lan\u00e7amento Unificado \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function ModalLancamento({ open, onClose, onSaved, editData, currentDate, ordens, presetOrder }) {
  const BLANK = {
    descricao: '',
    tipo: 'Diversos',
    pagamento: 'Pix',
    valor: '',
    ordemid: '',
  };

  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(()=>{
    if (!open) return;
    if (editData) {
      setForm({
        descricao: editData.descricao || '',
        tipo: editData.tipo || 'Diversos',
        pagamento: editData.pagamento || 'Pix',
        valor: String(editData.valor ?? ''),
        ordemid: editData.ordemid ? String(editData.ordemid) : '',
      });
    } else if (presetOrder) {
      setForm({
        descricao: descricaoOS(presetOrder),
        tipo: presetOrder.tipo || presetOrder.servico || 'Diversos',
        pagamento: presetOrder.pagamento || 'Pix',
        valor: '',
        ordemid: String(presetOrder.id),
      });
    } else {
      setForm(BLANK);
    }
  }, [open, editData, presetOrder]);

  const ordemSelecionada = useMemo(() => ordens.find(o => String(o.id) === String(form.ordemid)), [ordens, form.ordemid]);
  const saldoSelecionado = ordemSelecionada ? saldoOS(ordemSelecionada) : null;
  const isEntradaAutomatica = editData?.origem === 'entradaos';
  const ordensComSaldo = ordens.filter(o => saldoOS(o) > 0.009 && o.status !== 'Cancelado');

  const save = async () => {
    if (isEntradaAutomatica) { toast.error('A entrada autom\u00e1tica da OS deve ser alterada pela pr\u00f3pria OS.'); return; }
    const valor = Number(form.valor);
    if (!form.descricao.trim()) return toast.error('Descri\u00e7\u00e3o obrigat\u00f3ria');
    if (!Number.isFinite(valor) || valor === 0) return toast.error('Informe um valor (use negativo para despesas)');
    if (form.ordemid && saldoSelecionado !== null && valor > saldoSelecionado + 0.0001) {
      return toast.error(`Restante dispon\u00edvel: ${fmt(saldoSelecionado)}`);
    }
    setSaving(true);
    try {
      const payload = {
        data: currentDate,
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        pagamento: form.pagamento,
        valor,
        pago: true,
        ordemid: form.ordemid ? Number(form.ordemid) : null,
      };
      if (editData) {
        await api.put(`/caixa/${editData.id}`, payload);
        toast.success('Lan\u00e7amento atualizado!');
      } else {
        await api.post('/caixa', payload);
        toast.success('Lan\u00e7amento registrado!');
      }
      onSaved();
      onClose();
    } catch(e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <Portal>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 520 }}>
          <div className="modal-header">
            <span className="modal-title">{editData ? 'Editar Lan\u00e7amento' : 'Novo Lan\u00e7amento'}</span>
            <button className="btn btn-icon btn-ghost" onClick={onClose}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

            {isEntradaAutomatica && (
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-primary-hl)', color: 'var(--color-primary)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                Este lan\u00e7amento foi criado automaticamente pela OS e deve ser alterado pelo cadastro da ordem.
              </div>
            )}

            {/* Descri\u00e7\u00e3o */}
            <div className="form-group">
              <label className="form-label">Descri\u00e7\u00e3o <span style={{ color: 'var(--color-error)' }}>*</span></label>
              <input
                className="form-input"
                value={form.descricao}
                disabled={isEntradaAutomatica}
                onChange={e => set('descricao', e.target.value)}
                placeholder="Ex: Venda quadro pronto, material, conserto..."
                autoFocus
              />
            </div>

            <div className="form-grid-2">
              {/* Tipo */}
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={form.tipo} disabled={isEntradaAutomatica} onChange={e => set('tipo', e.target.value)}>
                  {TIPOOPTS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              {/* Pagamento */}
              <div className="form-group">
                <label className="form-label">Pagamento</label>
                <select className="form-input" value={form.pagamento} disabled={isEntradaAutomatica} onChange={e => set('pagamento', e.target.value)}>
                  {PAGOPTS.map(p => <option key={p} value={p}>{PAGLABEL[p]||p}</option>)}
                </select>
              </div>
            </div>

            {/* Valor */}
            <div className="form-group">
              <label className="form-label">
                Valor (R$)
                <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                  use valor negativo para despesas
                </span>
              </label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.valor}
                disabled={isEntradaAutomatica}
                onChange={e => set('valor', e.target.value)}
                placeholder="Ex: 150.00 ou -45.00"
              />
            </div>

            {/* Vincular a OS (opcional) */}
            <div className="form-group">
              <label className="form-label">
                Vincular a uma OS
                <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>opcional</span>
              </label>
              <select
                className="form-input"
                value={form.ordemid}
                disabled={isEntradaAutomatica}
                onChange={e => {
                  const o = ordens.find(x => String(x.id) === e.target.value);
                  setForm(f => ({
                    ...f,
                    ordemid: e.target.value,
                    tipo: o ? (o.tipo || o.servico || f.tipo) : f.tipo,
                    descricao: o ? descricaoOS(o) : f.descricao,
                    pagamento: o ? (o.pagamento || f.pagamento) : f.pagamento,
                  }));
                }}
              >
                <option value="">Nenhuma (lan\u00e7amento avulso)</option>
                {ordensComSaldo.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.numero} \u2013 {o.clientenome || o.clientecontato} \u2013 restante {fmt(saldoOS(o))}
                  </option>
                ))}
              </select>
              {ordemSelecionada && (
                <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Total {fmt(ordemSelecionada.valor || ordemSelecionada.valortotal)}
                  {' \u00b7 '}
                  Restante <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>{fmt(saldoSelecionado)}</span>
                </div>
              )}
            </div>

          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || isEntradaAutomatica}>
              {saving
                ? <><div className="spinner" style={{ width: 14, height: 14 }}/> Salvando...</>
                : 'Salvar'
              }
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// \u2500\u2500 P\u00e1gina Caixa \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export default function Caixa() {
  const { isAdmin, isCaixa } = useAuth();
  const [date, setDate] = useState(today);
  const [lancamentos, setLancamentos] = useState([]);
  const [ordens, setOrdens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false, edit: null, presetOrder: null });
  const [deleteId, setDeleteId] = useState(null);
  const [deleteDesc, setDeleteDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rCaixa, rOrdens] = await Promise.all([
        api.get(`/caixa?data=${date}`),
        api.get('/ordens?status=todos'),
      ]);
      setLancamentos(rCaixa.data);
      setOrdens(rOrdens.data);
    } catch { toast.error('Erro ao carregar caixa'); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const pedirExclusao = (l) => { setDeleteId(l.id); setDeleteDesc(l.descricao || `#${l.id}`); };
  const confirmDelete = async () => {
    try { await api.delete(`/caixa/${deleteId}`); toast.success('Exclu\u00eddo!'); setDeleteId(null); load(); }
    catch(e) { toast.error(e.response?.data?.error || 'Erro ao excluir'); }
  };

  const filtered = lancamentos.filter(l => {
    const q = search.toLowerCase();
    return !q || l.descricao?.toLowerCase().includes(q) || l.tipo?.toLowerCase().includes(q) || (l.ordemnumero || '').toLowerCase().includes(q);
  });

  const totalFiltrado = filtered.reduce((s, l) => s + Number(l.valor || 0), 0);
  const summary = PAGOPTS.reduce((acc, p) => ({ ...acc, [p]: lancamentos.filter(l => l.pagamento === p).reduce((s, l) => s + Number(l.valor || 0), 0) }), {});
  const totalDia = lancamentos.reduce((s, l) => s + Number(l.valor || 0), 0);
  const totalCartao = (summary.Credito || 0) + (summary.Debito || 0);
  const ordensPendentes = ordens.filter(o => saldoOS(o) > 0.009 && o.status !== 'Cancelado').sort((a, b) => saldoOS(b) - saldoOS(a));
  const isToday = date === today;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Caixa do Dia</h1>
        {isCaixa && (
          <button className="btn btn-primary" onClick={() => setModal({ open: true, edit: null, presetOrder: null })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Novo Lan\u00e7amento
          </button>
        )}
      </div>

      {/* Navega\u00e7\u00e3o de data */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(d => addDays(d, -1))}>\u2039</button>
          <div style={{ padding: 'var(--space-2) var(--space-5)', fontWeight: 700, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', minWidth: 220, textAlign: 'center', fontSize: 'var(--text-sm)' }}>
            {fmtDate(date)} {isToday && <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--color-primary)', fontWeight: 600 }}>Hoje</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(d => addDays(d, 1))} disabled={isToday}>\u203a</button>
        </div>
        {!isToday && <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)}>Ir para hoje</button>}
        <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto', padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--text-xs)' }}/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: 'var(--space-4)', alignItems: 'start' }}>
        {/* Tabela lan\u00e7amentos */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
            <input className="form-input" placeholder="Buscar descri\u00e7\u00e3o, tipo ou OS..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220 }}/>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', alignSelf: 'center' }}>{filtered.length} lan\u00e7amento{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {loading ? <div className="loading-center"><div className="spinner"/></div>
          : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>Nenhum lan\u00e7amento</h3>
              <p>{search ? 'Nenhum resultado para a busca.' : 'Nenhum registro para este dia.'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Tipo</th><th>Descri\u00e7\u00e3o</th><th>OS</th><th>Pagamento</th><th>Valor</th><th>Origem</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(l => {
                    const ordemNumero = l.ordemnumero || null;
                    const bloqueado = l.origem === 'entradaos';
                    return (
                      <tr key={l.id}>
                        <td style={{ color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>{l.id}</td>
                        <td><span className={`badge badge-${TIPOBADGE[l.tipo] || 'diversos'}`}>{l.tipo}</span></td>
                        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao}</td>
                        <td>{ordemNumero && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', fontWeight: 700 }}>{ordemNumero}</span>}</td>
                        <td><span className={`badge badge-${PAGBADGE[l.pagamento] || 'pix'}`}>{PAGLABEL[l.pagamento] || l.pagamento}</span></td>
                        <td className="tabnum" style={{ fontWeight: 700, whiteSpace: 'nowrap', color: Number(l.valor) < 0 ? 'var(--color-error)' : 'inherit' }}>
                          {fmtS(l.valor)}
                        </td>
                        <td>
                          {l.origem === 'entradaos' && <span className="badge" style={{ background: 'var(--color-primary-hl)', color: 'var(--color-primary)' }}>Entrada OS</span>}
                          {l.origem === 'saldoos' && <span className="badge" style={{ background: 'var(--color-success-hl)', color: 'var(--color-success)' }}>Restante OS</span>}
                          {(!l.origem || l.origem === 'manual') && <span className="badge">Manual</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                            <button className="btn btn-icon btn-ghost btn-sm" title="Imprimir recibo" onClick={() => imprimirRecibo(l)}>
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                            </button>
                            {isCaixa && !bloqueado && (
                              <button className="btn btn-icon btn-ghost btn-sm" title="Editar" onClick={() => setModal({ open: true, edit: l, presetOrder: null })}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            )}
                            {isAdmin && (
                              <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--color-error)' }} title="Excluir" onClick={() => pedirExclusao(l)}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
              Total filtrado: <span style={{ marginLeft: 8, color: totalFiltrado >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{fmtS(totalFiltrado)}</span>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

          {/* Resumo */}
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>Resumo do dia</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {PAGOPTS.map(p => summary[p] !== 0 && (
                <div key={p} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{PAGLABEL[p]}</span>
                  <span className="tabnum" style={{ fontWeight: 600 }}>{fmt(summary[p] || 0)}</span>
                </div>
              ))}
              {totalCartao > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', paddingTop: 'var(--space-1)', borderTop: '1px dashed var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Cart\u00f5es</span>
                  <span className="tabnum" style={{ fontWeight: 600 }}>{fmt(totalCartao)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', paddingTop: 'var(--space-2)', borderTop: '2px solid var(--color-border)', fontWeight: 700 }}>
                <span>Total do dia</span>
                <span className="tabnum" style={{ color: totalDia >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{fmtS(totalDia)}</span>
              </div>
            </div>
          </div>

          {/* Restantes a receber */}
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Restantes a receber</div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{ordensPendentes.length} OS</span>
            </div>
            {ordensPendentes.length === 0
              ? <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>Nenhuma OS com valor restante.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {ordensPendentes.slice(0, 12).map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', gap: 'var(--space-2)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.numero} \u2013 {o.clientenome || o.clientecontato}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                        <span className="tabnum" style={{ fontWeight: 800, color: 'var(--color-warning)' }}>{fmt(saldoOS(o))}</span>
                        {isCaixa && (
                          <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
                            onClick={() => setModal({ open: true, edit: null, presetOrder: o })}>
                            Lancar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {ordensPendentes.length > 12 && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', textAlign: 'center' }}>+{ordensPendentes.length - 12} mais</div>
                  )}
                </div>
              )
            }
          </div>
        </div>
      </div>

      {/* Modal lan\u00e7amento */}
      <ModalLancamento
        open={modal.open}
        onClose={() => setModal({ open: false, edit: null, presetOrder: null })}
        onSaved={load}
        editData={modal.edit}
        currentDate={date}
        ordens={ordens}
        presetOrder={modal.presetOrder}
      />

      {/* Confirm delete */}
      {deleteId && (
        <Portal>
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 400 }}>
              <div className="modal-header">
                <span className="modal-title">Confirmar exclus\u00e3o</span>
              </div>
              <div className="modal-body">
                <p>Excluir lan\u00e7amento <strong>{deleteDesc}</strong>? Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita.</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancelar</button>
                <button className="btn btn-danger" onClick={confirmDelete}>Excluir</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
