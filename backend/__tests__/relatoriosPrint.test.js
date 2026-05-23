import { describe, expect, it } from 'vitest';

const { renderRelatorioProducaoHtml } = await import('../utils/print/producaoReport.js');

describe('relatorios print', () => {
  it('renders production report with logo, operators, phases and rows', () => {
    const html = renderRelatorioProducaoHtml({
      mes: '2026-05',
      porOperador: [{ operador: 'Oficina', total_fases: 3, fases_concluidas: 2, em_andamento: 1, media_duracao_min: 90 }],
      porFase: [{ fase: 'Em Produ\u00e7\u00e3o', total: 2, media_duracao_min: 120 }],
      fases: [{ osnumero: 'OS-0004', servico: 'Quadro', status: 'Pronto', operador: 'Oficina', iniciadoem: '2026-05-20 10:00:00', finalizadoem: '2026-05-20 12:00:00', duracao_min: 120 }],
    });

    expect(html).toContain('class="brand-logo"');
    expect(html).toContain('Relatorio de Producao');
    expect(html).toContain('Oficina');
    expect(html).toContain('Em Produ');
    expect(html).toContain('OS-0004');
    expect(html).toContain('2h');
  });
});
