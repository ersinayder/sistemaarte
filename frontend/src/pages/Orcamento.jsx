import React, { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'

/* ── helpers ─────────────────────────────────────────────── */
const fmt = v =>
  'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const fmtN = (v, d = 2) => Number(v || 0).toFixed(d).replace('.', ',')
const uid = (() => { let n = 0; return () => ++n })()

/* ── Highlights via color-mix ─────────────────────────────── */
const HL = {
  orange: 'color-mix(in oklab, var(--color-orange) 12%, var(--color-surface-offset))',
  blue:   'color-mix(in oklab, var(--color-blue)   12%, var(--color-surface-offset))',
  purple: 'color-mix(in oklab, var(--color-purple)  12%, var(--color-surface-offset))',
}

/* ── sub-components ──────────────────────────────────────── */
function CalcRow({ label, value, total }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid var(--color-divider)',
      fontSize: 'var(--text-xs)',
    }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontWeight: total ? 700 : 600,
        color: 'var(--color-text)',
        fontSize: total ? 'var(--text-sm)' : 'var(--text-xs)',
      }}>{value}</span>
    </div>
  )
}

function ModuleHeader({ emoji, title, desc }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      marginBottom: 'var(--space-5)', paddingBottom: 'var(--space-4)',
      borderBottom: '1px solid var(--color-divider)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-dynamic)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>{emoji}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>{title}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{desc}</div>
      </div>
    </div>
  )
}

function PrecoInput({ label, id, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{
        display: 'flex', alignItems: 'stretch',
        background: 'var(--color-surface-offset)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', overflow: 'hidden',
      }}>
        <span style={{
          padding: '0 var(--space-3)', fontSize: 'var(--text-xs)',
          color: 'var(--color-text-faint)', borderRight: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center',
          background: 'var(--color-surface-dynamic)',
          whiteSpace: 'nowrap',
        }}>R$</span>
        <input
          type="number" id={id} value={value} min="0" step="0.01"
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--text-sm)', color: 'var(--color-text)', width: '100%',
          }}
        />
      </div>
    </div>
  )
}

function AddButton({ onClick, label = 'Adicionar \u00e0 OS' }) {
  return (
    <button onClick={onClick} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      {label}
    </button>
  )
}

