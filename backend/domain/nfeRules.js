/**
 * Monta a estrutura de dados da NF-e para o nfewizard-io.
 * Regime: Simples Nacional — CSOSN 400, PIS/COFINS CST 07 (isenção).
 * Confirmar CSTs com contador antes do go-live.
 */
'use strict';

const CODIGO_MUNICIPIO_IPATINGA = '3127701';

function montarNFe({ ordem, itens, cliente, emitente, numero, serie }) {
  return {
    ide: {
      cUF:     '31',
      natOp:   'VENDA',
      mod:     '55',
      serie:   String(serie),
      nNF:     String(numero),
      dhEmi:   new Date().toISOString(),
      tpNF:    '1',
      idDest:  '1',
      cMunFG:  CODIGO_MUNICIPIO_IPATINGA,
      tpImp:   '1',
      tpEmis:  '1',
      finNFe:  '1',
      indFinal:'1',
      indPres: '1',
      tpAmb:   process.env.NFE_AMBIENTE === 'producao' ? '1' : '2',
    },
    emit:   emitente,
    dest:   montarDest(cliente),
    det:    itens.map((item, i) => montarItem(item, i + 1)),
    total:  calcularTotais(itens),
    transp: { modFrete: '9' },
    pag:    { detPag: [{ tPag: '99', vPag: Number(ordem.valortotal).toFixed(2) }] },
  };
}

function montarDest(cliente) {
  const dest = { xNome: (cliente && cliente.name) ? cliente.name : 'CONSUMIDOR' };
  if (cliente && cliente.cpf) {
    const cpfDigits = cliente.cpf.replace(/\D/g, '');
    if (cpfDigits.length === 11) dest.CPF = cpfDigits;
  }
  if (cliente && cliente.ie) dest.IE = cliente.ie;
  return dest;
}

function montarItem(item, ordem) {
  const qtd   = Number(item.quantidade   || 1);
  const vUnit = Number(item.preco_unitario || item.valorunitario || 0);
  const vProd = (qtd * vUnit).toFixed(2);
  const ncm   = (item.ncm  || '49119900').replace(/\D/g, '').padStart(8, '0');
  const cfop  = (item.cfop || '5102').replace(/\D/g, '');

  return {
    nItem: String(ordem),
    prod: {
      cProd:    String(item.produto_id || item.produtoid || '000'),
      cEAN:     'SEM GTIN',
      xProd:    (item.nome || item.descricao || 'PRODUTO').substring(0, 120),
      NCM:      ncm,
      CFOP:     cfop,
      uCom:     item.unidade || 'UN',
      qCom:     qtd,
      vUnCom:   vUnit.toFixed(10),
      vProd:    vProd,
      cEANTrib: 'SEM GTIN',
      uTrib:    item.unidade || 'UN',
      qTrib:    qtd,
      vUnTrib:  vUnit.toFixed(10),
      indTot:   '1',
    },
    imposto: montarImpostoSimples(item),
  };
}

function montarImpostoSimples(item) {
  return {
    ICMS: {
      ICMSSN400: {
        orig:  String(item.origem_fiscal ?? item.origem ?? '0'),
        CSOSN: item.csosn || '400',
      },
    },
    PIS:    { PISAliq:    { CST: '07', vBC: '0.00', pPIS:    '0.00', vPIS:    '0.00' } },
    COFINS: { COFINSAliq: { CST: '07', vBC: '0.00', pCOFINS: '0.00', vCOFINS: '0.00' } },
  };
}

function calcularTotais(itens) {
  const vNF = itens.reduce((acc, i) => {
    return acc + Number(i.quantidade || 1) * Number(i.preco_unitario || i.valorunitario || 0);
  }, 0).toFixed(2);

  return {
    ICMSTot: {
      vBC: '0.00', vICMS: '0.00', vICMSDeson: '0.00',
      vFCP: '0.00', vBCST: '0.00', vST: '0.00', vFCPST: '0.00', vFCPSTRet: '0.00',
      vProd: vNF, vFrete: '0.00', vSeg: '0.00', vDesc: '0.00',
      vII: '0.00', vIPI: '0.00', vIPIDevol: '0.00',
      vPIS: '0.00', vCOFINS: '0.00', vOutro: '0.00',
      vNF,
    },
  };
}

module.exports = { montarNFe };
