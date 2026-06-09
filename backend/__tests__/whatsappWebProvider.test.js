import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWhatsappWebProvider } from '../utils/whatsappWebProvider.js';

describe('whatsappWebProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports connected status from a local provider', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ instance: { state: 'open' } }),
    });

    const provider = createWhatsappWebProvider({ baseUrl: 'http://127.0.0.1:8080', instance: 'loja' });
    await expect(provider.getStatus()).resolves.toEqual({ connected: true, state: 'open', qr: null });
  });

  it('sends text messages to the local provider', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ key: { id: 'MSG1' } }),
    });

    const provider = createWhatsappWebProvider({ baseUrl: 'http://127.0.0.1:8080', instance: 'loja', apiKey: 'secret' });
    await expect(provider.sendText({ phone: '5531999990000', text: 'Oi' })).resolves.toEqual({ ok: true, messageId: 'MSG1' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/message/sendText/loja',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: 'secret' }),
      })
    );
  });

  it('throws a readable error for provider failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'offline',
    });

    const provider = createWhatsappWebProvider({ baseUrl: 'http://127.0.0.1:8080', instance: 'loja' });
    await expect(provider.sendText({ phone: '5531999990000', text: 'Oi' })).rejects.toThrow('WhatsApp provider HTTP 503: offline');
  });
});
