import { describe, it, expect } from 'vitest';
import danfe from '../utils/danfe.js';

const { extractDanfeData, renderDanfeHtml } = danfe;

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe31260507500718000196550010000000291000000291">
      <ide>
        <natOp>Venda de mercadoria</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>29</nNF>
        <dhEmi>2026-05-15T10:30:00-03:00</dhEmi>
        <tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>07500718000196</CNPJ>
        <xNome>ARTE E MOLDURAS LTDA</xNome>
        <xFant>Arte e Molduras</xFant>
        <IE>001002003004</IE>
        <enderEmit>
          <xLgr>Rua Teste</xLgr>
          <nro>10</nro>
          <xBairro>Centro</xBairro>
          <xMun>Ipatinga</xMun>
          <UF>MG</UF>
          <CEP>35160000</CEP>
        </enderEmit>
      </emit>
      <dest>
        <CPF>12345678909</CPF>
        <xNome>Cliente Teste</xNome>
        <enderDest>
          <xLgr>Av Cliente</xLgr>
          <nro>20</nro>
          <xBairro>Bairro</xBairro>
          <xMun>Ipatinga</xMun>
          <UF>MG</UF>
          <CEP>35162000</CEP>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>1</cProd>
          <xProd>Moldura MDF</xProd>
          <NCM>44140000</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>2.0000</qCom>
          <vUnCom>50.00</vUnCom>
          <vProd>100.00</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vProd>100.00</vProd>
          <vFrete>0.00</vFrete>
          <vDesc>0.00</vDesc>
          <vNF>100.00</vNF>
        </ICMSTot>
      </total>
      <transp><modFrete>9</modFrete></transp>
      <pag><detPag><tPag>01</tPag><vPag>100.00</vPag></detPag></pag>
    </infNFe>
  </NFe>
  <protNFe>
    <infProt>
      <chNFe>31260507500718000196550010000000291000000291</chNFe>
      <nProt>131260152119363</nProt>
      <cStat>100</cStat>
      <dhRecbto>2026-05-15T10:30:05-03:00</dhRecbto>
    </infProt>
  </protNFe>
</nfeProc>`;

describe('DANFE HTML', () => {
  it('extrai dados principais do XML autorizado', () => {
    const data = extractDanfeData(XML);
    expect(data.chave).toBe('31260507500718000196550010000000291000000291');
    expect(data.ide.nNF).toBe('29');
    expect(data.emit.xNome).toBe('ARTE E MOLDURAS LTDA');
    expect(data.dest.xNome).toBe('Cliente Teste');
    expect(data.total.vNF).toBe('100.00');
    expect(data.itens).toHaveLength(1);
    expect(data.itens[0].xProd).toBe('Moldura MDF');
  });

  it('renderiza HTML imprimivel com chave e produtos', () => {
    const html = renderDanfeHtml(XML);
    expect(html).toContain('DANFE');
    expect(html).toContain('NF-e 29');
    expect(html).toContain('3126 0507 5007 1800 0196 5500 1000 0000 2910 0000 0291');
    expect(html).toContain('Moldura MDF');
    expect(html).toContain('Imprimir / salvar PDF');
  });
});
