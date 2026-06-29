import { describe, expect, it } from 'vitest';
import rules from '../domain/cnpjRules.js';

const { normalizeCnpj, validaCNPJ } = rules;

describe('cnpjRules', () => {
  it('normaliza e valida CNPJ numerico', () => {
    expect(normalizeCnpj('07.500.718/0001-96')).toBe('07500718000196');
    expect(validaCNPJ('07.500.718/0001-96')).toBe(true);
  });

  it('preserva letras e valida CNPJ alfanumerico', () => {
    expect(normalizeCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
    expect(validaCNPJ('12.ABC.345/01DE-35')).toBe(true);
  });

  it('rejeita CNPJ alfanumerico com digito verificador errado', () => {
    expect(validaCNPJ('12.ABC.345/01DE-36')).toBe(false);
  });
});
