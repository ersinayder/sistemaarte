import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'

/* ── helpers ─────────────────────────────────────────────── */
const fmt = v =>
  'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const fmtN = (v, d = 2) => Number(v || 0).toFixed(d).replace('.', ',')
const uid = (() => { let n = 0; return () => ++n })()

const HL = {
  orange: 'color-mix(in oklab, var(--color-orange) 12%, var(--color-surface-offset))',
  blue:   'color-mix(in oklab, var(--color-blue)   12%, var(--color-surface-offset))',
  purple: 'color-mix(in oklab, var(--color-purple)  12%, var(--color-surface-offset))',
}

/* ── Chip selector (vidro / opções) ─────────────────────── */
function ChipGroup({ options, value, onChange, colorActive = 'var(--color-primary)' }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '7px 16px',
              borderRadius: 'var(--radius-full)',
              border: active ? `2px solid ${colorActive}` : '2px solid var(--color-border)',
              background: active
                ? `color-mix(in oklab, ${colorActive} 14%, var(--color-surface))`
                : 'var(--color-surface-offset)',
              color: active ? colorActive : 'var(--color-text-muted)',
              fontWeight: active ? 700 : 500,
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              transition: 'all 160ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Toggle switch ───────────────────────────────────────── */
function Toggle({ checked, onChange, label, sub }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: checked
          ? 'color-mix(in oklab, var(--color-primary) 10%, var(--color-surface))'
          : 'var(--color-surface-offset)',
        border: checked ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer', width: '100%',
        transition: 'all 160ms ease',
        gap: 12,
      }}
    >
      <div style={{ textAlign: 'left' }}>
        <div style={{
          fontSize: 'var(--text-sm)', fontWeight: 600,
          color: checked ? 'var(--color-primary)' : 'var(--color-text)',
        }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>
        )}
      </div>
      {/* pill toggle */}
      <div style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0,
        background: checked ? 'var(--color-primary)' : 'var(--color-border)',
        position: 'relative', transition: 'background 160ms ease',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left 160ms ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </button>
  )
}

/* ── Big number input ────────────────────────────────────── */
function BigInput({ label, value, onChange, unit, placeholder = '0', hint, step = '0.1' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--color-text-muted)',
      }}>{label}</label>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--color-surface-offset)',
        border: '1.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'border-color 160ms',
      }}
        onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
        onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
      >
        <input
          type="number" value={value} placeholder={placeholder}
          step={step} min="0"
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            padding: '12px 14px',
            fontSize: 'var(--text-lg)', fontWeight: 700,
            color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums',
            width: '100%',
          }}
        />
        {unit && (
          <span style={{
            padding: '0 14px 0 4px',
            fontSize: 'var(--text-sm)', fontWeight: 600,
            color: 'var(--color-text-faint)',
          }}>{unit}</span>
        )}
      </div>
      {hint && <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{hint}</span>}
    </div>
  )
}

/* ── Preço input compacto ────────────────────────────────── */
function PrecoField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</span>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--color-surface-dynamic)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: '5px 10px',
      }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>R$</span>
        <input
          type="number" value={value} min="0" step="0.01"
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            fontSize: 'var(--text-sm)', fontWeight: 700,
            color: 'var(--color-text)', width: 70,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
      </div>
    </div>
  )
}

/* ── Breakdown row ───────────────────────────────────────── */
function Row({ label, value, accent, total, faint }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0',
    }}>
      <span style={{
        fontSize: faint ? 11 : 'var(--text-xs)',
        color: faint ? 'var(--color-text-faint)' : total ? 'var(--color-text)' : 'var(--color-text-muted)',
        fontWeight: total ? 700 : 400,
      }}>{label}</span>
      <span style={{
        fontSize: total ? 'var(--text-sm)' : 'var(--text-xs)',
        fontFamily: 'monospace', fontWeight: total ? 800 : 600,
        color: accent ? 'var(--color-primary)' : total ? 'var(--color-text)' : 'var(--color-text-muted)',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  )
}

/* ── Section label ───────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: 'var(--color-text-faint)',
      marginBottom: 8, marginTop: 4,
    }}>{children}</div>
  )
}

/* ── Divider ─────────────────────────────────────────────── */
function Divider() {
  return <div style={{ height: 1, background: 'var(--color-divider)', margin: '6px 0' }} />
}

