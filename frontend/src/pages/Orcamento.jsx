import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { toast } from 'react-hot-toast'
import api from '../services/api'

const fmt  = v => 'R$ ' + (v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const fmtN = (v, d = 2) => (v || 0).toFixed(d)
const fmtBRL = v => v != null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : ''

const HL = {
  orange: 'color-mix(in oklab, var(--color-orange) 12%, var(--color-surface))',
  blue:   'color-mix(in oklab, var(--color-blue)   12%, var(--color-surface))',
  purple: 'color-mix(in oklab, var(--color-purple)  12%, var(--color-surface))',
}

const TIPO_OPTS      = ['Quadro','Caixas','Corte a Laser','Diversos']
const STATUS_OPTS    = ['Aguardando','Em Produção','Pronto','Entregue','Cancelado']
const PRIORIDADE_OPTS = ['Normal','Urgente']

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.07em', color: 'var(--color-text-faint)', marginBottom: 4,
    }}>{children}</div>
  )
}

function Row({ label, value, accent, faint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
      <span style={{ fontSize: 'var(--text-xs)', color: faint ? 'var(--color-text-faint)' : 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: accent ? 'var(--color-primary)' : 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--color-divider)', margin: '6px 0' }} />
}

function BigInput({ label, value, onChange, unit, placeholder, step = '0.01' }) {
  return (
    <div style={{
      background: 'var(--color-surface-offset)', border: '1.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: '8px 10px', transition: 'border-color 150ms',
    }}
      onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
      onBlurCapture={e  => e.currentTarget.style.borderColor = 'var(--color-border)'}
    >
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-faint)', marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <input
          type="number" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} step={step}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', flexShrink: 0 }}>{unit}</span>
      </div>
    </div>
  )
}

function PrecoField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-faint)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>R$</span>
        <input
          type="number" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)}
          step="0.5"
          style={{ width: 64, background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '3px 6px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text)', textAlign: 'right', outline: 'none' }}
          onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
          onBlur={e  => e.target.style.borderColor = 'var(--color-border)'}
        />
      </div>
    </div>
  )
}

function calcQuadros({ L, A, precoMoldura, vidro, impressao }) {
  if (!L || !A) return null
  const l = parseFloat(L), a = parseFloat(A)
  if (!l || !a) return null
  const metrosTotal  = ((l + a) * 2 / 100) * 1.15
  const custoMoldura = metrosTotal * precoMoldura
  const areaM2       = (l / 100) * (a / 100)
  let custoVidro = 0
  const VIDRO_PRECO_M2 = 55, MIN_VIDRO_M2 = 0.25
  if (vidro !== 'sem') {
    const areaEfetiva = Math.max(areaM2, MIN_VIDRO_M2)
    custoVidro = areaEfetiva * VIDRO_PRECO_M2 * (vidro === 'minimo' ? 0.5 : 1)
  }
  let custoImpressao = 0
  if (impressao) custoImpressao = areaM2 * 150
  const custoTotal = custoMoldura + custoVidro + custoImpressao
  return { metrosTotal, custoMoldura, areaM2, custoVidro, custoImpressao, custoTotal }
}

