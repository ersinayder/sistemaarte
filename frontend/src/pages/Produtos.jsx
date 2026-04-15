import React, { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import ReactDOM from 'react-dom'

const fmt = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')

const CATEGORIAS = ['Moldura','Vidro','Passepartout','Impressão','Material 3D','Insumo Laser','Embalagem','Outros']
const UNIDADES   = ['un','m','m²','kg','g','l','ml','rolo','folha','pacote']

function Modal({ open, onClose, onSaved, editData }) {
  const BLANK = { nome: '', categoria: 'Outros', unidade: 'un', preco: '', estoque: '', estoquemin: '', descricao: '' }
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    setForm(editData ? {
      nome:       editData.nome        || '',
      categoria:  editData.categoria   || 'Outros',
      unidade:    editData.unidade     || 'un',
      preco:      editData.preco       != null ? String(editData.preco)       : '',
      estoque:    editData.estoque     != null ? String(editData.estoque)     : '',
      estoquemin: editData.estoquemin  != null ? String(editData.estoquemin)  : '',
      descricao:  editData.descricao   || '',
    } : BLANK)
  }, [open, editData])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const save = async () => {
    if (!form.nome.trim()) return toast.error('Nome obrigatório')
    setSaving(true)
    try {
      const payload = {
        nome:       form.nome.trim(),
        categoria:  form.categoria,
        unidade:    form.unidade,
        preco:      parseFloat(form.preco)      || 0,
        estoque:    parseFloat(form.estoque)    || 0,
        estoquemin: parseFloat(form.estoquemin) || 0,
        descricao:  form.descricao.trim(),
      }
      if (editData) {
        await api.put(`/produtos/${editData.id}`, payload)
        toast.success('Produto atualizado!')
      } else {
        await api.post('/produtos', payload)
        toast.success('Produto cadastrado!')
      }
      onSaved()
      onClose()
    } catch(e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  if (!open) return null
  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <span className="modal-title">{editData ? 'Editar Produto' : 'Novo Produto'}</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">Nome <span style={{color:'var(--color-error)'}}>*</span></label>
            <input className="form-input" value={form.nome} onChange={e=>set('nome',e.target.value)} autoFocus placeholder="Ex: Moldura Alumínio 2cm"/>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select className="form-input" value={form.categoria} onChange={e=>set('categoria',e.target.value)}>
                {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unidade</label>
              <select className="form-input" value={form.unidade} onChange={e=>set('unidade',e.target.value)}>
                {UNIDADES.map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Preço de Venda (R$)</label>
              <input type="number" className="form-input" value={form.preco} onChange={e=>set('preco',e.target.value)} min="0" step="0.01" placeholder="0,00"/>
            </div>
            <div className="form-group">
              <label className="form-label">Estoque Atual</label>
              <input type="number" className="form-input" value={form.estoque} onChange={e=>set('estoque',e.target.value)} min="0" step="0.01" placeholder="0"/>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Estoque Mínimo</label>
            <input type="number" className="form-input" value={form.estoquemin} onChange={e=>set('estoquemin',e.target.value)} min="0" step="0.01" placeholder="0" />
            <span style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',marginTop:4,display:'block'}}>Alerta quando estoque cair abaixo desse valor</span>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input type="text" className="form-input" value={form.descricao} onChange={e=>set('descricao',e.target.value)} placeholder="Detalhes, referência, fornecedor..."/>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><div className="spinner" style={{width:14,height:14}}/> Salvando...</> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const CATBADGE = {
  'Moldura':'quadro','Vidro':'quadro','Passepartout':'quadro',
  'Impressão':'3d','Material 3D':'3d','Insumo Laser':'laser',
  'Embalagem':'caixas','Outros':'diversos',
}

export default function Produtos() {
  const { isAdmin, isCaixa } = useAuth()
  const [produtos, setProdutos]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [catFiltro, setCatFiltro] = useState('')
  const [modal, setModal]         = useState({ open: false, edit: null })
  const [deleteId, setDeleteId]   = useState(null)
  const [deleteName, setDeleteName] = useState('')

  useEffect(() => { document.title = 'Produtos — Arte & Molduras' }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/produtos')
      setProdutos(r.data)
    } catch { toast.error('Erro ao carregar produtos') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const confirmDelete = async () => {
    try {
      await api.delete(`/produtos/${deleteId}`)
      toast.success('Produto excluído!')
      setDeleteId(null)
      load()
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao excluir') }
  }

  const filtered = produtos.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.nome?.toLowerCase().includes(q) || p.categoria?.toLowerCase().includes(q) || p.descricao?.toLowerCase().includes(q)
    const matchCat = !catFiltro || p.categoria === catFiltro
    return matchSearch && matchCat
  })

  const baixoEstoque = produtos.filter(p => p.estoquemin > 0 && p.estoque <= p.estoquemin).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Produtos</h1>
          {baixoEstoque > 0 && (
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:4, background:'var(--color-warning-hl)', color:'var(--color-warning)', borderRadius:'var(--radius-sm)', padding:'3px 10px', fontSize:'var(--text-xs)', fontWeight:700 }}>
              ⚠ {baixoEstoque} {baixoEstoque===1?'produto':'produtos'} com estoque baixo
            </div>
          )}
        </div>
        {(isAdmin||isCaixa) && (
          <button className="btn btn-primary" onClick={()=>setModal({open:true,edit:null})}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Novo Produto
          </button>
        )}
      </div>

      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', flexWrap:'wrap' }}>
        <input className="form-input" placeholder="Buscar nome, categoria..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:200}}/>
        <select className="form-input" value={catFiltro} onChange={e=>setCatFiltro(e.target.value)} style={{width:'auto'}}>
          <option value="">Todas categorias</option>
          {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
        </select>
        <span style={{alignSelf:'center',fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>{filtered.length} produto{filtered.length!==1?'s':''}</span>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? (
          <div className="loading-center"><div className="spinner"/></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhum produto</h3>
            <p>{search||catFiltro ? 'Nenhum resultado para o filtro.' : 'Cadastre o primeiro produto.'}</p>
            {(isAdmin||isCaixa) && <button className="btn btn-primary" onClick={()=>setModal({open:true,edit:null})}>Novo Produto</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Est. Mín.</th><th>Unidade</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const baixo = p.estoquemin > 0 && p.estoque <= p.estoquemin
                  return (
                    <tr key={p.id} style={baixo ? {background:'color-mix(in oklab, var(--color-warning) 6%, var(--color-surface))'} : {}}>
                      <td>
                        <div style={{fontWeight:600}}>{p.nome}</div>
                        {p.descricao && <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>{p.descricao}</div>}
                      </td>
                      <td><span className={`badge badge-${CATBADGE[p.categoria]||'diversos'}`}>{p.categoria}</span></td>
                      <td className="tabnum" style={{fontWeight:700}}>{fmt(p.preco)}</td>
                      <td className="tabnum" style={{fontWeight:700,color:baixo?'var(--color-warning)':undefined}}>
                        {p.estoque} {baixo && <span style={{fontSize:10}}>⚠</span>}
                      </td>
                      <td className="tabnum" style={{color:'var(--color-text-muted)'}}>{p.estoquemin||'—'}</td>
                      <td style={{color:'var(--color-text-muted)',fontSize:'var(--text-xs)'}}>{p.unidade}</td>
                      <td>
                        <div style={{display:'flex',gap:'var(--space-1)'}}>
                          {(isAdmin||isCaixa) && (
                            <button className="btn btn-icon btn-ghost btn-sm" title="Editar" onClick={()=>setModal({open:true,edit:p})}>
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          )}
                          {isAdmin && (
                            <button className="btn btn-icon btn-ghost btn-sm" title="Excluir" style={{color:'var(--color-error)'}} onClick={()=>{setDeleteId(p.id);setDeleteName(p.nome)}}>
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal.open} onClose={()=>setModal({open:false,edit:null})} onSaved={load} editData={modal.edit}/>

      {deleteId && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setDeleteId(null)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title" style={{color:'var(--color-error)'}}>Excluir produto?</span>
              <button className="btn btn-icon btn-ghost" onClick={()=>setDeleteId(null)}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{padding:'var(--space-4) var(--space-5)',fontSize:'var(--text-sm)',color:'var(--color-text-muted)'}}>
              <strong style={{color:'var(--color-text)'}}>{deleteName}</strong> será excluído permanentemente.
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setDeleteId(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Excluir</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
