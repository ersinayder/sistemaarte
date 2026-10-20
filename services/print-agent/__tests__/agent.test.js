import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Importaremos as funções do agente
const {
  carregarConfiguracao,
  processarProximaTarefa,
  executarCicloDrenagem,
  criarAgente,
} = require('../agent');

describe('Print Agent Local (PC Edu)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('carregarConfiguracao', () => {
    it('deve carregar defaults quando nenhuma env ou config fornecida', () => {
      const config = carregarConfiguracao({}, '/mock-empty-dir');
      expect(config.printerName).toBe('Canon G3010 series');
      expect(config.serverUrl).toBe('https://arteemolduras.com.br');
      expect(config.settleMs).toBe(4000);
      expect(config.token).toBe('');
      expect(config.pollIntervalMs).toBe(5000);
      expect(config.pingIntervalMs).toBe(20000);
    });

    it('deve priorizar variáveis de ambiente', () => {
      const env = {
        PRINTER_NAME: 'Minha Impressora',
        PRINT_SERVER_URL: 'http://localhost:3001',
        PRINT_AGENT_TOKEN: 'secret123',
        PRINT_SETTLE_MS: '2500',
      };
      const config = carregarConfiguracao(env);
      expect(config.printerName).toBe('Minha Impressora');
      expect(config.serverUrl).toBe('http://localhost:3001');
      expect(config.token).toBe('secret123');
      expect(config.settleMs).toBe(2500);
    });

    it('deve remover barra final de serverUrl se houver', () => {
      const config = carregarConfiguracao({ PRINT_SERVER_URL: 'http://localhost:3001/' });
      expect(config.serverUrl).toBe('http://localhost:3001');
    });
  });

  describe('processarProximaTarefa', () => {
    it('deve retornar null se não houver tarefas pendentes', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tarefa: null }),
      });

      const config = carregarConfiguracao({ PRINT_AGENT_TOKEN: 'tok123' });
      const resultado = await processarProximaTarefa({
        config,
        fetchFn: mockFetch,
        printFn: vi.fn(),
      });

      expect(resultado).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://arteemolduras.com.br/api/impressao/agente/tarefas',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Print-Agent-Token': 'tok123',
          }),
        })
      );
    });

    it('deve executar printHtml e concluir com sucesso ao receber tarefa', async () => {
      const tarefaFake = {
        id: 42,
        tipo: 'ordem',
        documento_nome: 'OS-0042',
        html: '<html><body>OS 42</body></html>',
        copias: 1,
        papel: 'A5',
      };

      const mockFetch = vi.fn()
        // 1. GET /tarefas
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tarefa: tarefaFake }),
        })
        // 2. POST /tarefas/42/concluir
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        });

      const mockPrintFn = vi.fn().mockResolvedValue({ ok: true, printerName: 'Canon G3010 series' });

      const config = carregarConfiguracao({
        PRINT_AGENT_TOKEN: 'tok123',
        PRINTER_NAME: 'Canon G3010 series',
        PRINT_SETTLE_MS: '3000',
      });

      const resultado = await processarProximaTarefa({
        config,
        fetchFn: mockFetch,
        printFn: mockPrintFn,
      });

      expect(resultado).toEqual({ id: 42, sucesso: true });
      expect(mockPrintFn).toHaveBeenCalledWith(
        expect.objectContaining({
          html: tarefaFake.html,
          jobName: tarefaFake.documento_nome,
          copies: 1,
          settleMs: 3000,
          env: expect.objectContaining({
            ORDEM_PRINTER_NAME: 'Canon G3010 series',
          }),
        })
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://arteemolduras.com.br/api/impressao/agente/tarefas/42/concluir',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Print-Agent-Token': 'tok123',
          }),
          body: JSON.stringify({ ok: true }),
        })
      );
    });

    it('deve chamar /concluir com erro quando printHtml falhar', async () => {
      const tarefaFake = {
        id: 88,
        tipo: 'ordem',
        documento_nome: 'OS-0088',
        html: '<html>Corrompido</html>',
        copias: 2,
      };

      const mockFetch = vi.fn()
        // 1. GET /tarefas
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tarefa: tarefaFake }),
        })
        // 2. POST /tarefas/88/concluir
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        });

      const mockPrintFn = vi.fn().mockRejectedValue(new Error('Impressora desconectada USB'));

      const config = carregarConfiguracao({ PRINT_AGENT_TOKEN: 'tok123' });

      const resultado = await processarProximaTarefa({
        config,
        fetchFn: mockFetch,
        printFn: mockPrintFn,
      });

      expect(resultado).toEqual({
        id: 88,
        sucesso: false,
        error: 'Impressora desconectada USB',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://arteemolduras.com.br/api/impressao/agente/tarefas/88/concluir',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Print-Agent-Token': 'tok123',
          }),
          body: JSON.stringify({ ok: false, error: 'Impressora desconectada USB' }),
        })
      );
    });
  });

  describe('executarCicloDrenagem', () => {
    it('deve drenar todas as tarefas sequencialmente até a fila esvaziar', async () => {
      let chamadas = 0;
      const mockProcessar = vi.fn().mockImplementation(async () => {
        chamadas++;
        if (chamadas <= 3) {
          return { id: chamadas, sucesso: true };
        }
        return null; // fila vazia
      });

      const total = await executarCicloDrenagem({ processarFn: mockProcessar });

      expect(total).toBe(3);
      expect(mockProcessar).toHaveBeenCalledTimes(4);
    });
  });

  describe('criarAgente', () => {
    it('deve instanciar agente com métodos de controle start e stop', () => {
      const agente = criarAgente({
        env: { PRINT_AGENT_TOKEN: 'test' },
      });
      expect(typeof agente.start).toBe('function');
      expect(typeof agente.stop).toBe('function');
      expect(typeof agente.ping).toBe('function');
      expect(typeof agente.drenarFila).toBe('function');
    });

    it('método ping deve enviar POST /api/impressao/agente/ping', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, agentLastSeen: '2026-10-19 14:00:00' }),
      });

      const agente = criarAgente({
        env: { PRINT_AGENT_TOKEN: 'token-abc', PRINT_SERVER_URL: 'http://localhost:3001' },
        fetchFn: mockFetch,
      });

      const res = await agente.ping();
      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/impressao/agente/ping',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Print-Agent-Token': 'token-abc',
          }),
        })
      );
    });
  });
});