/* ══ MODULE 1 — Quadros ══ */
function ModuloQuadros({ onAdd, precos, setPrecos }) {
  const [desc, setDesc]           = useState('')
  const [L, setL]                 = useState('')
  const [A, setA]                 = useState('')
  const [vidro, setVidro]         = useState('sem')
  const [impressao, setImpressao] = useState(false)
  const [qtd, setQtd]             = useState('1')

  const hasData  = (parseFloat(L) > 0) && (parseFloat(A) > 0)
  const q        = Math.max(1, parseInt(qtd) || 1)
  const calc     = hasData ? calcQuadros({ L, A, precoMoldura: precos.moldura, vidro, impressao }) : null
  const subtotal = calc ? calc.custoTotal * q : 0

  const VIDRO_OPTS = [
    { value: 'sem', label: 'Sem vidro' },
    { value: 'minimo', label: 'Liso' },
    { value: 'completo', label: 'Antirreflexo' },
  ]

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'color-mix(in oklab, var(--color-orange) 14%, var(--color-surface-offset))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🖼</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Quadros / Molduras</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>Custo por perímetro + extras</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <PrecoField label="R$/metro" value={precos.moldura} onChange={v => setPrecos(p => ({ ...p, moldura: v }))} />
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          <BigInput label="Largura" value={L}   onChange={setL}   unit="cm" placeholder="40" />
          <BigInput label="Altura"  value={A}   onChange={setA}   unit="cm" placeholder="60" />
          <BigInput label="Qtd"     value={qtd} onChange={setQtd} unit="×"  placeholder="1" step="1" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Vidro</SectionLabel>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {VIDRO_OPTS.map(o => (
              <button key={o.value} onClick={() => setVidro(o.value)} style={{
                flex: 1, padding: '6px 0', borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
                border: vidro === o.value ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                background: vidro === o.value ? 'color-mix(in oklab, var(--color-primary) 12%, var(--color-surface))' : 'var(--color-surface-offset)',
                color: vidro === o.value ? 'var(--color-primary)' : 'var(--color-text-muted)',
                transition: 'all 150ms',
              }}>{o.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Impressão</SectionLabel>
          <button onClick={() => setImpressao(v => !v)} style={{
            marginTop: 4, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderRadius: 'var(--radius-md)',
            border: impressao ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
            background: impressao ? 'color-mix(in oklab, var(--color-primary) 10%, var(--color-surface))' : 'var(--color-surface-offset)',
            cursor: 'pointer', transition: 'all 150ms',
          }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: impressao ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>Incluir impressão</span>
            <div style={{ width: 32, height: 18, borderRadius: 9, position: 'relative', background: impressao ? 'var(--color-primary)' : 'var(--color-border)', transition: 'background 180ms', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: impressao ? 14 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 180ms' }} />
            </div>
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Descrição (opcional)</SectionLabel>
          <input
            type="text" value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Ex: Retrato família 40×60"
            style={{ width: '100%', background: 'var(--color-surface-offset)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontSize: 'var(--text-sm)', color: 'var(--color-text)', outline: 'none' }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e  => e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>

        <div style={{ background: 'var(--color-surface-offset)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: 12 }}>
          <Row label={`Área (${L||0}×${A||0} cm)`} value={calc ? fmtN(calc.areaM2, 4) + ' m²' : '—'} faint />
          <Row label={hasData ? `${fmtN(calc.metrosTotal,3)}m × R$${precos.moldura}/m` : 'Moldura'} value={calc ? fmt(calc.custoMoldura) : '—'} faint />
          {vidro !== 'sem' && <Row label="Vidro"     value={calc ? fmt(calc.custoVidro)     : '—'} faint />}
          {impressao        && <Row label="Impressão" value={calc ? fmt(calc.custoImpressao) : '—'} faint />}
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Subtotal {q > 1 ? `× ${q}` : ''}</span>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: hasData ? 'var(--color-primary)' : 'var(--color-text-faint)', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{hasData && calc ? fmt(subtotal) : 'R$ —'}</span>
          </div>
        </div>

        <button
          onClick={() => {
            if (!hasData || !calc) return
            const vidroLabel = { sem: '', minimo: ' + Vidro liso', completo: ' + Vidro antirreflexo' }[vidro]
            const impLabel = impressao ? ' + Impressão' : ''
            onAdd({ type: 'quadros', emoji: '🖼', name: desc || `Quadro ${L}×${A}cm`, sub: `${L}×${A}cm${vidroLabel}${impLabel} · ×${q}`, price: subtotal })
          }}
          disabled={!hasData || !calc}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: hasData ? 1 : 0.45 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Adicionar à OS
        </button>
      </div>
    </div>
  )
}

/* ══ MODULE 2 — Nomes ══ */
function ModuloNomes({ onAdd, precos, setPrecos }) {
  const [desc, setDesc] = useState('')
  const [comp, setComp] = useState('')
  const [qtd, setQtd]   = useState('1')

  const c = parseFloat(comp) || 0
  const q = Math.max(1, parseInt(qtd) || 1)
  const hasData = c > 0
  const compM = c / 100
  const custo = compM * precos.nomes
  const subtotal = custo * q

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'color-mix(in oklab, var(--color-blue) 14%, var(--color-surface-offset))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>✂️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Nomes / Laser</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>Custo pelo comprimento</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <PrecoField label="R$/metro" value={precos.nomes} onChange={v => setPrecos(p => ({ ...p, nomes: v }))} />
        </div>
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 14 }}>
          <BigInput label="Comprimento" value={comp} onChange={setComp} unit="cm" placeholder="30" />
          <BigInput label="Qtd"         value={qtd}  onChange={setQtd}  unit="×"  placeholder="1" step="1" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Descrição (opcional)</SectionLabel>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Nome Ana Clara"
            style={{ width: '100%', background: 'var(--color-surface-offset)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontSize: 'var(--text-sm)', color: 'var(--color-text)', outline: 'none' }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e  => e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>
        <div style={{ background: 'var(--color-surface-offset)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: 12 }}>
          <Row label={`${fmtN(compM, 3)}m × R$${precos.nomes}/m`} value={hasData ? fmt(custo) : '—'} accent />
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Subtotal {q > 1 ? `× ${q}` : ''}</span>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: hasData ? 'var(--color-primary)' : 'var(--color-text-faint)', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{hasData ? fmt(subtotal) : 'R$ —'}</span>
          </div>
        </div>
        <button onClick={() => { if (!hasData) return; onAdd({ type: 'nomes', emoji: '✂️', name: desc || `Nome ${c}cm`, sub: `${c}cm · ×${q}`, price: subtotal }) }}
          disabled={!hasData} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', opacity: hasData ? 1 : 0.45 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Adicionar à OS
        </button>
      </div>
    </div>
  )
}

/* ══ MODULE 3 — 3D ══ */
function Modulo3D({ onAdd, precos, setPrecos }) {
  const [desc, setDesc]   = useState('')
  const [peso, setPeso]   = useState('')
  const [tempo, setTempo] = useState('')
  const [qtd, setQtd]     = useState('1')

  const cfg    = precos.trid3d || { filKg: 100, taxaEnergia: 1.191, consumoW: 120, lucroPct: 300 }
  const setCfg = (field, val) => setPrecos(p => ({ ...p, trid3d: { ...(p.trid3d || cfg), [field]: val } }))

  const p = parseFloat(peso) || 0
  const h = parseFloat(tempo) || 0
  const q = Math.max(1, parseInt(qtd) || 1)
  const hasData        = p > 0 || h > 0
  const custoFilamento = (p / 1000) * cfg.filKg
  const custoEnergia   = (cfg.consumoW / 1000) * cfg.taxaEnergia * h
  const custoUnitario  = custoFilamento + custoEnergia
  const precoUnitario  = custoUnitario * (1 + (cfg.lucroPct || 300) / 100)
  const subtotal       = precoUnitario * q

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'color-mix(in oklab, var(--color-purple) 14%, var(--color-surface-offset))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🖨</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Peças 3D</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>Custo por peso + tempo</div>
        </div>
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Dados da peça</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginTop: 6 }}>
            <BigInput label="Peso"  value={peso}  onChange={setPeso}  unit="g" placeholder="130" />
            <BigInput label="Tempo" value={tempo} onChange={setTempo} unit="h" placeholder="4" />
            <BigInput label="Qtd"   value={qtd}   onChange={setQtd}   unit="×" placeholder="1" step="1" />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Descrição (opcional)</SectionLabel>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Totem decorativo"
            style={{ width: '100%', background: 'var(--color-surface-offset)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontSize: 'var(--text-sm)', color: 'var(--color-text)', outline: 'none' }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e =>  e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>

        <div style={{ background: 'var(--color-surface-offset)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: 12 }}>
          <Row label={`Filamento (${p}g ÷ 1000 × R$${cfg.filKg}/kg)`}              value={hasData ? fmt(custoFilamento) : '—'} faint />
          <Row label={`Energia (${cfg.consumoW}W × ${cfg.taxaEnergia}kWh × ${h}h)`} value={hasData ? fmt(custoEnergia)   : '—'} faint />
          <Divider />
          <Row label="Custo unitário"                    value={hasData ? fmt(custoUnitario) : '—'} faint />
          <Row label={`Lucro ${cfg.lucroPct || 300}%`}  value={hasData ? fmt(precoUnitario - custoUnitario) : '—'} faint />
          <Row label="Preço unitário"                    value={hasData ? fmt(precoUnitario) : '—'} accent />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Subtotal {q > 1 ? `× ${q}` : ''}</span>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: hasData ? 'var(--color-primary)' : 'var(--color-text-faint)', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{hasData ? fmt(subtotal) : 'R$ —'}</span>
          </div>
        </div>

        <button onClick={() => { if (!hasData) return; onAdd({ type: '3d', emoji: '🖨', name: desc || `Peça 3D ${p}g/${h}h`, sub: `${p}g · ${h}h · ×${q}`, price: subtotal }) }}
          disabled={!hasData} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', opacity: hasData ? 1 : 0.45, marginBottom: 14 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Adicionar à OS
        </button>

        <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 12 }}>
          <SectionLabel>Configurações fixas</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 6 }}>
            {[
              { label: 'Filamento R$/kg', field: 'filKg',       val: cfg.filKg,       step: '1' },
              { label: 'Taxa energia Kw/h', field: 'taxaEnergia', val: cfg.taxaEnergia, step: '0.001' },
              { label: 'Consumo (W)',      field: 'consumoW',    val: cfg.consumoW,    step: '1' },
              { label: '% de Lucro',       field: 'lucroPct',    val: cfg.lucroPct ?? 300, step: '1' },
            ].map(({ label, field, val, step }) => (
              <div key={field} style={{ background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                <input type="number" value={val} step={step} onChange={e => setCfg(field, parseFloat(e.target.value) || 0)}
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'oklch(from var(--color-bg) l c h / 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', padding: 'var(--space-6)', maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 'var(--space-3)' }}>🗑️</div>
        <div style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>Limpar OS?</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>{message}</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost"   style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', background: 'var(--color-error)' }} onClick={onConfirm}>Limpar</button>
        </div>
      </div>
    </div>
  )
}

function ItemList({ items, onRemove }) {
  if (!items.length) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
        <div>Nenhum item adicionado ainda</div>
        <div style={{ marginTop: 4 }}>Use os módulos ao lado</div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-surface-offset)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{item.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }} className="truncate">{item.name}</div>
            {item.sub && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }} className="truncate">{item.sub}</div>}
          </div>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(item.price)}</div>
          <button onClick={() => onRemove(i)}
            style={{ flexShrink: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-faint)', transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-error-hl)'; e.currentTarget.style.color = 'var(--color-error)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-faint)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      ))}
    </div>
  )
}

function TotalsPanel({ items }) {
  const totals = { quadros: 0, nomes: 0, '3d': 0 }
  items.forEach(it => { if (totals[it.type] !== undefined) totals[it.type] += it.price })
  const total = items.reduce((s, it) => s + it.price, 0)

  const tagBg    = { quadros: HL.orange, nomes: HL.blue, '3d': HL.purple }
  const tagColor = { quadros: 'var(--color-orange)', nomes: 'var(--color-blue)', '3d': 'var(--color-purple)' }
  const tagLabel = { quadros: '🖼 Molduras', nomes: '✂️ Nomes', '3d': '🖨 3D' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Object.entries(totals).filter(([,v]) => v > 0).map(([type, val]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: tagBg[type], borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: tagColor[type] }}>{tagLabel[type]}</span>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: tagColor[type], fontVariantNumeric: 'tabular-nums' }}>{fmt(val)}</span>
        </div>
      ))}
      {items.length > 0 && (
        <>
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'color-mix(in oklab, var(--color-primary) 10%, var(--color-surface))', border: '1.5px solid color-mix(in oklab, var(--color-primary) 35%, var(--color-border))', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-primary)' }}>Total</span>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{fmt(total)}</span>
          </div>
        </>
      )}
      {!items.length && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>Adicione itens para ver o total</div>
      )}
    </div>
  )
}

