import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const fmtD = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : null
const getToday = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

const COLUNAS = [
  { status: 'Recebido',     label: 'Recebido',     color: '#006494', bg: 'rgba(0,100,148,0.10)' },
  { status: 'Em Produção',  label: 'Em Produção',  color: '#da7101', bg: 'rgba(218,113,1,0.10)' },
  { status: 'Pronto',       label: 'Pronto',       color: '#01696f', bg: 'rgba(1,105,111,0.10)' },
]

// BUG-06: usa servico (campo real do schema)
const TIPOBADGE = { 'Corte a Laser': 'laser', 'Quadro': 'quadro', 'Caixas': 'caixas', '3D': '3d', 'Diversos': 'diversos' }
const TIPOICONE = {
  'Corte a Laser': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  'Quadro':        'M3 3h18v18H3zM9 9h6M9 12h6M9 15h4',
  'Caixas':        'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  '3D':            'M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2',
  'Diversos':      'M4 6h16M4 12h16M4 18h7',
}

const STATUSNEXT = { 'Recebido': 'Em Produção', 'Em Produção': 'Pronto', 'Pronto': 'Entregue' }
const SCOLOR = {
  'Recebido':    '#006494',
  'Em Produção': '#da7101',
  'Pronto':      '#01696f',
  'Entregue':    '#437a22',
  'Cancelado':   'var(--color-text-faint)',
}

const TIPOS = ['todos', 'Corte a Laser', 'Quadro', 'Caixas', '3D', 'Diversos']

function fmt(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/(\d)(?=(\d{3})+,)/g, '$1.')
}

