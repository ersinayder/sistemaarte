import { describe, expect, it } from 'vitest';
import {
  AVISO_AUTO_STATUS,
  calcularProximaTentativa,
  normalizarAutoStatus,
  podeProcessarAvisoAutomatico,
  resumirErroEnvio,
} from '../domain/whatsappQueueRules.js';

describe('whatsappQueueRules', () => {
  it('normalizes queue statuses and rejects unknown values', () => {
    expect(AVISO_AUTO_STATUS).toContain('aguardando_conexao');
    expect(normalizarAutoStatus(' ERRO ')).toBe('erro');
    expect(normalizarAutoStatus('qualquer')).toBeNull();
  });

  it('selects only notices that can be processed automatically', () => {
    expect(podeProcessarAvisoAutomatico({ status: 'pendente', auto_status: 'pendente' })).toBe(true);
    expect(podeProcessarAvisoAutomatico({ status: 'aberto', auto_status: 'pendente' })).toBe(false);
    expect(podeProcessarAvisoAutomatico({ status: 'enviado', auto_status: 'pendente' })).toBe(false);
    expect(podeProcessarAvisoAutomatico({ status: 'pendente', auto_status: 'enviando' })).toBe(false);
  });

  it('calculates capped retry backoff in seconds', () => {
    expect(calcularProximaTentativa(0)).toBe(30);
    expect(calcularProximaTentativa(1)).toBe(60);
    expect(calcularProximaTentativa(5)).toBe(960);
    expect(calcularProximaTentativa(12)).toBe(1800);
  });

  it('trims provider errors for storage', () => {
    expect(resumirErroEnvio('x'.repeat(900))).toHaveLength(500);
    expect(resumirErroEnvio(null)).toBe('Erro desconhecido no envio do WhatsApp');
  });
});
