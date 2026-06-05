import { describe, expect, it, vi } from 'vitest';

const helper = await import('../../frontend/src/utils/printOrdem.js');

describe('printOrdem frontend helper', () => {
  it('posts one or two copies to the service order print endpoint', async () => {
    const api = {
      post: vi.fn(() => Promise.resolve({ data: { ok: true } })),
    };

    await helper.printOrdem(api, 42, 2);

    expect(api.post).toHaveBeenCalledWith('/ordens/42/print', { copies: 2 }, { skipGlobalErrorToast: true });
  });

  it('rejects invalid print copy counts before calling the API', async () => {
    const api = {
      post: vi.fn(),
    };

    await expect(helper.printOrdem(api, 42, 3)).rejects.toThrow('Escolha 1 ou 2 vias');

    expect(api.post).not.toHaveBeenCalled();
  });
});
