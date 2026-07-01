'use strict';

/**
 * domain/nfeRules.js
 * Monta o payload NF-e (mod 55) para o nfewizard-io v1.0.4.
 *
 * Estrutura esperada pela lib:
 *   { infNFe: { ide, emit: { CNPJCPF }, dest: { CNPJCPF }, det[], total, transp, pag } }
 *
 * - emit.CNPJCPF e dest.CNPJCPF: a lib valida e converte para CNPJ/CPF internamente.
 * - ide.tpAmb: number (1=producao, 2=homologacao).
 * - ide.dhEmi: horario de Brasilia no formato 2006-01-02T15:04:05-03:00.
 * - ICMSSN400 nao existe no schema — usar ICMSSN102 para CSOSN 400.
 * - PIS/COFINS Simples Nacional: PISNT/COFINSNT com CST 07.
 */

// Mapeia forma de pagamento da OS para tPag da NF-e
function mapTpPag(pagamento) {
  const mapa = {
    'Dinheiro':        '01',
    'Cheque':          '02',
    'Cartão Crédito':  '03',
    'Cartao Credito':  '03',
    'Cartão Débito':   '04',
    'Cartao Debito':   '04',
    'Crédito Loja':    '05',
    'Credito Loja':    '05',
    'Vale Alimentação':'10',
    'Vale Refeição':   '11',
    'Vale Presente':   '12',
    'Vale Combustível':'13',
    'Boleto':          '15',
    'Pix':             '17',
    'Transferência':   '17',
    'Transferencia':   '17',
    'Sem Pagamento':   '90',
  };
  return mapa[pagamento] || '01';
}

const COD_MUNICIPIO_IPATINGA = '3131307';
const MAX_INF_CPL = 5000;

function normalizarInformacoesComplementares(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .trim()
    .slice(0, MAX_INF_CPL);
}

function montarEnderecoDest(cliente) {
  if (!cliente?.logradouro) return null;
  return {
    xLgr:    (cliente.logradouro || '').toUpperCase(),
    nro:     (cliente.c_numero   || cliente.numero || 'S/N').toUpperCase(),
    xBairro: (cliente.bairro     || 'CENTRO').toUpperCase(),
    cMun:    cliente.cod_municipio || COD_MUNICIPIO_IPATINGA,
    xMun:    (cliente.cidade     || 'IPATINGA').toUpperCase(),
    UF:      (cliente.uf         || 'MG').toUpperCase(),
    CEP:     (cliente.cep        || '').replace(/\D/g, ''),
    cPais:   '1058',
    xPais:   'BRASIL',
  };
}

function montarDest(cliente) {
  const xNome = (cliente?.clientenome || cliente?.name || 'CONSUMIDOR FINAL').toUpperCase();
  const documento = (cliente?.cpf || '').replace(/\D/g, '');
  const ie = String(cliente?.ie || '').trim();

  if (documento.length === 11 || documento.length === 14) {
    const dest = { CNPJCPF: documento, xNome };
    const endereco = montarEnderecoDest(cliente);
    if (endereco) dest.enderDest = endereco;

    if (documento.length === 14 && ie) {
      if (ie.toUpperCase() === 'ISENTO') {
        dest.indIEDest = '2';
      } else {
        dest.indIEDest = '1';
        dest.IE = ie;
      }
    } else {
      dest.indIEDest = '9';
    }
    return dest;
  } else {
    // Consumidor final sem CPF/CNPJ valido
    return {
      CNPJCPF:   '11111111111',
      xNome,
      indIEDest: '9',
    };
  }
}

