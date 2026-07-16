// frontend/src/pages/OrdemDetalhe.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const fmt   = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')
const fmtDT = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '—'
const fmtD  = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—'
const today = () => new Date(Date.now()-3*60*60*1000).toISOString().slice(0,10)

const STATUS_FLOW  = ['Aguardando','Em Produção','Pronto','Entregue']
const STATUS_BADGE = { 'Aguardando':'secondary','Em Produção':'emproducao','Pronto':'pronto','Entregue':'entregue','Cancelado':'cancelado' }
const STATUS_COLOR = { 'Aguardando':'var(--status-aguardando)','Em Produção':'var(--status-producao)','Pronto':'var(--status-pronto)','Entregue':'var(--status-entregue)','Cancelado':'var(--status-cancelado)' }
const STATUS_NFE_EMISSAO = ['Aguardando', 'Em Produção', 'Pronto', 'Entregue']
const PAG_BADGE    = { Pix:'pix', Dinheiro:'dinheiro', Credito:'credito', Debito:'debito', Link:'link' }
const PAG_LABEL    = { Credito:'Crédito', Débito:'Débito', Link:'Link Pag.' }
const PAG_ICONE    = { Pix:'💠', Dinheiro:'💵', Credito:'💳', Debito:'💳', Link:'🔗' }

function formatarTelefoneWpp(tel) {
  if (!tel) return null
  const digits = tel.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return '55' + digits
}

function buildWppUrl(ordem) {
  const tel = formatarTelefoneWpp(ordem.clientetelefone || ordem.clientecontato)
  if (!tel) return null

  const nome    = ordem.clientenome   || 'cliente'
  const numero  = ordem.numero        || '—'
  const servico = ordem.servico       || ordem.tipo || '—'
  const total   = Number(ordem.valortotal   || ordem.valor   || 0)
  const entrada = Number(ordem.valorentrada || ordem.entrada || 0)
  const saldo   = Number(ordem.saldoaberto  ?? (total - entrada))
  const status  = ordem.status

  let msg = ''

  if (status === 'Pronto') {
    msg += `🎉 *Arte e Molduras — Pedido Pronto!*\n\n`
    msg += `Olá, *${nome}*! Seu pedido está pronto para retirada. 😊\n\n`
    msg += `🖼️ *Serviço:* ${servico}\n`
    msg += `🔖 *OS:* ${numero}\n`
    if (saldo > 0.009) {
      msg += `💳 *Saldo na retirada:* ${fmt(saldo)}\n`
    } else {
      msg += `✅ *Pagamento:* Quitado\n`
    }
    msg += `\nEstamos aguardando você!\n`
    msg += `_Arte e Molduras_ 🎨`
  } else {
    msg += `📋 *Arte e Molduras — Confirmação de Pedido*\n\n`
    msg += `Olá, *${nome}*! Seu pedido foi registrado com sucesso. 😊\n\n`
    msg += `🖼️ *Serviço:* ${servico}\n`
    msg += `🔖 *OS:* ${numero}\n`
    msg += `💵 *Valor Total:* ${fmt(total)}\n`
    if (entrada > 0.009) {
      msg += `✅ *Entrada paga:* ${fmt(entrada)}\n`
      if (saldo > 0.009) {
        msg += `💳 *Saldo restante na retirada:* ${fmt(saldo)}\n`
      } else {
        msg += `✅ *Pagamento:* Quitado\n`
      }
    }
    msg += `\nEntraremos em contato quando seu pedido estiver pronto!\n`
    msg += `_Arte e Molduras_ 🎨`
  }

  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
}

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

function IconWhatsApp() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

function IconNFe() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="12" y2="17"/>
    </svg>
  )
}

