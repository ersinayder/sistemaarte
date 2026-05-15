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

const EVENTO_LABEL = {
  autorizacao: 'Autorizacao',
  rejeicao: 'Rejeicao',
  cce: 'Carta de Correcao',
  cancelamento: 'Cancelamento',
}

const HOMOLOGACAO_ALVO = 10

async function baixarArquivo(url, nomeArquivo) {
  const r = await api.get(url, { responseType: 'blob', timeout: 45000 })
  const href = URL.createObjectURL(r.data)
  const a = document.createElement('a')
  a.href = href
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
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
    // limit=200 garante que todas as OSs sejam retornadas independente da paginação padrão
    api.get('/ordens?limit=200').then(r => {
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
      await api.post(`/nfe/emitir/${ordemSel.id}`, null, { timeout: 45000 })
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
          ) : filtradas.map(o => (
            <div
              key={o.id}
              onClick={() => setOrdemSel(o)}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                marginBottom: 'var(--space-1)',
                cursor: 'pointer',
                background: ordemSel?.id === o.id ? 'var(--color-primary-highlight)' : 'transparent',
                border: ordemSel?.id === o.id ? '1px solid var(--color-primary)' : '1px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'background var(--transition-interactive)',
              }}
              onMouseEnter={e => { if (ordemSel?.id !== o.id) e.currentTarget.style.background = 'var(--color-surface-offset)' }}
              onMouseLeave={e => { if (ordemSel?.id !== o.id) e.currentTarget.style.background = 'transparent' }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                  {o.numero} — {o.clientenome}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {o.servico} • {fmt(o.valor_total)}
                </div>
              </div>
              <span style={{
                fontSize: 'var(--text-xs)', fontWeight: 700,
                padding: '2px 8px', borderRadius: 'var(--radius-full)',
                background: o.status === 'Entregue' ? 'var(--color-primary-highlight)' : 'var(--color-surface-dynamic)',
                color: o.status === 'Entregue' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}>{o.status}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--color-divider)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={emitindo}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleEmitir} disabled={!ordemSel || emitindo}>
            {emitindo ? (
              <><div className="spinner" style={{ width: 14, height: 14, marginRight: 6 }}/>Emitindo…</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Emitir NF-e</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NotasFiscais() {
  const [notas, setNotas]             = useState([])
  const [meta, setMeta]               = useState({})
  const [loading, setLoading]         = useState(true)
  const [modalEmitir, setModalEmitir] = useState(false)
  const [filtro, setFiltro]           = useState('todas')
  const [busca, setBusca]             = useState('')
  const [modalCCe, setModalCCe]       = useState(null)
  const [modalCanc, setModalCanc]     = useState(null)
  const [modalEventos, setModalEventos] = useState(null)
  const [processando, setProcessando] = useState({})

  const carregar = useCallback(async () => {
    try {
      const r = await api.get('/nfe')
      setNotas(r.data?.notas || [])
      setMeta(r.data?.meta || {})
    } catch {
      toast.error('Erro ao carregar notas fiscais')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const notasFiltradas = notas.filter(n => {
    const matchFiltro = filtro === 'todas' || n.nfe_status === filtro
    const matchBusca = !busca.trim() || [n.nfe_numero, n.os_numero, n.clientenome, n.nfe_chave]
      .some(v => v?.toLowerCase().includes(busca.toLowerCase()))
    return matchFiltro && matchBusca
  })

  const homologPct = meta.homologacao
    ? Math.min(100, Math.round((meta.homologacao / HOMOLOGACAO_ALVO) * 100))
    : 0

  const setProc = (id, val) => setProcessando(p => ({ ...p, [id]: val }))

  const handleCancelar = async (nota, justificativa) => {
    setProc(nota.id, 'cancelando')
    try {
      await api.post(`/nfe/cancelar/${nota.id}`, { justificativa }, { timeout: 60000 })
      toast.success('NF-e cancelada com sucesso')
      carregar()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao cancelar NF-e')
    } finally {
      setProc(nota.id, null)
      setModalCanc(null)
    }
  }

  const handleCCe = async (nota, xCorrecao) => {
    setProc(nota.id, 'cce')
    try {
      await api.post(`/nfe/cce/${nota.id}`, { xCorrecao }, { timeout: 45000 })
      toast.success('CC-e enviada com sucesso')
      carregar()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao enviar CC-e')
    } finally {
      setProc(nota.id, null)
      setModalCCe(null)
    }
  }

  const handleReemitir = async (nota) => {
    setProc(nota.id, 'reemitindo')
    try {
      await api.post(`/nfe/reemitir/${nota.id}`, null, { timeout: 45000 })
      toast.success('NF-e reemitida com sucesso')
      carregar()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao reemitir NF-e')
    } finally {
      setProc(nota.id, null)
    }
  }

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 'var(--content-wide)', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, margin: 0 }}>Notas Fiscais</h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            {notas.length} nota{notas.length !== 1 ? 's' : ''} • {meta.autorizadas || 0} autorizada{(meta.autorizadas || 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalEmitir(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          Emitir NF-e
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        {[
          { label: 'Total emitidas', value: meta.total || 0 },
          { label: 'Autorizadas', value: meta.autorizadas || 0 },
          { label: 'Rejeitadas', value: meta.rejeitadas || 0, warn: (meta.rejeitadas || 0) > 0 },
          { label: 'Canceladas', value: meta.canceladas || 0 },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: k.warn ? 'var(--color-error)' : 'var(--color-text)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Barra de homologação */}
      {meta.homologacao !== undefined && meta.homologacao < HOMOLOGACAO_ALVO && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>HOMOLOGACAO NF-E</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{meta.homologacao}/{HOMOLOGACAO_ALVO} notas autorizadas em homologacao</span>
          </div>
          <div style={{ height: 6, background: 'var(--color-surface-dynamic)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${homologPct}%`, background: 'var(--color-primary)', borderRadius: 'var(--radius-full)', transition: 'width 0.6s ease' }}/>
          </div>
          <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Ambiente atual: homologacao
          </div>
        </div>
      )}

      {/* Filtros + busca */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar OS, cliente, NF-e…"
            style={{ width: '100%', padding: '8px 12px 8px 34px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}
          />
        </div>
        {['todas', 'autorizado', 'rejeitado', 'cancelado', 'emitindo'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`btn btn-sm ${filtro === f ? 'btn-primary' : 'btn-secondary'}`}
            style={{ textTransform: 'capitalize' }}>
            {f === 'todas' ? 'Todas' : BADGE[f]?.label || f}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={carregar} title="Atualizar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto var(--space-3)' }}/>Carregando…
          </div>
        ) : notasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ margin: '0 auto var(--space-3)', display: 'block', opacity: 0.4 }}>
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
            Nenhuma nota fiscal encontrada
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-offset)', borderBottom: '1px solid var(--color-divider)' }}>
                  {['NF-e', 'OS', 'Cliente', 'Valor', 'Emissão', 'Status', 'Ações'].map(h => (
                    <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notasFiltradas.map((n, i) => (
                  <tr key={n.id} style={{ borderBottom: i < notasFiltradas.length - 1 ? '1px solid var(--color-divider)' : 'none' }}>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {n.nfe_numero ? `${n.nfe_numero}/1` : '—'}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)' }}>
                      <a href={`/oficina/${n.os_id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>{n.os_numero}</a>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', maxWidth: 200 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{n.clientenome || '—'}</span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmt(n.valor_total)}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {fmtDate(n.nfe_emitida_em)}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', whiteSpace: 'nowrap' }}>
                      <StatusBadge status={n.nfe_status} />
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        {/* CC-e */}
                        {n.nfe_status === 'autorizado' && (
                          <button className="btn btn-xs btn-secondary" onClick={() => setModalCCe(n)} disabled={!!processando[n.id]} title="Carta de Correção">CC-e</button>
                        )}
                        {/* XML */}
                        {n.nfe_chave && (
                          <button className="btn btn-xs btn-ghost" onClick={() => baixarArquivo(`/nfe/xml/${n.id}`, `${n.nfe_chave}-nfe.xml`)} title="Baixar XML">XML</button>
                        )}
                        {/* DANFE */}
                        {n.nfe_status === 'autorizado' && (
                          <button className="btn btn-xs btn-ghost" onClick={() => baixarArquivo(`/nfe/danfe/${n.id}`, `${n.nfe_numero}-danfe.pdf`)} title="Baixar DANFE">DANFE</button>
                        )}
                        {/* Cancelar */}
                        {n.nfe_status === 'autorizado' && (
                          <button className="btn btn-xs btn-danger" onClick={() => setModalCanc(n)} disabled={!!processando[n.id]} title="Cancelar NF-e">Cancelar</button>
                        )}
                        {/* Reemitir */}
                        {['rejeitado', null, undefined].includes(n.nfe_status) && n.os_id && (
                          <button className="btn btn-xs btn-secondary" onClick={() => handleReemitir(n)} disabled={!!processando[n.id]} title="Reemitir">
                            {processando[n.id] === 'reemitindo' ? 'Reemitindo…' : 'Reemitir'}
                          </button>
                        )}
                        {/* Eventos */}
                        <button className="btn btn-icon btn-ghost btn-xs" onClick={() => setModalEventos(n)} title="Ver eventos">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Emitir */}
      {modalEmitir && <ModalEmitir onClose={() => setModalEmitir(false)} onSuccess={carregar} />}

      {/* Modal CC-e */}
      {modalCCe && <ModalCCe nota={modalCCe} onClose={() => setModalCCe(null)} onConfirm={handleCCe} loading={!!processando[modalCCe.id]} />}

      {/* Modal Cancelamento */}
      {modalCanc && <ModalCancelamento nota={modalCanc} onClose={() => setModalCanc(null)} onConfirm={handleCancelar} loading={!!processando[modalCanc.id]} />}

      {/* Modal Eventos */}
      {modalEventos && <ModalEventos nota={modalEventos} onClose={() => setModalEventos(null)} />}
    </div>
  )
}

function ModalCCe({ nota, onClose, onConfirm, loading }) {
  const [xCorrecao, setXCorrecao] = useState('')
  const min = 15, max = 1000
  const valido = xCorrecao.trim().length >= min

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'oklch(from var(--color-text) l c h / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', padding: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 4 }}>Carta de Correção</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
          NF-e {nota.nfe_numero} — {nota.clientenome}
        </p>
        <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 6 }}>Texto da Correção</label>
        <textarea value={xCorrecao} onChange={e => setXCorrecao(e.target.value)} rows={5} maxLength={max}
          placeholder="Descreva a correção (mínimo 15 caracteres)…"
          style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', fontSize: 'var(--text-sm)', resize: 'vertical', color: 'var(--color-text)' }}
        />
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', textAlign: 'right' }}>{xCorrecao.length}/{max}</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(nota, xCorrecao.trim())} disabled={!valido || loading}>
            {loading ? 'Enviando…' : 'Enviar CC-e'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalCancelamento({ nota, onClose, onConfirm, loading }) {
  const [justificativa, setJustificativa] = useState('')
  const min = 15
  const valido = justificativa.trim().length >= min

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'oklch(from var(--color-text) l c h / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', padding: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 4, color: 'var(--color-error)' }}>Cancelar NF-e</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
          NF-e {nota.nfe_numero} — {nota.clientenome}
        </p>
        <div style={{ background: 'var(--color-error-highlight)', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>
          ⚠️ Esta ação não pode ser desfeita. O cancelamento só é permitido em até 24h após a emissão.
        </div>
        <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 6 }}>Justificativa</label>
        <textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} rows={3}
          placeholder="Motivo do cancelamento (mínimo 15 caracteres)…"
          style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', fontSize: 'var(--text-sm)', resize: 'vertical', color: 'var(--color-text)' }}
        />
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Voltar</button>
          <button className="btn btn-danger" onClick={() => onConfirm(nota, justificativa.trim())} disabled={!valido || loading}>
            {loading ? 'Cancelando…' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalEventos({ nota, onClose }) {
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/nfe/eventos/${nota.id}`)
      .then(r => setEventos(r.data || []))
      .catch(() => toast.error('Erro ao carregar eventos'))
      .finally(() => setLoading(false))
  }, [nota.id])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'oklch(from var(--color-text) l c h / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 600, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>Histórico de Eventos</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>NF-e {nota.nfe_numero} — {nota.clientenome}</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-6)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto var(--space-3)' }}/>Carregando…
            </div>
          ) : eventos.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-8)' }}>Nenhum evento registrado</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {eventos.map((ev, i) => (
                <div key={i} style={{ background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{EVENTO_LABEL[ev.tipo] || ev.tipo}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{fmtDate(ev.criado_em)}</span>
                  </div>
                  {ev.xMotivo && <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{ev.xMotivo}</p>}
                  {ev.nProt && <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', fontFamily: 'monospace' }}>Protocolo: {ev.nProt}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
