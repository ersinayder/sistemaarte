import { describe, it, expect } from 'vitest';

const rules = await import('../domain/configuracoesRules.js');
const {
  normalizarEmpresaConfig,
  validarEmpresaConfig,
  statusEmpresaConfig,
  pickEmpresaConfig,
} = rules;

describe('configuracoesRules', () => {
  it('normalizes whitespace, digits, lowercase email, uppercase UF', () => {
    const out = normalizarEmpresaConfig({
      razaosocial: '  Arte e Molduras Ltda  ',
      nomefantasia: '  Arte & Molduras ',
      cnpj: '07.500.718/0001-96',
      inscricaoestadual: '  123.456.789.0000 ',
      crt: '1',
      telefone: '(31) 99999-0000',
      email: ' LOJA@EXEMPLO.COM ',
      logradouro: ' Rua A ',
      numero: ' 123 ',
      bairro: ' Centro ',
      municipio: ' Ipatinga ',
      codigomunicipio: '3131307',
      uf: 'mg',
      cep: '35160-000',
    });

    expect(out.razaosocial).toBe('Arte e Molduras Ltda');
    expect(out.nomefantasia).toBe('Arte & Molduras');
    expect(out.cnpj).toBe('07500718000196');
    expect(out.inscricaoestadual).toBe('1234567890000');
    expect(out.telefone).toBe('31999990000');
    expect(out.email).toBe('loja@exemplo.com');
    expect(out.uf).toBe('MG');
    expect(out.cep).toBe('35160000');
  });

  it('validates required, length, and CRT errors', () => {
    const result = validarEmpresaConfig(normalizarEmpresaConfig({
      razaosocial: '',
      cnpj: '123',
      crt: '9',
      municipio: '',
      uf: 'Minas',
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.razaosocial).toBe('Razao social e obrigatoria');
    expect(result.errors.cnpj).toBe('CNPJ deve ter 14 digitos');
    expect(result.errors.crt).toBe('CRT deve ser 1, 2 ou 3');
    expect(result.errors.logradouro).toBe('Logradouro e obrigatorio');
    expect(result.errors.numero).toBe('Numero e obrigatorio');
    expect(result.errors.bairro).toBe('Bairro e obrigatorio');
    expect(result.errors.municipio).toBe('Municipio e obrigatorio');
    expect(result.errors.codigomunicipio).toBe('Codigo IBGE e obrigatorio');
    expect(result.errors.uf).toBe('UF deve ter 2 letras');
    expect(result.errors.cep).toBe('CEP e obrigatorio');
  });

  it('returns status OK with all required fields', () => {
    const status = statusEmpresaConfig({
      razaosocial: 'Arte e Molduras Ltda',
      cnpj: '07500718000196',
      inscricaoestadual: '1234567890000',
      crt: '1',
      logradouro: 'Rua A',
      numero: '123',
      bairro: 'Centro',
      municipio: 'Ipatinga',
      codigomunicipio: '3131307',
      uf: 'MG',
      cep: '35160000',
    });

    expect(status.status).toBe('OK');
    expect(status.missing).toEqual([]);
  });

  it('returns status Pendente with missing fields', () => {
    const status = statusEmpresaConfig({ razaosocial: 'Arte' });

    expect(status.status).toBe('Pendente');
    expect(status.missing).toContain('cnpj');
    expect(status.missing).toContain('cep');
  });

  it('picks only empresa config keys plus updatedat', () => {
    const picked = pickEmpresaConfig({
      razaosocial: 'Arte',
      cnpj: '07500718000196',
      extra: 'ignored',
      updatedat: '2026-05-18 10:00:00',
    });

    expect(picked.razaosocial).toBe('Arte');
    expect(picked.cnpj).toBe('07500718000196');
    expect(picked.extra).toBeUndefined();
    expect(picked.nomefantasia).toBe('');
    expect(picked.updatedat).toBe('2026-05-18 10:00:00');
  });
});
