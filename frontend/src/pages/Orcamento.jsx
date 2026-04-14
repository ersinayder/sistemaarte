import React, { useState, useCallback, useRef } from 'react'

/* ── helpers ─────────────────────────────────────────────── */
const fmt = v =>
  'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const fmtN = (v, d = 2) => Number(v || 0).toFixed(d).replace('.', ',')
const uid = (() => { let n = 0; return () => ++n })()

/* ── Highlights via color-mix (sem depender de vars que podem não existir) ── */
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

function AddButton({ onClick, label = 'Adicionar à OS' }) {
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
      type: 'quadros', emoji: '🖼',
      name: desc || `Quadro ${l}×${a}cm`,
      sub: `${l}×${a} cm · ×${q}`,
      price: subtotal,
    })
  }

  return (
    <div className="card card-pad">
      <ModuleHeader emoji="🖼" title="Quadros — Molduras & Vidros" desc="Cálculo por perímetro (m) e área (m²)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <PrecoInput label="Preço Moldura / m"      id="q_pm" value={precos.moldura} onChange={v => setPrecos(p => ({ ...p, moldura: v }))} />
        <PrecoInput label="Preço Fundo/Vidro / m²" id="q_pv" value={precos.vidro}   onChange={v => setPrecos(p => ({ ...p, vidro: v }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="form-group">
          <label className="form-label">Largura — L (cm)</label>
          <input type="number" className="form-input" placeholder="60" min="0" step="0.1"
            value={L} onChange={e => setL(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Altura — A (cm)</label>
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
        <label className="form-label">Descrição</label>
        <input type="text" className="form-input" placeholder="Ex: Quadro sala 60×80"
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
                role="button" aria-label="Remover extra">×</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <CalcRow label="Perímetro (m)"     value={hasData ? fmtN(perimetro, 3) + ' m'  : '—'} />
        <CalcRow label="Custo Moldura"     value={hasData ? fmt(cMoldura)           : '—'} />
        <CalcRow label="Área (m²)"         value={hasData ? fmtN(area, 4) + ' m²'   : '—'} />
        <CalcRow label="Custo Fundo/Vidro" value={hasData ? fmt(cVidro)             : '—'} />
        <CalcRow label="Extras"            value={fmt(extrasTotal)} />
        <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
        <CalcRow label={`Subtotal × ${q}`} value={hasData ? fmt(subtotal) : '—'} total />
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
      type: 'nomes', emoji: '✂️',
      name: desc || `Nome ${c}cm`,
      sub: `${c} cm · ×${q}`,
      price: subtotal,
    })
  }

  return (
    <div className="card card-pad">
      <ModuleHeader emoji="✂️" title="Nomes — Corte Linear" desc="Cálculo por comprimento total (m)" />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <PrecoInput label="Preço Material / m" id="n_pm" value={precos.nomes} onChange={v => setPrecos(p => ({ ...p, nomes: v }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="form-group">
          <label className="form-label">Comprimento total — C (cm)</label>
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
        <label className="form-label">Descrição / Nome</label>
        <input type="text" className="form-input" placeholder="Ex: FAMÍLIA SILVA"
          value={desc} onChange={e => setDesc(e.target.value)} />
      </div>
      <div style={{ background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <CalcRow label="Comprimento (m)"   value={hasData ? fmtN(compM, 3) + ' m' : '—'} />
        <CalcRow label="Custo linear"      value={hasData ? fmt(custo)          : '—'} />
        <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
        <CalcRow label={`Subtotal × ${q}`} value={hasData ? fmt(subtotal) : '—'} total />
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
      type: '3d', emoji: '🖨',
      name: desc || `Peça 3D ${l}×${a}cm`,
      sub: `Ref=${ref}cm (${refWinner}) · ×${q}`,
      price: subtotal,
    })
  }

  return (
    <div className="card card-pad">
      <ModuleHeader emoji="🖨" title="Peças 3D — Maior Dimensão" desc="Custo pelo maior eixo: Ref = max(L, A)" />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <PrecoInput label="Preço 3D / m" id="t_pm" value={precos.trid} onChange={v => setPrecos(p => ({ ...p, trid: v }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="form-group">
          <label className="form-label">Largura — L (cm)</label>
          <input type="number" className="form-input" placeholder="40" min="0" step="0.1"
            value={L} onChange={e => setL(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Altura — A (cm)</label>
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
        <label className="form-label">Descrição da Peça</label>
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
          Ref = {fmtN(ref, 1)} cm — {refWinner} é o maior lado
        </div>
      )}
      <div style={{ background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <CalcRow label="Referência (maior lado)" value={hasData ? fmtN(ref, 1) + ' cm'  : '—'} />
        <CalcRow label="Ref (m)"                 value={hasData ? fmtN(refM, 3) + ' m'  : '—'} />
        <CalcRow label="Custo 3D"                value={hasData ? fmt(custo)             : '—'} />
        <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
        <CalcRow label={`Subtotal × ${q}`}       value={hasData ? fmt(subtotal) : '—'} total />
      </div>
      <AddButton onClick={handleAdd} />
    </div>
  )
}

/* ── Confirm Dialog (substitui window.confirm — seguro em iframe) ── */
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
        <div style={{ fontSize: 28, marginBottom: 'var(--space-3)' }}>🗑️</div>
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

/* ── OS Cart Sidebar ─────────────────────────────────────── */
function OSCart({ items, onRemove, onClear, onPrint }) {
  const totals = { quadros: 0, nomes: 0, '3d': 0 }
  items.forEach(i => { totals[i.type] = (totals[i.type] || 0) + i.price })
  const final = Object.values(totals).reduce((s, v) => s + v, 0)

  const dotColor = { quadros: 'var(--color-orange)', nomes: 'var(--color-blue)', '3d': 'var(--color-purple)' }
  const tagBg    = { quadros: HL.orange, nomes: HL.blue, '3d': HL.purple }
  const tagColor = { quadros: 'var(--color-orange)', nomes: 'var(--color-blue)', '3d': 'var(--color-purple)' }
  const tagLabel = { quadros: '🖼 Quadros', nomes: '✂️ Nomes', '3d': '🖨 3D' }

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
          Ordem de Serviço
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
            <div style={{ fontSize: 'var(--text-xs)' }}>Adicione itens dos módulos ao lado</div>
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

      {/* Total final + ações */}
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
          <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={onPrint}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Imprimir / Exportar OS
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

/* ── Print helper (fallback para data: URI caso popup seja bloqueado) ── */
function buildPrintHtml(osItems, fmt) {
  const totals = { quadros: 0, nomes: 0, '3d': 0 }
  osItems.forEach(i => { totals[i.type] = (totals[i.type] || 0) + i.price })
  const final = Object.values(totals).reduce((s, v) => s + v, 0)
  const now   = new Date().toLocaleString('pt-BR')
  const rows  = osItems.map(i =>
    `<tr><td>${i.emoji} ${i.name}</td><td>${i.sub}</td><td class="val">${fmt(i.price)}</td></tr>`
  ).join('')
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Orçamento OS</title>
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
  <h1>Orçamento — Ordem de Serviço</h1>
  <div class="sub">Emitido em ${now}</div>
  <table>
    <thead><tr><th>Item</th><th>Detalhes</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">Total: ${fmt(final)}</div>
  <div class="meta">Arte & Molduras — Sistema de Orçamento</div>
  <script>window.onload = () => { window.print() }<\/script>
</body></html>`
}

/* ── Main Page ───────────────────────────────────────────── */
export default function Orcamento() {
  const [osItems, setOsItems] = useState([])
  const [confirmClear, setConfirmClear] = useState(false)

  // Preços compartilhados entre módulos — persistidos em memória durante a sessão
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
    // Tenta abrir popup; faz fallback para data: URI se bloqueado
    try {
      const w = window.open('', '_blank', 'width=750,height=900')
      if (w) {
        w.document.write(html)
        w.document.close()
      } else {
        throw new Error('popup bloqueado')
      }
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

  return (
    <div>
      {confirmClear && (
        <ConfirmDialog
          message="Todos os itens da OS serão removidos. Esta ação não pode ser desfeita."
          onConfirm={confirmClearOS}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamento</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Monte o orçamento por módulo e gere o valor final da OS
          </p>
        </div>
      </div>

      {/* Grid principal — responsivo: empilha em telas < ~700px */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
        gap: 'var(--space-6)',
        alignItems: 'start',
      }}>
        {/* Módulos de cálculo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', minWidth: 0 }}>
          <ModuloQuadros onAdd={addItem} precos={precos} setPrecos={setPrecos} />
          <ModuloNomes   onAdd={addItem} precos={precos} setPrecos={setPrecos} />
          <Modulo3D      onAdd={addItem} precos={precos} setPrecos={setPrecos} />
        </div>

        {/* Carrinho OS */}
        <div style={{ minWidth: 0 }}>
          <OSCart
            items={osItems}
            onRemove={removeItem}
            onClear={clearOS}
            onPrint={printOS}
          />
        </div>
      </div>
    </div>
  )
}
