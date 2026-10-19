import { describe, expect, it } from 'vitest';
import {
  avaliarLeaseTimeout,
  isAgenteOnline,
  normalizarPrintJob,
  validarPrintJobPayload,
} from '../domain/printQueueRules.js';

describe('printQueueRules', () => {
  describe('validarPrintJobPayload', () => {
    it('aceita payload válido para ordem, proposta e caixa', () => {
      const payloadOrdem = {
        tipo: 'ordem',
        documentoNome: 'OS-0875',
        html: '<html>OS</html>',
        copias: 1,
        papel: 'A5',
      };
      expect(validarPrintJobPayload(payloadOrdem)).toEqual({ ok: true });

      const payloadProposta = {
        tipo: 'proposta',
        documentoNome: 'PROP-012',
        html: '<html>Proposta</html>',
        copias: 2,
        papel: 'A4',
      };
      expect(validarPrintJobPayload(payloadProposta)).toEqual({ ok: true });

      const payloadCaixa = {
        tipo: 'caixa',
        documento_nome: 'Fechamento-Caixa',
        html: '<html>Caixa</html>',
      };
      expect(validarPrintJobPayload(payloadCaixa)).toEqual({ ok: true });
    });

    it('rejeita payload nulo ou vazio', () => {
      const res = validarPrintJobPayload(null);
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('rejeita tipo inválido', () => {
      const res = validarPrintJobPayload({
        tipo: 'recibo_invalido',
        documentoNome: 'Doc',
        html: '<p>x</p>',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/tipo/i);
    });

    it('rejeita documentoNome ausente ou vazio', () => {
      const res = validarPrintJobPayload({
        tipo: 'ordem',
        documentoNome: '   ',
        html: '<p>x</p>',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/nome/i);
    });

    it('rejeita html ausente ou vazio', () => {
      const res = validarPrintJobPayload({
        tipo: 'ordem',
        documentoNome: 'OS-001',
        html: '',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/html/i);
    });

    it('rejeita quantidade de cópias diferente de 1 ou 2', () => {
      const resZero = validarPrintJobPayload({
        tipo: 'ordem',
        documentoNome: 'OS-001',
        html: '<p>x</p>',
        copias: 0,
      });
      expect(resZero.ok).toBe(false);
      expect(resZero.error).toMatch(/cópia|copia/i);

      const resTres = validarPrintJobPayload({
        tipo: 'ordem',
        documentoNome: 'OS-001',
        html: '<p>x</p>',
        copias: 3,
      });
      expect(resTres.ok).toBe(false);
    });

    it('rejeita papel diferente de A5 ou A4', () => {
      const res = validarPrintJobPayload({
        tipo: 'ordem',
        documentoNome: 'OS-001',
        html: '<p>x</p>',
        papel: 'Letter',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/papel/i);
    });
  });

  describe('normalizarPrintJob', () => {
    it('aplica defaults para copias (1), papel (A5) e status (pendente)', () => {
      const normalizado = normalizarPrintJob({
        tipo: 'Ordem',
        documentoNome: ' OS-100 ',
        html: '<html>test</html>',
      });

      expect(normalizado.tipo).toBe('ordem');
      expect(normalizado.documentoNome).toBe('OS-100');
      expect(normalizado.copias).toBe(1);
      expect(normalizado.papel).toBe('A5');
      expect(normalizado.status).toBe('pendente');
    });

    it('preserva copias = 2 e papel = A4 e converte referenciaId', () => {
      const normalizado = normalizarPrintJob({
        tipo: 'proposta',
        referencia_id: '42',
        documento_nome: 'PROP-42',
        html: '<html>test</html>',
        copias: '2',
        papel: 'a4',
      });

      expect(normalizado.referenciaId).toBe(42);
      expect(normalizado.referencia_id).toBe(42);
      expect(normalizado.copias).toBe(2);
      expect(normalizado.papel).toBe('A4');
    });
  });

  describe('isAgenteOnline', () => {
    const baseNow = new Date('2026-10-19T14:00:00.000Z');

    it('retorna true quando agent_mode === 1 e heartbeat dentro de 35s', () => {
      const config = {
        agent_mode: 1,
        agent_last_seen: new Date(baseNow.getTime() - 15000), // 15s atrás
      };
      expect(isAgenteOnline(config, baseNow)).toBe(true);
    });

    it('retorna true exatamente no limite de 35000 ms', () => {
      const config = {
        agent_mode: 1,
        agent_last_seen: new Date(baseNow.getTime() - 35000),
      };
      expect(isAgenteOnline(config, baseNow)).toBe(true);
    });

    it('retorna false quando heartbeat exceder 35000 ms', () => {
      const config = {
        agent_mode: 1,
        agent_last_seen: new Date(baseNow.getTime() - 35001),
      };
      expect(isAgenteOnline(config, baseNow)).toBe(false);
    });

    it('retorna false quando agent_mode for 0', () => {
      const config = {
        agent_mode: 0,
        agent_last_seen: new Date(baseNow.getTime() - 5000),
      };
      expect(isAgenteOnline(config, baseNow)).toBe(false);
    });

    it('retorna false quando agent_last_seen for nulo ou indefinido', () => {
      expect(isAgenteOnline({ agent_mode: 1, agent_last_seen: null }, baseNow)).toBe(false);
      expect(isAgenteOnline({ agent_mode: 1 }, baseNow)).toBe(false);
    });

    it('suporta strings de data do SQLite e formato camelCase', () => {
      const config = {
        agentMode: 1,
        agentLastSeen: '2026-10-19 13:59:40',
      };
      const now = new Date('2026-10-19 14:00:00');
      expect(isAgenteOnline(config, now)).toBe(true);
    });
  });

  describe('avaliarLeaseTimeout', () => {
    const baseNow = new Date('2026-10-19T14:05:00.000Z');

    it('retorna null se o job não estiver com status processando', () => {
      const job = {
        status: 'pendente',
        updatedat: new Date(baseNow.getTime() - 150000),
        tentativas: 1,
      };
      expect(avaliarLeaseTimeout(job, baseNow)).toBeNull();
    });

    it('retorna null se o job estiver em processando mas dentro do lease de 2 minutos (120000 ms)', () => {
      const job = {
        status: 'processando',
        updatedat: new Date(baseNow.getTime() - 119000),
        tentativas: 1,
      };
      expect(avaliarLeaseTimeout(job, baseNow)).toBeNull();
    });

    it('reatribui para pendente quando lease estourar (>120000 ms) e tentativas < 3', () => {
      const jobTentativa0 = {
        status: 'processando',
        updatedat: new Date(baseNow.getTime() - 120001),
        tentativas: 0,
      };
      expect(avaliarLeaseTimeout(jobTentativa0, baseNow)).toEqual({
        status: 'pendente',
        retry: true,
      });

      const jobTentativa2 = {
        status: 'processando',
        updatedat: new Date(baseNow.getTime() - 200000),
        tentativas: 2,
      };
      expect(avaliarLeaseTimeout(jobTentativa2, baseNow)).toEqual({
        status: 'pendente',
        retry: true,
      });
    });

    it('marca como falha com erro de timeout quando tentativas >= 3', () => {
      const jobTentativa3 = {
        status: 'processando',
        updatedat: new Date(baseNow.getTime() - 125000),
        tentativas: 3,
      };
      expect(avaliarLeaseTimeout(jobTentativa3, baseNow)).toEqual({
        status: 'falha',
        retry: false,
        erro: 'Timeout de execução',
      });

      const jobTentativa4 = {
        status: 'processando',
        updatedat: new Date(baseNow.getTime() - 125000),
        tentativas: 4,
      };
      expect(avaliarLeaseTimeout(jobTentativa4, baseNow)).toEqual({
        status: 'falha',
        retry: false,
        erro: 'Timeout de execução',
      });
    });
  });
});
