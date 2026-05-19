import { beforeEach, describe, expect, it } from 'vitest';

const { resolverAmbiente } = await import('../utils/nfeConfig.js');

describe('nfeConfig', () => {
  beforeEach(() => {
    delete process.env.NFE_AMBIENTE;
    delete process.env.NFE_AMBIENTE_NUM;
  });

  it('preserva ambiente do env quando fiscal_config esta apenas seedado', () => {
    process.env.NFE_AMBIENTE_NUM = '1';

    expect(resolverAmbiente({ ambiente: 2, configurado: 0 })).toEqual({
      ambiente: 1,
      origem: 'env',
    });
  });

  it('usa ambiente do banco quando fiscal_config foi salvo explicitamente', () => {
    process.env.NFE_AMBIENTE_NUM = '1';

    expect(resolverAmbiente({ ambiente: 2, configurado: 1 })).toEqual({
      ambiente: 2,
      origem: 'banco',
    });
  });
});
