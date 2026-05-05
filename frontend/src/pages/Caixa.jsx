import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { emit } from '../services/eventBus';

const TIPO_OPT = ['Entrada','Saída'];
const PAGAMENTO_OPT = ['Dinheiro','Pix','Cartão de Débito','Cartão de Crédito','Transferência','Outros'];
const CATEG_OPT = {
  Entrada: ['Pagamento OS','Adiantamento','Outros'],
  Saída:  ['Fornecedor','Despesa Fixa','Despesa Variável','Retirada','Outros'],
};

function getToday() { return new Date().toISOString().split('T')[0]; }
function getMesAtual() { return new Date().toISOString().slice(0, 7); }
function shiftDay(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}
function labelDay(dateStr) {
  const today = getToday();
  const yesterday = shiftDay(today, -1);
  if (dateStr === today) return 'Hoje';
  if (dateStr === yesterday) return 'Ontem';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' });
}

function gerarPDFFechamento(lancamentos, date, diaEntrada, diaSaida, diaSaldo) {
  const fmtCur = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtD   = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';

  // Agrupar entradas por forma de pagamento
  const entradas = lancamentos.filter(l => l.tipo === 'Entrada');
  const saidas   = lancamentos.filter(l => l.tipo === 'Saída');
  const grupos = {};
  PAGAMENTO_OPT.forEach(p => { grupos[p] = { total: 0, itens: [] }; });
  entradas.forEach(l => {
    const pg = l.pagamento || 'Outros';
    if (!grupos[pg]) grupos[pg] = { total: 0, itens: [] };
    grupos[pg].total += Number(l.valor||0);
    grupos[pg].itens.push(l);
  });

  const rows = lancamentos.map(l => `
    <tr>
      <td>${l.tipo==='Entrada'?'↑':'↓'} ${l.categoria||'—'}</td>
      <td>${l.descricao||'—'}</td>
      <td>${l.pagamento||'—'}</td>
      <td style="text-align:right;color:${l.tipo==='Entrada'?'#166534':'#991b1b'}">${l.tipo==='Entrada'?'+':'−'} ${fmtCur(l.valor)}</td>
    </tr>
  `).join('');

  const gruposRows = Object.entries(grupos)
    .filter(([,g]) => g.total > 0)
    .map(([pg, g]) => `
      <tr>
        <td><b>${pg}</b></td>
        <td style="text-align:right;color:#166534"><b>${fmtCur(g.total)}</b></td>
      </tr>
    `).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Fechamento Diário — ${fmtD(date)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  h2 { font-size: 13px; margin: 16px 0 6px; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px; }
  .kpis { display: flex; gap: 24px; margin-bottom: 16px; }
  .kpi { background: #f5f5f5; border-radius: 6px; padding: 8px 14px; }
  .kpi-label { font-size: 10px; color: #666; }
  .kpi-val { font-size: 15px; font-weight: 700; }
  .kpi-val.green { color: #166534; }
  .kpi-val.red   { color: #991b1b; }
  .kpi-val.blue  { color: #1e40af; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f0f0f0; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; padding: 5px 8px; text-align: left; }
  td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="logo">Arte &amp; Molduras</div>
  <h1>Fechamento de Caixa — ${fmtD(date)}</h1>
  <p style="color:#666;font-size:10px;margin-bottom:16px">Gerado em ${new Date().toLocaleString('pt-BR')}</p>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Total Entradas</div>
      <div class="kpi-val green">${fmtCur(diaEntrada)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Saídas</div>
      <div class="kpi-val red">${fmtCur(diaSaida)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Saldo do Dia</div>
      <div class="kpi-val blue">${fmtCur(diaSaldo)}</div>
    </div>
  </div>

  <h2>Entradas por Forma de Pagamento</h2>
  <table>
    <thead><tr><th>Forma</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${gruposRows || '<tr><td colspan="2" style="color:#999">Nenhuma entrada</td></tr>'}</tbody>
  </table>

  <h2>Lançamentos do Dia</h2>
  <table>
    <thead><tr><th>Tipo / Categoria</th><th>Descrição</th><th>Pagamento</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="color:#999">Sem lançamentos</td></tr>'}</tbody>
  </table>

  <div style="margin-top:24px;padding-top:12px;border-top:2px solid #333;display:flex;justify-content:space-between">
    <span>Responsável: ___________________________</span>
    <span>Assinatura: ___________________________</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function Pagination({ current, total, onChange }) {
  if (total <= 1) return null;
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'var(--space-3) var(--space-4)', borderTop:'1px solid var(--color-border)',
      flexShrink:0, gap:'var(--space-2)', flexWrap:'wrap