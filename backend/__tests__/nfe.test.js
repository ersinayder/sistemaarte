import { describe, it, expect, vi } from 'vitest';
import { montarNFe } from '../domain/nfeRules.js';

// Mock do wizard - nao chama SEFAZ
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
const cliente  = { name: 'Joao Teste', cpf: '123.456.789-09' };
const emitente = {
  CNPJ: '00000000000000', xNome: 'ARTE E MOLDURAS LTDA',
  xFant: 'Arte e Molduras', IE: '0000000000', CRT: '1',
  enderEmit: { xLgr:'Rua', nro:'1', xBairro:'Centro', cMun:'3131307', xMun:'Ipatinga', UF:'MG', CEP:'35160000', cPais:'1058', xPais:'Brasil' },
};
const itens = [
  { produto_id: 1, nome: 'Moldura MDF',           quantidade: 2, preco_unitario: 50, ncm: '44140000', cfop: '5102', csosn: '400', unidade: 'UN', origem_fiscal: 0 },
  { produto_id: 2, nome: 'Quadro Personalizado',  quantidade: 1, preco_unitario: 50, ncm: '49119100', cfop: '5102', csosn: '400', unidade: 'UN', origem_fiscal: 0 },
];

describe('montarNFe', () => {
  // montarNFe retorna { infNFe: { ide, dest, det, total, ... } }
  // Os campos ficam dentro de infNFe - a lib nfewizard-io exige esse wrapper

  it('deve montar a estrutura basica da NF-e', () => {
    const { infNFe } = montarNFe({ ordem, itens, cliente, emitente, numero: 1, serie: '1' });
    expect(infNFe.ide.mod).toBe('55');
    expect(infNFe.ide.nNF).toBe('1');
    expect(infNFe.ide.cMunFG).toBe('3131307');
    expect(infNFe.emit.enderEmit.cMun).toBe('3131307');
    expect(infNFe.det).toHaveLength(2);
    expect(infNFe.dest.xNome).toBe('JOAO TESTE');
  });

  it('usa ambiente informado como tpAmb numerico', () => {
    const homologacao = montarNFe({ ordem, itens, cliente, emitente, numero: 1, serie: '1', ambiente: 2 });
    const producao = montarNFe({ ordem, itens, cliente, emitente, numero: 1, serie: '1', ambiente: 1 });

    expect(homologacao.infNFe.ide.tpAmb).toBe(2);
    expect(producao.infNFe.ide.tpAmb).toBe(1);
  });

  it('inclui autorizados XML quando informados', () => {
    const autXML = [
      { CPF: '12345678901' },
      { CNPJ: '07500718000196' },
    ];

    const { infNFe } = montarNFe({ ordem, itens, cliente, emitente, numero: 1, serie: '1', autXML });

    expect(infNFe.autXML).toEqual(autXML);
  });

  it('dest sem CPF quando cliente nao tem CPF valido', () => {
    const { infNFe } = montarNFe({ ordem, itens, cliente: { name: 'Consumidor' }, emitente, numero: 2, serie: '1' });
    // Consumidor final sem CPF usa CNPJCPF='11111111111' (CPF generico)
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

  it('informa desconto da OS nos totais fiscais e distribui nos itens', () => {
    const { infNFe } = montarNFe({
      ordem: { ...ordem, valortotal: 135, descontovalor: 15 },
      itens,
      cliente,
      emitente,
      numero: 6,
      serie: '1',
    });

    expect(infNFe.det[0].prod.vDesc).toBe('10.00');
    expect(infNFe.det[1].prod.vDesc).toBe('5.00');
    expect(infNFe.total.ICMSTot.vProd).toBe('150.00');
    expect(infNFe.total.ICMSTot.vDesc).toBe('15.00');
    expect(infNFe.total.ICMSTot.vNF).toBe('135.00');
    expect(infNFe.pag.detPag[0].vPag).toBe('135.00');
  });

  it('infere desconto quando OS legada tem total menor que os itens', () => {
    const { infNFe } = montarNFe({
      ordem: { ...ordem, valortotal: 140 },
      itens,
      cliente,
      emitente,
      numero: 7,
      serie: '1',
    });

    expect(infNFe.total.ICMSTot.vDesc).toBe('10.00');
    expect(infNFe.total.ICMSTot.vNF).toBe('140.00');
    expect(infNFe.pag.detPag[0].vPag).toBe('140.00');
  });

  it('aplica ICMSSN102 para CSOSN 400 e PISNT/COFINSNT CST 07 para Simples Nacional', () => {
    // ICMSSN400 nao existe no XSD da SEFAZ - CSOSN 400 mapeia para ICMSSN102
    // PIS/COFINS no Simples Nacional usa PISNT/COFINSNT com CST 07 (nao tributado)
    const { infNFe } = montarNFe({ ordem, itens, cliente, emitente, numero: 4, serie: '1' });
    const imp = infNFe.det[0].imposto;
    expect(imp.ICMS.ICMSSN102.CSOSN).toBe('400');
    expect(imp.PIS.PISNT.CST).toBe('07');
    expect(imp.COFINS.COFINSNT.CST).toBe('07');
  });
});
