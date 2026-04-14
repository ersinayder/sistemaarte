import React, { useState, useEffect } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import api from '../services/api'
import toast from 'react-hot-toast'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const fmt  = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')
const fmtD = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—'
const PAG_LABEL = { Credito:'Crédito', Debito:'Débito', Link:'Link Pag.' }
const PAG_BADGE = { Pix:'pix', Dinheiro:'dinheiro', Credito:'credito', Debito:'debito', Link:'link' }
const TIPO_BADGE= { 'Corte a Laser':'laser','Quadro':'quadro','Caixas':'caixas','3D':'3d','Diversos':'diversos' }

function imprimirRelatorio(dados, mes) {
  const [y,m] = mes.split('-')
  const nomeMes = new Date(parseInt(y),parseInt(m)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})
  const win = window.open('','_blank','width=600,height=800')
  const PAG_LABEL2 = { Credito:'Crédito', Debito:'Débito', Link:'Link Pag.' }
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"><title>Relatório ${nomeMes}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial;font-size:12px;padding:20px}
    h1{font-size:16px;margin-bottom:4px}.center{text-align:center}
    .line{border-top:1px dashed #999;margin:8px 0}.row{display:flex;justify-content:space-between;padding:2px 0}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:4px 6px;text-align:left;font-size:11px;border-bottom:1px solid #eee}
    th{font-weight:bold;background:#f5f5f5}@media print{body{padding:4px}}</style>
    </head><body>
    <div class="center"><h1>RELATÓRIO MENSAL — ${nomeMes.toUpperCase()}</h1></div>
    <div class="center" style="margin-bottom:12px">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    <div class="line"></div>
    <b>TOTAIS POR FORMA DE PAGAMENTO</b>
    ${Object.entries(dados.por_pagamento||{}).map(([p,v])=>v>0?`<div class="row"><span>${PAG_LABEL2[p]||p}</span><span>R$ ${Number(v).toFixed(2).replace('.',',')}</span></div>`:'').join('')}
    <div class="line"></div>
    <div class="row"><b>TOTAL GERAL</b><b>R$ ${Number(dados.total||0).toFixed(2).replace('.',',')}</b></div>
    <div class="row"><span>Lançamentos</span><span>${dados.count||0}</span></div>
    <div class="row"><span>Ticket Médio</span><span>R$ ${Number(dados.ticket_medio||0).toFixed(2).replace('.',',')}</span></div>
    <div class="line"></div>
    <b>LANÇAMENTOS DO MÊS</b>
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Pag.</th><th>Valor</th></tr></thead>
    <tbody>${(dados.lancamentos||[]).map(l=>`<tr><td>${fmtD(l.data)}</td><td>${l.tipo}</td><td>${l.descricao}</td><td>${PAG_LABEL2[l.pagamento]||l.pagamento}</td><td>R$ ${Number(l.valor).toFixed(2).replace('.',',')}</td></tr>`).join('')}</tbody>
    </table></body></html>`)
  win.document.close()
  setTimeout(()=>{win.focus();win.print()},400)
}


function exportarCSV(dados, mes) {
  if (!dados?.lancamentos?.length) return
  const header = ['Data','Tipo','Descrição','Pagamento','Valor (R$)']
  const rows = dados.lancamentos.map(l => [
    l.data ? new Date(l.data+'T12:00:00').toLocaleDateString('pt-BR') : '',
    l.tipo || '',
    (l.descricao || '').replace(/,/g, ';'),
    l.pagamento || '',
    Number(l.valor||0).toFixed(2).replace('.',',')
  ])
  const csv = [header, ...rows].map(r => r.join(',')).join('\n')
  const bom  = '\uFEFF'
  const blob = new Blob([bom + csv], { type:'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `relatorio-${mes}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Relatorios() {
  const hoje = new Date()
  const [mes, setMes] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`)
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get(`/relatorios/resumo?mes=${mes}`)
      .then(r => setDados(r.data))
      .catch(() => toast.error('Erro ao carregar relatório'))
      .finally(() => setLoading(false))
  }, [mes])

  if (loading) return <div className="loading-center"><div className="spinner"/></div>

  const dias = dados?.dias || []
  const lancs = dados?.lancamentos || []
  const porPag  = dados?.porpagamento || {}
  const porTipo = dados?.portipo || {}
  const total          = dados?.total          || 0
  const ordensAbertas  = dados?.ordens_abertas  || 0
  const ordensVencidas = dados?.ordens_vencidas || 0
  const totalCartao = (porPag.Credito||0) + (porPag.Debito||0)

  // Gráfico de barras diário
  const chartData = {
    labels: dias.map(d => { const [,, dd] = d.data.split('-'); return `${dd}/${d.data.split('-')[1]}` }),
    datasets: [{
      label:'Faturamento',
      data: dias.map(d => d.total),
      backgroundColor: '#01696f', borderRadius: 4,
    }]
  }
  const chartOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: c => `R$ ${Number(c.raw).toFixed(2).replace('.',',')}` } } },
    scales:{
      x:{ grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:10 }, color:'#7a7974' } },
      y:{ grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:10 }, color:'#7a7974', callback: v => `R$${v>=1000?(v/1000).toFixed(1)+'k':v}` } }
    }
  }

  const meses = Array.from({length:12},(_,i)=>{
    const d = new Date(); d.setMonth(d.getMonth()-i)
    return { value:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}) }
  })

  const [anoAtual, mesAtual] = mes.split('-')
  const nomeMes = new Date(parseInt(anoAtual),parseInt(mesAtual)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', textTransform:'capitalize' }}>{nomeMes}</p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'center' }}>
          <select className="form-input" value={mes} onChange={e=>setMes(e.target.value)} style={{ width:'auto' }}>
            {meses.map(m => <option key={m.value} value={m.value} style={{ textTransform:'capitalize' }}>{m.label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={() => dados && imprimirRelatorio(dados, mes)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/>
            </svg>
            Imprimir
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportarCSV(dados, mes)}
            style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs resumo */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'var(--space-3)', marginBottom:'var(--space-5)' }}>
        {[
          { label:'Total do Mês', value:fmt(total), color:'var(--color-primary)' },
          { label:'Lançamentos',  value:dados?.count||0, color:'var(--color-blue)' },
          { label:'Ticket Médio', value:fmt(dados?.ticketmedio||0), color:'var(--color-gold)' },
          { label:'Total Cartão', value:fmt(totalCartao), color:'var(--color-orange)' },
          { label:'Dias com Venda', value:dias.filter(d=>d.total>0).length, color:'var(--color-success)' },
        ].map(k => (
          <div key={k.label} className="card card-pad" style={{ textAlign:'center' }}>
            <div style={{ fontSize:'var(--text-lg)', fontWeight:800, color:k.color, fontVariantNumeric:'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Gráfico diário */}
      <div className="card card-pad" style={{ marginBottom:'var(--space-4)' }}>
        <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)' }}>Faturamento por Dia</div>
        <div style={{ height:200 }}>
          {dias.length > 0 ? <Bar data={chartData} options={chartOpts}/> : <div className="empty-state"><p>Sem dados neste período</p></div>}
        </div>
      </div>

      {/* Totais por pagamento + por tipo */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-4)', marginBottom:'var(--space-4)' }}>
        {/* Por pagamento */}
        <div className="card card-pad">
          <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)' }}>Por Forma de Pagamento</div>
          {Object.entries(porPag).filter(([,v])=>v>0).map(([p,v]) => {
            const pct = total > 0 ? v/total*100 : 0
            return (
              <div key={p} style={{ marginBottom:'var(--space-3)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'var(--space-1)' }}>
                  <span className={`badge badge-${PAG_BADGE[p]||'pix'}`}>{PAG_LABEL[p]||p}</span>
                  <span className="tabnum" style={{ fontWeight:700, fontSize:'var(--text-sm)' }}>{fmt(v)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width:`${pct}%` }}/>
                </div>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-faint)', textAlign:'right', marginTop:2 }}>{pct.toFixed(1)}%</div>
              </div>
            )
          })}
          {Object.values(porPag).every(v=>!v) && <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-faint)' }}>Sem dados</p>}
        </div>

        {/* Por tipo */}
        <div className="card card-pad">
          <div style={{ fontWeight:700, fontSize:'var(--text-sm)', marginBottom:'var(--space-4)' }}>Por Tipo de Serviço</div>
          {Object.entries(porTipo).filter(([,v])=>v>0).map(([t,v]) => {
            const pct = total > 0 ? v/total*100 : 0
            return (
              <div key={t} style={{ marginBottom:'var(--space-3)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'var(--space-1)' }}>
                  <span className={`badge badge-${TIPO_BADGE[t]||'diversos'}`}>{t}</span>
                  <span className="tabnum" style={{ fontWeight:700, fontSize:'var(--text-sm)' }}>{fmt(v)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width:`${pct}%` }}/>
                </div>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-faint)', textAlign:'right', marginTop:2 }}>{pct.toFixed(1)}%</div>
              </div>
            )
          })}
          {Object.values(porTipo).every(v=>!v) && <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-faint)' }}>Sem dados</p>}
        </div>
      </div>

      {/* Extrato completo */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'var(--space-4)', borderBottom:'1px solid var(--color-border)' }}>
          <span style={{ fontWeight:700, fontSize:'var(--text-sm)' }}>Extrato Completo</span>
          <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{lancs.length} lançamentos</span>
        </div>
        {lancs.length === 0
          ? <div className="empty-state"><p>Nenhum lançamento neste período</p></div>
          : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>OS</th><th>Pagamento</th><th>Status</th><th>Valor</th></tr></thead>
              <tbody>
                {lancs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize:'var(--text-xs)', whiteSpace:'nowrap' }}>{fmtD(l.data)}</td>
                    <td><span className={`badge badge-${TIPO_BADGE[l.tipo]||'diversos'}`}>{l.tipo}</span></td>
                    <td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.descricao}</td>
                    <td>{l.ordem_numero ? <span style={{ fontSize:'var(--text-xs)', color:'var(--color-primary)', fontWeight:600 }}>{l.ordem_numero}</span> : <span style={{ color:'var(--color-text-faint)' }}>—</span>}</td>
                    <td><span className={`badge badge-${PAG_BADGE[l.pagamento]||'pix'}`}>{PAG_LABEL[l.pagamento]||l.pagamento}</span></td>
                    <td><span className="badge" style={{ background:l.pago?'var(--color-success-hl)':'var(--color-gold-hl)', color:l.pago?'var(--color-success)':'var(--color-gold)' }}>{l.pago?'✓':'Pendente'}</span></td>
                    <td className="tabnum" style={{ fontWeight:700, color:l.valor<0?'var(--color-red)':'inherit', whiteSpace:'nowrap' }}>{fmt(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
