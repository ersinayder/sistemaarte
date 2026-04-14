import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

// ── Modal Lançamento ──────────────────────────────────────────────────────────
function ModalLancamento({ open, onClose, onSaved, editData, currentDate, ordens, presetOrder }) {
  const ordemInicial = presetOrder ? String(presetOrder.id) : '';
  const [form, setForm] = useState({ modo:'saldoos', tipo:'Diversos', descricao:'', pagamento:'Pix', valor:'', pago:true, ordemid:ordemInicial });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    if(!open) return;
    if(editData){
      setForm({ modo: editData.ordemid?'saldoos':'avulso', tipo: editData.tipo||'Diversos',
        descricao: editData.descricao||'', pagamento: editData.pagamento||'Pix',
        valor: String(editData.valor??''), pago: !!editData.pago,
        ordemid: editData.ordemid ? String(editData.ordemid) : '' });
    } else {
      setForm({ modo: presetOrder?'saldoos':'saldoos', tipo: presetOrder?.tipo||presetOrder?.servico||'Diversos',
        descricao: presetOrder ? `Saldo ${presetOrder.numero} – ${presetOrder.clientenome||presetOrder.clientecontato}` : '',
        pagamento: presetOrder?.pagamento||'Pix', valor:'', pago:true, ordemid: ordemInicial });
    }
  },[open, editData, presetOrder, ordemInicial]);

  const ordemSelecionada = useMemo(()=> ordens.find(o=>String(o.id)===String(form.ordemid)), [ordens,form.ordemid]);
  const saldoSelecionado = ordemSelecionada ? saldoOS(ordemSelecionada) : 0;
  const isEntradaAutomatica = editData?.origem === 'entradaos';
  const ordensComSaldo = ordens.filter(o=>saldoOS(o)>0.009 && o.status!=='Cancelado');

  const trocarModo = modo => {
    if(editData) return;
    if(modo==='saldoos'){
      const o = ordens.find(x=>String(x.id)===String(form.ordemid)) || presetOrder;
      setForm(f=>({...f, modo, ordemid: o?String(o.id):'', tipo: o?.tipo||o?.servico||'Diversos',
        descricao: o?`Saldo ${o.numero} – ${o.clientenome||o.clientecontato}`:'', pagamento: o?.pagamento||'Pix', pago:true }));
    } else {
      setForm(f=>({...f, modo, ordemid:'', tipo:'Diversos', descricao:'', pagamento:'Pix', pago:true }));
    }
  };

  const save = async () => {
    if(isEntradaAutomatica){ toast.error('A entrada automática da OS deve ser alterada pela própria OS.'); return; }
    const valor = Number(form.valor);
    if(!form.descricao.trim() || !Number.isFinite(valor)){ toast.error('Preencha descrição e valor'); return; }
    if(form.modo==='saldoos'){
      if(!form.ordemid){ toast.error('Selecione a OS'); return; }
      if(!(valor>0)){ toast.error('Saldo deve ser maior que zero'); return; }
      if(ordemSelecionada && valor > saldoSelecionado+0.0001){ toast.error(`Saldo disponível: ${fmt(saldoSelecionado)}`); return; }
    }
    setSaving(true);
    try{
      const payload = { data:currentDate, tipo: form.modo==='saldoos'?(ordemSelecionada?.tipo||ordemSelecionada?.servico||form.tipo):form.tipo,
        descricao: form.descricao.trim(), pagamento: form.pagamento, valor, pago:true,
        ordemid: form.modo==='saldoos' ? Number(form.ordemid) : null };
      if(editData) await api.put(`/caixa/${editData.id}`, payload), toast.success('Lançamento atualizado!');
      else await api.post('/caixa', payload), toast.success(form.modo==='saldoos'?'Saldo recebido!':'Lançamento registrado!');
      onSaved(); onClose();
    }catch(e){ toast.error(e.response?.data?.error||'Erro ao salvar'); }
    finally{ setSaving(false); }
  };

  if(!open) return null;

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:720}}>
        <div className="modal-header">
          <span className="modal-title">{editData?'Editar Lançamento':'Novo Lançamento'}</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:'var(--space-5)',paddingTop:'var(--space-3)',paddingBottom:'var(--space-4)'}}>
          {!editData&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'var(--space-2)'}}>
              <button className={`btn ${form.modo==='saldoos'?'btn-primary':'btn-ghost'}`} onClick={()=>trocarModo('saldoos')}>Receber saldo OS</button>
              <button className={`btn ${form.modo==='avulso'?'btn-primary':'btn-ghost'}`} onClick={()=>trocarModo('avulso')}>Despesa / Outro</button>
            </div>
          )}
          {isEntradaAutomatica&&(
            <div style={{padding:'var(--space-3)',borderRadius:'var(--radius-md)',background:'var(--color-primary-highlight)',color:'var(--color-primary)',fontSize:'var(--text-xs)',fontWeight:700}}>
              Este lançamento foi criado automaticamente pela OS e deve ser alterado pelo cadastro da ordem.
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:'var(--space-4)'}}>
            {form.modo==='saldoos' ? (
              <>
                <div className="form-group">
                  <label className="form-label">OS com saldo pendente</label>
                  <select className="form-input" value={form.ordemid} disabled={isEntradaAutomatica} onChange={e=>{
                    const o=ordens.find(x=>String(x.id)===e.target.value);
                    setForm(f=>({...f, ordemid:e.target.value,
                      tipo: o?.tipo||o?.servico||'Diversos',
                      descricao: o?`Saldo ${o.numero} – ${o.clientenome||o.clientecontato}`:'',
                      pagamento: o?.pagamento||'Pix' }));
                  }}>
                    <option value="">Selecione a OS...</option>
                    {ordensComSaldo.map(o=><option key={o.id} value={o.id}>{o.numero} – {o.clientenome||o.clientecontato} – saldo {fmt(saldoOS(o))}</option>)}
                  </select>
                  {ordemSelecionada&&(
                    <div style={{marginTop:6,fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>
                      Total {fmt(ordemSelecionada.valor||ordemSelecionada.valortotal)} · Já recebido {fmt(ordemSelecionada.valorrecebido||0)} · Saldo <span style={{color:'var(--color-warning)',fontWeight:700}}>{fmt(saldoSelecionado)}</span>
                    </div>
                  )}
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Forma de pagamento</label>
                    <select className="form-input" value={form.pagamento} disabled={isEntradaAutomatica} onChange={e=>set('pagamento',e.target.value)}>
                      {PAGOPTS.map(p=><option key={p} value={p}>{PAGLABEL[p]||p}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor recebido (R$)</label>
                    <input className="form-input" type="number" step="0.01" value={form.valor} disabled={isEntradaAutomatica} onChange={e=>set('valor',e.target.value)}/>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input className="form-input" value={form.descricao} disabled={isEntradaAutomatica} onChange={e=>set('descricao',e.target.value)} placeholder="Ex: Saldo OS-0042 – Cliente"/>
                </div>
              </>
            ) : (
              <>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-input" value={form.tipo} onChange={e=>set('tipo',e.target.value)}>
                      {TIPOOPTS.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Forma de pagamento</label>
                    <select className="form-input" value={form.pagamento} onChange={e=>set('pagamento',e.target.value)}>
                      {PAGOPTS.map(p=><option key={p} value={p}>{PAGLABEL[p]||p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input className="form-input" value={form.descricao} onChange={e=>set('descricao',e.target.value)} placeholder="Ex: Compra de material, ajuste, outro"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Valor (use negativo para despesa)</label>
                  <input className="form-input" type="number" step="0.01" value={form.valor} onChange={e=>set('valor',e.target.value)}/>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving||isEntradaAutomatica}>
            {saving?<><div className="spinner" style={{width:14,height:14}}/>Salvando...</>:'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página Caixa ──────────────────────────────────────────────────────────────
export default function Caixa() {
  const { isAdmin, isCaixa } = useAuth();
  const [date, setDate] = useState(today);
  const [lancamentos, setLancamentos] = useState([]);
  const [ordens, setOrdens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open:false, edit:null, presetOrder:null });
  const [deleteId, setDeleteId] = useState(null);
  const [deleteDesc, setDeleteDesc] = useState('');

  const load = useCallback(async()=>{
    setLoading(true);
    try{
      const [rCaixa, rOrdens] = await Promise.all([
        api.get(`/caixa?data=${date}`),
        api.get('/ordens?status=todos'),
      ]);
      setLancamentos(rCaixa.data);
      setOrdens(rOrdens.data);
    }catch{ toast.error('Erro ao carregar caixa'); }
    finally{ setLoading(false); }
  },[date]);
  useEffect(()=>{ load(); },[load]);

  const pedirExclusao = (l) => { setDeleteId(l.id); setDeleteDesc(l.descricao||`#${l.id}`); };
  const confirmDelete = async () => {
    try{ await api.delete(`/caixa/${deleteId}`); toast.success('Excluído!'); setDeleteId(null); load(); }
    catch(e){ toast.error(e.response?.data?.error||'Erro ao excluir'); }
  };

  const filtered = lancamentos.filter(l=>{
    const q=search.toLowerCase();
    return !q || l.descricao?.toLowerCase().includes(q) || l.tipo?.toLowerCase().includes(q) || (l.ordemnumero||'').toLowerCase().includes(q);
  });

  const totalFiltrado = filtered.reduce((s,l)=>s+Number(l.valor||0),0);
  const summary = PAGOPTS.reduce((acc,p)=>({ ...acc, [p]: lancamentos.filter(l=>l.pagamento===p).reduce((s,l)=>s+Number(l.valor||0),0) }),{});
  const totalDia = lancamentos.reduce((s,l)=>s+Number(l.valor||0),0);
  const totalCartao = (summary.Credito||0)+(summary.Debito||0);
  const ordensPendentes = ordens.filter(o=>saldoOS(o)>0.009 && o.status!=='Cancelado').sort((a,b)=>saldoOS(b)-saldoOS(a));
  const isToday = date===today;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Caixa do Dia</h1>
        {isCaixa&&<button className="btn btn-primary" onClick={()=>setModal({open:true,edit:null,presetOrder:null})}>Novo Lançamento</button>}
      </div>

      {/* Navegação de data */}
      <div style={{display:'flex',alignItems:'center',gap:'var(--space-3)',marginBottom:'var(--space-5)',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:'var(--space-2)'}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setDate(d=>addDays(d,-1))}>‹</button>
          <div style={{padding:'var(--space-2) var(--space-5)',fontWeight:700,background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:'var(--radius-lg)',minWidth:220,textAlign:'center',fontSize:'var(--text-sm)'}}>
            {fmtDate(date)} {isToday&&<span style={{marginLeft:8,fontSize:'var(--text-xs)',color:'var(--color-primary)',fontWeight:600}}>Hoje</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setDate(d=>addDays(d,1))} disabled={isToday}>›</button>
        </div>
        {!isToday&&<button className="btn btn-ghost btn-sm" onClick={()=>setDate(today)}>Ir para hoje</button>}
        <input type="date" className="form-input" value={date} onChange={e=>setDate(e.target.value)} style={{width:'auto',padding:'var(--space-1) var(--space-3)',fontSize:'var(--text-xs)'}}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 290px',gap:'var(--space-4)',alignItems:'start'}}>
        {/* Tabela lançamentos */}
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{display:'flex',gap:'var(--space-3)',padding:'var(--space-4)',borderBottom:'1px solid var(--color-border)',flexWrap:'wrap'}}>
            <input className="form-input" placeholder="Buscar descrição, tipo ou OS..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:220}}/>
            <span style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',alignSelf:'center'}}>{filtered.length} lançamento{filtered.length!==1?'s':''}</span>
          </div>

          {loading ? <div className="loading-center"><div className="spinner"/></div>
          : filtered.length===0 ? (
            <div className="empty-state">
              <h3>Nenhum lançamento</h3>
              <p>{search?'Nenhum resultado para a busca.':'Nenhum registro para este dia.'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Tipo</th><th>Descrição</th><th>OS</th><th>Pagamento</th><th>Valor</th><th>Origem</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(l=>{
                    const ordemNumero = l.ordemnumero||null;
                    const bloqueado = l.origem==='entradaos';
                    return (
                      <tr key={l.id}>
                        <td style={{color:'var(--color-text-faint)',fontSize:'var(--text-xs)'}}>{l.id}</td>
                        <td><span className={`badge badge-${TIPOBADGE[l.tipo]||'diversos'}`}>{l.tipo}</span></td>
                        <td style={{maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.descricao}</td>
                        <td>{ordemNumero&&<span style={{fontSize:'var(--text-xs)',color:'var(--color-primary)',fontWeight:700}}>{ordemNumero}</span>}</td>
                        <td><span className={`badge badge-${PAGBADGE[l.pagamento]||'pix'}`}>{PAGLABEL[l.pagamento]||l.pagamento}</span></td>
                        <td className="tabnum" style={{fontWeight:700,whiteSpace:'nowrap',color:Number(l.valor)<0?'var(--color-error)':'inherit'}}>
                          {fmtS(l.valor)}
                        </td>
                        <td>
                          {l.origem==='entradaos'&&<span className="badge" style={{background:'var(--color-primary-highlight)',color:'var(--color-primary)'}}>Entrada OS</span>}
                          {l.origem==='saldoos'&&<span className="badge" style={{background:'var(--color-success-highlight)',color:'var(--color-success)'}}>Saldo OS</span>}
                          {(!l.origem||l.origem==='manual')&&<span className="badge">Manual</span>}
                        </td>
                        <td>
                          <div style={{display:'flex',gap:'var(--space-1)'}}>
                            <button className="btn btn-icon btn-ghost btn-sm" title="Imprimir recibo" onClick={()=>imprimirRecibo({...l,ordemnumero:ordemNumero})}>
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
                            </button>
                            {isCaixa&&!bloqueado&&(
                              <button className="btn btn-icon btn-ghost btn-sm" title="Editar" onClick={()=>setModal({open:true,edit:l,presetOrder:null})}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            )}
                            {isAdmin&&!bloqueado&&(
                              <button className="btn btn-icon btn-ghost btn-sm" title="Excluir" onClick={()=>pedirExclusao(l)} style={{color:'var(--color-error)'}}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'var(--color-surface-offset)'}}>
                    <td colSpan={5} style={{padding:'var(--space-2) var(--space-3)',fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>Total filtrado</td>
                    <td style={{padding:'var(--space-2) var(--space-3)',fontWeight:800,color:'var(--color-primary)'}} className="tabnum">{fmtS(totalFiltrado)}</td>
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar direita */}
        <div style={{display:'flex',flexDirection:'column',gap:'var(--space-4)',position:'sticky',top:'var(--space-6)'}}>
          {/* Resumo */}
          <div className="card card-pad">
            <div style={{fontWeight:700,fontSize:'var(--text-sm)',marginBottom:'var(--space-4)'}}>Resumo do Dia</div>
            {PAGOPTS.map(p=>(
              <div key={p} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'var(--space-2) 0',borderBottom:'1px solid var(--color-divider)'}}>
                <span className={`badge badge-${PAGBADGE[p]||'pix'}`}>{PAGLABEL[p]||p}</span>
                <span className="tabnum" style={{fontWeight:600,fontSize:'var(--text-sm)'}}>{fmt(summary[p]||0)}</span>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',padding:'var(--space-2) 0',borderBottom:'1px solid var(--color-divider)',fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>
              <span>Total cartão</span><span className="tabnum" style={{fontWeight:600}}>{fmt(totalCartao)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:'var(--space-3)',marginTop:'var(--space-1)'}}>
              <span style={{fontWeight:800}}>TOTAL</span>
              <span className="tabnum" style={{fontWeight:900,fontSize:'var(--text-base)',color:'var(--color-primary)'}}>{fmtS(totalDia)}</span>
            </div>
          </div>

          {/* Saldos pendentes */}
          <div className="card card-pad">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'var(--space-3)'}}>
              <div style={{fontWeight:700,fontSize:'var(--text-sm)'}}>Saldos pendentes</div>
              <span style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>{ordensPendentes.length} OS</span>
            </div>
            {ordensPendentes.length===0
              ? <p style={{fontSize:'var(--text-xs)',color:'var(--color-text-faint)'}}>Nenhuma OS com saldo pendente.</p>
              : <div style={{display:'flex',flexDirection:'column',gap:'var(--space-2)',maxHeight:420,overflowY:'auto'}}>
                  {ordensPendentes.slice(0,12).map(o=>(
                    <button key={o.id} className="btn btn-ghost btn-sm" onClick={()=>setModal({open:true,edit:null,presetOrder:o})} style={{justifyContent:'space-between',textAlign:'left',border:'1px solid var(--color-border)'}}>
                      <span>
                        <div style={{fontWeight:700,color:'var(--color-primary)',fontSize:'var(--text-xs)'}}>{o.numero}</div>
                        <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis'}}>{o.clientenome||o.clientecontato}</div>
                      </span>
                      <span className="tabnum" style={{fontWeight:800,color:'var(--color-warning)'}}>{fmt(saldoOS(o))}</span>
                    </button>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>

      <ModalLancamento open={modal.open} onClose={()=>setModal({open:false,edit:null,presetOrder:null})}
        onSaved={load} editData={modal.edit} currentDate={date} ordens={ordensPendentes} presetOrder={modal.presetOrder}/>

      {/* Modal confirmar exclusão */}
      {deleteId&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setDeleteId(null)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title" style={{color:'var(--color-error)'}}>Excluir Lançamento</span>
            </div>
            <div style={{padding:'var(--space-4) var(--space-5)'}}>
              <p style={{fontSize:'var(--text-sm)',color:'var(--color-text-muted)',marginBottom:'var(--space-3)'}}>
                Tem certeza que deseja excluir o lançamento <strong style={{color:'var(--color-text)'}}>{deleteDesc}</strong>?
              </p>
              <div style={{padding:'var(--space-3)',background:'var(--color-error-highlight)',borderRadius:'var(--radius-md)',fontSize:'var(--text-xs)',color:'var(--color-error)',fontWeight:600}}>
                ⚠️ Lançamentos de Entrada OS não podem ser excluídos por aqui — altere pela OS.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setDeleteId(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
