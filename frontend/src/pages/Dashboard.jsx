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
import { useKpiStream } from '../hooks/useKpiStream'

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

const getHoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const getMesPadrao = () => getHoje().slice(0, 7)

const STATUS_BADGE = {
  'Recebido': 'recebido', 'Em Produção': 'emproducao',
  'Pronto': 'pronto', 'Entregue': 'entregue', 'Cancelado': 'cancelado'
}

const C_PRIMARY      = '#01696f'
const C_PRIMARY_LIGHT= '#4f98a3'
const C_BG_DARK      = '#1c1b19'
const C_BORDER_DARK  = '#393836'
const C_TEXT_MUTED   = '#797876'
const C_TEXT_FAINT   = '#5a5957'
const C_DIVIDER      = '#262523'

const PAG_COLORS = {
  Pix:      '#01696f',
  Dinheiro: '#d19900',
  Credito:  '#da7101',
  Debito:   '#006494',
  Link:     '#7a39bb',
}
const PAG_LABELS = {
  Pix:      'Pix',
  Dinheiro: 'Dinheiro',
  Credito:  'Cartão de Crédito',
  Debito:   'Cartão de Débito',
  Link:     'Link de Pagamento',
}

function KPI({ label, value, sub, accent }) {
  return (
    <div className="kpi-card" style={{
      borderTop: `3px solid ${accent || 'var(--color-primary)'}`,
    }}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={{ color: accent || 'var(--color-text)', fontSize: 'clamp(1.1rem, 1rem + 1.5vw, 1.8rem)' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>{sub}</span>}
    </div>
  )
}

function LiveKPI({ label, value, sub, accent, pulse }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      borderTop: `3px solid ${accent || 'var(--color-primary)'}`,
      padding: 'var(--space-3) var(--space-3)',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex', flexDirection: 'column', gap: 4,
      position: 'relative', overflow: 'hidden', minWidth: 0
    }}>
      {pulse && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          width: 6, height: 6, borderRadius: '50%',
          background: accent || 'var(--color-primary)',
          boxShadow: `0 0 0 3px ${(accent || '#01696f')}33`,
          animation: 'kpi-pulse 2s infinite'
        }} />
      )}
      <span style={{
        fontSize: 9, fontWeight: 700,
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        lineHeight: 1, paddingRight: 14
      }}>{label}</span>
      <span style={{
        fontSize: 'clamp(1.1rem, 0.9rem + 1.5vw, 1.6rem)', fontWeight: 800,
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        color: accent || 'var(--color-text)'
      }}>{value ?? '—'}</span>
      {sub && <span style={{ fontSize: 9, color: 'var(--color-text-faint)', lineHeight: 1.2 }}>{sub}</span>}
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
        padding: 'var(--space-3) var(--space-4)',
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
      <div style={{ padding: 'var(--space-3) var(--space-4)' }}>{children}</div>
    </div>
  )
}

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
  const { kpis: live, online } = useKpiStream()

  const [mesSel, setMesSel] = useState(getMesPadrao)
  const [dados, setDados]   = useState(null)
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
    <div className="loading-center"><div className="spinner" /></div>
  )

  const hoje = getHoje()

  const lineData = {
    labels: dados?.dias?.map(d => {
      const [, , day] = d.data.split('-')
      return day + '/' + d.data.split('-')[1]
    }) || [],
    datasets: [{
      data: dados?.dias?.map(d => d.total) || [],
      borderColor: C_PRIMARY_LIGHT,
      backgroundColor: 'transparent',
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: C_PRIMARY_LIGHT,
      pointBorderColor: C_BG_DARK,
      pointBorderWidth: 2,
      borderWidth: 2,
      fill: true,
    }]
  }
  const lineOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#171614', titleColor: '#cdccca', bodyColor: C_TEXT_MUTED,
        borderColor: C_BORDER_DARK, borderWidth: 1, padding: 10, cornerRadius: 8,
        callbacks: { label: ctx => '  ' + fmtShort(ctx.raw) }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: C_TEXT_FAINT, font: { size: 10 }, maxTicksLimit: 6 }
      },
      y: {
        grid: { color: C_DIVIDER, drawBorder: false },
        border: { display: false, dash: [4, 4] },
        ticks: { color: C_TEXT_FAINT, font: { size: 10 }, callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) }
      }
    }
  }

  const pagKeys   = Object.keys(dados?.porpagamento || {}).filter(k => (dados.porpagamento[k] || 0) > 0)
  const pagLabels = pagKeys.map(k => PAG_LABELS[k] || k)
  const pagValues = pagKeys.map(k => dados.porpagamento[k])

  const doughnutData = {
    labels: pagLabels,
    datasets: [{
      data: pagValues,
      backgroundColor: pagKeys.map(k => PAG_COLORS[k] || '#999'),
      borderWidth: 0, hoverOffset: 4
    }]
  }
  const doughnutOptions = {
    responsive: true, maintainAspectRatio: false, cutout: '70%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: C_TEXT_MUTED, font: { size: 10 }, padding: 8, boxWidth: 8, boxHeight: 8, borderRadius: 3, useBorderRadius: true }
      },
      tooltip: {
        backgroundColor: '#171614', titleColor: '#cdccca', bodyColor: C_TEXT_MUTED,
        borderColor: C_BORDER_DARK, borderWidth: 1, padding: 10, cornerRadius: 8,
        callbacks: { label: ctx => '  ' + fmt(ctx.raw) }
      }
    }
  }

  const ordensRecentes = [...ordens].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5)
  const tipoCount = {}
  ordens.forEach(o => { const t = o.servico || 'Outros'; tipoCount[t] = (tipoCount[t] || 0) + 1 })
  const TIPO_COLORS = {
    'Corte a Laser': 'var(--color-primary)', 'Quadro': 'var(--color-orange)',
    'Caixas': 'var(--color-blue)', '3D': 'var(--color-purple)', 'Diversos': 'var(--color-text-faint)',
  }
  const ordensVencidas = ordens.filter(o =>
    !['Entregue', 'Cancelado'].includes(o.status) && o.prazoentrega && o.prazoentrega < hoje
  ).length

  return (
    <div className="dash-root">

      <style>{`
        @keyframes kpi-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.4); }
        }

        .dash-root {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        /* ── Live grid: 4 colunas → 4 → 3 no mobile pequeno */
        .dash-live-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-3);
        }
        /* Faturado Hoje ocupa 2 colunas na linha do grid de 4 para ficar proporcional */
        .dash-live-faturado {
          grid-column: span 2;
        }

        /* ── KPI mensal: 4 colunas */
        .dash-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-3);
        }

        /* ── Gráficos: 2 colunas */
        .dash-charts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
        }

        /* ── Tabela + OS Tipo: 2 colunas */
        .dash-bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
          align-items: start;
        }

        /* ── Tablet (≤ 900px) */
        @media (max-width: 900px) {
          .dash-live-grid    { grid-template-columns: repeat(4, 1fr); }
          .dash-kpi-grid     { grid-template-columns: repeat(2, 1fr); }
          .dash-bottom-grid  { grid-template-columns: 1fr; }
        }

        /* ── Mobile (≤ 600px) */
        @media (max-width: 600px) {
          .dash-root         { gap: var(--space-3); }

          /* Live KPIs: 3 colunas balanceadas — 6 cards ficam em 2 linhas de 3 */
          .dash-live-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: var(--space-2);
          }
          /* Faturado Hoje volta a ocupar 1 coluna no grid de 3 */
          .dash-live-faturado {
            grid-column: span 1;
          }

          /* KPI mensal: 2 colunas */
          .dash-kpi-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: var(--space-2);
          }

          /* Gráficos: 1 coluna */
          .dash-charts-grid  { grid-template-columns: 1fr; gap: var(--space-3); }

          /* Tabela+Tipo: 1 coluna */
          .dash-bottom-grid  { grid-template-columns: 1fr; gap: var(--space-3); }

          /* Esconde colunas secundárias da tabela */
          .hide-mobile       { display: none !important; }

          /* Cabeçalho do dashboard mais compacto */
          .dash-header-input { font-size: 11px !important; padding: 4px 8px !important; }
        }

        /* ── Mobile pequeno (≤ 380px) */
        @media (max-width: 380px) {
          .dash-live-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .dash-live-faturado {
            grid-column: span 2;
          }
        }
      `}</style>

      {/* ── Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, marginBottom: 2 }}>Dashboard</h1>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
            {mesNome}
          </span>
        </div>
        <input
          type="month" value={mesSel} max={getMesPadrao()}
          onChange={e => e.target.value && setMesSel(e.target.value)}
          className="dash-header-input"
          style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', cursor: 'pointer'
          }}
        />
      </div>

      {/* ── SEÇÃO AO VIVO */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Ao Vivo</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600,
            color: online ? 'var(--color-success)' : 'var(--color-text-faint)',
            background: online ? 'var(--color-success-highlight)' : 'var(--color-surface-offset)',
            padding: '2px 7px', borderRadius: 'var(--radius-full)'
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: online ? 'var(--color-success)' : 'var(--color-text-faint)',
              display: 'inline-block',
              animation: online ? 'kpi-pulse 2s infinite' : 'none'
            }} />
            {online ? 'SSE conectado' : 'polling'}
          </span>
          {live?.ts && (
            <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>
              atualizado {new Date(live.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        <div className="dash-live-grid">
          <LiveKPI label="OS Abertas"      value={live?.abertas}      accent="var(--color-primary)"  pulse />
          <LiveKPI label="Em Produção"     value={live?.emProducao}   accent="var(--color-blue)"     pulse />
          <LiveKPI label="Prontas"         value={live?.prontas}      accent="var(--color-success)"  pulse />
          <LiveKPI label="Aguardando"      value={live?.aguardando}   accent="var(--color-gold)"     pulse />
          <LiveKPI
            label="Vencidas"
            value={live?.vencidas}
            accent={live?.vencidas > 0 ? 'var(--color-error)' : 'var(--color-text-faint)'}
            sub={live?.vencidas > 0 ? 'prazo expirado' : 'no prazo'}
            pulse={live?.vencidas > 0}
          />
          <LiveKPI
            label="Entregas Hoje"
            value={live?.entreguesHoje}
            accent="var(--color-purple)"
            sub={live?.abertasHoje != null ? `${live.abertasHoje} abertas hoje` : undefined}
          />
          <div className="dash-live-faturado">
            <LiveKPI
              label="Faturado Hoje"
              value={live?.faturamentoHoje != null ? fmtShort(live.faturamentoHoje) : '—'}
              accent="var(--color-orange)"
              pulse
            />
          </div>
        </div>
      </div>

      {/* ── KPIs mensais */}
      <div className="dash-kpi-grid">
        <KPI label="Total do Mês"
          value={fmtShort(dados?.total)}
          sub={`${dados?.count || 0} lançamentos`}
          accent="var(--color-primary)" />
        <KPI label="Faturamento Hoje"
          value={fmtShort(dados?.hoje)}
          sub="dia atual" accent="var(--color-blue)" />
        <KPI label="Ticket Médio"
          value={fmtShort(dados?.ticket_medio || dados?.ticketmedio)}
          sub="por lançamento" accent="var(--color-gold)" />
        <KPI label="OS em Aberto"
          value={dados?.ordensabertas ?? 0}
          sub={ordensVencidas > 0 ? `${ordensVencidas} vencida${ordensVencidas > 1 ? 's' : ''}` : 'no prazo'}
          accent={ordensVencidas > 0 ? 'var(--color-error)' : 'var(--color-success)'} />
      </div>

      {/* ── Gráficos */}
      <div className="dash-charts-grid">
        <ChartCard title="Faturamento Diário" subtitle={`${mesNome}`}>
          {dados?.dias?.length ? (
            <div style={{ height: 180 }}>
              <Line data={lineData} options={lineOptions} plugins={[gradientPlugin]} />
            </div>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>Sem dados</span>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Por Pagamento" subtitle="Distribuição do mês">
          {pagValues.length ? (
            <div style={{ height: 180 }}><Doughnut data={doughnutData} options={doughnutOptions} /></div>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>Sem dados</span>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Tabela + OS por tipo */}
      <div className="dash-bottom-grid">
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden'
        }}>
          <div style={{
            padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-divider)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Últimas Ordens</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 1 }}>5 mais recentes</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/ordens')}>
              Ver todas
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>OS</th>
                  <th>Cliente</th>
                  <th className="hide-mobile">Tipo</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th className="hide-mobile">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {ordensRecentes.length ? ordensRecentes.map(o => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/ordens/${o.id}`)}>
                    <td style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{o.numero}</td>
                    <td style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.cliente_nome || o.clientenome || o.cliente?.nome || '—'}
                    </td>
                    <td className="hide-mobile">
                      <span className={`badge badge-${
                        o.servico === 'Corte a Laser' ? 'laser' : o.servico === 'Quadro' ? 'quadro' :
                        o.servico === '3D' ? '3d' : o.servico === 'Caixas' ? 'caixas' : 'diversos'
                      }`}>{o.servico || 'Outros'}</span>
                    </td>
                    <td><span className={`badge badge-${STATUS_BADGE[o.status] || 'diversos'}`}>{o.status}</span></td>
                    <td className="tabnum" style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>{fmtShort(o.valor || o.valortotal)}</td>
                    <td className="hide-mobile" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(o.prazoentrega)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-faint)', padding: 'var(--space-8)' }}>Nenhuma OS ainda</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ChartCard title="OS por Tipo" subtitle="Contagem geral">
          {Object.keys(tipoCount).length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {Object.entries(tipoCount).sort((a, b) => b[1] - a[1]).map(([tipo, count]) => {
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
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>Sem dados</div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
