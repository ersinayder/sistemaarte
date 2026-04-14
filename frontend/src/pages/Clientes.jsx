import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt  = v => `R$ ${Number(v||0).toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.')}`;
const fmtD = iso => iso ? new Date(iso+'T12:00:00').toLocaleDateString('pt-BR') : '—';

function maskDoc(v) {
  const n = v.replace(/\D/g,'').slice(0,14);
  if(n.length<=11){
    let r=n;
    if(n.length>9) r=`${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`;
    else if(n.length>6) r=`${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6)}`;
    else if(n.length>3) r=`${n.slice(0,3)}.${n.slice(3)}`;
    return r;
  }
  let r=n;
  if(n.length>12) r=`${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
  else if(n.length>8) r=`${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8)}`;
  else if(n.length>5) r=`${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5)}`;
  else if(n.length>2) r=`${n.slice(0,2)}.${n.slice(2)}`;
  return r;
}
function maskCep(v){const n=v.replace(/\D/g,'').slice(0,8);return n.length>5?`${n.slice(0,5)}-${n.slice(5)}`:n;}
const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// ── Modal Cliente ─────────────────────────────────────────────────────────────
function ModalCliente({ open, onClose, onSaved, editData }) {
  const blank = { nome:'', cpf:'', ie:'', contato:'', email:'', cep:'', endereco:'', cidade:'', uf:'', obs:'' };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [docInfo, setDocInfo] = useState(null);
  const [cepLoading, setCepLoading] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    if(!open) return;
    setDocInfo(null);
    setForm(editData ? {
      nome: editData.name, cpf: editData.cpf||'', ie: editData.ie||'',
      contato: editData.phone||'', email: editData.email||'',
      cep: editData.cep||'', endereco: editData.address||'',
      cidade: editData.cidade||'', uf: editData.uf||'', obs: editData.notes||''
    } : blank);
  },[open, editData]);

  const onCpfChange = async v => {
    const masked = maskDoc(v); set('cpf', masked);
    const digits = masked.replace(/\D/g,'');
    if(digits.length===14){ setDocLoading(true); setDocInfo(null);
      try{
        const r = await api.get(`/consulta/cnpj/${digits}`); const d=r.data;
        if(d.nome){ setDocInfo({ok:true,nome:d.nome,fantasia:d.fantasia,situacao:d.situacao,fonte:d.fonte});
          setForm(f=>({...f,cpf:masked,
            nome:f.nome.trim()?f.nome:(d.fantasia||d.nome),
            contato:f.contato.trim()?f.contato:(d.telefone||''),
            email:f.email.trim()?f.email:(d.email||''),
            endereco:f.endereco.trim()?f.endereco:[d.logradouro,d.numero,d.complemento].filter(Boolean).join(', '),
            cidade:f.cidade.trim()?f.cidade:(d.municipio||''),
            uf:f.uf.trim()?f.uf:(d.uf||''),
            cep:f.cep.trim()?f.cep:(d.cep?maskCep(d.cep):''),
          })); toast.success('CNPJ encontrado!');
        } else setDocInfo({erro:d.error||'CNPJ não encontrado'});
      }catch(e){ setDocInfo({erro:e.response?.data?.error||'Erro'}); } finally{ setDocLoading(false); }
    } else if(digits.length===11) setDocInfo({aviso:'CPF preenchido. Dados manuais.'});
    else setDocInfo(null);
  };

  const onCepChange = async v => {
    const masked = maskCep(v); set('cep',masked);
    if(masked.replace(/\D/g,'').length===8){ setCepLoading(true);
      try{
        const r=await fetch(`https://brasilapi.com.br/api/cep/v1/${masked.replace(/\D/g,'')}`);
        const d=await r.json();
        if(d.street||d.city) setForm(f=>({...f,cep:masked,
          endereco:f.endereco.trim()?f.endereco:[d.street,d.neighborhood].filter(Boolean).join(', '),
          cidade:f.cidade.trim()?f.cidade:(d.city||''),
          uf:f.uf.trim()?f.uf:(d.state||''),
        }));
        toast.success('CEP encontrado!');
      }catch{} finally{ setCepLoading(false); }
    }
  };

  const save = async () => {
    if(!form.nome.trim()){ toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try{
      const payload={name:form.nome,phone:form.contato,email:form.email,cpf:form.cpf,ie:form.ie,address:form.endereco,cidade:form.cidade,uf:form.uf,cep:form.cep,notes:form.obs};
      if(editData) await api.put(`/clientes/${editData.id}`,payload),toast.success('Cliente atualizado!');
      else await api.post('/clientes',payload),toast.success('Cliente cadastrado!');
      onSaved(); onClose();
    }catch(e){ toast.error(e.response?.data?.error||'Erro ao salvar'); }
    finally{ setSaving(false); }
  };

  if(!open) return null;
  const isJuridica = form.cpf.replace(/\D/g,'').length > 11;

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg" style={{maxWidth:660}}>
        <div className="modal-header">
          <span className="modal-title">{editData?'Editar Cliente':'Novo Cliente'}</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'var(--space-5)',padding:'var(--space-5)'}}>
          {/* Identificação */}
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:700,color:'var(--color-text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'var(--space-3)',display:'flex',alignItems:'center',gap:'var(--space-2)'}}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx={12} cy={7} r={4}/></svg>
              Identificação
            </div>
            <div className="form-grid-2">
              <div className="form-group col-span-2">
                <label className="form-label">Nome / Empresa</label>
                <input className="form-input" placeholder="Nome completo ou razão social" value={form.nome} onChange={e=>set('nome',e.target.value)} autoFocus/>
              </div>
              <div className="form-group">
                <label className="form-label" style={{display:'flex',alignItems:'center',gap:'var(--space-2)'}}>
                  CPF / CNPJ {docLoading&&<div className="spinner" style={{width:10,height:10}}/>}
                </label>
                <input className="form-input" placeholder="000.000.000-00 ou 00.000.000/0001-00" value={form.cpf} maxLength={18} onChange={e=>onCpfChange(e.target.value)}/>
              </div>
              {isJuridica && (
                <div className="form-group">
                  <label className="form-label">Inscrição Estadual</label>
                  <input className="form-input" value={form.ie} onChange={e=>set('ie',e.target.value)}/>
                </div>
              )}
            </div>
            {docInfo && (
              <div style={{marginTop:'var(--space-2)',padding:'var(--space-3)',borderRadius:'var(--radius-md)',fontSize:'var(--text-xs)',lineHeight:1.6,background:docInfo.erro?'var(--color-error-highlight)':docInfo.aviso?'var(--color-warning-highlight)':'var(--color-primary-highlight)',color:docInfo.erro?'var(--color-error)':docInfo.aviso?'var(--color-warning)':'var(--color-primary)',border:'1px solid currentColor',opacity:0.9}}>
                {docInfo.erro&&<span>{docInfo.erro}</span>}
                {docInfo.aviso&&<span>{docInfo.aviso}</span>}
                {docInfo.ok&&<div><strong>{docInfo.nome}</strong>{docInfo.fantasia&&docInfo.fantasia!==docInfo.nome&&<span> · Fantasia <strong>{docInfo.fantasia}</strong></span>}{docInfo.situacao&&<span> · Situação <strong>{docInfo.situacao}</strong></span>}</div>}
              </div>
            )}
          </div>

          {/* Contato */}
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:700,color:'var(--color-text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'var(--space-3)'}}>Contato</div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">WhatsApp / Telefone</label>
                <input className="form-input" placeholder="(31) 9 0000-0000" value={form.contato} onChange={e=>set('contato',e.target.value)}/>
              </div>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input className="form-input" type="email" value={form.email} onChange={e=>set('email',e.target.value)}/>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:700,color:'var(--color-text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'var(--space-3)',display:'flex',alignItems:'center',gap:'var(--space-2)'}}>
              Endereço {cepLoading&&<div className="spinner" style={{width:10,height:10}}/>}
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">CEP</label>
                <input className="form-input" placeholder="00000-000" value={form.cep} maxLength={9} onChange={e=>onCepChange(e.target.value)}/>
              </div>
              <div className="form-group col-span-2">
                <label className="form-label">Logradouro</label>
                <input className="form-input" placeholder="Rua, número, complemento" value={form.endereco} onChange={e=>set('endereco',e.target.value)}/>
              </div>
              <div className="form-group">
                <label className="form-label">Cidade</label>
                <input className="form-input" placeholder="Ipatinga" value={form.cidade} onChange={e=>set('cidade',e.target.value)}/>
              </div>
              <div className="form-group">
                <label className="form-label">UF</label>
                <select className="form-input" value={form.uf} onChange={e=>set('uf',e.target.value)}>
                  <option value=""/>
                  {UFS.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Obs */}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-input" rows={2} value={form.obs} onChange={e=>set('obs',e.target.value)} style={{resize:'vertical'}} placeholder="Preferências, referências, informações extras..."/>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving?<><div className="spinner" style={{width:14,height:14}}/>Salvando...</>:'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Clientes() {
  const { isCaixa, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [drawerOS, setDrawerOS] = useState([]);
  const [drawerLoad, setDrawerLoad] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open:false, edit:null });
  const [deleteId, setDeleteId] = useState(null);   // ← NOVO: confirmar exclusão
  const [deleteName, setDeleteName] = useState('');

  const load = useCallback(async()=>{
    setLoading(true);
    try{ const r=await api.get('/clientes'); setClientes(r.data); }
    catch{ toast.error('Erro ao carregar clientes'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const abrirDrawer = async c => {
    setDrawer(c); setDrawerOS([]); setDrawerLoad(true);
    try{ const r=await api.get(`/clientes/${c.id}/ordens`); setDrawerOS(r.data); }
    catch{ toast.error('Erro ao carregar histórico'); }
    finally{ setDrawerLoad(false); }
  };

  // ── NOVO: excluir cliente ─────────────────────────────────────────────────
  const pedirExclusao = (e, c) => {
    e.stopPropagation();
    setDeleteId(c.id);
    setDeleteName(c.name);
  };

  const confirmarExclusao = async () => {
    try{
      await api.delete(`/clientes/${deleteId}`);
      toast.success('Cliente excluído');
      setDeleteId(null);
      if(drawer?.id === deleteId) setDrawer(null);
      load();
    }catch(e){ toast.error(e.response?.data?.error||'Erro ao excluir'); }
  };

  const filtered = clientes.filter(c=>{
    if(!search) return true;
    const q=search.toLowerCase();
    return [c.name,c.phone,c.email,c.cpf,c.cidade,c.ie].join(' ').toLowerCase().includes(q);
  });

  const STATUSBADGE={Recebido:'recebido','Em Produção':'emproducao',Pronto:'pronto',Entregue:'entregue',Cancelado:'cancelado'};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',marginTop:2}}>
            {clientes.length} cadastrado{clientes.length!==1?'s':''}
          </p>
        </div>
        {(isCaixa||isAdmin)&&(
          <button className="btn btn-primary" onClick={()=>setModal({open:true,edit:null})}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
            Novo Cliente
          </button>
        )}
      </div>

      {/* Busca */}
      <div style={{display:'flex',alignItems:'center',gap:'var(--space-2)',marginBottom:'var(--space-4)',background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:'var(--radius-lg)',padding:'var(--space-2) var(--space-3)',maxWidth:480}}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth={2}><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
        <input style={{background:'none',border:'none',outline:'none',fontSize:'var(--text-sm)',width:'100%',color:'var(--color-text)'}} placeholder="Buscar por nome, CPF, CNPJ, cidade..." value={search} onChange={e=>setSearch(e.target.value)}/>
        {search&&<button className="btn btn-icon btn-ghost" style={{width:20,height:20,padding:0}} onClick={()=>setSearch('')}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>}
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div style={{padding:'var(--space-3) var(--space-4)',borderBottom:'1px solid var(--color-border)'}}>
          <span style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>{filtered.length} resultado{filtered.length!==1?'s':''}</span>
        </div>

        {loading ? <div className="loading-center"><div className="spinner"/></div> : filtered.length===0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx={12} cy={7} r={4}/></svg>
            <h3>Nenhum cliente encontrado</h3>
            <p>{search?'Tente outros termos.':'Cadastre o primeiro cliente.'}</p>
            {!search&&(isCaixa||isAdmin)&&<button className="btn btn-primary" style={{marginTop:'var(--space-4)'}} onClick={()=>setModal({open:true,edit:null})}>Cadastrar Cliente</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th><th>CPF / CNPJ</th><th>IE</th><th>Contato</th>
                  <th>Cidade / UF</th><th>OS</th><th>Total gasto</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c=>{
                  const isCNPJ=c.cpf&&c.cpf.replace(/\D/g,'').length>11;
                  return (
                    <tr key={c.id} onClick={()=>abrirDrawer(c)} style={{cursor:'pointer'}}>
                      <td style={{fontWeight:600}}>{c.name}</td>
                      <td>
                        {c.cpf&&<div>
                          <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-faint)',fontWeight:500}}>{isCNPJ?'CNPJ':'CPF'}</div>
                          <div style={{fontFamily:'monospace',fontSize:'var(--text-xs)'}}>{c.cpf}</div>
                        </div>}
                      </td>
                      <td style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>{c.ie||'—'}</td>
                      <td>
                        {c.phone?<a href={`https://wa.me/55${c.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{color:'var(--color-primary)',fontWeight:600,fontSize:'var(--text-xs)',display:'flex',alignItems:'center',gap:4}}>
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.896 2C6.394 2 2 6.394 2 11.896c0 1.89.497 3.659 1.363 5.193L2 22l5.086-1.334A9.845 9.845 0 0011.896 22c5.502 0 9.896-4.394 9.896-9.896C21.792 6.394 17.398 2 11.896 2z"/></svg>
                          {c.phone}
                        </a>:<span style={{color:'var(--color-text-faint)'}}>—</span>}
                      </td>
                      <td style={{fontSize:'var(--text-xs)'}}>{c.cidade?<span>{c.cidade}{c.uf?` / ${c.uf}`:''}</span>:'—'}</td>
                      <td><span style={{fontWeight:700,color:'var(--color-primary)'}}>{c.totalordens||0}</span></td>
                      <td className="tabnum" style={{fontWeight:600}}>{fmt(c.gastototal||0)}</td>
                      <td>
                        <div style={{display:'flex',gap:'var(--space-1)'}}>
                          {(isCaixa||isAdmin)&&(
                            <button className="btn btn-icon btn-ghost btn-sm" title="Editar" onClick={e=>{e.stopPropagation();setModal({open:true,edit:c});}}>
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          )}
                          {/* ── NOVO: botão excluir ── */}
                          {isAdmin&&(
                            <button className="btn btn-icon btn-ghost btn-sm" title="Excluir cliente" onClick={e=>pedirExclusao(e,c)} style={{color:'var(--color-error)'}}>
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
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
      </div>

      <ModalCliente open={modal.open} onClose={()=>setModal({open:false,edit:null})} onSaved={load} editData={modal.edit}/>

      {/* ── NOVO: Modal confirmar exclusão ── */}
      {deleteId&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setDeleteId(null)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title" style={{color:'var(--color-error)'}}>Excluir Cliente</span>
            </div>
            <div style={{padding:'var(--space-4) var(--space-5)'}}>
              <p style={{fontSize:'var(--text-sm)',color:'var(--color-text-muted)',marginBottom:'var(--space-3)'}}>
                Tem certeza que deseja excluir <strong style={{color:'var(--color-text)'}}>{deleteName}</strong>?
              </p>
              <div style={{padding:'var(--space-3)',background:'var(--color-error-highlight)',borderRadius:'var(--radius-md)',fontSize:'var(--text-xs)',color:'var(--color-error)',fontWeight:600}}>
                ⚠️ As ordens de serviço vinculadas a este cliente <strong>não serão excluídas</strong>, apenas a referência ao cliente será removida.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setDeleteId(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmarExclusao}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer histórico do cliente */}
      {drawer&&(
        <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',justifyContent:'flex-end',background:'oklch(0 0 0 / 0.35)',backdropFilter:'blur(2px)'}} onClick={e=>e.target===e.currentTarget&&setDrawer(null)}>
          <div style={{width:'min(480px,100vw)',height:'100%',overflowY:'auto',background:'var(--color-surface)',boxShadow:'var(--shadow-lg)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'var(--space-5) var(--space-6)',borderBottom:'1px solid var(--color-border)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontWeight:700,fontSize:'var(--text-lg)'}}>{drawer.name}</div>
                <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',marginTop:2}}>
                  {drawer.cpf&&<span style={{marginRight:8}}>{drawer.cpf}</span>}
                  {drawer.phone&&<span>{drawer.phone}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setDrawer(null)} style={{fontSize:20,lineHeight:1}}>×</button>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'var(--space-3)',padding:'var(--space-4) var(--space-6)'}}>
              {[['Total de OS',drawer.totalordens||0,'var(--color-primary)'],['Total gasto',`R$ ${Number(drawer.gastototal||0).toFixed(2).replace('.',',')}` ,'var(--color-success)']].map(([l,v,c])=>(
                <div key={l} style={{background:'var(--color-surface-offset)',borderRadius:'var(--radius-md)',padding:'var(--space-3)'}}>
                  <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>{l}</div>
                  <div style={{fontWeight:700,fontSize:'var(--text-lg)',color:c}}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{padding:'0 var(--space-6) var(--space-6)',flex:1}}>
              <div style={{fontWeight:600,fontSize:'var(--text-xs)',marginBottom:'var(--space-3)',color:'var(--color-text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Histórico de Ordens</div>
              {drawerLoad&&[1,2,3].map(i=><div key={i} className="skeleton" style={{height:64,borderRadius:'var(--radius-md)',marginBottom:'var(--space-2)'}}/>)}
              {!drawerLoad&&drawerOS.length===0&&<div style={{textAlign:'center',padding:'var(--space-8)',color:'var(--color-text-faint)',fontSize:'var(--text-sm)'}}>Nenhuma OS vinculada</div>}
              {!drawerLoad&&drawerOS.map(o=>{
                const bmap={Recebido:'info','Em Produção':'warning',Pronto:'success',Entregue:'success',Cancelado:'error'};
                return (
                  <div key={o.id} onClick={()=>navigate(`/ordens/${o.id}`)} style={{cursor:'pointer',padding:'var(--space-3)',borderRadius:'var(--radius-md)',border:'1px solid var(--color-border)',marginBottom:'var(--space-2)',background:'var(--color-surface-2)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                      <span style={{fontWeight:700,color:'var(--color-primary)',fontSize:'var(--text-sm)'}}>{o.numero}</span>
                      <span className={`badge badge-${bmap[o.status]||'info'}`}>{o.status}</span>
                    </div>
                    <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>{o.servico}{o.descricao?` · ${o.descricao}`:''}</div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontSize:'var(--text-xs)'}}>
                      <span style={{color:'var(--color-text-faint)'}}>{o.createdat?new Date(o.createdat).toLocaleDateString('pt-BR'):''}</span>
                      <span style={{fontWeight:600}}>R$ {Number(o.valortotal||0).toFixed(2).replace('.',',')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
