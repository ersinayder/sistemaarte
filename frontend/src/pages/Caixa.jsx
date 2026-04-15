import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt  = v => `R$ ${Math.abs(Number(v)||0).toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.')}`;
const fmtS = v => `${Number(v)>=0?'+ ':' − '}${fmt(v)}`;
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
  if (!win) return toast.error('Popup bloqueado! Permita popups para este site.');
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
    <div class="row"><span class="label">Nº</span><span>#${lanc.id}</span></div>
    <div class="row"><span class="label">Data</span><span>${new Date().toLocaleString('pt-BR')}</span></div>
    ${lanc.ordemnumero?`<div class="row"><span class="label">OS</span><span style="font-weight:700;color:#01696f">${lanc.ordemnumero}</span></div>`:''}
    <div class="row"><span class="label">Tipo</span><span>${lanc.tipo||'—'}</span></div>
    <div class="row"><span class="label">Pagamento</span><span>${PAGLABEL[lanc.pagamento]||lanc.pagamento}</span></div>
    <div class="row"><span class="label">Descrição</span><span style="max-width:200px;text-align:right">${lanc.descricao}</span></div>
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

// ── Modal Lançamento Unificado ──────────────────────────────────────────────────
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
    if (isEntradaAutomatica) { toast.error('A entrada automática da OS deve ser alterada pela própria OS.'); return; }
    const valor = Number(form.valor);
    if (!form.descricao.trim()) return toast.error('Descrição obrigatória');
    if (!Number.isFinite(valor) || valor === 0) return toast.error('Informe um valor (use negativo para despesas)');
    if (form.ordemid && saldoSelecionado !== null && valor > saldoSelecionado + 0.0001) {
      return toast.error(`Restante disponível: ${fmt(saldoSelecionado)}`);
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
        toast.success('Lançamento atualizado!');
      } else {
        await api.post('/caixa', payload);
        toast.success('Lançamento registrado!');
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
            <span className="modal-title">{editData ? 'Editar Lançamento' : 'Novo Lançamento'}</span>
            <button className="btn btn-icon btn-ghost" onClick={onClose}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

            {isEntradaAutomatica && (
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-primary-hl)', color: 'var(--color-primary)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                Este lançamento foi criado automaticamente pela OS e deve ser alterado pelo cadastro da ordem.
              </div>
            )}

            {/* Descrição */}
            <div className="form-group">
              <label className="form-label">Descrição <span style={{ color: 'var(--color-error)' }}>*</span></label>
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
              <label className="form-label">Valor <span style={{ color: 'var(--color-error)' }}>*</span></label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.valor}
                disabled={isEntradaAutomatica}
                onChange={e => set('valor', e.target.value)}
                placeholder="0,00 (negativo para despesa)"
              />
              {ordemSelecionada && saldoSelecionado !== null && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Total {fmt(ordemSelecionada.valor||ordemSelecionada.valortotal)} · Já recebido {fmt((ordemSelecionada.valor||ordemSelecionada.valortotal||0) - saldoSelecionado)} · Saldo <span style={{color:'var(--color-warning)',fontWeight:700}}>{fmt(saldoSelecionado)}</span>
                </div>
              )}
            </div>

            {/* OS vinculada */}
            {!isEntradaAutomatica && (
              <div className="form-group">
                <label className="form-label">OS Vinculada (opcional)</label>
                <select className="form-input" value={form.ordemid} onChange={e => {
                  set('ordemid', e.target.value);
                  const os = ordens.find(o => String(o.id) === e.target.value);
                  if (os) {
                    set('descricao', descricaoOS(os));
                    set('tipo', os.tipo || os.servico || 'Diversos');
                    set('pagamento', os.pagamento || 'Pix');
                  }
                }}>
                  <option value="">Nenhuma (lançamento avulso)</option>
                  {ordensComSaldo.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.numero} — {o.clientenome} {' · '} Saldo: {fmt(saldoOS(o))}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || isEntradaAutomatica}>
              {saving ? 'Salvando...' : editData ? 'Salvar' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ── Página Caixa ──────────────────────────────────────────────────────────────
export default function Caixa() {
  useEffect(() => { document.title = 'Caixa do Dia — Arte & Molduras' }, []);
  const { user } = useAuth();
  const isCaixa = ['admin','caixa'].includes(user?.role);

  const [date, setDate]       = useState(today);
  const [lancamentos, setLancamentos] = useState([]);
  const [ordens, setOrdens]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [modal, setModal]     = useState({ open: false, edit: null, presetOrder: null });
  const [deleteId, setDeleteId]   = useState(null);
  const [deleteDesc, setDeleteDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, oRes] = await Promise.all([
        api.get(`/caixa?data=${date}`),
        api.get('/ordens'),
      ]);
      setLancamentos(lRes.data || []);
      setOrdens(oRes.data?.ordens || oRes.data || []);
    } catch { toast.error('Erro ao carregar caixa'); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return lancamentos;
    const q = search.toLowerCase();
    return lancamentos.filter(l =>
      (l.descricao||'').toLowerCase().includes(q) ||
      (l.tipo||'').toLowerCase().includes(q) ||
      (l.ordemnumero||'').toLowerCase().includes(q)
    );
  }, [lancamentos, search]);

  const totalEntrada = useMemo(() => lancamentos.filter(l => Number(l.valor) > 0).reduce((s,l) => s + Number(l.valor), 0), [lancamentos]);
  const totalSaida   = useMemo(() => lancamentos.filter(l => Number(l.valor) < 0).reduce((s,l) => s + Number(l.valor), 0), [lancamentos]);
  const totalPix     = useMemo(() => lancamentos.filter(l => l.pagamento === 'Pix'     && Number(l.valor) > 0).reduce((s,l) => s + Number(l.valor), 0), [lancamentos]);
  const totalDinheiro= useMemo(() => lancamentos.filter(l => l.pagamento === 'Dinheiro'&& Number(l.valor) > 0).reduce((s,l) => s + Number(l.valor), 0), [lancamentos]);
  const totalCartao  = useMemo(() => lancamentos.filter(l => ['Credito','Debito','Link'].includes(l.pagamento) && Number(l.valor) > 0).reduce((s,l) => s + Number(l.valor), 0), [lancamentos]);

  const handleDelete = async () => {
    try {
      await api.delete(`/caixa/${deleteId}`);
      toast.success('Excluído!');
      setDeleteId(null);
      load();
    } catch(e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Caixa do Dia</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
            {fmtDate(date)}
          </p>
        </div>
        {isCaixa && (
          <button className="btn btn-primary" onClick={() => setModal({ open: true, edit: null, presetOrder: null })}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
            Novo Lançamento
          </button>
        )}
      </div>

      {/* Navegação de data */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setDate(d => addDays(d,-1))}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <input
          type="date"
          className="form-input"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ width: 'auto', flex: 'none' }}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => setDate(d => addDays(d,1))}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)} style={{ marginLeft: 'var(--space-2)' }}>
          Hoje
        </button>
      </div>

      {/* Tabela lançamentos */}
      <div className="card">
        <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
          <input className="form-input" placeholder="Buscar descrição, tipo ou OS..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220 }}/>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', alignSelf: 'center' }}>
            {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner"/></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x={2} y={5} width={20} height={14} rx={2}/><path d="M2 10h20"/></svg>
            <h3>Nenhum lançamento</h3>
            <p>Nenhum lançamento encontrado para esta data.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Tipo</th><th>Descrição</th><th>OS</th><th>Pagamento</th><th>Valor</th><th>Origem</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id}>
                    <td className="tabnum" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{l.id}</td>
                    <td>
                      <span className={`badge badge-${TIPOBADGE[l.tipo]||'diversos'}`}>{l.tipo||'—'}</span>
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao}</div>
                    </td>
                    <td>
                      {l.ordemnumero && (
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>{l.ordemnumero}</span>
                      )}
                    </td>
                    <td><span className={`badge badge-${PAGBADGE[l.pagamento]||'pix'}`}>{PAGLABEL[l.pagamento]||l.pagamento}</span></td>
                    <td className="tabnum" style={{ fontWeight: 700, color: Number(l.valor) >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {fmtS(l.valor)}
                    </td>
                    <td>
                      {l.origem === 'entradaos' && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-faint)', fontStyle: 'italic' }}>auto OS</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-icon btn-ghost btn-sm" title="Imprimir recibo" onClick={() => imprimirRecibo(l)}>
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
                        </button>
                        {isCaixa && (
                          <>
                            <button className="btn btn-icon btn-ghost btn-sm" title="Editar" onClick={() => setModal({ open: true, edit: l, presetOrder: null })}>
                              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {l.origem !== 'entradaos' && (
                              <button className="btn btn-icon btn-ghost btn-sm" title="Excluir" style={{ color: 'var(--color-error)' }}
                                onClick={() => { setDeleteId(l.id); setDeleteDesc(l.descricao); }}>
                                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totais */}
        {!loading && lancamentos.length > 0 && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Pix</span>
              <span className="tabnum" style={{ fontWeight: 600 }}>{fmt(totalPix)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Dinheiro</span>
              <span className="tabnum" style={{ fontWeight: 600 }}>{fmt(totalDinheiro)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Cartões</span>
              <span className="tabnum" style={{ fontWeight: 600 }}>{fmt(totalCartao)}</span>
            </div>
            <div style={{ width: 1, background: 'var(--color-border)', alignSelf: 'stretch' }}/>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>Saídas</span>
              <span className="tabnum" style={{ fontWeight: 600, color: 'var(--color-error)' }}>{fmt(Math.abs(totalSaida))}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 700 }}>Total Líquido</span>
              <span className="tabnum" style={{ fontWeight: 800, fontSize: 'var(--text-base)', color: 'var(--color-success)' }}>{fmt(totalEntrada + totalSaida)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal lançamento */}
      <ModalLancamento
        open={modal.open}
        onClose={() => setModal({ open: false, edit: null, presetOrder: null })}
        onSaved={load}
        editData={modal.edit}
        currentDate={date}
        ordens={ordens}
        presetOrder={modal.presetOrder}
      />

      {/* Modal confirmar exclusão */}
      {deleteId && (
        <Portal>
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 400 }}>
              <div className="modal-header">
                <span className="modal-title" style={{ color: 'var(--color-error)' }}>Confirmar exclusão</span>
              </div>
              <div className="modal-body">
                <p>Excluir lançamento <strong style={{ color: 'var(--color-text)' }}>{deleteDesc}</strong>? Esta ação não pode ser desfeita.</p>
                {deleteDesc?.includes('entradaos') && (
                  <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-warning)', fontSize: 'var(--text-xs)' }}>
                    ⚠️ Lançamentos de Entrada OS não podem ser excluídos por aqui — altere pela OS.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancelar</button>
                <button className="btn btn-danger" onClick={handleDelete}>Excluir</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
