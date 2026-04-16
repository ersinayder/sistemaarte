import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import api from '../services/api'
import toast from 'react-hot-toast'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler
)

const fmt = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const fmtShort = v => {
  const n = Number(v || 0)
  if (n >= 1000) return 'R$ ' + (n / 1000).toFixed(1).replace('.', ',') + 'k'
  return fmt(v)
}
const fmtD = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—'

const HOJE = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const MES_PADRAO = HOJE.slice(0, 7)

const STATUS_BADGE = {
  'Recebido': 'recebido', 'Em Produção': 'emproducao',
  'Pronto': 'pronto', 'Entregue': 'entregue', 'Cancelado': 'cancelado'
}

// Cores reais (hex) para Chart.js que não resolve CSS variables
const C_PRIMARY      = '#01696f'
const C_PRIMARY_LIGHT= '#4f98a3'
const C_BG_DARK      = '#1c1b19'
const C_BORDER_DARK  = '#393836'
const C_TEXT_MUTED   = '#797876'
const C_TEXT_FAINT   = '#5a5957'
const C_DIVIDER      = '#262523'

function KPI({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-xl)',
      borderTop: `3px solid ${accent || 'var(--color-primary)'}`,
      padding: 'var(--space-5)',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex', flexDirection: 'column', gap: 'var(--space-2)'
    }}>
      <span style={{
        fontSize: 'var(--text-xs)', fontWeight: 700,
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em'
      }}>{label}</span>
      <span style={{
        fontSize: 'var(--text-xl)', fontWeight: 800,
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        color: accent || 'var(--color-text)'
      }}>{value}</span>
      {sub && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>{sub}</span>}
    </div>
  )
}

function ChartCard({ title, subtitle, children, style }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      ...style
    }}>
      <div style={{
        padding: 'var(--space-5) var(--space-5) var(--space-4)',
        borderBottom: '1px solid var(--color-divider)',
        display: 'flex', flexDirection: 'column', gap: 2
      }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>
            {subtitle}
          </span>
        )}
      </div>
      <div style={{ padding: 'var(--space-5)' }}>{children}</div>
    </div>
  )
}

// Plugin para gradiente sob a linha
const gradientPlugin = {
  id: 'customGradient',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart
    if (!x) return
    const dataset = chart.data.datasets[0]
    if (!dataset) return
    const gradient = ctx.createLinearGradient(0, top, 0, bottom)
    gradient.addColorStop(0,  'rgba(1,105,111,0.35)')
    gradient.addColorStop(0.6,'rgba(1,105,111,0.08)')
    gradient.addColorStop(1,  'rgba(1,105,111,0.00)')
    dataset.backgroundColor = gradient
  }
}

