const {
  esc,
  fmtDate,
  renderKpis,
  renderPrintDocument,
  renderTable,
} = require('./base');

function mesLabel(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) return esc(mes || '');
  const [ano, month] = mes.split('-');
  return `${month}/${ano}`;
}

function duracaoLabel(minutos) {
  const total = Number(minutos);
  if (!Number.isFinite(total) || total <= 0) return '&mdash;';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}

function renderRelatorioProducaoHtml({ mes, fases = [], porOperador = [], porFase = [] } = {}) {
  const concluidas = porOperador.reduce((acc, row) => acc + Number(row.fases_concluidas || 0), 0);
  const andamento = porOperador.reduce((acc, row) => acc + Number(row.em_andamento || 0), 0);
  const body = `
    <section class="section">
      ${renderKpis([
        { label: 'Fases registradas', value: String(fases.length) },
        { label: 'Concluidas', value: String(concluidas), tone: 'good' },
        { label: 'Em andamento', value: String(andamento) },
      ])}
    </section>

    <section class="section">
      <h2 class="section-title">Resumo por operador</h2>
      ${renderTable({
        columns: [
          { key: 'operador', label: 'Operador', render: (row) => esc(row.operador || 'Sem usuario'), html: true },
          { key: 'total_fases', label: 'Total', align: 'right', render: (row) => esc(row.total_fases), html: true },
          { key: 'fases_concluidas', label: 'Concluidas', align: 'right', render: (row) => esc(row.fases_concluidas), html: true },
          { key: 'em_andamento', label: 'Andamento', align: 'right', render: (row) => esc(row.em_andamento), html: true },
          { key: 'media_duracao_min', label: 'Media', align: 'right', render: (row) => duracaoLabel(row.media_duracao_min), html: true },
        ],
        rows: porOperador,
        empty: 'Nenhum operador no periodo.',
      })}
    </section>

    <section class="section">
      <h2 class="section-title">Resumo por fase</h2>
      ${renderTable({
        columns: [
          { key: 'fase', label: 'Fase', render: (row) => esc(row.fase), html: true },
          { key: 'total', label: 'Total', align: 'right', render: (row) => esc(row.total), html: true },
          { key: 'media_duracao_min', label: 'Media', align: 'right', render: (row) => duracaoLabel(row.media_duracao_min), html: true },
        ],
        rows: porFase,
        empty: 'Nenhuma fase no periodo.',
      })}
    </section>

    <section class="section">
      <h2 class="section-title">Fases registradas</h2>
      ${renderTable({
        columns: [
          { key: 'osnumero', label: 'OS', render: (row) => esc(row.osnumero), html: true },
          { key: 'servico', label: 'Servico', render: (row) => esc(row.servico), html: true },
          { key: 'status', label: 'Fase', render: (row) => esc(row.status), html: true },
          { key: 'operador', label: 'Operador', render: (row) => esc(row.operador || 'Sem usuario'), html: true },
          { key: 'iniciadoem', label: 'Inicio', render: (row) => esc(row.iniciadoem ? `${fmtDate(row.iniciadoem)} ${String(row.iniciadoem).slice(11, 16)}` : ''), html: true },
          { key: 'finalizadoem', label: 'Fim', render: (row) => esc(row.finalizadoem ? `${fmtDate(row.finalizadoem)} ${String(row.finalizadoem).slice(11, 16)}` : ''), html: true },
          { key: 'duracao_min', label: 'Duracao', align: 'right', render: (row) => duracaoLabel(row.duracao_min), html: true },
        ],
        rows: fases,
        empty: 'Nenhuma fase registrada.',
      })}
    </section>
  `;

  return renderPrintDocument({
    title: 'Relatorio de Producao',
    subtitle: mesLabel(mes),
    body,
    compact: true,
  });
}

module.exports = {
  duracaoLabel,
  renderRelatorioProducaoHtml,
};
