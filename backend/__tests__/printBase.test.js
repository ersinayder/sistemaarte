import { describe, expect, it } from 'vitest';

const print = await import('../utils/print/base.js');

describe('print base', () => {
  it('renders an A4 printable document with logo, safe content and hidden actions', () => {
    const html = print.renderPrintDocument({
      title: 'Fechamento <script>',
      subtitle: 'Caixa',
      body: '<section>Conteudo seguro</section>',
      footer: 'Rodape',
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Arte e Molduras');
    expect(html).toContain('class="brand-logo"');
    expect(html).toContain('data:image/');
    expect(html).toContain('Imprimir / salvar PDF');
    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('.no-print { display: none !important; }');
    expect(html).toContain('Fechamento &lt;script&gt;');
    expect(html).not.toContain('<h1>Fechamento <script></h1>');
  });

  it('formats money and dates for Brazilian print documents', () => {
    expect(print.fmtMoney(1234.5)).toBe('R$&nbsp;1.234,50');
    expect(print.fmtDate('2026-05-23 10:15:00')).toBe('23/05/2026');
  });

  it('escapes table cell values by default and requires explicit trusted HTML', () => {
    const html = print.renderTable({
      columns: [
        { key: 'name', label: 'Nome' },
        { key: 'total', label: 'Total', render: (row) => `<strong>${print.fmtMoney(row.total)}</strong>`, html: true },
      ],
      rows: [{ name: '<img src=x onerror=alert(1)>', total: 10 }],
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('<strong>R$&nbsp;10,00</strong>');
  });

  it('sets print response headers compatible with the app CSP', () => {
    const headers = {};
    const res = {
      setHeader(key, value) {
        headers[key] = value;
      },
      send(value) {
        this.body = value;
      },
    };

    print.sendPrintHtml(res, 'fechamento.html', '<html></html>');

    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(headers['Content-Disposition']).toBe('inline; filename="fechamento.html"');
    expect(headers['Content-Security-Policy']).toContain("script-src 'unsafe-inline'");
    expect(headers['Content-Security-Policy']).toContain("style-src 'unsafe-inline'");
    expect(res.body).toBe('<html></html>');
  });
});