function montarImpostoSimples(item) {
  const csosn = String(item.csosn || '400');

  // Mapeamento CSOSN -> tag XML NF-e (ICMSSN400 nao existe no schema da SEFAZ)
  // 101                    -> ICMSSN101
  // 102, 103, 300, 400     -> ICMSSN102 (tributado sem permissao de credito)
  // 500                    -> ICMSSN500
  // 900                    -> ICMSSN900
  const tagICMS =
    csosn === '101'                              ? 'ICMSSN101' :
    ['102', '103', '300', '400'].includes(csosn) ? 'ICMSSN102' :
    csosn === '500'                              ? 'ICMSSN500' :
    csosn === '900'                              ? 'ICMSSN900' :
    'ICMSSN102';

  return {
    ICMS: {
      [tagICMS]: {
        orig:  String(item.origem_fiscal ?? '0'),
        CSOSN: csosn,
      },
    },
    PIS:    { PISNT:    { CST: '07' } },
    COFINS: { COFINSNT: { CST: '07' } },
  };
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function montarItem(item, desconto = 0) {
  const qtd   = Number(item.quantidade)     || 1;
  const vUnit = Number(item.preco_unitario) || 0;
  const vProd = (qtd * vUnit).toFixed(2);
  const ncm   = (item.ncm  || '49119900').replace(/\D/g, '').padStart(8, '0');
  const cfop  = (item.cfop || '5102').replace(/\D/g, '');
  const vDesc = Math.min(roundMoney(desconto), Number(vProd));

  const prod = {
    cProd:    String(item.produto_id || item.id || '000'),
    cEAN:     'SEM GTIN',
    xProd:    (item.nome || 'PRODUTO').substring(0, 120).toUpperCase(),
    NCM:      ncm,
    CFOP:     cfop,
    uCom:     (item.unidade || 'UN').toUpperCase(),
    qCom:     qtd.toFixed(4),
    vUnCom:   vUnit.toFixed(10),
    vProd,
    cEANTrib: 'SEM GTIN',
    uTrib:    (item.unidade || 'UN').toUpperCase(),
    qTrib:    qtd.toFixed(4),
    vUnTrib:  vUnit.toFixed(10),
    ...(vDesc > 0 ? { vDesc: vDesc.toFixed(2) } : {}),
    indTot:   '1',
  };

  return {
    prod,
    imposto: montarImpostoSimples(item),
  };
}

function valorProdutoItem(item) {
  return (Number(item.quantidade) || 1) * (Number(item.preco_unitario) || 0);
}

function distribuirDesconto(itens, descontoTotal) {
  const totalProdutos = roundMoney(itens.reduce((acc, item) => acc + valorProdutoItem(item), 0));
  const desconto = Math.min(Math.max(0, roundMoney(descontoTotal)), totalProdutos);
  if (desconto <= 0 || totalProdutos <= 0) return itens.map(() => 0);

  let distribuido = 0;
  return itens.map((item, index) => {
    const vProd = roundMoney(valorProdutoItem(item));
    if (index === itens.length - 1) {
      return Math.min(vProd, roundMoney(desconto - distribuido));
    }
    const descontoItem = Math.min(vProd, roundMoney(desconto * (vProd / totalProdutos)));
    distribuido = roundMoney(distribuido + descontoItem);
    return descontoItem;
  });
}

function descontoDaOrdem(ordem, itens) {
  const informado = Number(ordem.descontovalor || 0);
  if (informado > 0) return informado;

  const totalProdutos = roundMoney(itens.reduce((acc, item) => acc + valorProdutoItem(item), 0));
  const totalOS = roundMoney(Number(ordem.valortotal || 0));
  return totalOS > 0 && totalOS < totalProdutos ? roundMoney(totalProdutos - totalOS) : 0;
}

function calcularTotais(itens, descontoTotal = 0) {
  const vProd = itens.reduce((acc, item) => acc + valorProdutoItem(item), 0);
  const desconto = Math.min(roundMoney(descontoTotal), roundMoney(vProd));
  const v = vProd.toFixed(2);
  const d = desconto.toFixed(2);
  const nf = roundMoney(vProd - desconto).toFixed(2);
  return {
    total: {
      ICMSTot: {
        vBC: '0.00', vICMS: '0.00', vICMSDeson: '0.00',
        vFCP: '0.00', vBCST: '0.00', vST: '0.00',
        vFCPST: '0.00', vFCPSTRet: '0.00',
        vProd: v, vFrete: '0.00', vSeg: '0.00',
        vDesc: d, vII: '0.00', vIPI: '0.00',
        vIPIDevol: '0.00',
        vPIS: '0.00', vCOFINS: '0.00', vOutro: '0.00',
        vNF: nf, vTotTrib: '0.00',
      },
    },
    vNF: nf,
  };
}

function dhEmiBrasilia() {
  // Gera timestamp no horario de Brasilia (UTC-3) sem depender do fuso do servidor
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().replace(/\.\d{3}Z$/, '-03:00');
}

function resolverTpAmb(ambiente) {
  const informado = Number(ambiente);
  if (informado === 1 || informado === 2) return informado;

  const envAmbienteNum = Number(process.env.NFE_AMBIENTE_NUM);
  if (envAmbienteNum === 1 || envAmbienteNum === 2) return envAmbienteNum;

  return process.env.NFE_AMBIENTE === 'producao' ? 1 : 2;
}

function montarNFe({ ordem, itens, cliente, emitente, numero, serie, ambiente, autXML }) {
  const tpAmb = resolverTpAmb(ambiente);
  const descontosItens = distribuirDesconto(itens, descontoDaOrdem(ordem, itens));
  const totais = calcularTotais(itens, descontosItens.reduce((acc, value) => acc + value, 0));
  const infCpl = normalizarInformacoesComplementares(
    ordem?.informacoes_complementares ?? ordem?.informacoesComplementares
  );

  // emit usa CNPJCPF — a lib valida e converte para a tag CNPJ ou CPF no XML
  const emit = {
    CNPJCPF:   (emitente.CNPJ || '').replace(/\D/g, ''),
    xNome:     emitente.xNome,
    xFant:     emitente.xFant,
    enderEmit: emitente.enderEmit,
    IE:        emitente.IE,
    CRT:       emitente.CRT,
  };

  const infNFe = {
    ide: {
      cUF:      '31',
      cNF:      String(numero).slice(-8).padStart(8, '0'),
      natOp:    'VENDA DE MERCADORIA',
      mod:      '55',
      serie:    String(serie || '1'),
      nNF:      String(numero),
      dhEmi:    dhEmiBrasilia(),
      tpNF:     '1',
      idDest:   '1',
      cMunFG:   emitente.enderEmit?.cMun || COD_MUNICIPIO_IPATINGA,
      tpImp:    '1',
      tpEmis:   '1',
      cDV:      '0',    // recalculado pela lib
      tpAmb,            // number, nao string
      finNFe:   '1',
      indFinal: '1',
      indPres:  '1',
      procEmi:  '0',
      verProc:  '1.0.0.0',
    },
    emit,
    dest:   montarDest(cliente),
    det:    itens.map((item, index) => montarItem(item, descontosItens[index])),
    total:  totais.total,
    transp: { modFrete: '9' },
    pag: {
      detPag: [{
        tPag: mapTpPag(ordem.pagamento),
        vPag: totais.vNF,
      }],
    },
  };

  if (Array.isArray(autXML) && autXML.length > 0) {
    infNFe.autXML = autXML;
  }
  if (infCpl) {
    infNFe.infAdic = { infCpl };
  }

  return { infNFe };
}

module.exports = { montarNFe, normalizarInformacoesComplementares };
