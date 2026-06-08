import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const queue = {
  listarAvisosElegiveis: vi.fn(),
  tentarClaimAviso: vi.fn(),
  marcarAguardandoConexao: vi.fn(),
  marcarErroTemporario: vi.fn(),
  marcarEnviado: vi.fn(),
};

const require = createRequire(import.meta.url);
require.cache[require.resolve('../utils/whatsappQueue.js')] = {
  id: require.resolve('../utils/whatsappQueue.js'),
  filename: require.resolve('../utils/whatsappQueue.js'),
  loaded: true,
  exports: queue,
};

const { createWhatsappWorker } = await import('../utils/whatsappWorker.js');

describe('whatsappWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queue.listarAvisosElegiveis.mockReturnValue([]);
    queue.tentarClaimAviso.mockReturnValue(true);
  });

  it('leaves notices queued when provider is disconnected', async () => {
    queue.listarAvisosElegiveis.mockReturnValueOnce([
      { id: 1, telefone_snapshot: '5531999990000', mensagem_snapshot: 'Oi', tentativas: 0 },
    ]);
    const provider = {
      getStatus: vi.fn().mockResolvedValue({ connected: false, state: 'close' }),
      sendText: vi.fn(),
    };

    const worker = createWhatsappWorker({ provider, intervalMs: 1000, batchSize: 5 });
    await worker.tick();

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(queue.marcarAguardandoConexao).toHaveBeenCalledWith(1, 'Sessao WhatsApp desconectada: close');
  });

  it('marks notice sent when provider sends successfully', async () => {
    queue.listarAvisosElegiveis.mockReturnValueOnce([
      { id: 2, telefone_snapshot: '5531999990000', mensagem_snapshot: 'Oi', tentativas: 0 },
    ]);
    const provider = {
      getStatus: vi.fn().mockResolvedValue({ connected: true, state: 'open' }),
      sendText: vi.fn().mockResolvedValue({ ok: true, messageId: 'MSG2' }),
    };

    const worker = createWhatsappWorker({ provider, intervalMs: 1000, batchSize: 5 });
    await worker.tick();

    expect(provider.sendText).toHaveBeenCalledWith({ phone: '5531999990000', text: 'Oi' });
    expect(queue.marcarEnviado).toHaveBeenCalledWith(2, 'MSG2');
  });

  it('records temporary errors with incremented attempts', async () => {
    queue.listarAvisosElegiveis.mockReturnValueOnce([
      { id: 3, telefone_snapshot: '5531999990000', mensagem_snapshot: 'Oi', tentativas: 4 },
    ]);
    const provider = {
      getStatus: vi.fn().mockResolvedValue({ connected: true, state: 'open' }),
      sendText: vi.fn().mockRejectedValue(new Error('network down')),
    };

    const worker = createWhatsappWorker({ provider, intervalMs: 1000, batchSize: 5 });
    await worker.tick();

    expect(queue.marcarErroTemporario).toHaveBeenCalledWith(3, expect.any(Error), 5);
  });
});
