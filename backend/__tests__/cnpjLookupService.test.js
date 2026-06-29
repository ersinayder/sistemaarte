import { describe, expect, it } from 'vitest';

const service = await import('../services/cnpjLookupService.js');
const { consultarCnpj } = service.default || service;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('cnpjLookupService', () => {
  it('envia User-Agent ao consultar a BrasilAPI', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, {
        razao_social: 'IPAMINAS ESPORTE CLUBE',
        cnpj: '21227475000195',
      });
    };

    const result = await consultarCnpj('21.227.475/0001-95', { fetchImpl });

    expect(result.razao_social).toBe('IPAMINAS ESPORTE CLUBE');
    expect(calls[0].url).toContain('brasilapi.com.br/api/cnpj/v1/21227475000195');
    expect(calls[0].options.headers['User-Agent']).toContain('SistemaArte');
  });

  it('usa ReceitaWS como fallback quando BrasilAPI bloqueia a consulta', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (url.includes('brasilapi.com.br')) {
        return jsonResponse(403, { error: { code: '403', message: 'Forbidden' } });
      }
      return jsonResponse(200, {
        status: 'OK',
        nome: 'IPAMINAS ESPORTE CLUBE',
        fantasia: 'IPAMINAS ESPORTE CLUBE',
        cnpj: '21.227.475/0001-95',
        telefone: '(31) 3826-2582 / (31) 3826-3363',
        email: 'ipaminas@ipaminas.com.br',
        cep: '35.162-373',
        logradouro: 'RUA GRACILIANO RAMOS',
        numero: '600',
        bairro: 'CIDADE NOBRE',
        municipio: 'IPATINGA',
        uf: 'MG',
      });
    };

    const result = await consultarCnpj('21227475000195', { fetchImpl });

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('receitaws.com.br/v1/cnpj/21227475000195');
    expect(calls[1].options.headers['User-Agent']).toContain('SistemaArte');
    expect(result).toMatchObject({
      fonte: 'receitaws',
      razao_social: 'IPAMINAS ESPORTE CLUBE',
      nome_fantasia: 'IPAMINAS ESPORTE CLUBE',
      cnpj: '21227475000195',
      ddd_telefone_1: '3138262582',
      email: 'ipaminas@ipaminas.com.br',
      cep: '35162373',
      logradouro: 'RUA GRACILIANO RAMOS',
      numero: '600',
      bairro: 'CIDADE NOBRE',
      municipio: 'IPATINGA',
      uf: 'MG',
    });
  });
});
