import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const maskCPF  = v => v.replace(/\D/g,'')
  .replace(/(\d{3})(\d)/,'$1.$2')
  .replace(/(\d{3})(\d)/,'$1.$2')
  .replace(/(\d{3})(\d{1,2})$/,'$1-$2')
  .slice(0,14);

const maskCNPJ = v => v.replace(/\D/g,'')
  .replace(/(\d{2})(\d)/,'$1.$2')
  .replace(/(\d{3})(\d)/,'$1.$2')
  .replace(/(\d{3})(\d)/,'$1/$2')
  .replace(/(\d{4})(\d{1,2})$/,'$1-$2')
  .slice(0,18);

const validaCPF = cpf => {
  const n = cpf.replace(/\D/g,'');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(n[i]) * (10 - i);
  let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(n[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i);
  r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  return r === parseInt(n[10]);
};

const validaCNPJ = cnpj => {
  const n = cnpj.replace(/\D/g,'');
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;
  const calc = (s) => {
    let sum = 0, pos = s - 7;
    for (let i = s; i >= 1; i--) { sum += parseInt(n[s - i]) * pos--; if (pos < 2) pos = 9; }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11);
  };
  return calc(12) === parseInt(n[12]) && calc(13) === parseInt(n[13]);
};

const STATUS_COLOR = {
  'Recebido':    'var(--color-primary)',
  'Em Produção': 'var(--color-warning)',
  'Pronto':      'var(--color-blue)',
  'Entregue':    'var(--color-success)',
  'Cancelado':   'var(--color-error)',
};

