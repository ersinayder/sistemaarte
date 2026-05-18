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

function montarEnderecoDest(cliente) {
  if (!cliente?.logradouro) return null;
  return {
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

function montarDest(cliente) {
  const dest = { xNome: (cliente?.clientenome || cliente?.name || 'CONSUMIDOR FINAL').toUpperCase() };
  const documento = (cliente?.cpf || '').replace(/\D/g, '');
  const ie = String(cliente?.ie || '').trim();

  if (documento.length === 11 || documento.length === 14) {
    dest.CNPJCPF = documento;
    const endereco = montarEnderecoDest(cliente);
    if (endereco) dest.enderDest = endereco;

    if (documento.length === 14 && ie) {
      dest.IE = ie;
      dest.indIEDest = '1';
    } else {
      dest.indIEDest = '9';
    }
  } else {
    // Consumidor final sem CPF/CNPJ valido
    dest.CNPJCPF   = '11111111111';
    dest.indIEDest = '9';
  }

  return dest;
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

function montarItem(item) {
  const qtd   = Number(item.quantidade)     || 1;
  const vUnit = Number(item.preco_unitario) || 0;
  const vProd = (qtd * vUnit).toFixed(2);
  const ncm   = (item.ncm  || '49119900').replace(/\D/g, '').padStart(8, '0');
  const cfop  = (item.cfop || '5102').replace(/\D/g, '');

  return {
    prod: {
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
      indTot:   '1',
    },
    imposto: montarImpostoSimples(item),
  };
}

function calcularTotais(itens) {
  const vProd = itens.reduce((acc, item) =>
    acc + (Number(item.quantidade) || 1) * (Number(item.preco_unitario) || 0), 0);
  const v = vProd.toFixed(2);
  return {
    ICMSTot: {
      vBC: '0.00', vICMS: '0.00', vICMSDeson: '0.00',
      vFCP: '0.00', vBCST: '0.00', vST: '0.00',
      vFCPST: '0.00', vFCPSTRet: '0.00',
      vProd: v, vFrete: '0.00', vSeg: '0.00',
      vDesc: '0.00', vII: '0.00', vIPI: '0.00',
      vIPIDevol: '0.00',
      vPIS: '0.00', vCOFINS: '0.00', vOutro: '0.00',
      vNF: v, vTotTrib: '0.00',
    },
  };
}

function dhEmiBrasilia() {
  // Gera timestamp no horario de Brasilia (UTC-3) sem depender do fuso do servidor
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().replace(/\.\d{3}Z$/, '-03:00');
}

function montarNFe({ ordem, itens, cliente, emitente, numero, serie }) {
  const tpAmb = process.env.NFE_AMBIENTE === 'producao' ? 1 : 2;

  // emit usa CNPJCPF — a lib valida e converte para a tag CNPJ ou CPF no XML
  const emit = {
    CNPJCPF:   (emitente.CNPJ || '').replace(/\D/g, ''),
    xNome:     emitente.xNome,
    xFant:     emitente.xFant,
    enderEmit: emitente.enderEmit,
    IE:        emitente.IE,
    CRT:       emitente.CRT,
  };

  return {
    infNFe: {
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
        cMunFG:   '3127701',
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
      det:    itens.map((item) => montarItem(item)),
      total:  calcularTotais(itens),
      transp: { modFrete: '9' },
      pag: {
        detPag: [{
          tPag: mapTpPag(ordem.pagamento),
          vPag: Number(ordem.valortotal || 0).toFixed(2),
        }],
      },
    },
  };
}

module.exports = { montarNFe };