/* ── calcQuadros ─────────────────────────────────────────── */
const VIDRO_OPTS = [
  { value: 'Sem',          label: 'Sem vidro' },
  { value: 'Liso',         label: 'Liso' },
  { value: 'Antirreflexo', label: 'Antirreflexo' },
]

function calcQuadros({ L, A, precoMoldura, vidro, impressao }) {
  const lM = L / 100, aM = A / 100
  const area = lM * aM
  const perimetro = (lM + aM) * 2
  const folga = (lM >= 1 || aM >= 1) ? 1.5 : 1
  const metrosTotal = perimetro + folga
  const vMoldura = metrosTotal * precoMoldura
  let vVidro = 0
  if (vidro === 'Sem')          vVidro = (lM < 1 && aM < 1) ? 0.5 * precoMoldura : 0
  else if (vidro === 'Liso')    vVidro = area * 300
  else if (vidro === 'Antirreflexo') vVidro = area * 400
  const vFundo = area * 100
  const vImpressao = impressao ? area * 150 : 0
  const total = vMoldura + vVidro + vFundo + vImpressao
  return { lM, aM, area, perimetro, folga, metrosTotal, vMoldura, vVidro, vFundo, vImpressao, total }
}

/* ══════════════════════════════════════════════════════════
   MODULE 1 — Molduras & Quadros
══════════════════════════════════════════════════════════ */
function ModuloQuadros({ onAdd, precos, setPrecos }) {
  const [desc, setDesc]           = useState('')
  const [L, setL]                 = useState('')
  const [A, setA]                 = useState('')
  const [qtd, setQtd]             = useState('1')
  const [vidro, setVidro]         = useState('Sem')
  const [impressao, setImpressao] = useState(false)
  const [extraNome, setExtraNome] = useState('')
  const [extraVal, setExtraVal]   = useState('')
  const [extras, setExtras]       = useState([])

  const l = parseFloat(L) || 0
  const a = parseFloat(A) || 0
  const q = Math.max(1, parseInt(qtd) || 1)
  const hasData = l > 0 && a > 0

  const calc = hasData ? calcQuadros({ L: l, A: a, precoMoldura: precos.moldura, vidro, impressao }) : null
  const extrasTotal = extras.reduce((s, e) => s + e.val, 0)
  const subtotal = calc ? (calc.total + extrasTotal) * q : 0

  const addExtra = () => {
    if (!extraNome.trim() || !parseFloat(extraVal)) return
    setExtras(p => [...p, { id: uid(), nome: extraNome.trim(), val: parseFloat(extraVal) }])
    setExtraNome(''); setExtraVal('')
  }

  const handleAdd = () => {
    if (!hasData) return
    const parts = [`${l}×${a}cm`, `Vidro: ${vidro}`]
    if (impressao) parts.push('c/ Impressão')
    if (q > 1) parts.push(`×${q}`)
    onAdd({ type: 'quadros', emoji: '🖼', name: desc || `Moldura ${l}×${a}cm`, sub: parts.join(' · '), price: subtotal })
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--color-divider)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 'var(--radius-md)',
          background: 'color-mix(in oklab, var(--color-orange) 14%, var(--color-surface-offset))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
        }}>🖼</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Molduras &amp; Quadros</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>Perímetro · Vidro · Fundo</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <PrecoField label="R$/metro" value={precos.moldura} onChange={v => setPrecos(p => ({ ...p, moldura: v }))} />
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        {/* Dimensões */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10, marginBottom: 20 }}>
          <BigInput label="Largura" value={L} onChange={setL} unit="cm" placeholder="60" />
          <BigInput label="Altura" value={A} onChange={setA} unit="cm" placeholder="90" />
          <BigInput label="Qtd" value={qtd} onChange={setQtd} unit="×" placeholder="1" step="1" />
        </div>

        {/* Vidro */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Vidro</SectionLabel>
          <ChipGroup options={VIDRO_OPTS} value={vidro} onChange={setVidro} />
        </div>

        {/* Impressão toggle */}
        <div style={{ marginBottom: 18 }}>
          <Toggle
            checked={impressao}
            onChange={setImpressao}
            label="Impressão"
            sub={hasData && impressao && calc ? `${fmtN(calc.area, 4)} m² × R$150 = ${fmt(calc.vImpressao)}` : 'área × R$150/m²'}
          />
        </div>

        {/* Descrição */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Descrição (opcional)</SectionLabel>
          <input
            type="text" value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Ex: Quadro sala 60×90"
            style={{
              width: '100%', background: 'var(--color-surface-offset)',
              border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              padding: '9px 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text)',
              outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>

        {/* Extras */}
        <div style={{ marginBottom: extras.length > 0 ? 10 : 18 }}>
          <SectionLabel>Extras</SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text" value={extraNome} onChange={e => setExtraNome(e.target.value)}
              placeholder="Nome (ex: Pendurador)"
              onKeyDown={e => e.key === 'Enter' && addExtra()}
              style={{
                flex: 2, background: 'var(--color-surface-offset)',
                border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                padding: '8px 12px', fontSize: 'var(--text-xs)', color: 'var(--color-text)',
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
            />
            <input
              type="number" value={extraVal} onChange={e => setExtraVal(e.target.value)}
              placeholder="R$"
              onKeyDown={e => e.key === 'Enter' && addExtra()}
              style={{
                flex: 1, background: 'var(--color-surface-offset)',
                border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                padding: '8px 12px', fontSize: 'var(--text-xs)', color: 'var(--color-text)',
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
            />
            <button
              onClick={addExtra}
              style={{
                width: 36, height: 36, flexShrink: 0,
                background: 'var(--color-surface-dynamic)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--color-text-muted)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        </div>

        {extras.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {extras.map(e => (
              <span key={e.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--color-surface-dynamic)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-full)', padding: '3px 10px',
                fontSize: 11, color: 'var(--color-text-muted)',
              }}>
                {e.nome} <strong style={{ color: 'var(--color-text)' }}>+{fmt(e.val)}</strong>
                <span
                  onClick={() => setExtras(p => p.filter(x => x.id !== e.id))}
                  style={{ cursor: 'pointer', color: 'var(--color-text-faint)', lineHeight: 1 }}
                  role="button" aria-label="Remover">×</span>
              </span>
            ))}
          </div>
        )}

        {/* ── Breakdown ── */}
        <div style={{
          background: 'var(--color-surface-offset)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <Row label="Perímetro" value={hasData ? fmtN(calc.perimetro, 3) + ' m' : '—'} faint />
          <Row
            label={hasData ? `Folga (${calc.lM >= 1 || calc.aM >= 1 ? '1,5m' : '1,0m'})` : 'Folga'}
            value={hasData ? fmtN(calc.folga, 1) + ' m' : '—'} faint
          />
          <Row
            label={hasData ? `${fmtN(calc.metrosTotal, 3)}m × R$${precos.moldura}/m` : 'Moldura'}
            value={hasData ? fmt(calc.vMoldura) : '—'} accent
          />
          <Divider />
          <Row label="Área" value={hasData ? fmtN(calc.area, 4) + ' m²' : '—'} faint />
          <Row
            label={hasData
              ? vidro === 'Sem' && calc.lM < 1 && calc.aM < 1
                ? 'Vidro: taxa mínima (0,5×)'
                : vidro === 'Sem' ? 'Vidro: Sem'
                : `Vidro ${vidro} (m² × ${vidro === 'Liso' ? 'R$300' : 'R$400'})`
              : 'Vidro'}
            value={hasData ? fmt(calc.vVidro) : '—'} accent
          />
          <Divider />
          <Row
            label={hasData ? `Fundo: ${fmtN(calc.area, 4)}m² × R$100` : 'Fundo'}
            value={hasData ? fmt(calc.vFundo) : '—'} accent
          />
          {impressao && (
            <Row
              label={hasData ? `Impressão: ${fmtN(calc.area, 4)}m² × R$150` : 'Impressão'}
              value={hasData ? fmt(calc.vImpressao) : '—'} accent
            />
          )}
          {extrasTotal > 0 && <Row label="Extras" value={fmt(extrasTotal)} />}
          <Divider />
          {/* Subtotal em destaque */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 4,
          }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>
              Subtotal {q > 1 ? `× ${q}` : ''}
            </span>
            <span style={{
              fontSize: 'var(--text-xl)', fontWeight: 800,
              color: hasData ? 'var(--color-primary)' : 'var(--color-text-faint)',
              fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}>
              {hasData ? fmt(subtotal) : 'R$ —'}
            </span>
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={!hasData}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: hasData ? 1 : 0.45 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Adicionar à OS
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MODULE 2 — Nomes
══════════════════════════════════════════════════════════ */
function ModuloNomes({ onAdd, precos, setPrecos }) {
  const [desc, setDesc] = useState('')
  const [C, setC]       = useState('')
  const [qtd, setQtd]   = useState('1')

  const c = parseFloat(C) || 0
  const q = Math.max(1, parseInt(qtd) || 1)
  const hasData = c > 0
  const compM = c / 100
  const custo = compM * precos.nomes
  const subtotal = custo * q

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--color-divider)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 'var(--radius-md)',
          background: 'color-mix(in oklab, var(--color-blue) 14%, var(--color-surface-offset))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
        }}>✂️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Nomes — Corte Linear</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>Comprimento total em metros</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <PrecoField label="R$/metro" value={precos.nomes} onChange={v => setPrecos(p => ({ ...p, nomes: v }))} />
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10, marginBottom: 20 }}>
          <BigInput label="Comprimento total" value={C} onChange={setC} unit="cm" placeholder="85" hint="Soma linear das letras" />
          <BigInput label="Qtd" value={qtd} onChange={setQtd} unit="×" placeholder="1" step="1" />
        </div>

        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Descrição (opcional)</SectionLabel>
          <input
            type="text" value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Ex: FAMÍLIA SILVA"
            style={{
              width: '100%', background: 'var(--color-surface-offset)',
              border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              padding: '9px 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text)', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>

        <div style={{
          background: 'var(--color-surface-offset)', border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 16,
        }}>
          <Row label="Comprimento" value={hasData ? fmtN(compM, 3) + ' m' : '—'} faint />
          <Row label={`${fmtN(compM, 3)}m × R$${precos.nomes}/m`} value={hasData ? fmt(custo) : '—'} accent />
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>
              Subtotal {q > 1 ? `× ${q}` : ''}
            </span>
            <span style={{
              fontSize: 'var(--text-xl)', fontWeight: 800,
              color: hasData ? 'var(--color-primary)' : 'var(--color-text-faint)',
              fontFamily: 'monospace', letterSpacing: '-0.02em',
            }}>{hasData ? fmt(subtotal) : 'R$ —'}</span>
          </div>
        </div>

        <button
          onClick={() => {
            if (!hasData) return
            onAdd({ type: 'nomes', emoji: '✂️', name: desc || `Nome ${c}cm`, sub: `${c}cm · ×${q}`, price: subtotal })
          }}
          disabled={!hasData}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: hasData ? 1 : 0.45 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Adicionar à OS
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MODULE 3 — Peças 3D
══════════════════════════════════════════════════════════ */
function Modulo3D({ onAdd, precos, setPrecos }) {
  const [desc, setDesc] = useState('')
  const [L, setL]       = useState('')
  const [A, setA]       = useState('')
  const [qtd, setQtd]   = useState('1')

  const l = parseFloat(L) || 0
  const a = parseFloat(A) || 0
  const q = Math.max(1, parseInt(qtd) || 1)
  const hasData = l > 0 || a > 0
  const ref = Math.max(l, a)
  const refWinner = ref === l && l > 0 ? 'Largura' : 'Altura'
  const refM = ref / 100
  const custo = refM * precos.trid
  const subtotal = custo * q

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--color-divider)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 'var(--radius-md)',
          background: 'color-mix(in oklab, var(--color-purple) 14%, var(--color-surface-offset))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
        }}>🖨</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Peças 3D</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>Custo pelo maior eixo</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <PrecoField label="R$/metro" value={precos.trid} onChange={v => setPrecos(p => ({ ...p, trid: v }))} />
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          <BigInput label="Largura" value={L} onChange={setL} unit="cm" placeholder="40" />
          <BigInput label="Altura" value={A} onChange={setA} unit="cm" placeholder="60" />
          <BigInput label="Qtd" value={qtd} onChange={setQtd} unit="×" placeholder="1" step="1" />
        </div>

        {hasData && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'color-mix(in oklab, var(--color-purple) 10%, var(--color-surface))',
            border: '1px solid color-mix(in oklab, var(--color-purple) 30%, var(--color-border))',
            borderRadius: 'var(--radius-md)', padding: '8px 12px',
            marginBottom: 14, fontSize: 'var(--text-xs)', color: 'var(--color-purple)', fontWeight: 600,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
            </svg>
            Referência = {fmtN(ref, 1)} cm — {refWinner} é o maior lado
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Descrição (opcional)</SectionLabel>
          <input
            type="text" value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Ex: Totem decorativo"
            style={{
              width: '100%', background: 'var(--color-surface-offset)',
              border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              padding: '9px 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text)', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>

        <div style={{
          background: 'var(--color-surface-offset)', border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 16,
        }}>
          <Row label="Maior lado (ref)" value={hasData ? fmtN(ref, 1) + ' cm' : '—'} faint />
          <Row label={`${fmtN(refM, 3)}m × R$${precos.trid}/m`} value={hasData ? fmt(custo) : '—'} accent />
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>
              Subtotal {q > 1 ? `× ${q}` : ''}
            </span>
            <span style={{
              fontSize: 'var(--text-xl)', fontWeight: 800,
              color: hasData ? 'var(--color-primary)' : 'var(--color-text-faint)',
              fontFamily: 'monospace', letterSpacing: '-0.02em',
            }}>{hasData ? fmt(subtotal) : 'R$ —'}</span>
          </div>
        </div>

        <button
          onClick={() => {
            if (!hasData) return
            onAdd({ type: '3d', emoji: '🖨', name: desc || `Peça 3D ${l}×${a}cm`, sub: `Ref=${ref}cm (${refWinner}) · ×${q}`, price: subtotal })
          }}
          disabled={!hasData}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: hasData ? 1 : 0.45 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Adicionar à OS
        </button>
      </div>
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
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
    }}>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)',
        padding: 'var(--space-6)', maxWidth: 360, width: '100%', textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 'var(--space-3)' }}>🗑️</div>
        <div style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>Limpar OS?</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>{message}</div>
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
const PAG_LABEL = { Credito: 'Crédito', Debito: 'Débito', Link: 'Link Pag.', Pix: 'Pix', Dinheiro: 'Dinheiro' }
const PRIO_OPTS = ['Normal', 'Alta', 'Urgente']

function ModalConverterOS({ open, onClose, osItems, total, pagamento, observacoes, servico }) {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState([])
  const [buscaCliente, setBuscaCliente] = useState('')
  const [form, setForm] = useState({
    clientenome: '', clientetelefone: '', clientecpf: '', clienteid: null,
    servico: servico || TIPO_OPTS[0], valortotal: total ? total.toFixed(2) : '',
    valorentrada: '', prazoentrega: '', prioridade: 'Normal',
    pagamento: pagamento || 'Pix', observacoes: observacoes || '', status: 'Recebido',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  React.useEffect(() => {
    if (!open) return
    setForm({
      clientenome: '', clientetelefone: '', clientecpf: '', clienteid: null,
      servico: servico || TIPO_OPTS[0], valortotal: total ? total.toFixed(2) : '',
      valorentrada: '', prazoentrega: '', prioridade: 'Normal',
      pagamento: pagamento || 'Pix', observacoes: observacoes || '', status: 'Recebido',
    })
    setBuscaCliente(''); setClientes([])
  }, [open, total, pagamento, observacoes, servico])

  React.useEffect(() => {
    if (buscaCliente.length < 2) { setClientes([]); return }
    api.get(`/clientes?q=${encodeURIComponent(buscaCliente)}`).then(r => setClientes(r.data || [])).catch(() => {})
  }, [buscaCliente])

  const selecionarCliente = c => {
    set('clienteid', c.id); set('clientenome', c.name)
    set('clientetelefone', c.phone || ''); set('clientecpf', c.cpf || '')
    setBuscaCliente(c.name); setClientes([])
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
      toast(`✨ Cliente "${nome.trim()}" cadastrado automaticamente`)
      return r.data?.id || null
    } catch { return null }
  }

  const descricaoItens = osItems.map(i => `${i.emoji} ${i.name} (${i.sub})`).join('; ')

  const salvar = async () => {
    if (!form.clientenome.trim()) return toast.error('Nome do cliente obrigatório')
    const totalN = Number(form.valortotal), entradaN = form.valorentrada === '' ? 0 : Number(form.valorentrada)
    if (isNaN(totalN) || totalN <= 0) return toast.error('Valor total deve ser maior que zero')
    if (isNaN(entradaN) || entradaN < 0) return toast.error('Entrada não pode ser negativa')
    if (entradaN > totalN) return toast.error('Entrada não pode ser maior que o total')
    setSaving(true)
    try {
      let clienteid = form.clienteid
      if (!clienteid) clienteid = await ensureCliente(form.clientenome, form.clientetelefone, form.clientecpf)
      await api.post('/ordens', {
        clienteid: clienteid || null, clientenome: form.clientenome.trim(),
        clientetelefone: form.clientetelefone || null, clientecpf: form.clientecpf || null,
        servico: form.servico, descricao: descricaoItens || null,
        valortotal: totalN, valorentrada: entradaN,
        prazoentrega: form.prazoentrega || null, prioridade: form.prioridade,
        pagamento: form.pagamento, observacoes: form.observacoes || null, status: form.status,
      })
      toast.success('OS criada com sucesso!')
      onClose(); navigate('/ordens')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao criar OS')
    } finally { setSaving(false) }
  }

  const totalN = Number(form.valortotal) || 0
  const entradaN = Number(form.valorentrada) || 0
  const restante = Math.max(0, totalN - entradaN)

  if (!open) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <span className="modal-title">Converter Orçamento em OS</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <div style={{
            background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Itens do Orçamento ({osItems.length})
            </div>
            {osItems.map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '2px 0', color: 'var(--color-text-muted)' }}>
                <span>{i.emoji} {i.name} <span style={{ color: 'var(--color-text-faint)' }}>· {i.sub}</span></span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-text)' }}>{fmt(i.price)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>Total do Orçamento</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--color-primary)', fontSize: 'var(--text-sm)' }}>{fmt(total)}</span>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <div className="form-group">
              <label className="form-label">Cliente <span style={{ color: 'var(--color-error)' }}>*</span></label>
              <input className="form-input" placeholder="Nome do cliente"
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
              <label className="form-label">Tipo de Serviço</label>
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
              <label className="form-label">Valor Total (R$) <span style={{ color: 'var(--color-error)' }}>*</span></label>
              <input className="form-input" type="number" step="0.01" min="0"
                value={form.valortotal} onChange={e => set('valortotal', e.target.value)}
                style={{ fontFamily: 'monospace', fontWeight: 700 }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Entrada (R$) <span style={{ color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)', fontWeight: 400 }}>opcional</span></label>
              <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00"
                value={form.valorentrada} onChange={e => set('valorentrada', e.target.value)}/>
            </div>
          </div>

          {totalN > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: 'var(--space-3) var(--space-4)',
              background: restante > 0 ? 'var(--color-warning-highlight)' : 'var(--color-success-highlight)',
              borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
            }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Restante após entrada:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: restante > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                {restante > 0 ? fmt(restante) : '✓ Quitado na entrada'}
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
            <label className="form-label">Observações Internas</label>
            <textarea className="form-input" rows={2} style={{ resize: 'vertical' }}
              value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
              placeholder="Visível apenas internamente..."/>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>
            {saving
              ? <><div className="spinner" style={{ width: 14, height: 14 }}/>Criando OS...</>
              : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>Criar OS</>
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
  const tagLabel = { quadros: '🖼 Molduras', nomes: '✂️ Nomes', '3d': '🖨 3D' }

  return (
    <div className="card" style={{
      position: 'sticky', top: 'var(--space-6)',
      display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100dvh - 80px)', overflow: 'hidden', padding: 0,
    }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
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
          fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600,
        }}>{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
      </div>

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
                padding: 'var(--space-3)', background: 'var(--color-surface-offset)',
                borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-divider)',
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
                <button onClick={() => onRemove(item.id)} aria-label="Remover item"
                  style={{
                    color: 'var(--color-text-faint)', width: 20, height: 20, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'none', border: 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-faint)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0 }}>
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

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-faint)', marginBottom: 4 }}>
          Valor Final da OS
        </div>
        <div style={{
          fontFamily: 'monospace', fontWeight: 800, fontSize: 'var(--text-xl)',
          color: 'var(--color-primary)', letterSpacing: '-0.02em', marginBottom: 'var(--space-4)',
          fontVariantNumeric: 'tabular-nums',
        }}>{fmt(final)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <button className="btn btn-ghost" style={{ justifyContent: 'center' }} onClick={onPrint}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Imprimir Orçamento
          </button>
          <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={onConverterOS} disabled={items.length === 0}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
            Converter em OS
          </button>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }} onClick={onClear}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
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
  const now = new Date().toLocaleString('pt-BR')
  const rows = osItems.map(i => `<tr><td>${i.emoji} ${i.name}</td><td>${i.sub}</td><td class="val">${fmtFn(i.price)}</td></tr>`).join('')
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Orçamento OS</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:700px;margin:0 auto}h1{font-size:22px;margin-bottom:4px}.sub{color:#666;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-bottom:24px}th{background:#f0f0f0;padding:8px 12px;text-align:left;font-size:13px}td{padding:8px 12px;border-bottom:1px solid #eee;font-size:13px}.val{text-align:right;font-family:monospace;font-weight:700}.total{font-size:22px;font-weight:800;text-align:right;margin-top:16px;color:#01696f}.meta{color:#999;font-size:11px;margin-top:32px}@media print{body{padding:0}}</style></head>
<body><h1>Orçamento — Ordem de Serviço</h1><div class="sub">Emitido em ${now}</div>
<table><thead><tr><th>Item</th><th>Detalhes</th><th style="text-align:right">Valor</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total">Total: ${fmtFn(final)}</div><div class="meta">Arte &amp; Molduras — Sistema de Orçamento</div>
<script>window.onload=()=>{window.print()}<\/script></body></html>`
}

/* ── Main Page ───────────────────────────────────────────── */
export default function Orcamento() {
  const [osItems, setOsItems]           = useState([])
  const [confirmClear, setConfirmClear] = useState(false)
  const [modalOS, setModalOS]           = useState(false)
  const [precos, setPrecos]             = useState({ moldura: 60, nomes: 35, trid: 80 })

  const addItem = useCallback(item => setOsItems(prev => [...prev, { ...item, id: uid() }]), [])
  const removeItem = id => setOsItems(prev => prev.filter(i => i.id !== id))

  const printOS = () => {
    if (osItems.length === 0) return
    const html = buildPrintHtml(osItems, fmt)
    try {
      const w = window.open('', '_blank', 'width=750,height=900')
      if (w) { w.document.write(html); w.document.close() } else throw new Error()
    } catch {
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `orcamento-${Date.now()}.html`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }

  const totalItens = osItems.reduce((s, i) => s + i.price, 0)

  React.useEffect(() => { document.title = 'Orçamento — Arte & Molduras' }, [])

  return (
    <div>
      {confirmClear && (
        <ConfirmDialog
          message="Todos os itens da OS serão removidos. Esta ação não pode ser desfeita."
          onConfirm={() => { setOsItems([]); setConfirmClear(false) }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      <ModalConverterOS
        open={modalOS} onClose={() => setModalOS(false)}
        osItems={osItems} total={totalItens}
        pagamento="Pix" observacoes="" servico="Quadro"
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamento</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Monte o orçamento por módulo e gere o valor final da OS
          </p>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
        gap: 'var(--space-6)', alignItems: 'start',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', minWidth: 0 }}>
          <ModuloQuadros onAdd={addItem} precos={precos} setPrecos={setPrecos} />
          <ModuloNomes   onAdd={addItem} precos={precos} setPrecos={setPrecos} />
          <Modulo3D      onAdd={addItem} precos={precos} setPrecos={setPrecos} />
        </div>
        <div style={{ minWidth: 0 }}>
          <OSCart items={osItems} onRemove={removeItem}
            onClear={() => setConfirmClear(true)}
            onPrint={printOS}
            onConverterOS={() => {
              if (osItems.length === 0) return toast.error('Adicione ao menos um item ao orçamento')
              setModalOS(true)
            }}
          />
        </div>
      </div>
    </div>
  )
}