export default function Clientes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const blank = { tipo:'PF', nome:'', cpf:'', cnpj:'', ie:'', contato:'', email:'', cep:'', endereco:'', cidade:'', uf:'', obs:'' };

  const [clientes,      setClientes]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [form,          setForm]          = useState(blank);
  const [editId,        setEditId]        = useState(null);
  const [showForm,      setShowForm]      = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(null);
  const [confirmDel,    setConfirmDel]    = useState(null);
  const [cepLoading,    setCepLoading]    = useState(false);
  const [cnpjLoading,   setCnpjLoading]   = useState(false);
  const [cpfError,      setCpfError]      = useState('');
  const [cnpjError,     setCnpjError]     = useState('');
  const [sortField,     setSortField]     = useState('nome');
  const [sortDir,       setSortDir]       = useState('asc');
  const [detailId,      setDetailId]      = useState(null);
  const [detailData,    setDetailData]    = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/clientes');
      setClientes(data);
    } catch { toast.error('Erro ao carregar clientes'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buscarCNPJ = async (raw) => {
    const n = raw.replace(/\D/g,'');
    if (n.length !== 14) return;
    if (!validaCNPJ(n)) { setCnpjError('CNPJ inválido'); return; }
    setCnpjError('');
    setCnpjLoading(true);
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${n}`);
      if (!r.ok) throw new Error('não encontrado');
      const d = await r.json();
      setForm(f => ({
        ...f,
        nome:     f.nome.trim()     ? f.nome     : (d.razao_social || d.nome_fantasia || f.nome),
        email:    f.email.trim()    ? f.email    : (d.email?.toLowerCase() || f.email),
        contato:  f.contato.trim()  ? f.contato  : (d.ddd_telefone_1 ? d.ddd_telefone_1.replace(/[^\d]/g,'').replace(/(\d{2})(\d+)/,'($1) $2') : f.contato),
        cep:      f.cep.trim()      ? f.cep      : (d.cep?.replace(/\D/g,'').replace(/(\d{5})(\d{3})/,'$1-$2') || f.cep),
        endereco: f.endereco.trim() ? f.endereco : [d.logradouro, d.numero, d.bairro].filter(Boolean).join(', '),
        cidade:   f.cidade.trim()   ? f.cidade   : (d.municipio || f.cidade),
        uf:       f.uf.trim()       ? f.uf       : (d.uf || f.uf),
      }));
      toast.success('Dados do CNPJ carregados');
    } catch {
      setCnpjError('CNPJ não encontrado na Receita Federal');
    } finally {
      setCnpjLoading(false);
    }
  };

  const buscarCep = async (cep) => {
    const c = cep.replace(/\D/g,'');
    if (c.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setForm(f => ({
          ...f,
          endereco: f.endereco.trim() ? f.endereco : (d.logradouro ? `${d.logradouro}${d.bairro ? ', '+d.bairro : ''}` : f.endereco),
          cidade:   f.cidade.trim()   ? f.cidade   : (d.localidade || ''),
          uf:       f.uf.trim()       ? f.uf       : (d.uf || ''),
        }));
      }
    } catch {}
    finally { setCepLoading(false); }
  };

  const handleCPF = (v) => {
    const masked = maskCPF(v);
    set('cpf', masked);
    const digits = masked.replace(/\D/g,'');
    if (digits.length === 11) {
      setCpfError(validaCPF(digits) ? '' : 'CPF inválido');
    } else {
      setCpfError('');
    }
  };

  const openEdit = (c) => {
    setEditId(c.id);
    const tipo = c.cnpj ? 'PJ' : 'PF';
    setForm({
      tipo,
      nome:     c.name    || '',
      cpf:      c.cpf     || '',
      cnpj:     c.cnpj    || '',
      ie:       c.ie      || '',
      contato:  c.phone   || '',
      email:    c.email   || '',
      cep:      c.cep     || '',
      endereco: c.address || '',
      cidade:   c.cidade  || '',
      uf:       c.uf      || '',
      obs:      c.notes   || ''
    });
    setCpfError(''); setCnpjError('');
    setShowForm(true);
  };

  const openNew   = () => { setEditId(null); setForm(blank); setCpfError(''); setCnpjError(''); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(blank); setCpfError(''); setCnpjError(''); };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (form.tipo === 'PF' && form.cpf && !validaCPF(form.cpf)) { toast.error('CPF inválido'); return; }
    if (form.tipo === 'PJ' && form.cnpj && !validaCNPJ(form.cnpj)) { toast.error('CNPJ inválido'); return; }
    setSaving(true);
    try {
      const payload = {
        name:    form.nome,
        phone:   form.contato,
        email:   form.email,
        cpf:     form.tipo === 'PF' ? form.cpf  : '',
        cnpj:    form.tipo === 'PJ' ? form.cnpj : '',
        ie:      form.ie,
        address: form.endereco,
        cidade:  form.cidade,
        uf:      form.uf,
        cep:     form.cep,
        notes:   form.obs
      };
      if (editId) {
        await api.put(`/clientes/${editId}`, payload);
        toast.success('Cliente atualizado');
      } else {
        await api.post('/clientes', payload);
        toast.success('Cliente cadastrado');
      }
      closeForm();
      load();
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await api.delete(`/clientes/${id}`);
      toast.success('Cliente removido');
      setConfirmDel(null);
      if (detailId === id) setDetailId(null);
      load();
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Erro ao remover');
    } finally { setDeleting(null); }
  };

  // ── loadDetail: consome o endpoint enriquecido + ordens separado
  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const [cliRes, ordRes] = await Promise.all([
        api.get(`/clientes/${id}`),
        api.get(`/clientes/${id}/ordens`),
      ]);
      setDetailData({ cliente: cliRes.data, sumario: cliRes.data._sumario, ordens: ordRes.data });
    } catch { toast.error('Erro ao carregar detalhes'); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => {
    if (detailId) loadDetail(detailId);
    else setDetailData(null);
  }, [detailId, loadDetail]);

  const fmt  = v  => v != null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—';
  const fmtD = d  => {
    if (!d) return '—';
    const s = d.includes('T') ? d : d + 'T00:00:00';
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR');
  };

  const sorted = [...clientes]
    .filter(c => {
      const q = search.toLowerCase();
      return !q || (c.name||'').toLowerCase().includes(q)
        || (c.phone||'').includes(q)
        || (c.email||'').toLowerCase().includes(q)
        || (c.cpf||'').includes(q)
        || (c.cnpj||'').includes(q);
    })
    .sort((a,b) => {
      let va = a[sortField === 'nome' ? 'name' : sortField] || '';
      let vb = b[sortField === 'nome' ? 'name' : sortField] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  const toggleSort = (f) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };

  const SortIcon = ({ f }) => sortField !== f
    ? <span style={{color:'var(--color-text-faint)',marginLeft:4}}>⇅</span>
    : <span style={{marginLeft:4}}>{sortDir==='asc'?'↑':'↓'}</span>;

  const tabStyle = (active) => ({
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-muted)',
    transition: 'background var(--ease), color var(--ease)',
  });

  // ── Painel lateral enriquecido ──────────────────────────
  const DetailPanel = () => {
    const s = detailData?.sumario;
    const c = detailData?.cliente;
    const ordens = detailData?.ordens || [];

    const KpiBox = ({ label, value, color, sub }) => (
      <div style={{ background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:'var(--space-3)', textAlign:'center' }}>
        <div style={{ fontSize:'var(--text-sm)', fontWeight:800, color: color || 'var(--color-text)', fontVariantNumeric:'tabular-nums', lineHeight:1.1 }}>{value}</div>
        {sub && <div style={{ fontSize:9, color:'var(--color-text-faint)', marginTop:2 }}>{sub}</div>}
        <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginTop:'var(--space-1)' }}>{label}</div>
      </div>
    );

    return (
      <div style={{ overflowY:'auto', flex:1, padding:'var(--space-3) var(--space-4)' }}>

        {/* Identidade */}
        <div style={{ marginBottom:'var(--space-4)' }}>
          <div style={{ fontWeight:800, fontSize:'var(--text-base)', marginBottom:'var(--space-1)' }}>{c.name}</div>
          {c.email   && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>✉ {c.email}</div>}
          {c.phone   && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>📞 {c.phone}</div>}
          {c.cnpj    && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>CNPJ: {c.cnpj}</div>}
          {c.cpf     && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>CPF: {c.cpf}</div>}
          {c.ie      && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>IE: {c.ie}</div>}
          {c.address && (
            <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>
              📍 {c.address}{c.cidade ? `, ${c.cidade}` : ''}{c.uf ? `/${c.uf}` : ''}{c.cep ? ` — ${c.cep}` : ''}
            </div>
          )}
          {c.notes && (
            <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginTop:'var(--space-2)', padding:'var(--space-2)', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)' }}>💬 {c.notes}</div>
          )}
        </div>

        {/* KPIs — grid 2x2 */}
        {s && (
          <>
            <div style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'var(--space-2)' }}>Resumo financeiro</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-2)', marginBottom:'var(--space-4)' }}>
              <KpiBox label="Total de OS" value={s.totalOrdens} color="var(--color-primary)" />
              <KpiBox label="Total gasto" value={fmt(s.totalGasto)} color="var(--color-success)" />
              <KpiBox label="Ticket médio" value={fmt(s.ticketMedio)} color="var(--color-text)" />
              <KpiBox
                label="Em aberto"
                value={s.osEmAberto}
                color={s.osEmAberto > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)'}
                sub={s.osVencidas > 0 ? `${s.osVencidas} vencida${s.osVencidas > 1 ? 's' : ''}` : null}
              />
            </div>

            {/* Última OS */}
            {s.ultimaOs && (
              <div style={{ marginBottom:'var(--space-4)' }}>
                <div style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'var(--space-2)' }}>Última OS</div>
                <div
                  style={{ background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:'var(--space-2) var(--space-3)', cursor:'pointer', border:'1px solid var(--color-border)' }}
                  onClick={() => navigate(`/ordens/${s.ultimaOs.id}`)}
                >
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-primary)' }}>{s.ultimaOs.numero}</span>
                    <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>{fmtD(s.ultimaOs.createdat)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
                    <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{s.ultimaOs.servico}</span>
                    <span style={{ fontSize:'var(--text-xs)', fontFamily:'monospace', fontWeight:700 }}>{fmt(s.ultimaOs.valortotal || s.ultimaOs.valor)}</span>
                  </div>
                  <div style={{ marginTop:4 }}>
                    <span
                      style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:'var(--radius-full)',
                        background: `color-mix(in oklch, ${STATUS_COLOR[s.ultimaOs.status] || 'var(--color-primary)'} 15%, var(--color-surface))`,
                        color: STATUS_COLOR[s.ultimaOs.status] || 'var(--color-primary)' }}
                    >{s.ultimaOs.status}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Status breakdown */}
            {Object.keys(s.statusBreakdown).length > 0 && (
              <div style={{ marginBottom:'var(--space-4)' }}>
                <div style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'var(--space-2)' }}>Por status</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-1)' }}>
                  {Object.entries(s.statusBreakdown).map(([st, qty]) => (
                    <div key={st} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:'var(--text-xs)', display:'flex', alignItems:'center', gap:'var(--space-1)' }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background: STATUS_COLOR[st] || 'var(--color-text-faint)', display:'inline-block', flexShrink:0 }} />
                        {st}
                      </span>
                      <span style={{ fontSize:'var(--text-xs)', fontWeight:700, color:'var(--color-text-muted)', fontVariantNumeric:'tabular-nums' }}>{qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Histórico de OS */}
        {ordens.length > 0 && (
          <div>
            <div style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'var(--space-2)' }}>Histórico de OS</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
              {ordens.map(o => (
                <div
                  key={o.id}
                  style={{ background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:'var(--space-2) var(--space-3)', cursor:'pointer', border:'1px solid var(--color-border)' }}
                  onClick={() => navigate(`/ordens/${o.id}`)}
                >
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-primary)' }}>{o.numero}</span>
                    <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>{fmtD(o.createdat || o.criadoem)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:2 }}>
                    <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{o.servico}</span>
                    <span style={{ fontSize:'var(--text-xs)', fontFamily:'monospace', fontWeight:600 }}>{fmt(o.valortotal||o.valor)}</span>
                  </div>
                  <div style={{ marginTop:4 }}>
                    <span
                      style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:'var(--radius-full)',
                        background: `color-mix(in oklch, ${STATUS_COLOR[o.status] || 'var(--color-primary)'} 15%, var(--color-surface))`,
                        color: STATUS_COLOR[o.status] || 'var(--color-primary)' }}
                    >{o.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ height:'calc(100vh - 60px - var(--space-12))', display:'flex', flexDirection:'column', minHeight:0 }}>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:'var(--text-xl)', fontWeight:800, margin:0 }}>Clientes</h1>
          <p style={{ margin:0, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{clientes.length} cadastrado{clientes.length!==1?'s':''}</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Novo Cliente
          </button>
        )}
      </div>

      <div style={{ marginBottom:'var(--space-3)', flexShrink:0 }}>
        <div style={{ position:'relative' }}>
          <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-faint)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref={searchRef}
            className="form-input"
            style={{ paddingLeft:36 }}
            placeholder="Buscar por nome, telefone, email, CPF ou CNPJ…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ flex:1, overflow:'hidden', display:'flex', gap:'var(--space-4)', minHeight:0 }}>

        <div className="card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minWidth:0 }}>
          {loading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-2)' }}>
              <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Carregando…
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-3)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontWeight:600, margin:0 }}>{search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</p>
                {!search && canEdit && <p style={{ fontSize:'var(--text-xs)', margin:'var(--space-1) 0 0' }}>Clique em "Novo Cliente" para começar</p>}
              </div>
            </div>
          ) : (
            <div style={{ overflowY:'auto', flex:1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => toggleSort('nome')}>Nome <SortIcon f="nome"/></th>
                    <th>Contato</th>
                    <th>CPF / CNPJ</th>
                    <th>Cidade / UF</th>
                    <th>OS</th>
                    <th>Total gasto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(c => (
                    <tr
                      key={c.id}
                      style={{ cursor:'pointer', background: detailId===c.id ? 'var(--color-primary-highlight)' : '' }}
                      onClick={() => setDetailId(prev => prev===c.id ? null : c.id)}
                    >
                      <td>
                        <div style={{ fontWeight:600 }}>{c.name}</div>
                        {c.email && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{c.email}</div>}
                      </td>
                      <td style={{ fontSize:'var(--text-xs)' }}>{c.phone||'—'}</td>
                      <td style={{ fontSize:'var(--text-xs)' }}>
                        {c.cnpj && <div><span style={{color:'var(--color-text-faint)'}}>CNPJ </span>{c.cnpj}</div>}
                        {c.cpf  && <div><span style={{color:'var(--color-text-faint)'}}>CPF </span>{c.cpf}</div>}
                        {c.ie   && <div><span style={{color:'var(--color-text-faint)'}}>IE </span>{c.ie}</div>}
                        {!c.cpf && !c.cnpj && !c.ie && '—'}
                      </td>
                      <td style={{fontSize:'var(--text-xs)'}}>{c.cidade ? <span>{c.cidade}{c.uf ? ` / ${c.uf}` : ''}</span> : '—'}</td>
                      <td style={{ textAlign:'center' }}><span className="badge badge-primary">{c.totalordens ?? 0}</span></td>
                      <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-xs)' }}>{fmt(c.gastototal)}</td>
                      <td>
                        <div style={{ display:'flex', gap:'var(--space-1)', justifyContent:'flex-end' }} onClick={e => e.stopPropagation()}>
                          {canEdit && (
                            <>
                              <button className="btn btn-ghost btn-xs" title="Editar" onClick={() => openEdit(c)}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button className="btn btn-ghost btn-xs" style={{ color:'var(--color-error)' }} title="Excluir" onClick={() => setConfirmDel(c)}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
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
        </div>

        {/* Detail Panel */}
        {detailId && (
          <div className="card" style={{ width:340, overflow:'hidden', display:'flex', flexDirection:'column', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, padding:'var(--space-3) var(--space-4) var(--space-2)' }}>
              <span style={{ fontWeight:700, fontSize:'var(--text-sm)' }}>Detalhes do Cliente</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setDetailId(null)}>✕</button>
            </div>
            {detailLoading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-2)' }}>
                <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Carregando…
              </div>
            ) : detailData ? (
              <DetailPanel />
            ) : null}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" style={{ maxWidth:560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editId ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={closeForm}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display:'flex', background:'var(--color-surface-offset)', borderRadius:'var(--radius-lg)', padding:3, gap:2 }}>
                <button style={tabStyle(form.tipo==='PF')} onClick={() => { set('tipo','PF'); setCnpjError(''); }}>👤 Pessoa Física</button>
                <button style={tabStyle(form.tipo==='PJ')} onClick={() => { set('tipo','PJ'); setCpfError(''); }}>🏢 Pessoa Jurídica</button>
              </div>
              <div className="form-grid">
                {form.tipo === 'PF' && (
                  <div className="form-group">
                    <label className="form-label">CPF</label>
                    <input className="form-input" style={cpfError ? {borderColor:'var(--color-error)'} : {}} value={form.cpf} onChange={e => handleCPF(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
                    {cpfError && <span className="form-error">{cpfError}</span>}
                  </div>
                )}
                {form.tipo === 'PJ' && (
                  <div className="form-group">
                    <label className="form-label" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span>CNPJ</span>
                      {cnpjLoading && <span style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',fontWeight:400}}>🔍 buscando…</span>}
                    </label>
                    <input className="form-input" style={cnpjError ? {borderColor:'var(--color-error)'} : {}} value={form.cnpj}
                      onChange={e => { const v = maskCNPJ(e.target.value); set('cnpj', v); setCnpjError(''); if (v.replace(/\D/g,'').length === 14) buscarCNPJ(v); }}
                      placeholder="00.000.000/0000-00" inputMode="numeric" />
                    {cnpjError && <span className="form-error">{cnpjError}</span>}
                  </div>
                )}
                {form.tipo === 'PJ' && (
                  <div className="form-group">
                    <label className="form-label">Inscrição Estadual</label>
                    <input className="form-input" value={form.ie} onChange={e => set('ie', e.target.value)} placeholder="IE" />
                  </div>
                )}
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Nome / Razão Social <span style={{color:"var(--color-error)"}}>*</span></label>
                  <input className="form-input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder={form.tipo==='PJ' ? 'Razão social ou nome fantasia' : 'Nome completo'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone / WhatsApp</label>
                  <input className="form-input" value={form.contato} onChange={e => set('contato', e.target.value)} placeholder="(31) 99999-9999" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span>CEP</span>
                    {cepLoading && <span style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',fontWeight:400}}>buscando…</span>}
                  </label>
                  <input className="form-input" value={form.cep} onChange={e => { set('cep', e.target.value); buscarCep(e.target.value); }} placeholder="00000-000" inputMode="numeric" />
                </div>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Endereço</label>
                  <input className="form-input" value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro" />
                </div>
                <div className="form-group">
                  <label className="form-label">Cidade</label>
                  <input className="form-input" value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
                </div>
                <div className="form-group">
                  <label className="form-label">UF</label>
                  <select className="form-input" value={form.uf} onChange={e => set('uf', e.target.value)}>
                    <option value="" />
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Observações</label>
                  <textarea className="form-input" rows={3} value={form.obs} onChange={e => set('obs', e.target.value)} placeholder="Anotações sobre o cliente…" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeForm}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmDel && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Excluir Cliente</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Tem certeza que deseja excluir <strong>{confirmDel.name}</strong>?</p>
              <p style={{ marginTop:'var(--space-2)', fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
                ⚠️ As ordens de serviço vinculadas a este cliente <strong>não serão excluídas</strong>, apenas a referência ao cliente será removida.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn" style={{ background:'var(--color-error)', color:'white' }}
                onClick={() => handleDelete(confirmDel.id)} disabled={deleting === confirmDel.id}>
                {deleting === confirmDel.id ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
