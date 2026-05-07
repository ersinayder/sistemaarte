import { describe, it, expect } from 'vitest';
import {
  validarEntradaOS,
  validarStatus,
  normalizarStatus,
  validarPrazo,
  descricaoEntradaOS,
  descricaoRestanteOS,
  STATUS_VALIDOS,
  TRANSICOES_VALIDAS,
} from '../domain/ordensRules.js';

describe('STATUS_VALIDOS e TRANSICOES_VALIDAS (estrutura)', () => {
  it('STATUS_VALIDOS contém os 5 status esperados', () => {
    expect(STATUS_VALIDOS).toContain('Aguardando');
    expect(STATUS_VALIDOS).toContain('Em Producao');
    expect(STATUS_VALIDOS).toContain('Pronto');
    expect(STATUS_VALIDOS).toContain('Entregue');
    expect(STATUS_VALIDOS).toContain('Cancelado');
  });

  it('TRANSICOES_VALIDAS cobre todos os status ativos', () => {
    ['Aguardando', 'Em Producao', 'Pronto'].forEach(s => {
      expect(TRANSICOES_VALIDAS).toHaveProperty(s);
    });
  });

  it('Entregue e Cancelado não têm transições de saída', () => {
    expect(TRANSICOES_VALIDAS['Entregue'] ?? []).toHaveLength(0);
    expect(TRANSICOES_VALIDAS['Cancelado'] ?? []).toHaveLength(0);
  });
});

describe('validarEntradaOS — casos extremos', () => {
  it('aceita entrada = 0 (sem entrada)', () => {
    expect(() => validarEntradaOS(100, 0)).not.toThrow();
  });

  it('rejeita total = 0.001 (quase zero mas positivo não deve ser tratado como zero)', () => {
    expect(() => validarEntradaOS(0.001, 0)).not.toThrow();
  });

  it('rejeita entrada 0.01 acima do total', () => {
    expect(() => validarEntradaOS(100, 100.01)).toThrow();
  });

  it('aceita valores grandes (R$ 99.999,99)', () => {
    expect(() => validarEntradaOS(99999.99, 50000)).not.toThrow();
  });
});

describe('normalizarStatus — todos os aliases', () => {
  it('normaliza Cancelada -> Cancelado', () => {
    expect(normalizarStatus('Cancelada')).toBe('Cancelado');
  });

  it('retorna o mesmo valor para status já corretos', () => {
    STATUS_VALIDOS.forEach(s => {
      expect(normalizarStatus(s)).toBe(s);
    });
  });

  it('retorna o mesmo valor para status desconhecido (sem crash)', () => {
    expect(normalizarStatus('Outro')).toBe('Outro');
  });
});

describe('validarPrazo — formatos de data', () => {
  it('aceita YYYY-MM-DD válido', () => {
    expect(() => validarPrazo('2025-12-31')).not.toThrow();
  });

  it('aceita prazo undefined', () => {
    expect(() => validarPrazo(undefined)).not.toThrow();
  });

  it('aceita prazo null', () => {
    expect(() => validarPrazo(null)).not.toThrow();
  });

  it('rejeita DD/MM/YYYY', () => {
    expect(() => validarPrazo('31/12/2025')).toThrow();
  });

  it('rejeita string aleatória', () => {
    expect(() => validarPrazo('amanha')).toThrow();
  });
});

describe('descricaoEntradaOS e descricaoRestanteOS', () => {
  it('gera label correto para entrada parcial', () => {
    const desc = descricaoEntradaOS(100, 30);
    expect(desc).toContain('Entrada');
    expect(desc).toContain('30');
  });

  it('gera label correto para pagamento total', () => {
    const desc = descricaoEntradaOS(100, 100);
    expect(desc).toContain('Total');
  });

  it('gera label correto para sem entrada', () => {
    const desc = descricaoEntradaOS(100, 0);
    expect(desc).toContain('Sem entrada');
  });

  it('descricaoRestanteOS inclui numero da OS', () => {
    const desc = descricaoRestanteOS({ numero: 'OS-007', clientenome: 'João' }, 200);
    expect(desc).toContain('OS-007');
    expect(desc).toContain('João');
  });

  it('descricaoRestanteOS para saldo zero', () => {
    const desc = descricaoRestanteOS({ numero: 'OS-001', clientenome: 'Ana' }, 0);
    expect(desc).toBeDefined();
  });
});

describe('validarStatus — transições completas', () => {
  it('Aguardando -> Em Producao (valida)', () => {
    expect(() => validarStatus('Em Producao', 'Aguardando')).not.toThrow();
  });

  it('Em Producao -> Pronto (valida)', () => {
    expect(() => validarStatus('Pronto', 'Em Producao')).not.toThrow();
  });

  it('Pronto -> Entregue (valida)', () => {
    expect(() => validarStatus('Entregue', 'Pronto')).not.toThrow();
  });

  it('Pronto -> Cancelado (valida)', () => {
    expect(() => validarStatus('Cancelado', 'Pronto')).not.toThrow();
  });

  it('Entregue -> qualquer coisa (invalida)', () => {
    expect(() => validarStatus('Aguardando', 'Entregue')).toThrow();
  });

  it('Cancelado -> qualquer coisa (invalida)', () => {
    expect(() => validarStatus('Em Producao', 'Cancelado')).toThrow();
  });

  it('sem status anterior aceita qualquer status valido', () => {
    STATUS_VALIDOS.forEach(s => {
      expect(() => validarStatus(s)).not.toThrow();
    });
  });
});
