import { describe, it, expect } from 'vitest';
import {
  aplicarOverridesItensNFe,
  aplicarOverrideClienteNFe,
  normalizarItensAvulsosNFe,
  normalizarItemFiscalOverride,
  serializarItemPreviaNFe,
  validarClienteFiscalNFe,
  validarEmitenteFiscalNFe,
  validarItensFiscaisNFe,
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

  it('serializes NF-e preview items with store fiscal defaults and commercial totals', () => {
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
      ncm: '44151000',
      cfop: '5101',
      csosn: '102',
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
    expect(resultado.erro).toBe('Preencha os dados fiscais do cliente: CEP.');
  });

  it('rejects customer without fiscal data before XML generation', () => {
    const resultado = validarClienteFiscalNFe({
      clientenome: 'CONSUMIDOR FINAL',
      cpf: '',
      logradouro: '',
      c_numero: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe('Preencha os dados fiscais do cliente: CPF/CNPJ, logradouro, numero, bairro, cidade, UF e CEP.');
  });

  it('accepts customer with all required fiscal data before XML generation', () => {
    const resultado = validarClienteFiscalNFe({
      clientenome: 'Eduardo Rodrigues Sinayder',
      cpf: '12804239608',
      logradouro: 'Rua dos Tocantins',
      c_numero: '55',
      bairro: 'Iguacu',
      cidade: 'Ipatinga',
      uf: 'MG',
      cep: '35162131',
    });

    expect(resultado.ok).toBe(true);
  });

  it('rejects item with invalid fiscal fields before XML generation', () => {
    const resultado = validarItensFiscaisNFe([{
      nome: 'Produto teste',
      quantidade: 1,
      preco_unitario: 123,
      ncm: '49119900',
      cfop: '5102',
      csosn: '999',
      origem_fiscal: '0',
      unidade: 'UN',
    }]);

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe('Item "Produto teste": CSOSN invalido. Use 101, 102, 103, 300, 400, 500 ou 900.');
  });

  it('rejects item with zero quantity before XML generation', () => {
    const resultado = validarItensFiscaisNFe([{
      nome: 'Produto zerado',
      quantidade: 0,
      preco_unitario: 123,
      ncm: '49119900',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    }]);

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe('Item "Produto zerado": quantidade deve ser maior que zero.');
  });

  it('normalizes full avulsa items with fiscal fields and commercial totals', () => {
    const resultado = normalizarItensAvulsosNFe([
      {
        produto_id: 3,
        nome: 'Moldura avulsa',
        quantidade: '2',
        preco_unitario: '45.50',
        avulso: false,
        ncm: '44.15.10.00',
        cfop: '5102',
        csosn: '400',
        origem_fiscal: '0',
        unidade: 'un',
      },
    ]);

    expect(resultado.ok).toBe(true);
    expect(resultado.itens[0]).toMatchObject({
      produto_id: 3,
      nome: 'Moldura avulsa',
      quantidade: 2,
      preco_unitario: 45.5,
      subtotal: 91,
      avulso: false,
      ncm: '44151000',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    });
  });

  it('rejects avulsa items without commercial value before issuing NF-e', () => {
    const resultado = normalizarItensAvulsosNFe([
      {
        nome: 'Sem preco',
        quantidade: 1,
        preco_unitario: 0,
        ncm: '44151000',
        cfop: '5102',
        csosn: '400',
        origem_fiscal: '0',
        unidade: 'UN',
      },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain('preco unitario');
  });

  it('rejects emitente with invalid CEP before XML generation', () => {
    const resultado = validarEmitenteFiscalNFe({
      CNPJ: '07500718000196',
      xNome: 'ARTE E MOLDURAS LTDA',
      IE: '3133592250027',
      CRT: '1',
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

  it('rejects emitente with invalid CNPJ before XML generation', () => {
    const resultado = validarEmitenteFiscalNFe({
      CNPJ: '',
      xNome: 'ARTE E MOLDURAS LTDA',
      IE: '3133592250027',
      CRT: '1',
      enderEmit: {
        xLgr: 'Rua Topazio',
        nro: '75',
        xBairro: 'Iguacu',
        cMun: '3131307',
        xMun: 'Ipatinga',
        UF: 'MG',
        CEP: '35162131',
      },
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe('CNPJ do emitente deve ter 14 digitos. Revise Configuracoes > Empresa.');
  });
});
