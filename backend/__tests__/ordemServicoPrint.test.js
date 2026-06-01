import { describe, expect, it } from 'vitest';

const { renderOrdemServicoHtml } = await import('../utils/print/ordemServico.js');

describe('ordemServico print', () => {
  it('renders a branded service order with client, items, totals and signatures', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-0042',
        status: 'Em Produ\u00e7\u00e3o',
        prioridade: 'Urgente',
        createdat: '2026-05-20 09:00:00',
        prazoentrega: '2026-05-28',
        clientenome: 'Cliente Teste',
        clientetelefone: '(31) 99999-0000',
        clientecpf: '123.456.789-09',
        servico: 'Quadro',
        descricao: 'Moldura preta 40x60',
        observacoes: 'Cuidado com vidro',
        criadopornome: 'Atendente',
      },
      itens: [
        { nome: 'Moldura preta', quantidade: 1, preco_unitario: 120 },
        { nome: 'Vidro antirreflexo', quantidade: 1, preco_unitario: 80 },
      ],
      resumo: {
        total: 200,
        recebido: 50,
        saldo: 150,
      },
    });

    expect(html).toContain('class="brand-logo"');
    expect(html).toContain('Ordem de Servico');
    expect(html).toContain('OS-0042');
    expect(html).toContain('Cliente Teste');
    expect(html).toContain('Moldura preta');
    expect(html).toContain('Vidro antirreflexo');
    expect(html).toContain('R$&nbsp;200,00');
    expect(html).toContain('R$&nbsp;150,00');
    expect(html).toContain('Assinatura do Cliente');
    expect(html).toContain('window.print();');
    expect(html).toContain('Ao aprovar esta Ordem de Serviço');
    expect(html).toContain('serviço/produto é personalizado');
    expect(html).toContain('início da produção');
    expect(html).toContain('não sendo reembolsável');
  });

  it('escapes service order data', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-<1>',
        clientenome: '<script>alert(1)</script>',
        servico: 'Quadro',
        status: 'Aguardando',
      },
      itens: [{ nome: '<b>Item</b>', quantidade: 1, preco_unitario: 10 }],
      resumo: { total: 10, recebido: 0, saldo: 10 },
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>Item</b>');
    expect(html).toContain('OS-&lt;1&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Item&lt;/b&gt;');
  });

  it('uses a readable A5 print layout for service orders', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-0140',
        status: 'Em Produ\u00e7\u00e3o',
        createdat: '2026-05-22',
        prazoentrega: '2026-05-27',
        clientenome: 'Breno',
        clientecpf: '075.256.026-38',
        servico: 'Quadro',
        pagamento: 'Pix',
        criadopornome: 'Ione',
      },
      itens: [
        {
          nome: 'quadro 30x40 sem vidro / adesivar e laminar imagem mold=2016928123',
          quantidade: 1,
          preco_unitario: 114,
          subtotal: 114,
        },
      ],
      resumo: { total: 114, recebido: 114, saldo: 0 },
    });

    expect(html).toContain('body class="ordem-servico-print"');
    expect(html).toContain('@page { size: A5; margin: 0; }');
    expect(html).toContain('.ordem-servico-print { font-size: 13px; line-height: 1.34; }');
    expect(html).toContain('.ordem-servico-print .sheet { width: 148mm; min-height: 210mm; padding: 6mm; }');
    expect(html).toContain('.ordem-servico-print .os-row { display: grid; grid-template-columns: repeat(2, 1fr);');
    expect(html).toContain('.ordem-servico-print .os-box-value { min-height: 6.2mm;');
    expect(html).toContain('.ordem-servico-print .os-items-box { border: 1px solid #d7dee8; border-radius: 7px; min-height: 50mm;');
  });

  it('renders service orders as a boxed A5 form with only total, entrada and restante', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-0123',
        createdat: '2026-05-25',
        prazoentrega: '2026-05-25',
        clientenome: 'Cliente Modelo',
        clientecpf: '123.456.789-09',
        clientetelefone: '(31) 98888-7777',
        observacoes: 'Retirar apos aprovacao.',
        valorentrada: 150,
      },
      itens: [
        { nome: 'Moldura madeira clara 30x40', quantidade: 1, preco_unitario: 300, subtotal: 300 },
      ],
      resumo: { total: 300, recebido: 150, saldo: 150 },
    });

    expect(html).toContain('class="os-form-frame"');
    expect(html).toContain('class="os-number-badge">OS-0123</div>');
    expect(html).toContain('class="os-box-field os-client-name"');
    expect(html).toContain('class="os-items-box"');
    expect(html).toContain('class="finance-grid finance-grid-3"');
    expect(html).toContain('Total');
    expect(html).toContain('Entrada');
    expect(html).toContain('Restante');
    expect(html).toContain('R$&nbsp;300,00');
    expect(html).toContain('R$&nbsp;150,00');
    expect(html).not.toContain('<span>Recebido</span>');
    expect(html).not.toContain('<span>Saldo</span>');
    expect(html).toContain('.ordem-servico-print .os-form-frame { border: 1px solid #cbd5e1;');
    expect(html).toContain('.ordem-servico-print .os-title-band');
    expect(html).toContain('.ordem-servico-print .os-number-badge { flex: 0 0 auto; display: inline-block; min-width: 26mm; border: 1.5px solid #111827;');
    expect(html).toContain('.ordem-servico-print .os-number-badge { border: 1.5px solid #111827; background: #fff !important; color: #111827 !important;');
  });

  it('omits status and service fields from the printed service order', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-0150',
        status: 'Em Produ\u00e7\u00e3o',
        servico: 'Quadro',
        createdat: '2026-05-25',
        prazoentrega: '2026-05-30',
        clientenome: 'Cliente sem status impresso',
        valorentrada: 40,
      },
      itens: [{ nome: 'Item teste', quantidade: 1, preco_unitario: 100, subtotal: 100 }],
      resumo: { total: 100, recebido: 40, saldo: 60 },
    });

    expect(html).not.toContain('<span class="label">Status</span>');
    expect(html).not.toContain('<span class="label">Servico</span>');
    expect(html).not.toContain('<div class="os-box-value">Em Produ\u00e7\u00e3o</div>');
    expect(html).not.toContain('<div class="os-box-value">Quadro</div>');
  });

  it('keeps the printed service order title and number on one line', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-0140',
        createdat: '2026-05-25',
        prazoentrega: '2026-05-30',
        clientenome: 'Cliente',
      },
      itens: [],
      resumo: { total: 0, recebido: 0, saldo: 0 },
    });

    expect(html).toContain('.ordem-servico-print .os-title-band { display: flex;');
    expect(html).toContain('white-space: nowrap;');
    expect(html).toContain('<h1>Ordem de Servico</h1>');
    expect(html).toContain('<div class="os-number-badge">OS-0140</div>');
  });

  it('keeps the printed items table readable with unit and total columns', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-0140',
        createdat: '2026-05-25',
        prazoentrega: '2026-05-30',
        clientenome: 'Cliente',
      },
      itens: [
        {
          nome: 'quadro 30x40 sem vidro / adesivar e laminar imagem mold=2016928123',
          quantidade: 1,
          preco_unitario: 114,
          subtotal: 114,
        },
      ],
      resumo: { total: 114, recebido: 114, saldo: 0 },
    });

    expect(html).toContain('<th class="right">Unit.</th>');
    expect(html).toContain('<th class="right">Total</th>');
    expect(html).not.toContain('<th class="right">Valor</th>');
    expect(html).toContain('.ordem-servico-print .os-items-table { margin: 0; font-size: 10.4px; table-layout: fixed; }');
    expect(html).toContain('<th>Descricao</th>');
    expect(html).toContain('width: 65%; white-space: nowrap; font-size: 9px;');
    expect(html).toContain('quadro 30x40 sem vidro / adesivar e laminar imagem mold=2016928123');
  });
});
