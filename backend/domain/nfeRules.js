/**
 * domain/nfeRules.js
 * Monta o payload NF-e (mod 55) para o nfewizard-io.
 * Regime: Simples Nacional (CRT=1), CSOSN 400, PIS/COFINS CST 07.
 */

'use strict';

// ─── Funções auxiliares ───────────────────────────────────────────────────────

function montarDest(cliente) {
  const dest = { xNome: (cliente?.name || 'CONSUMIDOR FINAL').toUpperCase() };
  const cpf = (cliente?.cpf || '').replace(/\D/g, '');
  if (cpf.length === 11) dest.CPF = cpf;
  // Sem endereço obrigatório para consumidor final (indFinal=1)
  return dest;
}

function montarImpostoSimples(item) {
  return {
    ICMS: {
      ICMSSN400: {
        orig:  String(item.origem_fiscal ?? 0),
        CSOSN: item.csosn   || '400',
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
  const qtd   = Number(item.quantidade)      || 1;
  const vUnit = Number(item.preco_unitario)  || 0;
  const vProd = (qtd * vUnit).toFixed(2);
  const ncm   = (item.ncm || '49119900').replace(/\D/g, '').padStart(8, '0');
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
      qCom:     String(qtd),
      vUnCom:   vUnit.toFixed(10),
      vProd:    vProd,
      cEANTrib: 'SEM GTIN',
      uTrib:    (item.unidade || 'UN').toUpperCase(),
      qTrib:    String(qtd),
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
      vBC:   '0.00', vICMS:  '0.00', vICMSDeson: '0.00',
      vFCP:  '0.00', vBCST:  '0.00', vST:        '0.00',
      vFCPST:'0.00', vFCPSTRet: '0.00',
      vProd: v,      vFrete: '0.00', vSeg:       '0.00',
      vDesc: '0.00', vII:    '0.00', vIPI:       '0.00',
      vIPIDevol: '0.00',
      vPIS:  '0.00', vCOFINS:'0.00', vOutro:     '0.00',
      vNF:   v,      vTotTrib:'0.00',
    },
  };
}

// ─── Montagem principal ───────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object} opts.ordem      — registro da tabela ordens
 * @param {object[]} opts.itens    — itens com colunas de produtos joinadas
 * @param {object} opts.cliente    — registro da tabela clientes (pode ser null)
 * @param {object} opts.emitente   — dados do emitente (CNPJ, IE, endereço, etc.)
 * @param {number} opts.numero     — próximo número sequencial NF-e
 * @param {string} opts.serie      — série (ex: '1')
 * @returns {object} payload pronto para wizard.NFeAutorizacao({ NFe: payload })
 */
function montarNFe({ ordem, itens, cliente, emitente, numero, serie }) {
  const tpAmb = process.env.NFE_AMBIENTE === 'producao' ? '1' : '2';

  return {
    ide: {
      cUF:    '31',
      natOp:  'VENDA DE MERCADORIA',
      mod:    '55',
      serie:  String(serie || '1'),
      nNF:    String(numero),
      dhEmi:  new Date().toISOString(),
      tpNF:   '1',    // saída
      idDest: '1',    // operação interna (MG → MG)
      cMunFG: '3127701', // IBGE Ipatinga-MG
      tpImp:  '1',    // DANFE normal
      tpEmis: '1',    // emissão normal (online)
      finNFe: '1',    // NF-e normal
      indFinal:'1',   // consumidor final
      indPres: '1',   // operação presencial
      tpAmb,
    },
    emit: emitente,
    dest: montarDest(cliente),
    det:  itens.map((item, i) => montarItem(item, i + 1)),
    total: calcularTotais(itens),
    transp: { modFrete: '9' }, // sem frete
    pag: {
      detPag: [{
        tPag: '99',   // outros
        vPag: Number(ordem.valortotal || 0).toFixed(2),
      }],
    },
  };
}

module.exports = { montarNFe };
