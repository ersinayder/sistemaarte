import { describe, it, expect } from 'vitest';
import {
  validarEntradaOS,
  validarStatus,
  normalizarStatus,
  validarPrazo,
  descricaoEntradaOS,
  descricaoRestanteOS,
  STATUSES_VALIDOS,
  TRANSICOES_VALIDAS,
} from '../domain/ordensRules.js';

describe('STATUSES_VALIDOS e TRANSICOES_VALIDAS (estrutura)', () => {
  it('STATUSES_VALIDOS contem os 5 status esperados', () => {
    expect(STATUSES_VALIDOS).toContain('Aguardando');
    expect(STATUSES_VALIDOS).toContain('Em Produção');
    expect(STATUSES_VALIDOS).toContain('Pronto');
    expect(STATUSES_VALIDOS).toContain('Entregue');
    expect(STATUSES_VALIDOS).toContain('Cancelado');
  });

  it('TRANSICOES_VALIDAS tem chaves para os status de origem', () => {
    expect(TRANSICOES_VALIDAS).toHaveProperty('Aguardando');
    expect(TRANSICOES_VALIDAS).toHaveProperty('Pronto');
  });

  it('Entregue e Cancelado nao tem transicoes de saida', () => {
    expect(TRANSICOES_VALIDAS['Entregue'] ?? []).toHaveLength(0);
    expect(TRANSICOES_VALIDAS['Cancelado'] ?? []).toHaveLength(0);
  });
});

describe('validarEntradaOS', () => {
  it('aceita entrada = 0 (sem entrada)', () => {
    expect(validarEntradaOS(100, 0)).toBeNull();
  });

  it('aceita entrada parcial', () => {
    expect(validarEntradaOS(100, 50)).toBeNull();
  });

  it('aceita entrada igual ao total', () => {
    expect(validarEntradaOS(100, 100)).toBeNull();
  });

  it('rejeita entrada maior que total', () => {
    expect(validarEntradaOS(100, 100.01)).not.toBeNull();
  });

  it('aceita valores grandes', () => {
    expect(validarEntradaOS(99999.99, 50000)).toBeNull();
  });

  it('rejeita total zero', () => {
    expect(validarEntradaOS(0, 0)).not.toBeNull();
  });

  it('rejeita entrada negativa', () => {
    expect(validarEntradaOS(100, -1)).not.toBeNull();
  });
});

describe('normalizarStatus', () => {
  it('normaliza Cancelada -> Cancelado', () => {
    expect(normalizarStatus('Cancelada')).toBe('Cancelado');
  });

  it('preserva Cancelado', () => {
    expect(normalizarStatus('Cancelado')).toBe('Cancelado');
  });

  it('preserva Aguardando', () => {
    expect(normalizarStatus('Aguardando')).toBe('Aguardando');
  });

  it('retorna o mesmo valor para status desconhecido', () => {
    expect(normalizarStatus('Outro')).toBe('Outro');
  });
});

describe('validarPrazo', () => {
  it('aceita YYYY-MM-DD valido', () => {
    expect(validarPrazo('2025-12-31')).toBeNull();
  });

  it('aceita prazo undefined', () => {
    expect(validarPrazo(undefined)).toBeNull();
  });

  it('aceita prazo null', () => {
    expect(validarPrazo(null)).toBeNull();
  });

  it('rejeita DD/MM/YYYY', () => {
    expect(validarPrazo('31/12/2025')).not.toBeNull();
  });

  it('rejeita string aleatoria', () => {
    expect(validarPrazo('amanha')).not.toBeNull();
  });
});

describe('descricaoEntradaOS', () => {
  it('gera label Entrada para entrada parcial', () => {
    const desc = descricaoEntradaOS('OS-001', 'Joao', 'Quadro', 100, 30);
    expect(desc).toContain('Entrada');
  });

  it('gera label Total para entrada igual ao total', () => {
    const desc = descricaoEntradaOS('OS-001', 'Joao', null, 100, 100);
    expect(desc).toContain('Total');
  });

  it('gera label Sem entrada quando entrada zero', () => {
    const desc = descricaoEntradaOS('OS-001', 'Joao', null, 100, 0);
    expect(desc).toContain('Sem entrada');
  });

  it('inclui numero da OS na descricao', () => {
    const desc = descricaoEntradaOS('OS-007', 'Ana', null, 200, 50);
    expect(desc).toContain('OS-007');
    expect(desc).toContain('Ana');
  });
});

describe('descricaoRestanteOS', () => {
  it('inclui numero e cliente', () => {
    const desc = descricaoRestanteOS('OS-007', 'Joao', null);
    expect(desc).toContain('OS-007');
    expect(desc).toContain('Joao');
  });

  it('inclui servico quando fornecido', () => {
    const desc = descricaoRestanteOS('OS-001', 'Ana', 'Quadro');
    expect(desc).toContain('Quadro');
  });
});

describe('validarStatus', () => {
  it('Aguardando -> Em Produção (valida)', () => {
    expect(validarStatus('Em Produção', 'Aguardando')).toBeNull();
  });

  it('Pronto -> Entregue (valida)', () => {
    expect(validarStatus('Entregue', 'Pronto')).toBeNull();
  });

  it('Pronto -> Cancelado (valida)', () => {
    expect(validarStatus('Cancelado', 'Pronto')).toBeNull();
  });

  it('Entregue -> Aguardando (invalida)', () => {
    expect(validarStatus('Aguardando', 'Entregue')).not.toBeNull();
  });

  it('Cancelado -> Em Produção (invalida)', () => {
    expect(validarStatus('Em Produção', 'Cancelado')).not.toBeNull();
  });

  it('sem status anterior aceita Aguardando', () => {
    expect(validarStatus('Aguardando')).toBeNull();
  });

  it('sem status anterior aceita Entregue', () => {
    expect(validarStatus('Entregue')).toBeNull();
  });

  it('rejeita status desconhecido', () => {
    expect(validarStatus('Invalido')).not.toBeNull();
  });
});
