import { describe, expect, it } from 'vitest';

const rules = await import('../domain/whatsappAvisosRules.js');

const ordemBase = {
  id: 7,
  numero: 'OS-0007',
  clientenome: 'Maria Silva',
  clientetelefone: '(31) 99999-0000',
  clientecontato: null,
  servico: 'Quadro',
  tipo: 'Quadro',
  valortotal: 1234.5,
  valor: 1234.5,
  valorentrada: 200,
  entrada: 200,
  saldoaberto: 1034.5,
  status: 'Aguardando',
};

describe('whatsappAvisosRules', () => {
  it('normalizes only allowed notice types and statuses', () => {
    expect(rules.normalizarTipoAviso('confirmacao_pedido')).toBe('confirmacao_pedido');
    expect(rules.normalizarTipoAviso('pedido_pronto')).toBe('pedido_pronto');
    expect(rules.normalizarTipoAviso(' http://evil.test ')).toBeNull();

    expect(rules.normalizarStatusAviso('pendente')).toBe('pendente');
    expect(rules.normalizarStatusAviso('aberto')).toBe('aberto');
    expect(rules.normalizarStatusAviso('enviado')).toBe('enviado');
    expect(rules.normalizarStatusAviso('ignorado')).toBe('ignorado');
    expect(rules.normalizarStatusAviso('confirmado')).toBeNull();
  });

  it('normalizes Brazilian phone numbers without trusting formatting', () => {
    expect(rules.normalizarTelefoneWhatsapp('(31) 99999-0000')).toBe('5531999990000');
    expect(rules.normalizarTelefoneWhatsapp('5531999990000')).toBe('5531999990000');
    expect(rules.normalizarTelefoneWhatsapp('')).toBeNull();
    expect(rules.normalizarTelefoneWhatsapp('123')).toBeNull();
  });

  it('allows customer whatsapp notices only when the caller has the capability', () => {
    expect(rules.podeUsarAviso(true, 'confirmacao_pedido')).toBe(true);
    expect(rules.podeUsarAviso(true, 'pedido_pronto')).toBe(true);
    expect(rules.podeUsarAviso(false, 'confirmacao_pedido')).toBe(false);
    expect(rules.podeUsarAviso(false, 'pedido_pronto')).toBe(false);
  });

  it('builds confirmation messages with financial data only for callers with the capability', () => {
    const msg = rules.montarMensagemAviso(ordemBase, 'confirmacao_pedido', { canUseNotice: true });

    expect(msg.ok).toBe(true);
    expect(msg.text).toContain('Confirmacao de Pedido');
    expect(msg.text).toContain('Maria Silva');
    expect(msg.text).toContain('OS-0007');
    expect(msg.text).toContain('R$ 1.234,50');
    expect(msg.text).toContain('R$ 200,00');
    expect(msg.text).toContain('R$ 1.034,50');

    const denied = rules.montarMensagemAviso(ordemBase, 'confirmacao_pedido', { canUseNotice: false });
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe('forbidden_notice_type');
  });

  it('builds ready notices without exposing extra payment details in the basic text', () => {
    const msg = rules.montarMensagemAviso({ ...ordemBase, status: 'Pronto' }, 'pedido_pronto', { canUseNotice: true });

    expect(msg.ok).toBe(true);
    expect(msg.text).toContain('Pedido Pronto');
    expect(msg.text).toContain('OS-0007');
    expect(msg.text).toContain('Quadro');
    expect(msg.text).not.toContain('Valor Total');
    expect(msg.text).not.toContain('Entrada paga');
  });

  it('renders configured message templates with order variables', () => {
    const msg = rules.montarMensagemAviso(ordemBase, 'confirmacao_pedido', {
      canUseNotice: true,
      templates: {
        confirmacaoPedido: [
          'Cliente: {cliente}',
          'Servico: {servico}',
          'OS: {numero_os}',
          'Total: {valor_total}',
          'Entrada: {entrada_paga}',
          'Saldo: {saldo}',
        ].join('\n'),
      },
    });

    expect(msg.ok).toBe(true);
    expect(msg.text).toBe([
      'Cliente: Maria Silva',
      'Servico: Quadro',
      'OS: OS-0007',
      'Total: R$ 1.234,50',
      'Entrada: R$ 200,00',
      'Saldo: R$ 1.034,50',
    ].join('\n'));
  });

  it('validates notice availability by OS status', () => {
    expect(rules.avisoDisponivelParaOrdem(ordemBase, 'confirmacao_pedido', true)).toEqual({ ok: true });
    expect(rules.avisoDisponivelParaOrdem({ ...ordemBase, status: 'Cancelado' }, 'confirmacao_pedido', true).ok).toBe(false);
    expect(rules.avisoDisponivelParaOrdem({ ...ordemBase, status: 'Pronto' }, 'pedido_pronto', true)).toEqual({ ok: true });
    expect(rules.avisoDisponivelParaOrdem({ ...ordemBase, status: 'Pronto' }, 'pedido_pronto', false).ok).toBe(false);
  });

  it('validates safe status transitions', () => {
    expect(rules.validarTransicaoAviso('pendente', 'aberto')).toEqual({ ok: true });
    expect(rules.validarTransicaoAviso('aberto', 'enviado')).toEqual({ ok: true });
    expect(rules.validarTransicaoAviso('pendente', 'enviado')).toEqual({ ok: true });
    expect(rules.validarTransicaoAviso('enviado', 'aberto').ok).toBe(false);
    expect(rules.validarTransicaoAviso('ignorado', 'enviado').ok).toBe(false);
  });

  it('treats sent and ignored notice statuses as final', () => {
    expect(rules.avisoFinalizado('enviado')).toBe(true);
    expect(rules.avisoFinalizado('ignorado')).toBe(true);
    expect(rules.avisoFinalizado('aberto')).toBe(false);
    expect(rules.avisoFinalizado('pendente')).toBe(false);
  });
});
