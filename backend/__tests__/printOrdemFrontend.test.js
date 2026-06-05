import { describe, expect, it, vi } from 'vitest';

const helper = await import('../../frontend/src/utils/printOrdem.js');

describe('printOrdem frontend helper', () => {
  it('posts one or two copies to the service order print endpoint for direct server printing', async () => {
    const api = {
      post: vi.fn(() => Promise.resolve({ data: { ok: true, mode: 'server' } })),
    };
    const browserPrint = vi.fn();

    await helper.printOrdem(api, 42, 2, { browserPrint });

    expect(api.post).toHaveBeenCalledWith('/ordens/42/print', { copies: 2 }, { skipGlobalErrorToast: true });
    expect(browserPrint).not.toHaveBeenCalled();
  });

  it('prints the service order inside the current page when the API returns browser mode', async () => {
    const api = {
      post: vi.fn(() => Promise.resolve({
        data: { ok: true, mode: 'browser', printUrl: '/api/ordens/42/pdf?embedded=1', copies: 2 },
      })),
    };
    const browserPrint = vi.fn(() => Promise.resolve());

    await helper.printOrdem(api, 42, 2, { browserPrint });

    expect(browserPrint).toHaveBeenCalledWith('/api/ordens/42/pdf?embedded=1', { copies: 2 });
  });

  it('rejects invalid print copy counts before calling the API', async () => {
    const api = {
      post: vi.fn(),
    };

    await expect(helper.printOrdem(api, 42, 3)).rejects.toThrow('Escolha 1 ou 2 vias');

    expect(api.post).not.toHaveBeenCalled();
  });
});
