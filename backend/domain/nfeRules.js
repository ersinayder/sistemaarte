'use strict';

/**
 * domain/nfeRules.js
 * Monta o payload NF-e (mod 55) para o nfewizard-io.
 * Regime: Simples Nacional (CRT=1), CSOSN 400, PIS/COFINS CST 07.
 */

function montarDest(cliente) {
  const dest = { xNome: (cliente?.clientenome || cliente?.name || 'CONSUMIDOR FINAL').toUpperCase() };
  const cpf = (cliente?.cpf || '').replace(/\D/g, '');

  if (cpf.length === 11) {
    dest.CPF = cpf;
    // Endereco do destinatario (obrigatorio quando ha CPF)
    if (cliente?.logradouro) {
      dest.enderDest = {
        xLgr:    (cliente.logradouro || '').toUpperCase(),
        nro:     (cliente.c_numero   || cliente.numero || 'S/N').toUpperCase(),
        xBairro: (cliente.bairro     || 'CENTRO').toUpperCase(),
        cMun:    cliente.cod_municipio || '3127701',
        xMun:    (cliente.cidade     || 'IPATINGA').toUpperCase(),
        UF:      (cliente.uf         || 'MG').toUpperCase(),
        CEP:     (cliente.cep        || '').replace(/\D/g, ''),
        cPais:   '1058',
        xPais:   'BRASIL',
      };
    }
    dest.indIEDest = '9';
  } else {
    // Consumidor final sem CPF/CNPJ valido
    dest.indIEDest = '9';
  }

  return dest;
}

function montarImpostoSimples(item) {
  return {
    ICMS: {
      ICMSSN400: {
        orig:  String(item.origem_fiscal ?? '0'),
        CSOSN: String(item.csosn || '400'),
      },
    },
    PIS: {
      PISAliq: { CST: '07', vBC: '0.00', pPIS: '0.0000', vPIS: '0.00' },
    },
    COFINS: {
      COFINSAliq: { CST: '07', vBC: '0.00', pCOFINS: '0.0000', vCOFINS: '0.00' },
    },
  };
}

function montarItem(item, nItem) {
  const qtd   = Number(item.quantidade)     || 1;
  const vUnit = Number(item.preco_unitario) || 0;
  const vProd = (qtd * vUnit).toFixed(2);
  const ncm   = (item.ncm  || '49119900').replace(/\D/g, '').padStart(8, '0');
  const cfop  = (item.cfop || '5102').replace(/\D/g, '');

  return {
    nItem: String(nItem),
    prod: {
      cProd:    String(item.produto_id || item.id || '000'),
      cEAN:     'SEM GTIN',
      xProd:    (item.nome || 'PRODUTO').substring(0, 120).toUpperCase(),
      NCM:      ncm,
      CFOP:     cfop,
      uCom:     (item.unidade || 'UN').toUpperCase(),
      qCom:     qtd.toFixed(4),
      vUnCom:   vUnit.toFixed(10),
      vProd:    vProd,
      cEANTrib: 'SEM GTIN',
      uTrib:    (item.unidade || 'UN').toUpperCase(),
      qTrib:    qtd.toFixed(4),
      vUnTrib:  vUnit.toFixed(10),
      indTot:   '1',
    },
    imposto: montarImpostoSimples(item),
  };
}

function calcularTotais(itens) {
  const vProd = itens.reduce((acc, item) => {
    return acc + (Number(item.quantidade) || 1) * (Number(item.preco_unitario) || 0);
  }, 0);
  const v = vProd.toFixed(2);
  return {
    ICMSTot: {
      vBC:       '0.00', vICMS:     '0.00', vICMSDeson: '0.00',
      vFCP:      '0.00', vBCST:     '0.00', vST:        '0.00',
      vFCPST:    '0.00', vFCPSTRet: '0.00',
      vProd:     v,      vFrete:    '0.00', vSeg:       '0.00',
      vDesc:     '0.00', vII:       '0.00', vIPI:       '0.00',
      vIPIDevol: '0.00',
      vPIS:      '0.00', vCOFINS:   '0.00', vOutro:     '0.00',
      vNF:       v,      vTotTrib:  '0.00',
    },
  };
}

function montarNFe({ ordem, itens, cliente, emitente, numero, serie }) {
  const tpAmb = process.env.NFE_AMBIENTE === 'producao' ? '1' : '2';

  return {
    ide: {
      cUF:     '31',
      natOp:   'VENDA DE MERCADORIA',
      mod:     '55',
      serie:   String(serie || '1'),
      nNF:     String(numero),
      dhEmi:   new Date().toISOString(),
      tpNF:    '1',
      idDest:  '1',
      cMunFG:  '3127701',
      tpImp:   '1',
      tpEmis:  '1',
      finNFe:  '1',
      indFinal:'1',
      indPres: '1',
      tpAmb,
    },
    emit:  emitente,
    dest:  montarDest(cliente),
    det:   itens.map((item, i) => montarItem(item, i + 1)),
    total: calcularTotais(itens),
    transp: { modFrete: '9' },
    pag: {
      detPag: [{
        tPag: '99',
        vPag: Number(ordem.valortotal || 0).toFixed(2),
      }],
    },
  };
}

module.exports = { montarNFe };
