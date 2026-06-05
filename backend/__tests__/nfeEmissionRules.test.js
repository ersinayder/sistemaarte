import { describe, it, expect } from 'vitest';
import {
  aplicarOverridesItensNFe,
  aplicarOverrideClienteNFe,
  normalizarItemFiscalOverride,
  serializarItemPreviaNFe,
  validarClienteFiscalNFe,
  validarEmitenteFiscalNFe,
} from '../domain/nfeEmissionRules.js';

describe('nfeEmissionRules', () => {
  it('applies per-emission fiscal overrides without mutating the original item', () => {
    const itens = [{
      id: 10,
      produto_id: 4,
      nome: 'Trofeu 3d',
      quantidade: 2,
      preco_unitario: 50,
      ncm: '49119900',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    }];

    const resultado = aplicarOverridesItensNFe(itens, [{
      id: 10,
      ncm: ' 3926.90.90 ',
      cfop: '6102',
      csosn: '102',
      origem_fiscal: '1',
      unidade: 'pc',
    }]);

    expect(resultado.ok).toBe(true);
    expect(resultado.itens[0]).toMatchObject({
      ncm: '39269090',
      cfop: '6102',
      csosn: '102',
      origem_fiscal: '1',
      unidade: 'PC',
    });
    expect(itens[0].ncm).toBe('49119900');
  });

  it('rejects invalid NCM overrides before the SEFAZ lock is acquired', () => {
    const resultado = normalizarItemFiscalOverride({ id: 10, ncm: '123' });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain('NCM');
  });

  it('serializes NF-e preview items with fiscal defaults and commercial totals', () => {
    const item = serializarItemPreviaNFe({
      id: 7,
      produto_id: 2,
      nome: 'Quadro acrilico',
      quantidade: 3,
      preco_unitario: 20,
    });

    expect(item).toMatchObject({
      id: 7,
      produto_id: 2,
      nome: 'Quadro acrilico',
      quantidade: 3,
      preco_unitario: 20,
      subtotal: 60,
      ncm: '49119900',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    });
  });

  it('applies customer overrides for the NF-e payload using customer-table field names', () => {
    const os = {
      clienteid: 9,
      clientenome: 'Cliente antigo',
      cpf: '12345678901',
      ie: '',
      logradouro: 'Rua A',
      c_numero: '10',
      bairro: 'Centro',
      cidade: 'Ipatinga',
      uf: 'MG',
      cep: '35160000',
    };

    const resultado = aplicarOverrideClienteNFe(os, {
      nome: 'Cliente atualizado',
      documento: '07.500.718/0001-96',
      ie: 'ISENTO',
      logradouro: 'Rua Nova',
      numero: '22',
      bairro: 'Veneza',
      cidade: 'Ipatinga',
      uf: 'mg',
      cep: '35.162-123',
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.cliente).toMatchObject({
      clientenome: 'Cliente atualizado',
      cpf: '07500718000196',
      ie: 'ISENTO',
      logradouro: 'Rua Nova',
      c_numero: '22',
      bairro: 'Veneza',
      cidade: 'Ipatinga',
      uf: 'MG',
      cep: '35162123',
    });
  });

  it('rejects invalid customer document overrides before issuing NF-e', () => {
    const resultado = aplicarOverrideClienteNFe({ clientenome: 'Cliente' }, {
      documento: '12345',
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain('CPF/CNPJ');
  });

  it('rejects customer fiscal address with blank CEP before XML generation', () => {
    const resultado = validarClienteFiscalNFe({
      clientenome: 'Cliente com endereco',
      cpf: '12345678901',
      logradouro: 'Rua dos Tocantins',
      c_numero: '55',
      bairro: 'Iguacu',
      cidade: 'Ipatinga',
      uf: 'MG',
      cep: '',
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe('CEP do cliente e obrigatorio quando o endereco fiscal e informado.');
  });

  it('rejects emitente with invalid CEP before XML generation', () => {
    const resultado = validarEmitenteFiscalNFe({
      xNome: 'ARTE E MOLDURAS LTDA',
      enderEmit: {
        xLgr: 'Rua Topazio',
        nro: '75',
        xBairro: 'Iguacu',
        cMun: '3131307',
        xMun: 'Ipatinga',
        UF: 'MG',
        CEP: '',
      },
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe('CEP do emitente deve ter 8 digitos. Revise Configuracoes > Empresa.');
  });
});