/* ══ ProdutoInput — busca produtos cadastrados ou avulso ══ */
function ProdutoInput({ produtos, onAdd }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const sugestoes = useMemo(() => {
    if (!query.trim()) return produtos.slice(0, 8)
    return produtos.filter(p => p.nome.toLowerCase().includes(query.toLowerCase()))
  }, [query, produtos])

  const handleSelect = (p) => {
    onAdd({ produto_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco || 0, avulso: false })
    setQuery(''); setOpen(false)
  }

  const handleAvulso = () => {
    if (!query.trim()) return
    onAdd({ produto_id: null, nome: query.trim(), quantidade: 1, preco_unitario: 0, avulso: true })
    setQuery(''); setOpen(false)
  }

  const semResultado = query.trim().length > 0 && sugestoes.length === 0
  const temSugestoes = sugestoes.length > 0

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-faint)', pointerEvents:'none' }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          className="form-input"
          style={{ paddingLeft: 32 }}
          placeholder="Buscar produto cadastrado ou digitar novo nome…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter') { e.preventDefault(); if (semResultado) handleAvulso(); else if (sugestoes.length === 1) handleSelect(sugestoes[0]) }
          }}
        />
      </div>
      {open && (temSugestoes || semResultado) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          zIndex: 200, maxHeight: 220, overflowY: 'auto'
        }}>
          {temSugestoes && sugestoes.map(p => (
            <div key={p.id}
              style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)' }}
              onMouseDown={() => handleSelect(p)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <span style={{ fontWeight: 500 }}>{p.nome}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{fmtBRL(p.preco)}</span>
            </div>
          ))}
          {semResultado && (
            <div
              style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-primary)', borderTop: temSugestoes ? '1px solid var(--color-divider)' : 'none' }}
              onMouseDown={handleAvulso}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Adicionar <strong style={{ marginLeft: 2 }}>"{query}"</strong> como item avulso
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ══ Modal Nova OS (reutilizado do Ordens.jsx) ══ */
function NovaOSModal({ produtosIniciais, clienteInicial, clienteIdInicial, clientes, todosProdutos, onClose, onSaved }) {
  const blankForm = {
    cliente_id: clienteIdInicial || '',
    clientenome: clienteInicial || '',
    servico: TIPO_OPTS[0],
    valortotal: '',
    valorentrada: '',
    observacoes: '',
    prazoentrega: '',
    prioridade: 'Normal',
    status: 'Aguardando',
    produtos: produtosIniciais || [],
  }

  const [form, setForm]               = useState(blankForm)
  const [saving, setSaving]           = useState(false)
  const [clienteSearch, setClienteSearch] = useState(clienteInicial || '')
  const [clienteOpen, setClienteOpen] = useState(false)
  const clienteRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    const total = (produtosIniciais || []).reduce((acc, p) => acc + (Number(p.quantidade||1) * Number(p.preco_unitario||0)), 0)
    if (total > 0) setForm(f => ({ ...f, valortotal: total.toFixed(2) }))
  }, [])

  useEffect(() => {
    const h = (e) => { if (clienteRef.current && !clienteRef.current.contains(e.target)) setClienteOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const recalcTotal = (prods) => {
    if (!prods || prods.length === 0) { setForm(f => ({ ...f, valortotal: '' })); return }
    const t = prods.reduce((acc, p) => acc + (Number(p.quantidade||1) * Number(p.preco_unitario||0)), 0)
    setForm(f => ({ ...f, valortotal: t.toFixed(2) }))
  }

  const addProduto = (prod) => {
    const novos = [...(form.produtos||[]), { ...prod }]
    set('produtos', novos); recalcTotal(novos)
  }

  const removeProduto = (idx) => {
    const novos = form.produtos.filter((_,i) => i !== idx)
    set('produtos', novos); recalcTotal(novos)
  }

  const updateProd = (idx, campo, valor) => {
    const novos = form.produtos.map((p,i) => i===idx ? {...p, [campo]: valor} : p)
    set('produtos', novos); recalcTotal(novos)
  }

  const handleSave = async () => {
    if (!form.cliente_id && !form.clientenome.trim()) { toast.error('Selecione um cliente'); return }
    if (!form.valortotal) { toast.error('Valor total é obrigatório'); return }
    const total   = Number(form.valortotal)
    const entrada = form.valorentrada === '' ? 0 : Number(form.valorentrada)
    if (isNaN(total) || total < 0) { toast.error('Valor total inválido'); return }
    if (isNaN(entrada) || entrada < 0) { toast.error('Entrada inválida'); return }
    if (entrada > total) { toast.error('Entrada não pode ser maior que o total'); return }
    setSaving(true)
    try {
      await api.post('/ordens', {
        cliente_id:   form.cliente_id || null,
        clientenome:  form.clientenome,
        servico:      form.servico,
        descricao:    '',
        observacoes:  form.observacoes,
        prazoentrega: form.prazoentrega || null,
        prioridade:   form.prioridade,
        status:       form.status,
        valortotal:   total,
        valorentrada: entrada,
        produtos:     form.produtos,
      })
      toast.success('Ordem de serviço criada!')
      onSaved()
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar OS')
    } finally { setSaving(false) }
  }

  const total        = Number(form.valortotal)  || 0
  const entrada      = Number(form.valorentrada) || 0
  const restantePrev = total - entrada

  const cliFiltered = useMemo(() =>
    clientes.filter(c => !clienteSearch || (c.name||c.nome||'').toLowerCase().includes(clienteSearch.toLowerCase())).slice(0,10)
  , [clientes, clienteSearch])

  const produtosSugestoes = useMemo(() =>
    todosProdutos.filter(p => !(form.produtos||[]).find(fp => fp.produto_id && fp.produto_id === p.id))
  , [todosProdutos, form.produtos])

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:640, maxHeight:'92vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ position:'sticky', top:0, background:'var(--color-surface)', zIndex:1, borderBottom:'1px solid var(--color-divider)' }}>
          <h2 className="modal-title">Nova Ordem de Serviço</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn:'1/-1', position:'relative' }} ref={clienteRef}>
              <label className="form-label">Cliente <span style={{color:'var(--color-error)'}}>*</span></label>
              <input
                className="form-input"
                placeholder="Digite para buscar cliente…"
                value={clienteSearch}
                onChange={e => { setClienteSearch(e.target.value); set('cliente_id',''); set('clientenome', e.target.value); setClienteOpen(true) }}
                onFocus={() => setClienteOpen(true)}
              />
              {clienteOpen && cliFiltered.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', boxShadow:'var(--shadow-md)', zIndex:100, maxHeight:200, overflowY:'auto' }}>
                  {cliFiltered.map(c => (
                    <div key={c.id} style={{ padding:'var(--space-2) var(--space-3)', cursor:'pointer', fontSize:'var(--text-sm)' }}
                      onMouseDown={() => { set('cliente_id', c.id); set('clientenome', c.name||c.nome); setClienteSearch(c.name||c.nome); setClienteOpen(false) }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--color-surface-offset)'}
                      onMouseLeave={e => e.currentTarget.style.background=''}>
                      <span style={{ fontWeight:600 }}>{c.name||c.nome}</span>
                      {(c.phone||c.telefone) && <span style={{ marginLeft:8, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{c.phone||c.telefone}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de Serviço</label>
              <select className="form-input" value={form.servico} onChange={e=>set('servico',e.target.value)}>
                {TIPO_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-input" value={form.prioridade} onChange={e=>set('prioridade',e.target.value)}>
                {PRIORIDADE_OPTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Produtos</label>
              <ProdutoInput produtos={produtosSugestoes} onAdd={addProduto} />
              {form.produtos && form.produtos.length > 0 && (
                <div style={{ marginTop:'var(--space-2)', display:'flex', flexDirection:'column', gap:'var(--space-1)' }}>
                  {form.produtos.map((p, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', padding:'var(--space-2) var(--space-3)', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', fontSize:'var(--text-xs)' }}>
                      <span style={{ flex:1, fontWeight:500, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p.nome}
                        {p.avulso && <span style={{ marginLeft:6, fontSize:9, color:'var(--color-text-faint)', fontWeight:400, background:'var(--color-surface-dynamic)', borderRadius:'var(--radius-full)', padding:'1px 5px' }}>avulso</span>}
                      </span>
                      <input type="number" step="0.01" min="0" className="form-input"
                        style={{ width:90, fontFamily:'monospace', textAlign:'right', fontSize:'var(--text-xs)', padding:'2px 6px' }}
                        placeholder="R$ 0,00"
                        value={p.preco_unitario || ''}
                        onChange={e => updateProd(i, 'preco_unitario', parseFloat(e.target.value)||0)}
                        onWheel={e => e.currentTarget.blur()}
                        title="Preço unitário"
                      />
                      <input type="number" min="1" className="form-input"
                        style={{ width:52, textAlign:'center', fontSize:'var(--text-xs)', padding:'2px 4px' }}
                        value={p.quantidade}
                        onChange={e => updateProd(i, 'quantidade', Number(e.target.value)||1)}
                        onWheel={e => e.currentTarget.blur()}
                        title="Quantidade"
                      />
                      <span style={{ fontFamily:'monospace', color:'var(--color-text-muted)', minWidth:72, textAlign:'right', fontWeight:600 }}>
                        {(Number(p.quantidade) * Number(p.preco_unitario||0)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                      </span>
                      <button className="btn btn-ghost btn-xs" style={{ color:'var(--color-error)', padding:2, flexShrink:0 }} onClick={() => removeProduto(i)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Observações internas</label>
              <textarea className="form-input" rows={2} value={form.observacoes} onChange={e=>set('observacoes',e.target.value)} placeholder="Notas para a equipe da oficina…" />
            </div>

            <div className="form-group">
              <label className="form-label">Prazo de Entrega</label>
              <input className="form-input" type="date" value={form.prazoentrega} onChange={e=>set('prazoentrega',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={e=>set('status',e.target.value)}>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                Valor Total (R$) <span style={{color:'var(--color-error)'}}>*</span>
                <span style={{marginLeft:6,fontSize:'var(--text-xs)',color:'var(--color-text-muted)',fontWeight:400}}>— calculado pelos produtos, editável</span>
              </label>
              <input className="form-input" type="number" step="0.01" min="0"
                value={form.valortotal} onChange={e=>set('valortotal',e.target.value)}
                onWheel={e=>e.currentTarget.blur()} style={{ fontFamily:'monospace', fontWeight:700 }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Entrada (R$)
                <span style={{marginLeft:6,fontSize:'var(--text-xs)',color:'var(--color-text-muted)',fontWeight:400}}>opcional</span>
              </label>
              <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00 (sem entrada)"
                value={form.valorentrada} onChange={e=>set('valorentrada',e.target.value)} onWheel={e=>e.currentTarget.blur()}/>
            </div>
          </div>

          {total > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'var(--space-3) var(--space-4)',
              background: restantePrev > 0 ? 'var(--color-warning-highlight)' : 'var(--color-primary-highlight)',
              borderRadius:'var(--radius-md)', fontSize:'var(--text-xs)', marginTop:'var(--space-3)'
            }}>
              <span style={{color:'var(--color-text-muted)'}}>Restante a receber após entrada:</span>
              <strong style={{fontFamily:'monospace',color: restantePrev > 0 ? 'var(--color-warning)' : 'var(--color-success)'}}>{fmtBRL(restantePrev)}</strong>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ position:'sticky', bottom:0, background:'var(--color-surface)', borderTop:'1px solid var(--color-divider)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Criar OS'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function Orcamento() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [items, setItems]                     = useState([])
  const [cliente, setCliente]                 = useState('')
  const [clientes, setClientes]               = useState([])
  const [todosProdutos, setTodosProdutos]     = useState([])
  const [clienteId, setClienteId]             = useState(null)
  const [showClienteList, setShowClienteList] = useState(false)
  const [showConfirm, setShowConfirm]         = useState(false)
  const [showNovaOS, setShowNovaOS]           = useState(false)
  const [activeTab, setActiveTab]             = useState('quadros')
  const [precos, setPrecos]                   = useState({ moldura: 60, nomes: 35, trid: 80 })
  const clienteRef = useRef(null)

  useEffect(() => {
    api.get('/clientes').then(r => setClientes(r.data)).catch(() => {})
    api.get('/produtos').then(r => setTodosProdutos(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    function handleMouseDown(e) {
      if (clienteRef.current && !clienteRef.current.contains(e.target)) {
        setShowClienteList(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const addItem    = useCallback((item) => setItems(prev => [...prev, item]), [])
  const removeItem = useCallback((idx)  => setItems(prev => prev.filter((_, i) => i !== idx)), [])

  // Converte itens do orçamento em produtos avulsos para o modal de OS
  const produtosParaOS = useMemo(() =>
    items.map(it => ({
      produto_id: null,
      nome: it.name + (it.sub ? ` (${it.sub})` : ''),
      quantidade: 1,
      preco_unitario: it.price,
      avulso: true,
    }))
  , [items])

  const TAB_OPTS = [
    { id: 'quadros', label: '🖼 Molduras' },
    { id: 'nomes',   label: '✂️ Nomes'   },
    { id: '3d',      label: '🖨 3D'      },
  ]

  const filteredClientes = clientes.filter(c =>
    cliente.length >= 1 &&
    (c.nome || c.name) != null &&
    (c.nome || c.name).toLowerCase().includes(cliente.toLowerCase())
  )

  return (
    <div className="page-content">
      {showConfirm && (
        <ConfirmDialog
          message="Todos os itens serão removidos."
          onConfirm={() => { setItems([]); setShowConfirm(false) }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {showNovaOS && (
        <NovaOSModal
          produtosIniciais={produtosParaOS}
          clienteInicial={cliente}
          clienteIdInicial={clienteId}
          clientes={clientes}
          todosProdutos={todosProdutos}
          onClose={() => setShowNovaOS(false)}
          onSaved={() => {
            setShowNovaOS(false)
            setItems([])
            setCliente('')
            setClienteId(null)
            navigate('/ordens')
          }}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Orçamento</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 2 }}>Monte itens e calcule o preço final</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {items.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowConfirm(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
              Limpar
            </button>
          )}
          {items.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowNovaOS(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Criar OS
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 12, alignItems: 'start' }}>

        {/* COLUNA ESQUERDA — tabs + módulo ativo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 4, padding: '4px', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            {TAB_OPTS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                flex: 1, padding: '7px 0', borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
                background: activeTab === t.id ? 'var(--color-surface)' : 'transparent',
                color:      activeTab === t.id ? 'var(--color-text)' : 'var(--color-text-muted)',
                boxShadow:  activeTab === t.id ? 'var(--shadow-sm)' : 'none',
                border: 'none', transition: 'all 150ms',
              }}>{t.label}</button>
            ))}
          </div>
          {activeTab === 'quadros' && <ModuloQuadros onAdd={addItem} precos={precos} setPrecos={setPrecos} />}
          {activeTab === 'nomes'   && <ModuloNomes   onAdd={addItem} precos={precos} setPrecos={setPrecos} />}
          {activeTab === '3d'      && <Modulo3D      onAdd={addItem} precos={precos} setPrecos={setPrecos} />}
        </div>

        {/* COLUNA DIREITA — cliente + itens + resumo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Card Cliente */}
          <div className="card card-pad" style={{ position: 'relative', padding: '12px 14px' }} ref={clienteRef}>
            <SectionLabel>Cliente</SectionLabel>
            <input
              type="text"
              value={cliente}
              onChange={e => { setCliente(e.target.value); setClienteId(null); setShowClienteList(true) }}
              onFocus={() => setShowClienteList(true)}
              placeholder="Nome do cliente (opcional)"
              className="form-input"
              style={{ marginTop: 4 }}
              autoComplete="off"
            />
            {showClienteList && filteredClientes.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
                maxHeight: 200, overflowY: 'auto', marginTop: 2,
              }}>
                {filteredClientes.map(c => (
                  <div
                    key={c.id}
                    onMouseDown={e => {
                      e.preventDefault()
                      const nome = c.nome || c.name
                      setCliente(nome)
                      setClienteId(c.id)
                      setShowClienteList(false)
                    }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--color-divider)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 600 }}>{c.nome || c.name}</span>
                    {(c.telefone || c.phone) && <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>{c.telefone || c.phone}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card Itens da OS */}
          <div className="card card-pad" style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 10 }}>
              Itens da OS
              {items.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--color-primary-hl)', color: 'var(--color-primary)', padding: '1px 7px', borderRadius: 'var(--radius-full)' }}>{items.length}</span>
              )}
            </div>
            <ItemList items={items} onRemove={removeItem} />
          </div>

          {/* Card Resumo */}
          {items.length > 0 && (
            <div className="card card-pad" style={{ padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 10 }}>Resumo</div>
              <TotalsPanel items={items} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
