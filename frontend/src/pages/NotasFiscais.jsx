import React, { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d) ? s : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const BADGE = {
  autorizado: { bg: 'var(--color-success)', text: '#fff', label: 'Autorizado' },
  rejeitado:  { bg: 'var(--color-error)',   text: '#fff', label: 'Rejeitado'  },
  emitindo:   { bg: 'var(--color-gold)',    text: '#fff', label: 'Emitindo…'  },
  cancelado:  { bg: 'var(--color-text-muted)', text: '#fff', label: 'Cancelado' },
}

function StatusBadge({ status }) {
  const cfg = BADGE[status] || { bg: 'var(--color-surface-offset)', text: 'var(--color-text-muted)', label: status || '—' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-xs)', fontWeight: 700,
      background: cfg.bg, color: cfg.text,
    }}>{cfg.label}</span>
  )
}

function ModalEmitir({ onClose, onSuccess }) {
  const [ordens, setOrdens]       = useState([])
  const [loadingOS, setLoadingOS] = useState(true)
  const [q, setQ]                 = useState('')
  const [ordemSel, setOrdemSel]   = useState(null)
  const [emitindo, setEmitindo]   = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    api.get('/ordens').then(r => {
      const lista = (r.data?.ordens || r.data || []).filter(
        o => ['Pronto', 'Entregue'].includes(o.status) && o.nfe_status !== 'autorizado'
      )
      setOrdens(lista)
    }).catch(() => toast.error('Erro ao carregar ordens'))
      .finally(() => setLoadingOS(false))
  }, [])

  const filtradas = q.trim()
    ? ordens.filter(o =>
        o.numero?.toLowerCase().includes(q.toLowerCase()) ||
        o.clientenome?.toLowerCase().includes(q.toLowerCase()) ||
        o.servico?.toLowerCase().includes(q.toLowerCase())
      )
    : ordens

  const handleEmitir = async () => {
    if (!ordemSel) return
    setEmitindo(true)
    try {
      await api.post(`/nfe/emitir/${ordemSel.id}`)
      toast.success(`NF-e emitida com sucesso para ${ordemSel.numero}!`)
      onSuccess()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao emitir NF-e')
    } finally {
      setEmitindo(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'oklch(from var(--color-text) l c h / 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 580,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '80vh', overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>Emitir NF-e</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Selecione uma OS com status Pronto ou Entregue</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-divider)' }}>
          <div style={{ position: 'relative' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input ref={inputRef} type="text" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar por OS, cliente ou serviço…"
              style={{ width: '100%', padding: '8px 12px 8px 34px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-4)' }}>
          {loadingOS ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto var(--space-3)' }}/>Carregando ordens…
            </div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ margin: '0 auto var(--space-3)', display: 'block', opacity: 0.4 }}>
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
              </svg>
              {q ? 'Nenhuma OS encontrada' : 'Nenhuma OS elegível para emissão'}
            </div>
          ) : (
            filtradas.map(o => {
              const sel = ordemSel?.id === o.id
              return (
                <button key={o.id} onClick={() => setOrdemSel(sel ? null : o)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-2)',
                    borderRadius: 'var(--radius-lg)',
                    border: `2px solid ${sel ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: sel ? 'var(--color-primary-highlight)' : 'var(--color-surface-offset)',
                    cursor: 'pointer', transition: 'all var(--transition-interactive)',
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-2)', alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{o.numero} — {o.clientenome}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{o.servico} · {fmt(o.valortotal)}</div>
                    {o.itens_resumo && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.itens_resumo}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: o.status === 'Pronto' ? 'var(--color-primary-highlight)' : 'var(--color-success-highlight)', color: o.status === 'Pronto' ? 'var(--color-primary)' : 'var(--color-success)' }}>{o.status}</span>
                    {sel && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {ordemSel && (
          <div style={{ margin: 'var(--space-2) var(--space-4)', padding: 'var(--space-3) var(--space-4)', background: 'var(--color-primary-highlight)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-primary)', fontSize: 'var(--text-xs)' }}>
            <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: 4 }}>OS selecionada</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
              <span><b>OS:</b> {ordemSel.numero}</span>
              <span><b>Cliente:</b> {ordemSel.clientenome}</span>
              <span><b>Serviço:</b> {ordemSel.servico}</span>
              <span><b>Total:</b> {fmt(ordemSel.valortotal)}</span>
            </div>
          </div>
        )}

        <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--color-divider)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={emitindo}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleEmitir} disabled={!ordemSel || emitindo} style={{ minWidth: 140 }}>
            {emitindo
              ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}/> Emitindo…</>
              : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Emitir NF-e</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalDetalhe({ nfe, onClose }) {
  if (!nfe) return null
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'oklch(from var(--color-text) l c h / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>NF-e Nº {nfe.nfe_numero}</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Série {nfe.nfe_serie}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <StatusBadge status={nfe.nfe_status} />
            <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {[
              ['OS',          nfe.numero || '—'],
              ['Cliente',     nfe.clientenome || '—'],
              ['Serviço',     nfe.servico || '—'],
              ['Valor Total', fmt(nfe.valortotal)],
              ['Emitida em',  fmtDate(nfe.nfe_emitida_em)],
              ['Protocolo',   nfe.nfe_protocolo || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-divider)', gap: 'var(--space-4)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 'var(--text-sm)', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
              </div>
            ))}
            {nfe.nfe_chave && (
              <div style={{ paddingTop: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4 }}>Chave de Acesso</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', background: 'var(--color-surface-offset)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', wordBreak: 'break-all', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{nfe.nfe_chave}</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

export default function NotasFiscais() {
  const [notas, setNotas]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [modalEmitir, setModalEmitir] = useState(false)
  const [detalhe, setDetalhe]         = useState(null)
  const [q, setQ]                     = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/ordens')
      const todas = (r.data?.ordens || r.data || [])
      setNotas(todas.filter(o => o.nfe_status))
    } catch {
      toast.error('Erro ao carregar notas fiscais')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtradas = notas.filter(n => {
    const matchQ = !q.trim() ||
      n.numero?.toLowerCase().includes(q.toLowerCase()) ||
      n.clientenome?.toLowerCase().includes(q.toLowerCase()) ||
      n.nfe_numero?.toLowerCase().includes(q.toLowerCase()) ||
      n.nfe_chave?.toLowerCase().includes(q.toLowerCase())
    return matchQ && (filtroStatus === 'todos' || n.nfe_status === filtroStatus)
  })

  const totais = {
    total:      notas.length,
    autorizado: notas.filter(n => n.nfe_status === 'autorizado').length,
    rejeitado:  notas.filter(n => n.nfe_status === 'rejeitado').length,
    emitindo:   notas.filter(n => n.nfe_status === 'emitindo').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800 }}>Notas Fiscais</h1>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {totais.total} nota{totais.total !== 1 ? 's' : ''} · {totais.autorizado} autorizada{totais.autorizado !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalEmitir(true)} style={{ gap: 'var(--space-2)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          Emitir NF-e
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
        {[
          { label: 'Total emitidas', value: totais.total,      color: 'var(--color-text)' },
          { label: 'Autorizadas',    value: totais.autorizado, color: 'var(--color-success)' },
          { label: 'Rejeitadas',     value: totais.rejeitado,  color: 'var(--color-error)' },
          { label: 'Em andamento',   value: totais.emitindo,   color: 'var(--color-gold)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar OS, cliente, NF-e…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}
          />
        </div>
        {['todos', 'autorizado', 'rejeitado', 'emitindo'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: `1px solid ${filtroStatus === s ? 'var(--color-primary)' : 'var(--color-border)'}`, background: filtroStatus === s ? 'var(--color-primary)' : 'var(--color-surface)', color: filtroStatus === s ? '#fff' : 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', transition: 'all var(--transition-interactive)' }}
          >
            {{ todos: 'Todos', autorizado: 'Autorizadas', rejeitado: 'Rejeitadas', emitindo: 'Em andamento' }[s]}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={carregar} title="Atualizar" style={{ marginLeft: 'auto' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
            <div className="spinner"/>Carregando notas fiscais…
          </div>
        ) : filtradas.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.35 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{notas.length === 0 ? 'Nenhuma NF-e emitida ainda' : 'Nenhum resultado'}</div>
              <div style={{ fontSize: 'var(--text-xs)' }}>{notas.length === 0 ? 'Clique em "Emitir NF-e" para emitir a primeira nota.' : 'Tente ajustar os filtros.'}</div>
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-divider)' }}>
                {['NF-e', 'OS', 'Cliente', 'Serviço', 'Valor', 'Emitida em', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', background: 'var(--color-surface-offset)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((n, i) => (
                <tr key={n.id}
                  style={{ borderBottom: '1px solid var(--color-divider)', background: i % 2 === 0 ? 'transparent' : 'oklch(from var(--color-surface-offset) l c h / 0.5)', transition: 'background var(--transition-interactive)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'oklch(from var(--color-surface-offset) l c h / 0.5)'}
                >
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{n.nfe_numero ? `${n.nfe_numero}/${n.nfe_serie}` : '—'}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-primary)' }}>{n.numero}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)' }}>{n.clientenome}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.servico}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(n.valortotal)}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(n.nfe_emitida_em)}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}><StatusBadge status={n.nfe_status} /></td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetalhe(n)} title="Ver detalhes">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalEmitir && <ModalEmitir onClose={() => setModalEmitir(false)} onSuccess={carregar} />}
      {detalhe && <ModalDetalhe nfe={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  )
}
