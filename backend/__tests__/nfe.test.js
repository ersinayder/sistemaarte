import { describe, it, expect, vi } from 'vitest';
import { montarNFe } from '../domain/nfeRules.js';

// Mock do wizard — não chama SEFAZ
vi.mock('../utils/nfe', () => ({
  getNFEWizard: () => ({
    NFeAutorizacao: vi.fn().mockResolvedValue({
      protNFe: { infProt: { nProt: '131260001', chNFe: '3126053100000000001055000010000000011' } },
      xmlAssinado: '<nfeProc>mock</nfeProc>',
    }),
  }),
  resetNFEWizard: vi.fn(),
}));

const ordem    = { id: 1, valortotal: 150.00, nfe_serie: '1' };
const cliente  = { name: 'João Teste', cpf: '123.456.789-09' };
const emitente = {
  CNPJ: '00000000000000', xNome: 'ARTE E MOLDURAS LTDA',
  xFant: 'Arte e Molduras', IE: '0000000000', CRT: '1',
  enderEmit: { xLgr:'Rua', nro:'1', xBairro:'Centro', cMun:'3131307', xMun:'Ipatinga', UF:'MG', CEP:'35160000', cPais:'1058', xPais:'Brasil' },
};
const itens = [
  { produto_id: 1, nome: 'Moldura MDF',           quantidade: 2, preco_unitario: 50, ncm: '44140000', cfop: '5102', csosn: '400', unidade: 'UN', origem_fiscal: 0 },
  { produto_id: 2, nome: 'Quadro Personalizado',   quantidade: 1, preco_unitario: 50, ncm: '49119100', cfop: '5102', csosn: '400', unidade: 'UN', origem_fiscal: 0 },
];

describe('montarNFe', () => {
  // montarNFe retorna { infNFe: { ide, dest, det, total, ... } }
  // Os campos ficam dentro de infNFe — a lib nfewizard-io exige esse wrapper

  it('deve montar a estrutura básica da NF-e', () => {
    const { infNFe } = montarNFe({ ordem, itens, cliente, emitente, numero: 1, serie: '1' });
    expect(infNFe.ide.mod).toBe('55');
    expect(infNFe.ide.nNF).toBe('1');
    expect(infNFe.ide.cMunFG).toBe('3131307');
    expect(infNFe.emit.enderEmit.cMun).toBe('3131307');
    expect(infNFe.det).toHaveLength(2);
    expect(infNFe.dest.xNome).toBe('JOÃO TESTE');
  });

  it('dest sem CPF quando cliente não tem CPF válido', () => {
    const { infNFe } = montarNFe({ ordem, itens, cliente: { name: 'Consumidor' }, emitente, numero: 2, serie: '1' });
    // Consumidor final sem CPF usa CNPJCPF='11111111111' (CPF genérico)
    expect(infNFe.dest.CNPJCPF).toBe('11111111111');
    expect(infNFe.dest.xNome).toBe('CONSUMIDOR');
  });

  it('dest aceita CNPJ de pessoa juridica', () => {
    const { infNFe } = montarNFe({
      ordem,
      itens,
      cliente: { name: 'TREM DAS CORES MATERIAIS PARA PINTURA LTDA', cpf: '07.500.718/0001-96', ie: '123456789' },
      emitente,
      numero: 5,
      serie: '1',
    });
    expect(infNFe.dest.CNPJCPF).toBe('07500718000196');
    expect(infNFe.dest.IE).toBe('123456789');
    expect(infNFe.dest.indIEDest).toBe('1');
    expect(Object.keys(infNFe.dest).indexOf('indIEDest')).toBeLessThan(Object.keys(infNFe.dest).indexOf('IE'));
  });

  it('calcula vNF corretamente', () => {
    const { infNFe } = montarNFe({ ordem, itens, cliente, emitente, numero: 3, serie: '1' });
    expect(Number(infNFe.total.ICMSTot.vNF)).toBeCloseTo(150.00, 2);
  });

  it('aplica ICMSSN102 para CSOSN 400 e PISNT/COFINSNT CST 07 para Simples Nacional', () => {
    // ICMSSN400 não existe no XSD da SEFAZ — CSOSN 400 mapeia para ICMSSN102
    // PIS/COFINS no Simples Nacional usa PISNT/COFINSNT com CST 07 (não tributado)
    const { infNFe } = montarNFe({ ordem, itens, cliente, emitente, numero: 4, serie: '1' });
    const imp = infNFe.det[0].imposto;
    expect(imp.ICMS.ICMSSN102.CSOSN).toBe('400');
    expect(imp.PIS.PISNT.CST).toBe('07');
    expect(imp.COFINS.COFINSNT.CST).toBe('07');
  });
});
