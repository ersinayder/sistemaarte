import { describe, expect, it } from 'vitest';
import {
  faixaSobrepoe,
  fraseConfirmacaoInutilizacao,
  normalizarPedidoInutilizacao,
  validarPedidoInutilizacao,
} from '../domain/nfeInutilizacaoRules.js';

const pedidoValido = {
  ano: 2026,
  numeroInicial: 280,
  numeroFinal: 280,
  justificativa: 'Quebra de sequencia por rejeicao fiscal durante emissao',
  confirmacao: 'INUTILIZAR 280',
  idempotencyKey: 'manual-280',
};

describe('nfe inutilizacao rules', () => {
  it('normaliza pedido valido de numero unico', () => {
    const result = normalizarPedidoInutilizacao(pedidoValido, { anoAtual: 2026 });

    expect(result.ok).toBe(true);
    expect(result.pedido).toMatchObject({
      ano: 2026,
      anoSefaz: '26',
      numeroInicial: 280,
      numeroFinal: 280,
      quantidade: 1,
      justificativa: pedidoValido.justificativa,
      confirmacaoEsperada: 'INUTILIZAR 280',
      idempotencyKey: 'manual-280',
    });
  });

  it('normaliza pedido valido de intervalo continuo', () => {
    const result = normalizarPedidoInutilizacao({
      ...pedidoValido,
      numeroFinal: '285',
      confirmacao: 'INUTILIZAR 280-285',
    }, { anoAtual: 2026 });

    expect(result.ok).toBe(true);
    expect(result.pedido.quantidade).toBe(6);
    expect(result.pedido.confirmacaoEsperada).toBe('INUTILIZAR 280-285');
  });

  it('rejeita ano fora do limite permitido', () => {
    expect(validarPedidoInutilizacao({ ...pedidoValido, ano: 2005 }, { anoAtual: 2026 }))
      .toMatchObject({ ok: false, erro: expect.stringContaining('ano') });
    expect(validarPedidoInutilizacao({ ...pedidoValido, ano: 2027 }, { anoAtual: 2026 }))
      .toMatchObject({ ok: false, erro: expect.stringContaining('ano') });
  });

  it('rejeita faixa invertida, grande demais ou fora do limite da NF-e', () => {
    expect(validarPedidoInutilizacao({
      ...pedidoValido,
      numeroInicial: 285,
      numeroFinal: 280,
      confirmacao: 'INUTILIZAR 285-280',
    }, { anoAtual: 2026 })).toMatchObject({ ok: false, campo: 'numeroFinal' });

    expect(validarPedidoInutilizacao({
      ...pedidoValido,
      numeroInicial: 1,
      numeroFinal: 10001,
      confirmacao: 'INUTILIZAR 1-10001',
    }, { anoAtual: 2026 })).toMatchObject({ ok: false, campo: 'numeroFinal' });

    expect(validarPedidoInutilizacao({
      ...pedidoValido,
      numeroInicial: 0,
      numeroFinal: 1,
      confirmacao: 'INUTILIZAR 0-1',
    }, { anoAtual: 2026 })).toMatchObject({ ok: false, campo: 'numeroInicial' });
  });

  it('rejeita justificativa curta ou longa demais', () => {
    expect(validarPedidoInutilizacao({
      ...pedidoValido,
      justificativa: 'curta',
    }, { anoAtual: 2026 })).toMatchObject({ ok: false, campo: 'justificativa' });

    expect(validarPedidoInutilizacao({
      ...pedidoValido,
      justificativa: 'x'.repeat(256),
    }, { anoAtual: 2026 })).toMatchObject({ ok: false, campo: 'justificativa' });
  });

  it('exige confirmacao textual exata recalculada no backend', () => {
    expect(fraseConfirmacaoInutilizacao(280, 280)).toBe('INUTILIZAR 280');
    expect(fraseConfirmacaoInutilizacao(280, 285)).toBe('INUTILIZAR 280-285');

    expect(validarPedidoInutilizacao({
      ...pedidoValido,
      numeroFinal: 285,
      confirmacao: 'INUTILIZAR 280',
    }, { anoAtual: 2026 })).toMatchObject({ ok: false, campo: 'confirmacao' });
  });

  it('identifica sobreposicao e permite faixas adjacentes', () => {
    expect(faixaSobrepoe(280, 285, 279, 279)).toBe(false);
    expect(faixaSobrepoe(280, 285, 286, 290)).toBe(false);
    expect(faixaSobrepoe(280, 285, 285, 290)).toBe(true);
    expect(faixaSobrepoe(280, 285, 281, 282)).toBe(true);
  });
});