export default function OrdemDetalhe({ context }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()

  const isOficinaContext = context === 'oficina'
  const backPath = isOficinaContext ? '/oficina' : '/ordens'

  const [ordem, setOrdem]                 = useState(null)
  const [itens, setItens]                 = useState([])
  const [historico, setHistorico]         = useState([])
  const [lancamentosOS, setLancamentosOS] = useState([])
  const [loading, setLoading]             = useState(true)
  const [novaObs, setNovaObs]             = useState('')
  const [savingObs, setSavingObs]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // NF-e
  const [emitindo, setEmitindo]           = useState(false)

  useEffect(() => {
    document.body.style.overflow = confirmDelete ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [confirmDelete])

  const load = useCallback(async () => {
    try {
      const ro = await api.get(`/ordens/${id}`)
      setOrdem(ro.data)
      setHistorico(ro.data.logs || [])
      setItens(ro.data.itens || ro.data.items || ro.data.produtos || [])
      setLancamentosOS(ro.data.lancamentos || [])
    } catch {
      toast.error('Erro ao carregar OS')
      navigate(backPath)
    } finally {
      setLoading(false)
    }
  }, [id, navigate, backPath])

  useEffect(() => { load() }, [load])

  // Timeline mesclada: statuslog + lancamentos do caixa, ordenados por timestamp real
  const timelineMesclada = useMemo(() => {
    const statusEventos = historico.map(h => ({
      _tipo: 'status',
      _ts: h.createdat || '',
      ...h,
    }))

    const caixaEventos = lancamentosOS.map(l => {
      const icone = PAG_ICONE[l.pagamento] || '💰'
      let label
      if (l.origem === 'entradaos') {
        label = `${icone} Entrada recebida — ${fmt(l.valor)} via ${l.pagamento}`
      } else if (l.origem === 'restanteos') {
        label = `${icone} Restante recebido — ${fmt(l.valor)} via ${l.pagamento}`
      } else {
        label = `${icone} Pagamento registrado — ${fmt(l.valor)} via ${l.pagamento}`
      }
      return {
        _tipo: 'caixa',
        _ts: l.createdat || (l.data ? `${l.data}T00:00:00` : ''),
        _label: label,
        ...l,
      }
    })

    return [...statusEventos, ...caixaEventos].sort((a, b) =>
      (a._ts || '').localeCompare(b._ts || '') || (a.id || 0) - (b.id || 0)
    )
  }, [historico, lancamentosOS])

  const mudarStatus = async (novoStatus) => {
    if (novoStatus === 'Cancelado' && !(typeof can === 'function' && can('ordens.cancelar'))) return toast.error('Sem permissao para cancelar OS')
    if (!(typeof can === 'function' && (can('ordens.alterar_status') || can('oficina.alterar_status')))) return toast.error('Sem permissao para alterar status')
    try {
      await api.patch(`/ordens/${id}/status`, { status: novoStatus })
      toast.success(`Status → ${novoStatus}`)
      load()
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao atualizar status') }
  }

  const adicionarObs = async () => {
    if (!(typeof can === 'function' && (can('ordens.alterar_status') || can('oficina.alterar_status')))) return toast.error('Sem permissao para adicionar observacao')
    if (!novaObs.trim()) return
    setSavingObs(true)
    try {
      await api.patch(`/ordens/${id}/status`, { status: ordem.status, obs: novaObs })
      setNovaObs('')
      toast.success('Observação adicionada!')
      load()
    } catch { toast.error('Erro ao adicionar observação') }
    finally { setSavingObs(false) }
  }

  const excluirOS = async () => {
    if (!(typeof can === 'function' && can('ordens.excluir'))) return toast.error('Sem permissao para excluir OS')
    try {
      await api.delete(`/ordens/${id}`)
      toast.success(`OS ${ordem.numero} excluída.`)
      navigate('/ordens')
    } catch(e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir OS')
      setConfirmDelete(false)
    }
  }

  const imprimirOS = () => {
    if (!(typeof can === 'function' && can('ordens.imprimir'))) return toast.error('Sem permissao para imprimir OS')
    window.open(`/api/ordens/${id}/pdf`, '_blank', 'noopener,noreferrer')
  }
  const baixarDanfe = async () => {
    if (!(typeof can === 'function' && can('nfe.danfe'))) return toast.error('Sem permissao para baixar DANFE')
    if (!ordem?.nfe_chave) {
      toast.error('Chave da NF-e indisponivel')
      return
    }
    try {
      await baixarArquivo(`/nfe/${ordem.nfe_chave}/danfe`, `danfe-${ordem.nfe_chave}.pdf`)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'DANFE indisponivel')
    }
  }

  // ── NF-e ──────────────────────────────────────────────────────────────────
  const handleEmitirNFe = async () => {
    if (!(typeof can === 'function' && can('nfe.emitir'))) return toast.error('Sem permissao para emitir NF-e')
    if (!window.confirm('Emitir NF-e para esta OS? A nota será enviada à SEFAZ.')) return
    setEmitindo(true)
    try {
      const res = await api.post(`/nfe/emitir/${id}`)
      toast.success(`NF-e nº ${res.data.numero} autorizada pela SEFAZ! ✅`)
      load()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao emitir NF-e')
    } finally {
      setEmitindo(false)
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading-center"><div className="spinner"/></div>
  if (!ordem)  return null

  const saldoOS   = Number(ordem.saldoaberto ?? 0)
  const vencida   = ordem.prazo && ordem.prazo < today() && !['Entregue','Cancelado','Pronto'].includes(ordem.status)
  const statusIdx = STATUS_FLOW.indexOf(ordem.status)
  const canChangeStatus = typeof can === 'function' && (can('ordens.alterar_status') || can('oficina.alterar_status'))
  const canAdvance = canChangeStatus && ordem.status !== 'Entregue' && ordem.status !== 'Cancelado'
  const canCancel  = typeof can === 'function' && can('ordens.cancelar') && !isOficinaContext && ordem.status !== 'Cancelado'
  const canSendWpp = typeof can === 'function' && can('ordens.whatsapp') && !['Cancelado'].includes(ordem.status)
  const canDelete  = typeof can === 'function' && can('ordens.excluir') && !isOficinaContext
  const canPrint = typeof can === 'function' && can('ordens.imprimir')
  const canDownloadDanfe = typeof can === 'function' && can('nfe.danfe')
  const wppUrl     = buildWppUrl(ordem)
  const wppLabel = ordem.status === 'Pronto' ? 'Avisar Pronto' : 'Confirmar Pedido'

  // NF-e: algumas empresas exigem nota antes do pagamento, entao Aguardando tambem e elegivel.
  const podeEmitirNFe =
    typeof can === 'function' &&
    can('nfe.emitir') &&
    !isOficinaContext &&
    STATUS_NFE_EMISSAO.includes(ordem.status) &&
    !ordem.nfe_chave

  const nfeEmitida = !!ordem.nfe_chave

  return (
    <div>
      {/* Breadcrumb + ações */}
      <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', marginBottom:'var(--space-5)', flexWrap:'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(backPath)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          {isOficinaContext ? 'Oficina' : 'Ordens'}
        </button>
        <span style={{ color:'var(--color-text-faint)' }}>/</span>
        <span style={{ fontWeight:700, color:'var(--color-primary)' }}>{ordem.numero}</span>
        <span className={`badge badge-${STATUS_BADGE[ordem.status]}`}>{ordem.status}</span>
        {ordem.prioridade === 'Urgente' && <span className="badge badge-urgente">⚡ Urgente</span>}
        {vencida && (
          <span className="badge" style={{ background:'var(--color-error-hl)', color:'var(--color-error)' }}>
            ⚠ Prazo vencido
          </span>
        )}
        {nfeEmitida && (
          <span className="badge" style={{ background:'var(--color-success-highlight)', color:'var(--color-success)', fontSize:'var(--text-xs)', fontWeight:700 }}>
            📄 NF-e {ordem.nfe_numero}
          </span>
        )}
        {isOficinaContext && (
          <span className="badge" style={{ background:'var(--color-surface-dynamic)', color:'var(--color-text-muted)', fontSize:'var(--text-xs)' }}>
            🔧 Modo Oficina
          </span>
        )}
        <div style={{ flex:1 }}/>

        {/* Botão NF-e */}
        {podeEmitirNFe && (
          <button
            className="btn btn-sm"
            onClick={handleEmitirNFe}
            disabled={emitindo}
            style={{
              background: emitindo ? 'var(--color-surface-dynamic)' : 'var(--color-primary)',
              color: emitindo ? 'var(--color-text-muted)' : '#fff',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              minWidth: 130,
              justifyContent: 'center',
            }}
            title="Emitir Nota Fiscal Eletrônica para esta OS"
          >
            {emitindo
              ? <><div className="spinner" style={{width:14,height:14}}/> Emitindo...</>
              : <><IconNFe /> Emitir NF-e</>
            }
          </button>
        )}

        {canSendWpp && (
          <a
            href={wppUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={!wppUrl ? (e) => { e.preventDefault(); toast.error('Cliente sem telefone cadastrado.') } : undefined}
            className="btn btn-sm"
            style={{
              background:'#25D366', color:'#fff', border:'none',
              display:'inline-flex', alignItems:'center', gap:'var(--space-2)',
              textDecoration:'none',
              opacity: wppUrl ? 1 : 0.55,
              cursor: wppUrl ? 'pointer' : 'not-allowed',
            }}
            title={wppUrl ? `Abrir WhatsApp — ${wppLabel}` : 'Cliente sem telefone cadastrado'}
          >
            <IconWhatsApp />
            {wppLabel}
          </a>
        )}

        {canPrint && (
          <button className="btn btn-ghost btn-sm" onClick={imprimirOS}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/>
            </svg>
            Imprimir OS
          </button>
        )}

        {canDelete && (
          <button className="btn btn-sm" onClick={() => setConfirmDelete(true)}
            style={{ color:'var(--color-error)', border:'1px solid var(--color-error)', background:'transparent' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
            Excluir OS
          </button>
        )}
      </div>

      {/* Timeline de status */}
      <div className="card card-pad" style={{ marginBottom:'var(--space-4)' }}>
        <div style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'var(--space-4)' }}>
          Progresso
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:'var(--space-4)', overflowX:'auto', paddingBottom:'var(--space-2)' }}>
          {STATUS_FLOW.map((s, i) => {
            const done    = i < statusIdx || (ordem.status === 'Entregue' && i <= statusIdx)
            const current = s === ordem.status
            const isDone  = done || current
            return (
              <React.Fragment key={s}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'var(--space-2)', minWidth:80 }}>
                  <div style={{
                    width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                    background: current ? STATUS_COLOR[s] : done ? 'var(--color-success)' : 'var(--color-surface-dynamic)',
                    color: isDone ? 'white' : 'var(--color-text-faint)',
                    fontWeight:700, fontSize:'var(--text-sm)',
                    border: current ? `2px solid ${STATUS_COLOR[s]}` : done ? '2px solid var(--color-success)' : '2px solid var(--color-border)',
                    transition:'all 0.3s ease',
                    boxShadow: current ? `0 0 0 4px color-mix(in oklab, ${STATUS_COLOR[s]} 20%, transparent)` : 'none',
                  }}>
                    {done && !current
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      : i+1
                    }
                  </div>
                  <span style={{ fontSize:'var(--text-xs)', fontWeight: current ? 700 : 400, color: current ? STATUS_COLOR[s] : 'var(--color-text-muted)', textAlign:'center', whiteSpace:'nowrap' }}>
                    {s}
                  </span>
                </div>
                {i < STATUS_FLOW.length - 1 && (
                  <div style={{ flex:1, height:2, background: done ? 'var(--color-success)' : 'var(--color-border)', minWidth:24, margin:'0 4px', marginBottom:36 }}/>
                )}
              </React.Fragment>
            )
          })}
        </div>
        {canAdvance && (
          <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap' }}>
            {STATUS_FLOW.map(s => s !== ordem.status && (
              <button key={s} className="btn btn-ghost btn-sm"
                style={{ borderColor: STATUS_COLOR[s], color: STATUS_COLOR[s] }}
                onClick={() => mudarStatus(s)}>
                → {s}
              </button>
            ))}
            {canCancel && (
              <button className="btn btn-ghost btn-sm"
                style={{ borderColor:'var(--color-text-faint)', color:'var(--color-text-faint)' }}
                onClick={() => mudarStatus('Cancelado')}>
                Cancelar OS
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid: info + financeiro */}
      <div style={{
        display:'grid',
        gridTemplateColumns: isOficinaContext ? '1fr' : 'minmax(0,1fr) minmax(260px,300px)',
        gap:'var(--space-4)',
        marginBottom:'var(--space-4)'
      }}>
        <div className="card card-pad">
          <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)' }}>Detalhes da OS</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
            {[
              ['Cliente',    ordem.clientenome                              || '—'],
              ['Contato',    ordem.clientetelefone || ordem.clientecontato  || '—'],
              ['Tipo',       ordem.servico         || ordem.tipo            || '—'],
              ['Prioridade', ordem.prioridade                               || '—'],
              ['Prazo',      fmtD(ordem.prazoentrega || ordem.prazo)],
              ['Criada em',  fmtDT(ordem.createdat  || ordem.criadoem)],
            ].map(([l,v]) => (
              <div key={l}>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>{l}</div>
                <div style={{ fontWeight:600, fontSize:'var(--text-sm)' }}>{v}</div>
              </div>
            ))}
            {(ordem.clientetelefone || ordem.clientecontato) && canSendWpp && (
              <div style={{ gridColumn:'1 / -1' }}>
                <a
                  href={wppUrl || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display:'inline-flex', alignItems:'center', gap:6,
                    fontSize:'var(--text-xs)', fontWeight:600,
                    color:'#25D366', textDecoration:'none',
                    padding:'4px 10px',
                    border:'1px solid #25D36644',
                    borderRadius:'var(--radius-full)',
                    background:'rgba(37,211,102,0.08)',
                  }}
                >
                  <IconWhatsApp />
                  {wppLabel}
                </a>
              </div>
            )}
            {ordem.descricao && (
              <div style={{ gridColumn:'1 / -1' }}>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:4 }}>Descrição</div>
                <div style={{ fontSize:'var(--text-sm)', lineHeight:1.6, background:'var(--color-surface-dynamic)', padding:'var(--space-3)', borderRadius:'var(--radius-md)' }}>
                  {ordem.descricao}
                </div>
              </div>
            )}
            {(ordem.observacoes || ordem.obs) && (
              <div style={{ gridColumn:'1 / -1' }}>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:4 }}>Observações</div>
                <div style={{ fontSize:'var(--text-sm)', lineHeight:1.6, background:'var(--color-surface-dynamic)', padding:'var(--space-3)', borderRadius:'var(--radius-md)' }}>
                  {ordem.observacoes || ordem.obs}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isOficinaContext && (
          <div className="card card-pad">
            <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)' }}>Financeiro</div>
            {[
              ['Valor Total', fmt(ordem.valortotal || ordem.valor)],
              ['Entrada',     fmt(ordem.valorentrada || ordem.entrada)],
            ].map(([l,v]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'var(--space-2) 0', borderBottom:'1px solid var(--color-divider)' }}>
                <span style={{ fontSize:'var(--text-sm)', color:'var(--color-text-muted)' }}>{l}</span>
                <span className="tabnum" style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:'var(--space-3)', marginTop:'var(--space-1)' }}>
              <span style={{ fontWeight:700 }}>Restante</span>
              <span className="tabnum" style={{ fontWeight:800, color: saldoOS > 0 ? 'var(--color-warning)' : 'var(--color-success)', fontSize:'var(--text-base)' }}>
                {saldoOS > 0 ? fmt(saldoOS) : '✓ Quitado'}
              </span>
            </div>
            <div style={{ marginTop:'var(--space-4)', padding:'var(--space-2) 0', borderTop:'1px solid var(--color-divider)' }}>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:4 }}>Forma de Pagamento</div>
              <span className={`badge badge-${PAG_BADGE[ordem.pagamento]||'normal'}`}>
                {PAG_LABEL[ordem.pagamento] || ordem.pagamento || '—'}
              </span>
            </div>

            {/* ── Painel NF-e ─────────────────────────────────────────── */}
            {nfeEmitida && (
              <div style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-success-highlight)',
                border: '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', marginBottom:'var(--space-2)' }}>
                  <IconNFe />
                  <span style={{ fontSize:'var(--text-xs)', fontWeight:700, color:'var(--color-success)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    NF-e Autorizada
                  </span>
                </div>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', lineHeight:1.8 }}>
                  <div><b>Nº:</b> {ordem.nfe_numero} · Série {ordem.nfe_serie || '1'}</div>
                  {ordem.nfe_protocolo && <div><b>Protocolo:</b> {ordem.nfe_protocolo}</div>}
                  {ordem.nfe_emitida_em && <div><b>Emitida em:</b> {fmtDT(ordem.nfe_emitida_em)}</div>}
                  {ordem.nfe_chave && (
                    <div style={{ marginTop:'var(--space-2)', wordBreak:'break-all', fontFamily:'monospace', fontSize:10, color:'var(--color-text-faint)' }}>
                      {ordem.nfe_chave}
                    </div>
                  )}
                </div>
                {canDownloadDanfe && <button
                  className="btn btn-sm"
                  onClick={baixarDanfe}
                  style={{
                    width: '100%',
                    marginTop: 'var(--space-3)',
                    background: 'var(--color-success)',
                    color: '#fff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <IconNFe /> Baixar DANFE
                </button>}
              </div>
            )}

            {/* Botão emitir dentro do card financeiro (estado Pronto sem NF-e) */}
            {podeEmitirNFe && (
              <button
                className="btn btn-sm"
                onClick={handleEmitirNFe}
                disabled={emitindo}
                style={{
                  width: '100%',
                  marginTop: 'var(--space-4)',
                  background: emitindo ? 'var(--color-surface-dynamic)' : 'var(--color-primary)',
                  color: emitindo ? 'var(--color-text-muted)' : '#fff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                {emitindo
                  ? <><div className="spinner" style={{width:14,height:14}}/> Emitindo...</>
                  : <><IconNFe /> Emitir NF-e</>
                }
              </button>
            )}
            {/* ────────────────────────────────────────────────────────── */}
          </div>
        )}
      </div>

      {/* Itens */}
      {itens.length > 0 && (
        <div className="card card-pad" style={{ marginBottom:'var(--space-4)' }}>
          <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)', display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/>
            </svg>
            Itens do Pedido
            <span style={{ fontSize:11, fontWeight:700, background:'var(--color-primary-highlight)', color:'var(--color-primary)', borderRadius:'var(--radius-full)', padding:'1px 8px' }}>
              {itens.length}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Produto / Descrição</th>
                <th style={{ textAlign:'center' }}>Qtd</th>
                <th style={{ textAlign:'right' }}>Preço Unit.</th>
                <th style={{ textAlign:'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, idx) => {
                const nome     = item.nome || item.produto || item.descricao || item.name || `Item ${idx + 1}`
                const qtd      = Number(item.quantidade || item.qty || item.qtd || 1)
                const preco    = Number(item.preco_unitario ?? item.preco ?? item.precovenda ?? item.valor ?? item.price ?? 0)
                const subtotal = Number(item.subtotal || item.total || (qtd * preco))
                return (
                  <tr key={item.id || idx}>
                    <td style={{ color:'var(--color-text-faint)', fontSize:'var(--text-xs)', fontWeight:600 }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight:600, fontSize:'var(--text-sm)' }}>{nome}</div>
                      {item.observacao && (
                        <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginTop:2, fontStyle:'italic' }}>
                          {item.observacao}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:'var(--text-sm)' }}>{qtd}</td>
                    <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-sm)' }}>{fmt(preco)}</td>
                    <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'var(--text-sm)', fontWeight:700 }}>{fmt(subtotal)}</td>
                  </tr>
                )
              })}
            </tbody>
            {itens.length > 1 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign:'right', fontWeight:700, fontSize:'var(--text-sm)', paddingTop:'var(--space-3)', borderTop:'2px solid var(--color-border)', color:'var(--color-text-muted)' }}>
                    Total dos Itens
                  </td>
                  <td style={{ textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:'var(--text-base)', paddingTop:'var(--space-3)', borderTop:'2px solid var(--color-border)', color:'var(--color-primary)' }}>
                    {fmt(itens.reduce((acc, item) => {
                      const qtd   = Number(item.quantidade || item.qty || item.qtd || 1)
                      const preco = Number(item.preco_unitario ?? item.preco ?? item.precovenda ?? item.valor ?? item.price ?? 0)
                      return acc + Number(item.subtotal || item.total || (qtd * preco))
                    }, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Histórico de Atividade */}
      <div className="card card-pad">
        <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)' }}>Histórico de Atividade</div>
        <div style={{ position:'relative', paddingLeft:'var(--space-8)', marginBottom:'var(--space-5)' }}>
          <div style={{ position:'absolute', left:11, top:0, bottom:0, width:2, background:'var(--color-border)' }}/>
          {timelineMesclada.length === 0 && (
            <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-faint)' }}>Nenhuma atividade registrada.</p>
          )}
          {timelineMesclada.map((h, i) => (
            <div key={`${h._tipo}-${h.id || i}`} style={{ position:'relative', marginBottom:'var(--space-4)' }}>
              <div style={{
                position:'absolute', left:'calc(-1 * var(--space-8) + 4px)',
                width:16, height:16, borderRadius:'50%',
                background: h._tipo === 'caixa'
                  ? 'var(--color-success)'
                  : h.statusnovo ? (STATUS_COLOR[h.statusnovo] || 'var(--color-primary)') : 'var(--color-surface-dynamic)',
                border: `2px solid ${
                  h._tipo === 'caixa'
                    ? 'var(--color-success)'
                    : h.statusnovo ? (STATUS_COLOR[h.statusnovo] || 'var(--color-primary)') : 'var(--color-border)'
                }`,
              }}/>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-faint)', marginBottom:2 }}>
                {fmtDT(h._ts)} · {h.usuarionome || 'sistema'}
              </div>
              <div style={{ fontSize:'var(--text-sm)', fontWeight: h._tipo === 'caixa' ? 600 : (h.obs ? 400 : 600) }}>
                {h._tipo === 'caixa'
                  ? <span style={{ color:'var(--color-success)' }}>{h._label}</span>
                  : h.obs
                    ? <span style={{ color:'var(--color-text-muted)' }}>📝 {h.obs}</span>
                    : <span>
                        {h.statusanterior
                          ? <>
                              Status alterado:
                              <span style={{ color: STATUS_COLOR[h.statusanterior] || 'inherit' }}> {h.statusanterior}</span>
                              <span style={{ color: STATUS_COLOR[h.statusnovo] || 'inherit', fontWeight:700 }}> → {h.statusnovo}</span>
                            </>
                          : <span style={{ color:'var(--color-text-muted)' }}>Ordem criada</span>
                        }
                      </span>
                }
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop:'1px solid var(--color-divider)', paddingTop:'var(--space-4)' }}>
          <div style={{ fontWeight:600, fontSize:'var(--text-xs)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'var(--space-3)' }}>
            Adicionar Observação
          </div>
          <div style={{ display:'flex', gap:'var(--space-3)' }}>
            <input className="form-input" placeholder="Anote uma informação, atualização..."
              value={novaObs} onChange={e => setNovaObs(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionarObs()}
              style={{ flex:1 }}/>
            <button className="btn btn-primary" onClick={adicionarObs} disabled={savingObs || !novaObs.trim()}>
              {savingObs ? <div className="spinner" style={{width:14,height:14}}/> : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal exclusão */}
      {confirmDelete && !isOficinaContext && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setConfirmDelete(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title" style={{ color:'var(--color-error)' }}>Excluir OS {ordem.numero}?</span>
              <button className="btn btn-icon btn-ghost" onClick={() => setConfirmDelete(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding:'var(--space-4) var(--space-5)', display:'flex', flexDirection:'column', gap:'var(--space-3)' }}>
              <p style={{ color:'var(--color-text-muted)', fontSize:'var(--text-sm)' }}>
                Esta ação é <strong>permanente e irreversível</strong>.
              </p>
              <div style={{ fontSize:'var(--text-xs)', padding:'var(--space-2) var(--space-3)', background:'var(--color-warning-hl)', borderRadius:'var(--radius-md)', color:'var(--color-warning)' }}>
                💡 Para encerrar sem apagar o histórico, use <strong>"Cancelar OS"</strong>.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={excluirOS}>Excluir permanentemente</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
