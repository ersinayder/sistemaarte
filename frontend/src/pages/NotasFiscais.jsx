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
const STATUS_NFE_EMISSAO = ['Aguardando', 'Pronto', 'Entregue']

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

function abrirDanfe(chave) {
  if (!chave) {
    toast.error('Chave da NF-e indisponivel')
    return
  }
  window.open(`/api/nfe/${chave}/danfe`, '_blank', 'noopener,noreferrer')
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
        o => STATUS_NFE_EMISSAO.includes(o.status) && o.nfe_status !== 'autorizado'
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
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Selecione uma OS com status Aguardando, Pronto ou Entregue</p>
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
                    <span style={{
                      fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                      background: o.status === 'Aguardando' ? 'var(--color-warning-highlight, var(--color-surface-offset))' : o.status === 'Pronto' ? 'var(--color-primary-highlight)' : 'var(--color-success-highlight)',
                      color: o.status === 'Aguardando' ? 'var(--color-warning)' : o.status === 'Pronto' ? 'var(--color-primary)' : 'var(--color-success)'
                    }}>{o.status}</span>
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
              : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Emitir NF-e</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalDetalhe({ nfe, onClose }) {
  const [eventos, setEventos] = useState([])
  const [loadingEventos, setLoadingEventos] = useState(false)

  useEffect(() => {
    if (!nfe?.nfe_chave && !nfe?.id) {
      setEventos([])
      return
    }

    let alive = true
    setLoadingEventos(true)
    const eventosUrl = nfe.nfe_chave ? `/nfe/${nfe.nfe_chave}/eventos` : `/nfe/ordem/${nfe.id}/eventos`
    api.get(eventosUrl)
      .then(r => { if (alive) setEventos(r.data?.eventos || []) })
      .catch(() => { if (alive) toast.error('Erro ao carregar eventos da NF-e') })
      .finally(() => { if (alive) setLoadingEventos(false) })
    return () => { alive = false }
  }, [nfe?.id, nfe?.nfe_chave])

  if (!nfe) return null

  const baixarXmlAutorizacao = async () => {
    try {
      await baixarArquivo(`/nfe/${nfe.nfe_chave}/xml/autorizacao`, `${nfe.nfe_chave}.xml`)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'XML de autorizacao indisponivel')
    }
  }

  const baixarXmlEvento = async (evento) => {
    try {
      const sufixo = evento.tipo === 'cce'
        ? `cce-${String(evento.nseqevento || 1).padStart(2, '0')}`
        : evento.tipo
      await baixarArquivo(`/nfe/eventos/${evento.id}/xml`, `${evento.chave}-${sufixo}.xml`)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'XML do evento indisponivel')
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'oklch(from var(--color-text) l c h / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 680, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>NF-e Nº {nfe.nfe_numero || '—'}</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Série {nfe.nfe_serie || '—'}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <StatusBadge status={nfe.nfe_status} />
            <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div style={{ padding: 'var(--space-5) var(--space-6)', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {[
              ['OS',          nfe.numero || '—'],
              ['Cliente',     nfe.clientenome || '—'],
              ['Serviço',     nfe.servico || '—'],
              ['Valor Total', fmt(nfe.valortotal)],
              ['Emitida em',  fmtDate(nfe.nfe_emitida_em)],
              ['Protocolo',   nfe.nfe_protocolo || '—'],
              ['Motivo rejeicao', nfe.nfe_rejeicao_motivo || '—'],
              ['CC-e emitidas', nfe.nfe_cce_count || 0],
              ['Ultima CC-e', fmtDate(nfe.nfe_cce_ultima_em)],
              ['Cancelada em', fmtDate(nfe.nfe_cancelado_em)],
              ['Protocolo cancelamento', nfe.nfe_cancel_protocolo || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-divider)', gap: 'var(--space-4)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 'var(--text-sm)', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
              </div>
            ))}
            {nfe.nfe_chave && (
              <div style={{ paddingTop: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4 }}>Chave de Acesso</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', background: 'var(--color-surface-offset)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', wordBreak: 'break-all', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{nfe.nfe_chave}</div>
              </div>
            )}
            <div style={{ paddingTop: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Eventos fiscais</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {nfe.nfe_chave && nfe.nfe_status !== 'rejeitado' && (
                    <button className="btn btn-ghost btn-sm" onClick={baixarXmlAutorizacao}>XML autorizacao</button>
                  )}
                  {['autorizado', 'cancelado'].includes(nfe.nfe_status) && nfe.nfe_chave && (
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirDanfe(nfe.nfe_chave)} title="Abrir DANFE para impressao">DANFE</button>
                  )}
                </div>
              </div>
              {loadingEventos ? (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)' }}>Carregando eventos...</div>
              ) : eventos.length === 0 ? (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)' }}>Nenhum evento fiscal registrado.</div>
              ) : (
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  {eventos.map(ev => (
                    <div key={ev.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{EVENTO_LABEL[ev.tipo] || ev.tipo} {ev.tipo === 'cce' ? `#${ev.nseqevento}` : ''}</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{fmtDate(ev.createdat)} · cStat {ev.cstat || '—'} · protocolo {ev.protocolo || '—'}</div>
                        </div>
                        {ev.tem_xml ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => baixarXmlEvento(ev)}>XML</button>
                        ) : null}
                      </div>
                      {(ev.texto || ev.motivo) && (
                        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {ev.texto || ev.motivo}
                        </div>
                      )}
                      {ev.motivo && ev.texto && (
                        <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{ev.motivo}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

function ModalCancelamento({ nfe, onClose, onSuccess }) {
  const [motivo, setMotivo] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  if (!nfe) return null

  const handleSubmit = async () => {
    const texto = motivo.trim()
    if (texto.length < 30) {
      toast.error('Informe um motivo mais detalhado, com pelo menos 30 caracteres')
      return
    }
    if (!confirmado) {
      toast.error('Confirme que entende que o cancelamento sera registrado na SEFAZ')
      return
    }
    setEnviando(true)
    try {
      const r = await api.post(`/nfe/${nfe.nfe_chave}/cancelar`, { motivo: texto }, { timeout: 45000 })
      toast.success(`NF-e cancelada. Protocolo ${r.data?.protocolo || ''}`.trim())
      onSuccess()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao cancelar NF-e')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'oklch(from var(--color-text) l c h / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>Cancelar NF-e</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>NF-e {nfe.nfe_numero}/{nfe.nfe_serie}</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: 'var(--space-5) var(--space-6)', display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', padding: 'var(--space-3)', display: 'grid', gap: 4, fontSize: 'var(--text-xs)' }}>
            <div><b>OS:</b> {nfe.numero || '---'} · <b>Cliente:</b> {nfe.clientenome || '---'}</div>
            <div><b>Valor:</b> {fmt(nfe.valortotal)} · <b>Chave:</b> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{nfe.nfe_chave}</span></div>
            <div style={{ color: 'var(--color-error)', fontWeight: 700, marginTop: 4 }}>Cancelamento e um evento fiscal enviado a SEFAZ e nao deve ser usado como teste em nota real.</div>
          </div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Motivo do cancelamento</label>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={5}
            placeholder="Ex.: Nota emitida com dados incorretos, sera substituida por nova emissao."
            style={{ width: '100%', resize: 'vertical', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', color: 'var(--color-text)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)' }}
          />
          <div style={{ fontSize: 'var(--text-xs)', color: motivo.trim().length < 30 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{motivo.trim().length}/30 caracteres minimos</div>
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
            <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} style={{ marginTop: 2 }} />
            Confirmo que esta NF-e deve ser cancelada e que o evento sera registrado fiscalmente.
          </label>
        </div>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Voltar</button>
          <button className="btn btn-danger" onClick={handleSubmit} disabled={enviando || motivo.trim().length < 30 || !confirmado}>
            {enviando ? 'Cancelando...' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalCCE({ nfe, onClose, onSuccess }) {
  const [correcao, setCorrecao] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!nfe) return null

  const handleSubmit = async () => {
    const texto = correcao.trim()
    if (texto.length < 15 || texto.length > 1000) {
      toast.error('A correcao deve ter entre 15 e 1000 caracteres')
      return
    }
    setEnviando(true)
    try {
      const r = await api.post(`/nfe/${nfe.nfe_chave}/cce`, { correcao: texto }, { timeout: 45000 })
      toast.success(`CC-e emitida. Seq. ${r.data?.sequencia || ''}`.trim())
      onSuccess()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao emitir CC-e')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'oklch(from var(--color-text) l c h / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 560, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>Carta de Correcao</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>NF-e {nfe.nfe_numero}/{nfe.nfe_serie}</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: 'var(--space-5) var(--space-6)', display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-highlight, var(--color-surface-offset))', padding: 'var(--space-3)', fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Antes de emitir a CC-e</div>
            <div>A CC-e nao pode corrigir valor, imposto, quantidade, destinatario, data de emissao ou data de saida. Use apenas para ajustes descritivos permitidos pela SEFAZ.</div>
          </div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Texto da correcao</label>
          <textarea value={correcao} onChange={e => setCorrecao(e.target.value)} rows={7}
            placeholder="Ex.: Corrige-se a descricao do item para Moldura em madeira, sem alteracao de valores, impostos, destinatario, datas ou quantidades."
            style={{ width: '100%', resize: 'vertical', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', color: 'var(--color-text)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)' }}
          />
          <div style={{ fontSize: 'var(--text-xs)', color: correcao.trim().length > 1000 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>{correcao.trim().length}/1000 caracteres</div>
        </div>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Voltar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={enviando || correcao.trim().length < 15 || correcao.trim().length > 1000}>
            {enviando ? 'Enviando...' : 'Emitir CC-e'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NotasFiscais() {
  const [notas, setNotas]             = useState([])
  const [nfeMeta, setNfeMeta]         = useState({ ambiente: null, autorizadas_homologacao: 0, alvo_homologacao: HOMOLOGACAO_ALVO })
  const [loading, setLoading]         = useState(true)
  const [modalEmitir, setModalEmitir] = useState(false)
  const [detalhe, setDetalhe]         = useState(null)
  const [cancelarNota, setCancelarNota] = useState(null)
  const [cceNota, setCceNota]         = useState(null)
  const [q, setQ]                     = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/nfe')
      setNotas(r.data?.notas || [])
      setNfeMeta(r.data?.meta || { ambiente: null, autorizadas_homologacao: 0, alvo_homologacao: HOMOLOGACAO_ALVO })
    } catch {
      toast.error('Erro ao carregar notas fiscais')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const emitirNota = async (nota) => {
    try {
      await api.post(`/nfe/emitir/${nota.id}`, null, { timeout: 45000 })
      toast.success(`NF-e emitida com sucesso para ${nota.numero}!`)
      carregar()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao emitir NF-e')
      carregar()
    }
  }

  const baixarXmlAutorizacao = async (nota) => {
    try {
      await baixarArquivo(`/nfe/${nota.nfe_chave}/xml/autorizacao`, `${nota.nfe_chave}.xml`)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'XML de autorizacao indisponivel')
    }
  }

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
    cancelado:  notas.filter(n => n.nfe_status === 'cancelado').length,
  }
  const alvoHomologacao = nfeMeta.alvo_homologacao || HOMOLOGACAO_ALVO
  const autorizadasHomologacao = nfeMeta.autorizadas_homologacao ?? totais.autorizado
  const progressoHomologacao = Math.min(100, Math.round((autorizadasHomologacao / alvoHomologacao) * 100))

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
          { label: 'Canceladas',     value: totais.cancelado,  color: 'var(--color-text-muted)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Homologacao NF-e</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{autorizadasHomologacao}/{alvoHomologacao} notas autorizadas em homologacao</div>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {nfeMeta.ambiente === 1 ? 'Ambiente atual: producao' : 'Ambiente atual: homologacao'}
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-offset)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressoHomologacao}%`, background: progressoHomologacao >= 100 ? 'var(--color-success)' : 'var(--color-primary)', transition: 'width var(--transition-interactive)' }} />
        </div>
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
        {['todos', 'autorizado', 'rejeitado', 'emitindo', 'cancelado'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: `1px solid ${filtroStatus === s ? 'var(--color-primary)' : 'var(--color-border)'}`, background: filtroStatus === s ? 'var(--color-primary)' : 'var(--color-surface)', color: filtroStatus === s ? '#fff' : 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', transition: 'all var(--transition-interactive)' }}
          >
            {{ todos: 'Todos', autorizado: 'Autorizadas', rejeitado: 'Rejeitadas', emitindo: 'Em andamento', cancelado: 'Canceladas' }[s]}
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
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <StatusBadge status={n.nfe_status} />
                    {n.nfe_status === 'rejeitado' && n.nfe_rejeicao_motivo && (
                      <div title={n.nfe_rejeicao_motivo} style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--color-error)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.nfe_rejeicao_motivo}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', alignItems: 'center', whiteSpace: 'nowrap' }}>
                      {n.nfe_status === 'autorizado' && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => setCceNota(n)} title="Emitir CC-e">CC-e</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => baixarXmlAutorizacao(n)} title="Baixar XML autorizado">XML</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => abrirDanfe(n.nfe_chave)} title="Abrir DANFE para impressao">DANFE</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setCancelarNota(n)} title="Cancelar NF-e">Cancelar</button>
                        </>
                      )}
                      {n.nfe_status === 'cancelado' && n.nfe_chave && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => baixarXmlAutorizacao(n)} title="Baixar XML autorizado">XML</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => abrirDanfe(n.nfe_chave)} title="Abrir DANFE para impressao">DANFE</button>
                        </>
                      )}
                      {['rejeitado', 'cancelado'].includes(n.nfe_status) && STATUS_NFE_EMISSAO.includes(n.status) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => emitirNota(n)} title="Emitir novamente">Reemitir</button>
                      )}
                      {n.nfe_status === 'emitindo' && (
                        <button className="btn btn-ghost btn-sm" onClick={carregar} title="Atualizar andamento">Atualizar</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setDetalhe(n)} title="Ver detalhes">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalEmitir && <ModalEmitir onClose={() => setModalEmitir(false)} onSuccess={carregar} />}
      {detalhe && <ModalDetalhe nfe={detalhe} onClose={() => setDetalhe(null)} />}
      {cancelarNota && <ModalCancelamento nfe={cancelarNota} onClose={() => setCancelarNota(null)} onSuccess={carregar} />}
      {cceNota && <ModalCCE nfe={cceNota} onClose={() => setCceNota(null)} onSuccess={carregar} />}
    </div>
  )
}
