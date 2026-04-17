// frontend/src/pages/OrdemDetalhe.jsx
import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { imprimirOS } from '../utils/imprimirOS'

const fmt   = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')
const fmtDT = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '—'
const fmtD  = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—'
const today = () => new Date(Date.now()-3*60*60*1000).toISOString().slice(0,10)

const STATUS_FLOW  = ['Recebido','Em Produção','Pronto','Entregue']
const STATUS_BADGE = { 'Recebido':'recebido','Em Produção':'emproducao','Pronto':'pronto','Entregue':'entregue','Cancelado':'cancelado' }
const STATUS_COLOR = { 'Recebido':'var(--color-blue)','Em Produção':'var(--color-orange)','Pronto':'var(--color-primary)','Entregue':'var(--color-success)','Cancelado':'var(--color-text-faint)' }
const PAG_BADGE    = { Pix:'pix', Dinheiro:'dinheiro', Credito:'credito', Debito:'debito', Link:'link' }
const PAG_LABEL    = { Credito:'Crédito', Debito:'Débito', Link:'Link Pag.' }

export default function OrdemDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isCaixa, isAdmin, isOficina } = useAuth()
  const [ordem, setOrdem]               = useState(null)
  const [historico, setHistorico]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [novaObs, setNovaObs]           = useState('')
  const [savingObs, setSavingObs]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (confirmDelete) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [confirmDelete])

  const load = useCallback(async () => {
    try {
      const ro = await api.get(`/ordens/${id}`)
      setOrdem(ro.data)
      setHistorico(ro.data.logs || [])
    } catch {
      toast.error('Erro ao carregar OS')
      navigate('/ordens')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => { load() }, [load])

  const mudarStatus = async (novoStatus) => {
    try {
      await api.patch(`/ordens/${id}/status`, { status: novoStatus })
      toast.success(`Status → ${novoStatus}`)
      load()
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao atualizar status') }
  }

  const adicionarObs = async () => {
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
    try {
      await api.delete(`/ordens/${id}`)
      toast.success(`OS ${ordem.numero} excluída.`)
      navigate('/ordens')
    } catch(e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir OS')
      setConfirmDelete(false)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner"/></div>
  if (!ordem)  return null

  const saldoOS   = Number(ordem.saldoaberto ?? 0)
  const vencida   = ordem.prazo && ordem.prazo < today() && !['Entregue','Cancelado','Pronto'].includes(ordem.status)
  const statusIdx = STATUS_FLOW.indexOf(ordem.status)
  const canAdvance = (isCaixa || isOficina) && ordem.status !== 'Entregue' && ordem.status !== 'Cancelado'

  return (
    <div>
      {/* Breadcrumb + ações */}
      <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', marginBottom:'var(--space-5)', flexWrap:'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/ordens')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          Ordens
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
        <div style={{ flex:1 }}/>
        <button className="btn btn-ghost btn-sm" onClick={() => imprimirOS(ordem)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/>
          </svg>
          Imprimir OS
        </button>
        {isAdmin && (
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
                  <div style={{ flex:1, height:2, background: done ? 'var(--color-success)' : 'var(--color-border)', minWidth:24, margin:'0 4px', marginBottom:28 }}/>
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
            {isCaixa && ordem.status !== 'Cancelado' && (
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
      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:'var(--space-4)', marginBottom:'var(--space-4)' }}>
        <div className="card card-pad">
          <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)' }}>Detalhes da OS</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
            {[
              ['Cliente',    ordem.clientenome     || '—'],
              ['Contato',    ordem.clientetelefone || ordem.clientecontato || '—'],
              ['Tipo',       ordem.servico         || ordem.tipo || '—'],
              ['Prioridade', ordem.prioridade       || '—'],
              ['Prazo',      fmtD(ordem.prazoentrega || ordem.prazo)],
              ['Criada em',  fmtDT(ordem.createdat  || ordem.criadoem)],
            ].map(([l,v]) => (
              <div key={l}>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>{l}</div>
                <div style={{ fontWeight:600, fontSize:'var(--text-sm)' }}>{v}</div>
              </div>
            ))}
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
        </div>
      </div>

      {/* Histórico */}
      <div className="card card-pad">
        <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)' }}>Histórico de Atividade</div>
        <div style={{ position:'relative', paddingLeft:'var(--space-8)', marginBottom:'var(--space-5)' }}>
          <div style={{ position:'absolute', left:11, top:0, bottom:0, width:2, background:'var(--color-border)' }}/>
          {historico.length === 0 && (
            <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-faint)' }}>Nenhuma atividade registrada.</p>
          )}
          {historico.map((h, i) => (
            <div key={h.id || i} style={{ position:'relative', marginBottom:'var(--space-4)' }}>
              <div style={{
                position:'absolute', left:'calc(-1 * var(--space-8) + 4px)',
                width:16, height:16, borderRadius:'50%',
                background: h.statusnovo ? (STATUS_COLOR[h.statusnovo] || 'var(--color-primary)') : 'var(--color-surface-dynamic)',
                border:`2px solid ${h.statusnovo ? (STATUS_COLOR[h.statusnovo] || 'var(--color-primary)') : 'var(--color-border)'}`,
              }}/>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-faint)', marginBottom:2 }}>
                {fmtDT(h.createdat)} · {h.usuarionome || 'sistema'}
              </div>
              <div style={{ fontSize:'var(--text-sm)', fontWeight: h.obs ? 400 : 600 }}>
                {h.obs
                  ? <span style={{ color:'var(--color-text-muted)' }}>📝 {h.obs}</span>
                  : <span>
                      Status alterado:
                      {h.statusanterior && <span style={{ color: STATUS_COLOR[h.statusanterior] || 'inherit' }}> {h.statusanterior}</span>}
                      <span style={{ color: STATUS_COLOR[h.statusnovo] || 'inherit', fontWeight:700 }}> → {h.statusnovo}</span>
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

      {/* Modal confirmar exclusão via Portal */}
      {confirmDelete && ReactDOM.createPortal(
        <div
          className="modal-overlay"
          onClick={e => e.target===e.currentTarget && setConfirmDelete(false)}
        >
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
