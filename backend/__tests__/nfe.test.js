import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const ordem   = { id: 1, valortotal: 150.00, nfe_serie: '1' };
const cliente = { name: 'João Teste', cpf: '123.456.789-09' };
const emitente = {
  CNPJ: '00000000000000', xNome: 'ARTE E MOLDURAS LTDA',
  xFant: 'Arte e Molduras', IE: '0000000000', CRT: '1',
  enderEmit: { xLgr:'Rua', nro:'1', xBairro:'Centro', cMun:'3127701', xMun:'Ipatinga', UF:'MG', CEP:'35160000', cPais:'1058', xPais:'Brasil' },
};
const itens = [
  { produto_id: 1, nome: 'Moldura MDF', quantidade: 2, preco_unitario: 50, ncm: '44140000', cfop: '5102', csosn: '400', unidade: 'UN', origem_fiscal: 0 },
  { produto_id: 2, nome: 'Quadro Personalizado', quantidade: 1, preco_unitario: 50, ncm: '49119100', cfop: '5102', csosn: '400', unidade: 'UN', origem_fiscal: 0 },
];

describe('montarNFe', () => {
  // xNome DEVE ser maiúsculo — obrigação do schema NF-e (tag xNome = uppercase)
  it('deve montar a estrutura básica da NF-e', () => {
    const nfe = montarNFe({ ordem, itens, cliente, emitente, numero: 1, serie: '1' });
    expect(nfe.ide.mod).toBe('55');
    expect(nfe.ide.nNF).toBe('1');
    expect(nfe.det).toHaveLength(2);
    expect(nfe.dest.xNome).toBe('JOÃO TESTE');
  });

  it('dest sem CPF quando cliente não tem CPF válido', () => {
    const nfe = montarNFe({ ordem, itens, cliente: { name: 'Consumidor' }, emitente, numero: 2, serie: '1' });
    expect(nfe.dest.CPF).toBeUndefined();
    expect(nfe.dest.xNome).toBe('CONSUMIDOR');
  });

  it('calcula vNF corretamente', () => {
    const nfe = montarNFe({ ordem, itens, cliente, emitente, numero: 3, serie: '1' });
    expect(Number(nfe.total.ICMSTot.vNF)).toBeCloseTo(150.00, 2);
  });

  it('aplica CSOSN 400 e CST 07 para PIS/COFINS', () => {
    const nfe = montarNFe({ ordem, itens, cliente, emitente, numero: 4, serie: '1' });
    const imp = nfe.det[0].imposto;
    expect(imp.ICMS.ICMSSN400.CSOSN).toBe('400');
    expect(imp.PIS.PISAliq.CST).toBe('07');
    expect(imp.COFINS.COFINSAliq.CST).toBe('07');
  });
});