/* ── Module 1: Quadros ───────────────────────────────────── */
function ModuloQuadros({ onAdd, precos, setPrecos }) {
  const [desc, setDesc]           = useState('')
  const [L, setL]                 = useState('')
  const [A, setA]                 = useState('')
  const [qtd, setQtd]             = useState(1)
  const [extraNome, setExtraNome] = useState('')
  const [extraVal, setExtraVal]   = useState('')
  const [extras, setExtras]       = useState([])

  const l = parseFloat(L) || 0
  const a = parseFloat(A) || 0
  const q = Math.max(1, parseInt(qtd) || 1)
  const hasData = l > 0 && a > 0

  const perimetro   = ((l + a) * 2) / 100
  const area        = (l / 100) * (a / 100)
  const cMoldura    = perimetro * precos.moldura
  const cVidro      = area * precos.vidro
  const extrasTotal = extras.reduce((s, e) => s + e.val, 0)
  const subtotal    = (cMoldura + cVidro + extrasTotal) * q

  const addExtra = () => {
    if (!extraNome.trim() || !parseFloat(extraVal)) return
    setExtras(prev => [...prev, { id: uid(), nome: extraNome.trim(), val: parseFloat(extraVal) }])
    setExtraNome('')
    setExtraVal('')
  }
  const removeExtra = id => setExtras(prev => prev.filter(e => e.id !== id))

  const handleAdd = () => {
    if (!hasData) return
    onAdd({
      type: 'quadros', emoji: '\uD83D\uDDBC',
      name: desc || `Quadro ${l}\u00d7${a}cm`,
      sub: `${l}\u00d7${a} cm \u00b7 \u00d7${q}`,
      price: subtotal,
    })
  }

  return (
    <div className="card card-pad">
      <ModuleHeader emoji="\uD83D\uDDBC" title="Quadros \u2014 Molduras & Vidros" desc="C\u00e1lculo por per\u00edmetro (m) e \u00e1rea (m\u00b2)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <PrecoInput label="Pre\u00e7o Moldura / m"      id="q_pm" value={precos.moldura} onChange={v => setPrecos(p => ({ ...p, moldura: v }))} />
        <PrecoInput label="Pre\u00e7o Fundo/Vidro / m\u00b2" id="q_pv" value={precos.vidro}   onChange={v => setPrecos(p => ({ ...p, vidro: v }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="form-group">
          <label className="form-label">Largura \u2014 L (cm)</label>
          <input type="number" className="form-input" placeholder="60" min="0" step="0.1"
            value={L} onChange={e => setL(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Altura \u2014 A (cm)</label>
          <input type="number" className="form-input" placeholder="80" min="0" step="0.1"
            value={A} onChange={e => setA(e.target.value)} />
        </div>
        <div className="form-group" style={{ maxWidth: 90 }}>
          <label className="form-label">Qtd</label>
          <input type="number" className="form-input" min="1" step="1"
            value={qtd} onChange={e => setQtd(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
        <label className="form-label">Descri\u00e7\u00e3o</label>
        <input type="text" className="form-input" placeholder="Ex: Quadro sala 60\u00d780"
          value={desc} onChange={e => setDesc(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '2 1 120px' }}>
          <label className="form-label">Extra (nome)</label>
          <input type="text" className="form-input" placeholder="Ex: Pendurador"
            value={extraNome} onChange={e => setExtraNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExtra()} />
        </div>
        <div className="form-group" style={{ flex: '1 1 80px' }}>
          <label className="form-label">Valor R$</label>
          <input type="number" className="form-input" placeholder="0,00" min="0" step="0.01"
            value={extraVal} onChange={e => setExtraVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExtra()} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={addExtra} style={{ marginBottom: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add
        </button>
      </div>
      {extras.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {extras.map(e => (
            <span key={e.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--color-surface-dynamic)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-full)', padding: '2px 10px', fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}>
              {e.nome} <strong style={{ color: 'var(--color-text)' }}>+{fmt(e.val)}</strong>
              <span onClick={() => removeExtra(e.id)}
                style={{ cursor: 'pointer', color: 'var(--color-text-faint)', marginLeft: 2, lineHeight: 1 }}
                role="button" aria-label="Remover extra">\u00d7</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <CalcRow label="Per\u00edmetro (m)"     value={hasData ? fmtN(perimetro, 3) + ' m'  : '\u2014'} />
        <CalcRow label="Custo Moldura"     value={hasData ? fmt(cMoldura)           : '\u2014'} />
        <CalcRow label="\u00c1rea (m\u00b2)"         value={hasData ? fmtN(area, 4) + ' m\u00b2'   : '\u2014'} />
        <CalcRow label="Custo Fundo/Vidro" value={hasData ? fmt(cVidro)             : '\u2014'} />
        <CalcRow label="Extras"            value={fmt(extrasTotal)} />
        <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
        <CalcRow label={`Subtotal \u00d7 ${q}`} value={hasData ? fmt(subtotal) : '\u2014'} total />
      </div>
      <AddButton onClick={handleAdd} />
    </div>
  )
}

/* ── Module 2: Nomes ─────────────────────────────────────── */
function ModuloNomes({ onAdd, precos, setPrecos }) {
  const [desc, setDesc] = useState('')
  const [C, setC]       = useState('')
  const [qtd, setQtd]   = useState(1)

  const c = parseFloat(C) || 0
  const q = Math.max(1, parseInt(qtd) || 1)
  const hasData = c > 0

  const compM    = c / 100
  const custo    = compM * precos.nomes
  const subtotal = custo * q

  const handleAdd = () => {
    if (!hasData) return
    onAdd({
      type: 'nomes', emoji: '\u2702\uFE0F',
      name: desc || `Nome ${c}cm`,
      sub: `${c} cm \u00b7 \u00d7${q}`,
      price: subtotal,
    })
  }

  return (
    <div className="card card-pad">
      <ModuleHeader emoji="\u2702\uFE0F" title="Nomes \u2014 Corte Linear" desc="C\u00e1lculo por comprimento total (m)" />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <PrecoInput label="Pre\u00e7o Material / m" id="n_pm" value={precos.nomes} onChange={v => setPrecos(p => ({ ...p, nomes: v }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="form-group">
          <label className="form-label">Comprimento total \u2014 C (cm)</label>
          <input type="number" className="form-input" placeholder="85" min="0" step="0.1"
            value={C} onChange={e => setC(e.target.value)} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 4, display: 'block' }}>Soma linear das letras</span>
        </div>
        <div className="form-group">
          <label className="form-label">Qtd</label>
          <input type="number" className="form-input" min="1" step="1"
            value={qtd} onChange={e => setQtd(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
        <label className="form-label">Descri\u00e7\u00e3o / Nome</label>
        <input type="text" className="form-input" placeholder="Ex: FAM\u00cdLIA SILVA"
          value={desc} onChange={e => setDesc(e.target.value)} />
      </div>
      <div style={{ background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <CalcRow label="Comprimento (m)"   value={hasData ? fmtN(compM, 3) + ' m' : '\u2014'} />
        <CalcRow label="Custo linear"      value={hasData ? fmt(custo)          : '\u2014'} />
        <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
        <CalcRow label={`Subtotal \u00d7 ${q}`} value={hasData ? fmt(subtotal) : '\u2014'} total />
      </div>
      <AddButton onClick={handleAdd} />
    </div>
  )
}

/* ── Module 3: 3D ────────────────────────────────────────── */
function Modulo3D({ onAdd, precos, setPrecos }) {
  const [desc, setDesc] = useState('')
  const [L, setL]       = useState('')
  const [A, setA]       = useState('')
  const [qtd, setQtd]   = useState(1)

  const l = parseFloat(L) || 0
  const a = parseFloat(A) || 0
  const q = Math.max(1, parseInt(qtd) || 1)
  const hasData = l > 0 || a > 0

  const ref       = Math.max(l, a)
  const refWinner = ref === l && l > 0 ? 'Largura (L)' : 'Altura (A)'
  const refM      = ref / 100
  const custo     = refM * precos.trid
  const subtotal  = custo * q

  const handleAdd = () => {
    if (!hasData) return
    onAdd({
      type: '3d', emoji: '\uD83D\uDDA8',
      name: desc || `Pe\u00e7a 3D ${l}\u00d7${a}cm`,
      sub: `Ref=${ref}cm (${refWinner}) \u00b7 \u00d7${q}`,
      price: subtotal,
    })
  }

  return (
    <div className="card card-pad">
      <ModuleHeader emoji="\uD83D\uDDA8" title="Pe\u00e7as 3D \u2014 Maior Dimens\u00e3o" desc="Custo pelo maior eixo: Ref = max(L, A)" />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <PrecoInput label="Pre\u00e7o 3D / m" id="t_pm" value={precos.trid} onChange={v => setPrecos(p => ({ ...p, trid: v }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="form-group">
          <label className="form-label">Largura \u2014 L (cm)</label>
          <input type="number" className="form-input" placeholder="40" min="0" step="0.1"
            value={L} onChange={e => setL(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Altura \u2014 A (cm)</label>
          <input type="number" className="form-input" placeholder="60" min="0" step="0.1"
            value={A} onChange={e => setA(e.target.value)} />
        </div>
        <div className="form-group" style={{ maxWidth: 90 }}>
          <label className="form-label">Qtd</label>
          <input type="number" className="form-input" min="1" step="1"
            value={qtd} onChange={e => setQtd(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
        <label className="form-label">Descri\u00e7\u00e3o da Pe\u00e7a</label>
        <input type="text" className="form-input" placeholder="Ex: Totem decorativo"
          value={desc} onChange={e => setDesc(e.target.value)} />
      </div>
      {hasData && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: HL.orange,
          color: 'var(--color-orange)',
          borderRadius: 'var(--radius-sm)', padding: '4px 12px',
          fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: 'var(--space-3)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/>
          </svg>
          Ref = {fmtN(ref, 1)} cm \u2014 {refWinner} \u00e9 o maior lado
        </div>
      )}
      <div style={{ background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <CalcRow label="Refer\u00eancia (maior lado)" value={hasData ? fmtN(ref, 1) + ' cm'  : '\u2014'} />
        <CalcRow label="Ref (m)"                 value={hasData ? fmtN(refM, 3) + ' m'  : '\u2014'} />
        <CalcRow label="Custo 3D"                value={hasData ? fmt(custo)             : '\u2014'} />
        <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
        <CalcRow label={`Subtotal \u00d7 ${q}`}       value={hasData ? fmt(subtotal) : '\u2014'} total />
      </div>
      <AddButton onClick={handleAdd} />
    </div>
  )
}

/* ── Confirm Dialog ──────────────────────────────────────── */
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'oklch(from var(--color-bg) l c h / 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-4)',
    }}>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        padding: 'var(--space-6)',
        maxWidth: 360, width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 'var(--space-3)' }}>\uD83D\uDDD1\uFE0F</div>
        <div style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>Limpar OS?</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', background: 'var(--color-error)' }} onClick={onConfirm}>Limpar</button>
        </div>
      </div>
    </div>
  )
}

/* ── Modal Converter em OS ───────────────────────────────── */
const TIPO_OPTS = ['Corte a Laser', 'Quadro', 'Caixas', '3D', 'Diversos']
const PAG_OPTS  = ['Pix', 'Dinheiro', 'Credito', 'Debito', 'Link']
const PAG_LABEL = { Credito: 'Cr\u00e9dito', Debito: 'D\u00e9bito', Link: 'Link Pag.', Pix: 'Pix', Dinheiro: 'Dinheiro' }
const PRIO_OPTS = ['Normal', 'Alta', 'Urgente']

function ModalConverterOS({ open, onClose, osItems, total, pagamento, observacoes, servico }) {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState([])
  const [buscaCliente, setBuscaCliente] = useState('')

  const [form, setForm] = useState({
    clientenome: '', clientetelefone: '', clientecpf: '', clienteid: null,
    servico: servico || TIPO_OPTS[0],
    valortotal: total ? total.toFixed(2) : '',
    valorentrada: '',
    prazoentrega: '',
    prioridade: 'Normal',
    pagamento: pagamento || 'Pix',
    observacoes: observacoes || '',
    status: 'Recebido',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  React.useEffect(() => {
    if (!open) return
    setForm({
      clientenome: '', clientetelefone: '', clientecpf: '', clienteid: null,
      servico: servico || TIPO_OPTS[0],
      valortotal: total ? total.toFixed(2) : '',
      valorentrada: '',
      prazoentrega: '',
      prioridade: 'Normal',
      pagamento: pagamento || 'Pix',
      observacoes: observacoes || '',
      status: 'Recebido',
    })
    setBuscaCliente('')
    setClientes([])
  }, [open, total, pagamento, observacoes, servico])

  React.useEffect(() => {
    if (buscaCliente.length < 2) { setClientes([]); return }
    api.get(`/clientes?q=${encodeURIComponent(buscaCliente)}`).then(r => setClientes(r.data || [])).catch(() => {})
  }, [buscaCliente])

  const selecionarCliente = c => {
    set('clienteid', c.id)
    set('clientenome', c.name)
    set('clientetelefone', c.phone || '')
    set('clientecpf', c.cpf || '')
    setBuscaCliente(c.name)
    setClientes([])
  }

  const ensureCliente = async (nome, telefone, cpf) => {
    if (!nome.trim()) return null
    try {
      const r = await api.get(`/clientes?q=${encodeURIComponent(nome.trim())}`)
      const exact = (r.data || []).find(c => c.name?.toLowerCase() === nome.trim().toLowerCase())
      if (exact) return exact.id
    } catch {}
    try {
      const r = await api.post('/clientes', { name: nome.trim(), phone: telefone || null, cpf: cpf || null })
      toast(`\u2728 Cliente "${nome.trim()}" cadastrado automaticamente`)
      return r.data?.id || null
    } catch { return null }
  }

  const descricaoItens = osItems.map(i => `${i.emoji} ${i.name} (${i.sub})`).join('; ')

  const salvar = async () => {
    if (!form.clientenome.trim()) return toast.error('Nome do cliente obrigat\u00f3rio')
    const totalN   = Number(form.valortotal)
    const entradaN = form.valorentrada === '' ? 0 : Number(form.valorentrada)
    if (isNaN(totalN) || totalN <= 0)  return toast.error('Valor total deve ser maior que zero')
    if (isNaN(entradaN) || entradaN < 0) return toast.error('Entrada n\u00e3o pode ser negativa')
    if (entradaN > totalN)              return toast.error('Entrada n\u00e3o pode ser maior que o total')

    setSaving(true)
    try {
      let clienteid = form.clienteid
      if (!clienteid) clienteid = await ensureCliente(form.clientenome, form.clientetelefone, form.clientecpf)

      const payload = {
        clienteid:       clienteid || null,
        clientenome:     form.clientenome.trim(),
        clientetelefone: form.clientetelefone || null,
        clientecpf:      form.clientecpf || null,
        servico:         form.servico,
        descricao:       descricaoItens || null,
        valortotal:      totalN,
        valorentrada:    entradaN,
        prazoentrega:    form.prazoentrega || null,
        prioridade:      form.prioridade,
        pagamento:       form.pagamento,
        observacoes:     form.observacoes || null,
        status:          form.status,
      }

      await api.post('/ordens', payload)
      toast.success('OS criada com sucesso!')
      onClose()
      navigate('/ordens')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao criar OS')
    } finally { setSaving(false) }
  }

  const totalN    = Number(form.valortotal) || 0
  const entradaN  = Number(form.valorentrada) || 0
  const restante  = Math.max(0, totalN - entradaN)

  if (!open) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <span className="modal-title">Converter Or\u00e7amento em OS</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Resumo dos itens do or\u00e7amento */}
          <div style={{
            background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Itens do Or\u00e7amento ({osItems.length})
            </div>
            {osItems.map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '2px 0', color: 'var(--color-text-muted)' }}>
                <span>{i.emoji} {i.name} <span style={{ color: 'var(--color-text-faint)' }}>\u00b7 {i.sub}</span></span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-text)' }}>{fmt(i.price)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>Total do Or\u00e7amento</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--color-primary)', fontSize: 'var(--text-sm)' }}>{fmt(total)}</span>
            </div>
          </div>

          {/* Cliente */}
          <div style={{ position: 'relative' }}>
            <div className="form-group">
              <label className="form-label">
                Cliente <span style={{ color: 'var(--color-error)' }}>*</span>
                <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                  \u2014 se n\u00e3o cadastrado, ser\u00e1 registrado automaticamente
                </span>
              </label>
              <input className="form-input"
                placeholder="Nome do cliente"
                value={buscaCliente || form.clientenome}
                onChange={e => { setBuscaCliente(e.target.value); set('clientenome', e.target.value); set('clienteid', null) }}
              />
            </div>
            {clientes.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', maxHeight: 200, overflowY: 'auto' }}>
                {clientes.map(c => (
                  <div key={c.id} onClick={() => selecionarCliente(c)}
                    style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <strong>{c.name}</strong>
                    {c.cpf && <span style={{ color: 'var(--color-text-muted)', marginLeft: 8, fontSize: 'var(--text-xs)' }}>{c.cpf}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Telefone / WhatsApp</label>
              <input className="form-input" value={form.clientetelefone} onChange={e => set('clientetelefone', e.target.value)} placeholder="31 9 0000-0000"/>
            </div>
            <div className="form-group">
              <label className="form-label">CPF / CNPJ</label>
              <input className="form-input" value={form.clientecpf} onChange={e => set('clientecpf', e.target.value)}/>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de Servi\u00e7o</label>
              <select className="form-input" value={form.servico} onChange={e => set('servico', e.target.value)}>
                {TIPO_OPTS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Forma de Pagamento</label>
              <select className="form-input" value={form.pagamento} onChange={e => set('pagamento', e.target.value)}>
                {PAG_OPTS.map(p => <option key={p} value={p}>{PAG_LABEL[p] || p}</option>)}
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">
                Valor Total (R$) <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <input className="form-input" type="number" step="0.01" min="0"
                value={form.valortotal}
                onChange={e => set('valortotal', e.target.value)}
                style={{ fontFamily: 'monospace', fontWeight: 700 }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Entrada (R$)
                <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>opcional</span>
              </label>
              <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00 (sem entrada)"
                value={form.valorentrada} onChange={e => set('valorentrada', e.target.value)}/>
            </div>
          </div>

          {totalN > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: 'var(--space-3) var(--space-4)',
              background: restante > 0 ? 'var(--color-warning-hl, var(--color-warning-highlight))' : 'var(--color-success-highlight)',
              borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
            }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Restante a receber ap\u00f3s entrada:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: restante > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                {restante > 0 ? fmt(restante) : '\u2713 Quitado na entrada'}
              </span>
            </div>
          )}

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Prazo de Entrega</label>
              <input className="form-input" type="date" value={form.prazoentrega} onChange={e => set('prazoentrega', e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-input" value={form.prioridade} onChange={e => set('prioridade', e.target.value)}>
                {PRIO_OPTS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observa\u00e7\u00f5es Internas</label>
            <textarea className="form-input" rows={2} style={{ resize: 'vertical' }}
              value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
              placeholder="Vis\u00edvel apenas internamente..."/>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>
            {saving
              ? <><div className="spinner" style={{ width: 14, height: 14 }}/>Criando OS...</>
              : <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                  Criar OS
                </>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── OS Cart Sidebar ─────────────────────────────────────── */
function OSCart({ items, onRemove, onClear, onPrint, onConverterOS }) {
  const totals = { quadros: 0, nomes: 0, '3d': 0 }
  items.forEach(i => { totals[i.type] = (totals[i.type] || 0) + i.price })
  const final = Object.values(totals).reduce((s, v) => s + v, 0)

  const dotColor = { quadros: 'var(--color-orange)', nomes: 'var(--color-blue)', '3d': 'var(--color-purple)' }
  const tagBg    = { quadros: HL.orange, nomes: HL.blue, '3d': HL.purple }
  const tagColor = { quadros: 'var(--color-orange)', nomes: 'var(--color-blue)', '3d': 'var(--color-purple)' }
  const tagLabel = { quadros: '\uD83D\uDDBC Quadros', nomes: '\u2702\uFE0F Nomes', '3d': '\uD83D\uDDA8 3D' }

  return (
    <div className="card" style={{
      position: 'sticky', top: 'var(--space-6)',
      display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100dvh - 80px)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-4) var(--space-5)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 700 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          Ordem de Servi\u00e7o
        </div>
        <span style={{
          background: 'var(--color-surface-dynamic)', color: 'var(--color-text-muted)',
          fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)',
          fontWeight: 600,
        }}>
          {items.length} {items.length === 1 ? 'item' : 'itens'}
        </span>
      </div>

      {/* Lista de itens */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)' }}>
        {items.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', padding: 'var(--space-10) var(--space-4)',
            color: 'var(--color-text-muted)',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-faint)' }}>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
            </svg>
            <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>OS vazia</div>
            <div style={{ fontSize: 'var(--text-xs)' }}>Adicione itens dos m\u00f3dulos ao lado</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {items.map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                padding: 'var(--space-3)',
                background: 'var(--color-surface-offset)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-divider)',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: dotColor[item.type] }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.emoji} {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{item.sub}</div>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                  {fmt(item.price)}
                </span>
                <button
                  onClick={() => onRemove(item.id)}
                  aria-label="Remover item"
                  style={{
                    color: 'var(--color-text-faint)', width: 20, height: 20, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'none', border: 'none',
                    transition: 'color var(--transition-interactive)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-faint)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-totais por tipo */}
      {items.length > 0 && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          borderTop: '1px solid var(--color-divider)',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0,
        }}>
          {Object.entries(totals).filter(([, v]) => v > 0).map(([type, val]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
              <span style={{ background: tagBg[type], color: tagColor[type], borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontWeight: 700, fontSize: 11 }}>
                {tagLabel[type]}
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(val)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Total final + a\u00e7\u00f5es */}
      <div style={{ padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Valor Final da OS
        </div>
        <div style={{
          fontFamily: 'monospace', fontWeight: 800,
          fontSize: 'var(--text-xl)', color: 'var(--color-primary)',
          letterSpacing: '-0.02em', marginBottom: 'var(--space-4)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {fmt(final)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {/* Imprimir Or\u00e7amento */}
          <button className="btn btn-ghost" style={{ justifyContent: 'center' }} onClick={onPrint}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Imprimir Or\u00e7amento
          </button>
          {/* Converter em OS */}
          <button
            className="btn btn-primary"
            style={{ justifyContent: 'center' }}
            onClick={onConverterOS}
            disabled={items.length === 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
            Converter em OS
          </button>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }} onClick={onClear}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
            Limpar OS
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Print helper ────────────────────────────────────────── */
function buildPrintHtml(osItems, fmtFn) {
  const totals = { quadros: 0, nomes: 0, '3d': 0 }
  osItems.forEach(i => { totals[i.type] = (totals[i.type] || 0) + i.price })
  const final = Object.values(totals).reduce((s, v) => s + v, 0)
  const now   = new Date().toLocaleString('pt-BR')
  const rows  = osItems.map(i =>
    `<tr><td>${i.emoji} ${i.name}</td><td>${i.sub}</td><td class="val">${fmtFn(i.price)}</td></tr>`
  ).join('')
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Or\u00e7amento OS</title>
<style>
  body { font-family: Arial, sans-serif; padding: 32px; color: #111; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f0f0f0; padding: 8px 12px; text-align: left; font-size: 13px; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
  .val { text-align: right; font-family: monospace; font-weight: 700; }
  .total { font-size: 22px; font-weight: 800; text-align: right; margin-top: 16px; color: #01696f; }
  .meta { color: #999; font-size: 11px; margin-top: 32px; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>Or\u00e7amento \u2014 Ordem de Servi\u00e7o</h1>
  <div class="sub">Emitido em ${now}</div>
  <table>
    <thead><tr><th>Item</th><th>Detalhes</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">Total: ${fmtFn(final)}</div>
  <div class="meta">Arte & Molduras \u2014 Sistema de Or\u00e7amento</div>
  <script>window.onload = () => { window.print() }<\/script>
</body></html>`
}

/* ── Main Page ───────────────────────────────────────────── */
export default function Orcamento() {
  const [osItems, setOsItems]           = useState([])
  const [confirmClear, setConfirmClear] = useState(false)
  const [modalOS, setModalOS]           = useState(false)

  const [precos, setPrecos] = useState({ moldura: 45, vidro: 120, nomes: 35, trid: 80 })

  const addItem = useCallback(item => {
    setOsItems(prev => [...prev, { ...item, id: uid() }])
  }, [])

  const removeItem = id => setOsItems(prev => prev.filter(i => i.id !== id))

  const clearOS = () => setConfirmClear(true)
  const confirmClearOS = () => { setOsItems([]); setConfirmClear(false) }

  const printOS = () => {
    if (osItems.length === 0) return
    const html = buildPrintHtml(osItems, fmt)
    try {
      const w = window.open('', '_blank', 'width=750,height=900')
      if (w) { w.document.write(html); w.document.close() }
      else throw new Error('popup bloqueado')
    } catch {
      const blob = new Blob([html], { type: 'text/html' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `orcamento-os-${Date.now()}.html`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }

  const totalItens = osItems.reduce((s, i) => s + i.price, 0)

  return (
    <div>
      {confirmClear && (
        <ConfirmDialog
          message="Todos os itens da OS ser\u00e3o removidos. Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita."
          onConfirm={confirmClearOS}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      <ModalConverterOS
        open={modalOS}
        onClose={() => setModalOS(false)}
        osItems={osItems}
        total={totalItens}
        pagamento="Pix"
        observacoes=""
        servico="Diversos"
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Or\u00e7amento</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Monte o or\u00e7amento por m\u00f3dulo e gere o valor final da OS
          </p>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
        gap: 'var(--space-6)',
        alignItems: 'start',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', minWidth: 0 }}>
          <ModuloQuadros onAdd={addItem} precos={precos} setPrecos={setPrecos} />
          <ModuloNomes   onAdd={addItem} precos={precos} setPrecos={setPrecos} />
          <Modulo3D      onAdd={addItem} precos={precos} setPrecos={setPrecos} />
        </div>

        <div style={{ minWidth: 0 }}>
          <OSCart
            items={osItems}
            onRemove={removeItem}
            onClear={clearOS}
            onPrint={printOS}
            onConverterOS={() => {
              if (osItems.length === 0) return toast.error('Adicione ao menos um item ao or\u00e7amento')
              setModalOS(true)
            }}
          />
        </div>
      </div>
    </div>
  )
}