export default function Dashboard() {
  const navigate = useNavigate()

  const [mesSel, setMesSel] = useState(MES_PADRAO)
  const [dados, setDados] = useState(null)
  const [ordens, setOrdens] = useState([])
  const [loading, setLoading] = useState(true)

  const mesNome = new Date(`${mesSel}-01T12:00:00`)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  useEffect(() => { document.title = 'Dashboard — Arte & Molduras' }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, rOrdens] = await Promise.all([
        api.get(`/relatorios/resumo?mes=${mesSel}`),
        api.get('/ordens')
      ])
      setDados(rRes.data)
      setOrdens(rOrdens.data?.ordens || rOrdens.data || [])
    } catch {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [mesSel])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="loading-center">
      <div className="spinner" />
    </div>
  )

  const lineData = {
    labels: dados?.dias?.map(d => {
      const [, , day] = d.data.split('-')
      return day + '/' + d.data.split('-')[1]
    }) || [],
    datasets: [{
      data: dados?.dias?.map(d => d.total) || [],
      borderColor: C_PRIMARY_LIGHT,
      backgroundColor: 'transparent', // sobrescrito pelo plugin
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: C_PRIMARY_LIGHT,
      pointBorderColor: C_BG_DARK,
      pointBorderWidth: 2,
      borderWidth: 2.5,
      fill: true,
    }]
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#171614',
        titleColor: '#cdccca',
        bodyColor: C_TEXT_MUTED,
        borderColor: C_BORDER_DARK,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: { label: ctx => '  ' + fmt(ctx.raw) }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: C_TEXT_FAINT, font: { size: 11 } }
      },
      y: {
        grid: { color: C_DIVIDER, drawBorder: false },
        border: { display: false, dash: [4, 4] },
        ticks: {
          color: C_TEXT_FAINT, font: { size: 11 },
          callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
        }
      }
    }
  }

  const pagLabels = Object.keys(dados?.porpagamento || {}).filter(k => dados.porpagamento[k] > 0)
  const pagValues = pagLabels.map(k => dados.porpagamento[k])
  const PAG_COLORS = {
    Pix: '#01696f', Dinheiro: '#d19900', Credito: '#da7101',
    Debito: '#006494', Link: '#7a39bb'
  }
  const doughnutData = {
    labels: pagLabels,
    datasets: [{
      data: pagValues,
      backgroundColor: pagLabels.map(k => PAG_COLORS[k] || '#bbb'),
      borderWidth: 0,
      hoverOffset: 4
    }]
  }
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: C_TEXT_MUTED,
          font: { size: 12 },
          padding: 14,
          boxWidth: 10,
          boxHeight: 10,
          borderRadius: 3,
          useBorderRadius: true,
        }
      },
      tooltip: {
        backgroundColor: '#171614',
        titleColor: '#cdccca',
        bodyColor: C_TEXT_MUTED,
        borderColor: C_BORDER_DARK,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: { label: ctx => '  ' + fmt(ctx.raw) }
      }
    }
  }

  const ordensRecentes = [...ordens]
    .sort((a, b) => (b.id || 0) - (a.id || 0))
    .slice(0, 5)

  const tipoCount = {}
  ordens.forEach(o => {
    const t = o.servico || 'Outros'
    tipoCount[t] = (tipoCount[t] || 0) + 1
  })
  const TIPO_COLORS = {
    'Corte a Laser': 'var(--color-primary)',
    'Quadro': 'var(--color-orange)',
    'Caixas': 'var(--color-blue)',
    '3D': 'var(--color-purple)',
    'Diversos': 'var(--color-text-faint)',
  }

  const ordensVencidas = ordens.filter(o =>
    !['Entregue', 'Cancelado'].includes(o.status) &&
    o.prazoentrega &&
    o.prazoentrega < HOJE
  ).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, marginBottom: 2 }}>Dashboard</h1>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
            {mesNome}
          </span>
        </div>
        <input
          type="month"
          value={mesSel}
          max={MES_PADRAO}
          onChange={e => e.target.value && setMesSel(e.target.value)}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            cursor: 'pointer'
          }}
        />
      </div>

      {/* KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--space-4)'
      }}>
        <KPI label="Total do Mês" value={fmtShort(dados?.total)}
          sub={`${dados?.count || 0} lançamento${dados?.count !== 1 ? 's' : ''}`}
          accent="var(--color-primary)" />
        <KPI label="Faturamento Hoje" value={fmtShort(dados?.hoje)}
          sub="dia atual" accent="var(--color-blue)" />
        <KPI label="Ticket Médio" value={fmtShort(dados?.ticket_medio || dados?.ticketmedio)}
          sub="por lançamento" accent="var(--color-gold)" />
        <KPI label="OS em Aberto" value={dados?.ordensabertas ?? 0}
          sub={ordensVencidas > 0 ? `${ordensVencidas} vencida${ordensVencidas > 1 ? 's' : ''}` : 'no prazo'}
          accent={ordensVencidas > 0 ? 'var(--color-error)' : 'var(--color-success)'} />
      </div>

      {/* Gráficos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--space-4)'
      }}>
        <ChartCard title="Faturamento Diário" subtitle={`Evolução de receitas em ${mesNome}`}>
          {dados?.dias?.length ? (
            <div style={{ height: 220 }}>
              <Line data={lineData} options={lineOptions} plugins={[gradientPlugin]} />
            </div>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>Sem dados no período</span>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Por Pagamento" subtitle="Distribuição do mês">
          {pagValues.length ? (
            <div style={{ height: 220 }}><Doughnut data={doughnutData} options={doughnutOptions} /></div>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>Sem dados</span>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Tabela + OS por tipo */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 'var(--space-4)',
        alignItems: 'start'
      }}>
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-divider)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Últimas Ordens</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 2 }}>5 mais recentes</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/ordens')}>
              Ver todas
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>OS</th><th>Cliente</th><th>Tipo</th>
                  <th>Status</th><th>Valor</th><th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {ordensRecentes.length ? ordensRecentes.map(o => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/ordens/${o.id}`)}>
                    <td style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{o.numero}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.cliente_nome || o.clientenome || o.cliente?.nome || '—'}
                    </td>
                    <td>
                      <span className={`badge badge-${
                        o.servico === 'Corte a Laser' ? 'laser' :
                        o.servico === 'Quadro' ? 'quadro' :
                        o.servico === '3D' ? '3d' :
                        o.servico === 'Caixas' ? 'caixas' : 'diversos'
                      }`}>{o.servico || 'Outros'}</span>
                    </td>
                    <td>
                      <span className={`badge badge-${STATUS_BADGE[o.status] || 'diversos'}`}>{o.status}</span>
                    </td>
                    <td className="tabnum" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {fmt(o.valor || o.valortotal)}
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {fmtD(o.prazoentrega)}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-faint)', padding: 'var(--space-8)' }}>
                    Nenhuma OS ainda
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ChartCard title="OS por Tipo" subtitle="Contagem geral">
          {Object.keys(tipoCount).length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {Object.entries(tipoCount)
                .sort((a, b) => b[1] - a[1])
                .map(([tipo, count]) => {
                  const total = ordens.length || 1
                  const pct = Math.round((count / total) * 100)
                  const cor = TIPO_COLORS[tipo] || 'var(--color-text-faint)'
                  return (
                    <div key={tipo}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600 }}>{tipo}</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                          {count} <span style={{ opacity: 0.6 }}>({pct}%)</span>
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: cor }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
              Sem dados
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