export default function Oficina() {
  const { isOficina, isCaixa, isAdmin } = useAuth()
  const [ordens, setOrdens]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterTipo, setFilterTipo] = useState('todos')
  const [view, setView]             = useState('kanban')
  const [dragOver, setDragOver]     = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const canEdit = isOficina || isCaixa || isAdmin
  const navigate = useNavigate()

  useEffect(() => { document.title = 'Fila da Oficina — Arte & Molduras' }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2, r3] = await Promise.all([
        api.get('/ordens?status=Recebido'),
        api.get('/ordens?status=Em Produção'),
        api.get('/ordens?status=Pronto'),
      ])
      const todas = [
        ...(Array.isArray(r1.data) ? r1.data : []),
        ...(Array.isArray(r2.data) ? r2.data : []),
        ...(Array.isArray(r3.data) ? r3.data : []),
      ]
      setOrdens(todas)
    } catch {
      toast.error('Erro ao carregar fila')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const mudarStatus = useCallback(async (id, novoStatus) => {
    setOrdens(prev => prev.map(o => o.id === id ? { ...o, status: novoStatus } : o))
    try {
      await api.patch(`/ordens/${id}/status`, { status: novoStatus })
      toast.success(novoStatus)
      if (novoStatus === 'Entregue' || novoStatus === 'Cancelado') {
        setTimeout(() => setOrdens(prev => prev.filter(o => o.id !== id)), 1200)
      }
    } catch (e) {
      load()
      toast.error(e.response?.data?.error || 'Erro ao atualizar status')
    }
  }, [load])

  const handleDragStart = id => setDraggingId(id)
  const handleDragEnd   = ()  => { setDraggingId(null); setDragOver(null) }
  const handleDrop      = novoStatus => {
    if (draggingId) mudarStatus(draggingId, novoStatus)
    setDragOver(null)
    setDraggingId(null)
  }

  const today = getToday()

  // BUG-06: filtra por servico (não tipo)
  const filtered = ordens.filter(o => {
    const matchSearch = !search || [o.numero, o.clientenome, o.descricao, o.servico].join(' ').toLowerCase().includes(search.toLowerCase())
    const matchTipo   = filterTipo === 'todos' || o.servico === filterTipo
    return matchSearch && matchTipo
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.prioridade === 'Urgente' && b.prioridade !== 'Urgente') return -1
    if (b.prioridade === 'Urgente' && a.prioridade !== 'Urgente') return 1
    if (a.prazoentrega && b.prazoentrega) return a.prazoentrega.localeCompare(b.prazoentrega)
    if (a.prazoentrega) return -1
    if (b.prazoentrega) return 1
    return new Date(a.criadoem) - new Date(b.criadoem)
  })

  const byStatus = s => sorted.filter(o => o.status === s)

  const urgentes = ordens.filter(o => o.prioridade === 'Urgente' && !['Entregue','Cancelado'].includes(o.status)).length
  const vencidas = ordens.filter(o => o.prazoentrega && o.prazoentrega < today && !['Entregue','Cancelado'].includes(o.status)).length
  const hj       = ordens.filter(o => o.prazoentrega === today && !['Entregue','Cancelado'].includes(o.status)).length

  return (
    <div style={{ height:'calc(100vh - 60px - var(--space-12))', display:'flex', flexDirection:'column', minHeight:0 }}>

      <div className="page-header" style={{ marginBottom:'var(--space-4)', flexShrink:0 }}>
        <div>
          <h1 className="page-title">Fila da Oficina</h1>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginTop:2 }}>Atualiza automaticamente a cada 30s</p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap', alignItems:'center' }}>
          {urgentes > 0 && <span className="badge badge-urgente" style={{ padding:'var(--space-1) var(--space-3)', fontSize:'var(--text-xs)' }}>{urgentes} urgente{urgentes !== 1 ? 's' : ''}</span>}
          {vencidas > 0 && <span className="badge" style={{ background:'rgba(161,44,123,0.10)', color:'var(--color-error)', padding:'var(--space-1) var(--space-3)', fontSize:'var(--text-xs)' }}>{vencidas} vencida{vencidas !== 1 ? 's' : ''}</span>}
          {hj > 0      && <span className="badge" style={{ background:'rgba(209,153,0,0.10)', color:'#d19900', padding:'var(--space-1) var(--space-3)', fontSize:'var(--text-xs)' }}>{hj} para hoje</span>}
          <button className="btn btn-ghost btn-sm" onClick={load} title="Atualizar agora">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', flexWrap:'wrap', alignItems:'center', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)', padding:'var(--space-2) var(--space-3)', flex:'1 1 200px', maxWidth:320 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input style={{ background:'none', border:'none', outline:'none', fontSize:'var(--text-sm)', width:'100%', color:'var(--color-text)' }} placeholder="Buscar OS, cliente..." value={search} onChange={e => setSearch(e.target.value)}/>
          {search && <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-faint)', padding:0 }} onClick={() => setSearch('')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>}
        </div>

        <div className="filter-bar">
          {TIPOS.map(t => (
            <button key={t} className={`chip${filterTipo === t ? ' active' : ''}`} onClick={() => setFilterTipo(t)}>
              {t === 'todos' ? 'Todos os tipos' : t}
            </button>
          ))}
        </div>

        <div style={{ display:'flex', gap:'var(--space-1)', background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)', padding:4 }}>
          <button className={`btn btn-xs ${view === 'kanban' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('kanban')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Kanban
          </button>
          <button className={`btn btn-xs ${view === 'lista' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('lista')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
            Lista
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner"/></div>
      ) : view === 'kanban' ? (
        <div style={{ display:'flex', gap:'var(--space-4)', flex:1, overflowX:'auto', overflowY:'hidden', minHeight:0, paddingBottom:'var(--space-2)' }}>
          {COLUNAS.map(col => (
            <div
              key={col.status}
              onDragOver={e => { e.preventDefault(); setDragOver(col.status) }}
              onDrop={e => { e.preventDefault(); handleDrop(col.status) }}
              style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)', minWidth:260, flex:1, background: dragOver === col.status ? col.bg : 'transparent', borderRadius:'var(--radius-xl)', padding:'var(--space-2)', transition:'background 0.2s ease' }}
            >
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'var(--space-2) var(--space-3)', background: col.bg, borderRadius:'var(--radius-lg)', border:`1px solid ${col.color}40` }}>
                <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: col.color }}/>
                  <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color: col.color }}>{col.label}</span>
                </div>
                <span style={{ background: col.color, color:'white', width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>
                  {byStatus(col.status).length}
                </span>
              </div>

              {byStatus(col.status).length === 0
                ? <div style={{ border:'2px dashed var(--color-border)', borderRadius:'var(--radius-lg)', padding:'var(--space-8) var(--space-4)', textAlign:'center', color:'var(--color-text-faint)', fontSize:'var(--text-xs)', minHeight:80, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {canEdit ? 'Arraste uma OS aqui' : 'Nenhuma OS'}
                  </div>
                : byStatus(col.status).map(o => {
                    const vencida  = o.prazoentrega && o.prazoentrega < today && !['Entregue','Cancelado'].includes(o.status)
                    const ehHoje   = o.prazoentrega === today
                    const saldo    = (o.valortotal || o.valor || 0) - (o.valorentrada || o.entrada || 0)
                    const diasCriado = Math.floor((Date.now() - new Date(o.criadoem)) / 86400000)
                    const next     = STATUSNEXT[o.status]
                    return (
                      <div
                        key={o.id}
                        draggable={canEdit}
                        onDragStart={() => handleDragStart(o.id)}
                        onDragEnd={handleDragEnd}
                        style={{ background:'var(--color-surface)', border:`1px solid ${vencida ? 'var(--color-error)' : 'var(--color-border)'}`, borderRadius:'var(--radius-lg)', padding:'var(--space-3)', cursor: canEdit ? 'grab' : 'default', opacity: draggingId === o.id ? 0.5 : 1, transition:'all 0.2s ease', boxShadow:'var(--shadow-sm)' }}
                      >
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'var(--space-2)' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                            <div style={{ width:28, height:28, borderRadius:'var(--radius-md)', background:'rgba(1,105,111,0.10)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2"><path d={TIPOICONE[o.servico] || TIPOICONE['Diversos']}/></svg>
                            </div>
                            <div style={{ fontWeight:800, fontSize:'var(--text-xs)', color:'var(--color-primary)', lineHeight:1.2 }}>{o.numero}</div>
                          </div>
                          <div style={{ fontSize:10, color:'var(--color-text-faint)' }}>{diasCriado === 0 ? 'hoje' : `${diasCriado}d`}</div>
                        </div>

                        {o.prioridade === 'Urgente' && (
                          <div style={{ marginBottom:'var(--space-1)' }}>
                            <span style={{ fontSize:10, fontWeight:700, color:'var(--color-error)', background:'rgba(161,44,123,0.10)', borderRadius:'var(--radius-full)', padding:'1px 6px' }}>Urgente</span>
                          </div>
                        )}

                        <div style={{ fontWeight:600, fontSize:'var(--text-sm)', marginBottom:2, lineHeight:1.3 }}>{o.clientenome}</div>

                        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-1)', marginBottom:'var(--space-2)' }}>
                          <span className={`badge badge-${TIPOBADGE[o.servico] || 'diversos'}`} style={{ fontSize:10 }}>{o.servico}</span>
                          {o.descricao && <span style={{ fontSize:10, color:'var(--color-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110 }}>{o.descricao}</span>}
                        </div>

                        {o.prazoentrega && (
                          <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:'var(--space-2)', fontSize:10, color: vencida ? 'var(--color-error)' : ehHoje ? '#d19900' : 'var(--color-text-muted)', fontWeight: vencida || ehHoje ? 700 : 400 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                            {vencida ? 'Vencido' : ehHoje ? 'Hoje' : fmtD(o.prazoentrega)}
                          </div>
                        )}

                        {saldo > 0 && (
                          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:'var(--space-2)' }}>
                            Saldo <strong style={{ color:'var(--color-warning)' }}>{fmt(saldo)}</strong>
                          </div>
                        )}

                        <div style={{ display:'flex', gap:'var(--space-1)', marginTop:'var(--space-2)', borderTop:'1px solid var(--color-divider)', paddingTop:'var(--space-2)' }}>
                          <button className="btn btn-ghost btn-xs" style={{ flex:1, justifyContent:'center', fontSize:10 }} onClick={() => navigate(`/ordens/${o.id}`)}>
                            Detalhes
                          </button>
                          {canEdit && next && (
                            <button className="btn btn-primary btn-xs" style={{ flex:1, justifyContent:'center', fontSize:10 }} onClick={() => mudarStatus(o.id, next)}>
                              {next === 'Em Produção' ? 'Produzir' : next === 'Pronto' ? 'Concluir' : 'Entregar'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
              }
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden', flex:1 }}>
          {sorted.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width:40, height:40, marginBottom:'var(--space-3)', color:'var(--color-text-faint)' }}>
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>
              </svg>
              <h3>Nenhuma OS na fila</h3>
              <p>{search ? 'Tente outros termos.' : 'A fila está vazia.'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>OS</th><th>Cliente</th><th>Tipo</th><th>Descrição</th>
                    <th>Status</th><th>Prazo</th><th>Prioridade</th>
                    {canEdit && <th>Ação</th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(o => {
                    const venc = o.prazoentrega && o.prazoentrega < today
                    const next = STATUSNEXT[o.status]
                    return (
                      <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/ordens/${o.id}`)}>
                        <td><span style={{ fontWeight:800, color:'var(--color-primary)', fontSize:'var(--text-xs)' }}>{o.numero}</span></td>
                        <td style={{ fontWeight:600 }}>{o.clientenome}</td>
                        <td><span className={`badge badge-${TIPOBADGE[o.servico] || 'diversos'}`}>{o.servico}</span></td>
                        <td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'var(--text-xs)' }}>{o.descricao}</td>
                        <td><span style={{ fontSize:'var(--text-xs)', fontWeight:700, color: SCOLOR[o.status] }}>{o.status}</span></td>
                        <td style={{ fontSize:'var(--text-xs)', color: venc ? 'var(--color-error)' : 'var(--color-text-muted)', fontWeight: venc ? 700 : 400 }}>{fmtD(o.prazoentrega)}</td>
                        <td><span className={`badge badge-${o.prioridade === 'Urgente' ? 'urgente' : 'normal'}`}>{o.prioridade}</span></td>
                        {canEdit && (
                          <td>
                            {next && (
                              <button className="btn btn-primary btn-xs" onClick={e => { e.stopPropagation(); mudarStatus(o.id, next) }}>
                                {next}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
