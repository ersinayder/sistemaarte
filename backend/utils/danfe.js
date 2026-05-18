function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstTag(xml, tag) {
  const patterns = [
    new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'),
    new RegExp(`<\\w+:${tag}>([\\s\\S]*?)<\\/\\w+:${tag}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = String(xml || '').match(pattern);
    if (match) return decodeXml(match[1].trim());
  }
  return '';
}

function firstBlock(xml, tag) {
  const patterns = [
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
    new RegExp(`<\\w+:${tag}\\b[^>]*>([\\s\\S]*?)<\\/\\w+:${tag}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = String(xml || '').match(pattern);
    if (match) return match[1];
  }
  return '';
}

function firstAttr(xml, tag, attr) {
  const patterns = [
    new RegExp(`<${tag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<\\w+:${tag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = String(xml || '').match(pattern);
    if (match) return decodeXml(match[1].trim());
  }
  return '';
}

function allBlocks(xml, tag) {
  const out = [];
  const patterns = [
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'),
    new RegExp(`<\\w+:${tag}\\b[^>]*>([\\s\\S]*?)<\\/\\w+:${tag}>`, 'gi'),
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(xml || '')))) out.push(match[1]);
    if (out.length) break;
  }
  return out;
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function money(value) {
  const n = Number(String(value || '0').replace(',', '.'));
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function decimal(value, digits = 2) {
  const n = Number(String(value || '0').replace(',', '.'));
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function moneyDanfe(value) {
  const n = Number(String(value || '0').replace(',', '.'));
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function dateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatDoc(value) {
  const d = digits(value);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value || '';
}

function formatCep(value) {
  const d = digits(value);
  if (d.length === 8) return d.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  return value || '';
}

function formatChave(chave) {
  const d = digits(chave);
  return d ? d.replace(/(\d{4})(?=\d)/g, '$1 ') : '';
}

function formatPhone(value) {
  const d = digits(value);
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  return value || '';
}

function freteLabel(value) {
  const mapa = {
    0: '0 - Por conta do emitente',
    1: '1 - Por conta do destinatario',
    2: '2 - Por conta de terceiros',
    3: '3 - Transporte proprio remetente',
    4: '4 - Transporte proprio destinatario',
    9: '9 - Sem frete',
  };
  return mapa[String(value)] || String(value || '');
}

function pagamentoLabel(value) {
  const mapa = {
    '01': 'Dinheiro',
    '02': 'Cheque',
    '03': 'Cartao de credito',
    '04': 'Cartao de debito',
    '05': 'Credito loja',
    '15': 'Boleto',
    '17': 'Pix / transferencia',
    '90': 'Sem pagamento',
  };
  return mapa[String(value).padStart(2, '0')] || String(value || '');
}

const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
];

function barcode128C(value) {
  const d = digits(value);
  if (!d || d.length % 2 !== 0) return '';
  const codes = [105];
  for (let i = 0; i < d.length; i += 2) codes.push(Number(d.slice(i, i + 2)));
  const checksum = codes.reduce((acc, code, idx) => acc + (idx === 0 ? code : code * idx), 0) % 103;
  codes.push(checksum, 106);

  const height = 44;
  const unit = 1.15;
  let x = 0;
  const rects = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i += 1) {
      const w = Number(pattern[i]) * unit;
      if (i % 2 === 0) rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`);
      x += w;
    }
  }
  return `<svg class="barcode" viewBox="0 0 ${x.toFixed(2)} ${height}" preserveAspectRatio="none" aria-label="Codigo de barras da chave de acesso">${rects.join('')}</svg>`;
}

function extractDanfeData(xml) {
  const infNFe = firstBlock(xml, 'infNFe') || xml;
  const ide = firstBlock(infNFe, 'ide');
  const emit = firstBlock(infNFe, 'emit');
  const dest = firstBlock(infNFe, 'dest');
  const enderEmit = firstBlock(emit, 'enderEmit');
  const enderDest = firstBlock(dest, 'enderDest');
  const total = firstBlock(infNFe, 'ICMSTot');
  const transp = firstBlock(infNFe, 'transp');
  const transporta = firstBlock(transp, 'transporta');
  const vol = firstBlock(transp, 'vol');
  const pag = firstBlock(infNFe, 'pag');
  const prot = firstBlock(xml, 'infProt');
  const chave = firstTag(prot, 'chNFe') || firstAttr(xml, 'infNFe', 'Id').replace(/^NFe/i, '');

  const itens = allBlocks(infNFe, 'det').map((det, idx) => {
    const prod = firstBlock(det, 'prod');
    const imposto = firstBlock(det, 'imposto');
    const icms = firstBlock(imposto, 'ICMS');
    const ipi = firstBlock(imposto, 'IPI');
    return {
      n: firstAttr(det, 'det', 'nItem') || String(idx + 1),
      cProd: firstTag(prod, 'cProd'),
      xProd: firstTag(prod, 'xProd'),
      ncm: firstTag(prod, 'NCM'),
      cest: firstTag(prod, 'CEST'),
      cst: firstTag(icms, 'CST') || firstTag(icms, 'CSOSN'),
      cfop: firstTag(prod, 'CFOP'),
      uCom: firstTag(prod, 'uCom'),
      qCom: firstTag(prod, 'qCom'),
      vUnCom: firstTag(prod, 'vUnCom'),
      vProd: firstTag(prod, 'vProd'),
      vBC: firstTag(icms, 'vBC') || '0.00',
      vICMS: firstTag(icms, 'vICMS') || '0.00',
      vIPI: firstTag(ipi, 'vIPI') || '0.00',
      pICMS: firstTag(icms, 'pICMS') || '0.00',
      pIPI: firstTag(ipi, 'pIPI') || '0.00',
    };
  });

  return {
    chave,
    ide: {
      nNF: firstTag(ide, 'nNF'),
      serie: firstTag(ide, 'serie'),
      dhEmi: firstTag(ide, 'dhEmi'),
      dhSaiEnt: firstTag(ide, 'dhSaiEnt'),
      natOp: firstTag(ide, 'natOp'),
      tpNF: firstTag(ide, 'tpNF'),
      tpAmb: firstTag(ide, 'tpAmb'),
    },
    emit: {
      xNome: firstTag(emit, 'xNome'),
      xFant: firstTag(emit, 'xFant'),
      cnpj: firstTag(emit, 'CNPJ') || firstTag(emit, 'CNPJCPF'),
      ie: firstTag(emit, 'IE'),
      fone: firstTag(enderEmit, 'fone'),
      xLgr: firstTag(enderEmit, 'xLgr'),
      nro: firstTag(enderEmit, 'nro'),
      xBairro: firstTag(enderEmit, 'xBairro'),
      xMun: firstTag(enderEmit, 'xMun'),
      uf: firstTag(enderEmit, 'UF'),
      cep: formatCep(firstTag(enderEmit, 'CEP')),
      endereco: [
        firstTag(enderEmit, 'xLgr'),
        firstTag(enderEmit, 'nro'),
        firstTag(enderEmit, 'xBairro'),
        firstTag(enderEmit, 'xMun'),
        firstTag(enderEmit, 'UF'),
        formatCep(firstTag(enderEmit, 'CEP')),
      ].filter(Boolean).join(' - '),
    },
    dest: {
      xNome: firstTag(dest, 'xNome'),
      doc: firstTag(dest, 'CNPJ') || firstTag(dest, 'CPF') || firstTag(dest, 'CNPJCPF'),
      ie: firstTag(dest, 'IE') || 'ISENTO',
      xLgr: firstTag(enderDest, 'xLgr'),
      nro: firstTag(enderDest, 'nro'),
      xBairro: firstTag(enderDest, 'xBairro'),
      xMun: firstTag(enderDest, 'xMun'),
      uf: firstTag(enderDest, 'UF'),
      cep: formatCep(firstTag(enderDest, 'CEP')),
      endereco: [
        firstTag(enderDest, 'xLgr'),
        firstTag(enderDest, 'nro'),
        firstTag(enderDest, 'xBairro'),
        firstTag(enderDest, 'xMun'),
        firstTag(enderDest, 'UF'),
        formatCep(firstTag(enderDest, 'CEP')),
      ].filter(Boolean).join(' - '),
    },
    total: {
      vProd: firstTag(total, 'vProd'),
      vFrete: firstTag(total, 'vFrete'),
      vDesc: firstTag(total, 'vDesc'),
      vSeg: firstTag(total, 'vSeg'),
      vOutro: firstTag(total, 'vOutro'),
      vIPI: firstTag(total, 'vIPI'),
      vPIS: firstTag(total, 'vPIS'),
      vCOFINS: firstTag(total, 'vCOFINS'),
      vBCST: firstTag(total, 'vBCST'),
      vST: firstTag(total, 'vST'),
      vNF: firstTag(total, 'vNF'),
      vICMS: firstTag(total, 'vICMS'),
      vBC: firstTag(total, 'vBC'),
    },
    transp: {
      modFrete: firstTag(transp, 'modFrete'),
      xNome: firstTag(transporta, 'xNome'),
      doc: firstTag(transporta, 'CNPJ') || firstTag(transporta, 'CPF'),
      ie: firstTag(transporta, 'IE'),
      endereco: firstTag(transporta, 'xEnder'),
      xMun: firstTag(transporta, 'xMun'),
      uf: firstTag(transporta, 'UF'),
      qVol: firstTag(vol, 'qVol'),
      especie: firstTag(vol, 'esp'),
      marca: firstTag(vol, 'marca'),
      pesoL: firstTag(vol, 'pesoL'),
      pesoB: firstTag(vol, 'pesoB'),
    },
    pag: {
      vPag: firstTag(pag, 'vPag'),
      tPag: firstTag(pag, 'tPag'),
    },
    prot: {
      nProt: firstTag(prot, 'nProt'),
      dhRecbto: firstTag(prot, 'dhRecbto'),
      cStat: firstTag(prot, 'cStat'),
    },
    itens,
  };
}

function renderDanfeHtml(xml) {
  const d = extractDanfeData(xml);
  if (!d.chave || !d.ide.nNF) {
    const err = new Error('XML de NF-e nao contem chave ou numero da nota.');
    err.statusCode = 422;
    throw err;
  }

  const ambienteHomologacao = d.ide.tpAmb === '2';
  const barcode = barcode128C(d.chave);
  const dataSaida = dateOnly(d.ide.dhSaiEnt || d.ide.dhEmi);
  const horaSaida = dateTime(d.ide.dhSaiEnt || d.ide.dhEmi).split(' ')[1] || '';

  const itensRows = d.itens.map(item => `
    <tr>
      <td class="cod">${esc(item.cProd)}</td>
      <td class="desc">${esc(item.xProd)}</td>
      <td>${esc(item.ncm)}</td>
      <td>${esc(item.cst)}</td>
      <td>${esc(item.cfop)}</td>
      <td>${esc(item.uCom)}</td>
      <td class="num">${decimal(item.qCom, 4)}</td>
      <td class="num">${moneyDanfe(item.vUnCom)}</td>
      <td class="num">${moneyDanfe(item.vProd)}</td>
      <td class="num">${moneyDanfe(item.vBC)}</td>
      <td class="num">${moneyDanfe(item.vICMS)}</td>
      <td class="num">${moneyDanfe(item.vIPI)}</td>
      <td class="num">${decimal(item.pICMS, 2)}</td>
      <td class="num">${decimal(item.pIPI, 2)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>DANFE NF-e ${esc(d.ide.nNF)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #e5e7eb; color: #000; font-family: Arial, Helvetica, sans-serif; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 5mm; background: #fff; position: relative; }
    .danfe { font-size: 8pt; }
    .receipt { display: grid; grid-template-columns: 1fr 39mm; border: 1px solid #000; min-height: 18mm; margin-bottom: 1.4mm; }
    .receipt-text { padding: 2mm; font-size: 7pt; line-height: 1.28; }
    .receipt-sign { border-top: 1px solid #000; margin-top: 4mm; padding-top: 1mm; font-size: 6.5pt; }
    .receipt-nfe { border-left: 1px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 700; font-size: 10pt; line-height: 1.45; }
    .top { display: grid; grid-template-columns: 69mm 42mm 1fr; border: 1px solid #000; min-height: 44mm; }
    .box { border-right: 1px solid #000; padding: 1.6mm; overflow: hidden; }
    .box:last-child { border-right: 0; }
    .logo { min-height: 18mm; display: flex; align-items: center; justify-content: center; text-align: center; border-bottom: 1px solid #000; margin: -1.6mm -1.6mm 1.2mm; padding: 1.5mm; font-size: 13pt; font-weight: 800; text-transform: uppercase; letter-spacing: .01em; }
    .small { font-size: 6.5pt; line-height: 1.22; }
    .center { text-align: center; }
    .danfe-title { font-size: 18pt; font-weight: 900; line-height: 1; margin: 1mm 0 1mm; }
    .danfe-sub { font-size: 6.5pt; line-height: 1.25; }
    .entrada-saida { width: 29mm; display: grid; grid-template-columns: 21mm 8mm; align-items: stretch; border: 1px solid #000; margin: 1.3mm auto; font-size: 6.5pt; text-align: left; }
    .entrada-saida span { grid-column: 1; padding: .6mm .8mm; border-bottom: 1px solid #000; white-space: nowrap; }
    .entrada-saida span:last-child { border-bottom: 0; }
    .entrada-saida b { border-left: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 11pt; grid-row: 1 / span 2; grid-column: 2; }
    .nfnum { font-size: 10pt; font-weight: 800; line-height: 1.35; }
    .barcode { width: 100%; height: 15mm; display: block; margin: .6mm 0 1mm; fill: #000; }
    .barcode-fallback { height: 15mm; margin: .6mm 0 1mm; background: repeating-linear-gradient(90deg,#000 0 1px,#fff 1px 3px,#000 3px 5px,#fff 5px 8px); }
    .key { font-family: "Courier New", monospace; font-size: 8.2pt; font-weight: 700; line-height: 1.2; text-align: center; }
    .consulta { font-size: 6.5pt; text-align: center; line-height: 1.2; margin-top: .8mm; }
    .section-title { margin-top: 1.4mm; padding: .7mm 1.2mm; background: #d9d9d9; border: 1px solid #000; border-bottom: 0; font-size: 6.4pt; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; }
    .grid { display: grid; border: 1px solid #000; border-bottom: 0; }
    .grid.last { border-bottom: 1px solid #000; }
    .g2 { grid-template-columns: 1fr 35mm; }
    .g3 { grid-template-columns: 1fr 39mm 35mm; }
    .g4 { grid-template-columns: repeat(4, 1fr); }
    .g5 { grid-template-columns: repeat(5, 1fr); }
    .g6 { grid-template-columns: 1fr 24mm 26mm 26mm 26mm 28mm; }
    .field { min-height: 8mm; border-right: 1px solid #000; padding: .8mm 1.1mm; }
    .field:last-child { border-right: 0; }
    .label { display: block; font-size: 5.8pt; text-transform: uppercase; margin-bottom: .7mm; line-height: 1; }
    .value { display: block; font-size: 8pt; font-weight: 700; line-height: 1.16; }
    .value.normal { font-weight: 400; }
    table { width: 100%; border-collapse: collapse; }
    .products { border: 1px solid #000; table-layout: fixed; }
    th, td { border-right: 1px solid #000; border-bottom: 1px solid #000; padding: .9mm .8mm; font-size: 6.1pt; vertical-align: top; }
    th:last-child, td:last-child { border-right: 0; }
    th { background: #d9d9d9; text-transform: uppercase; font-size: 5.5pt; line-height: 1.05; font-weight: 800; text-align: center; }
    .cod { width: 17mm; }
    .desc { width: 49mm; }
    .num { text-align: right; white-space: nowrap; }
    .additional { display: grid; grid-template-columns: 1fr 58mm; border: 1px solid #000; min-height: 28mm; }
    .additional > div { padding: 1.3mm; border-right: 1px solid #000; font-size: 7pt; line-height: 1.32; }
    .additional > div:last-child { border-right: 0; }
    .watermark { position: absolute; inset: 85mm 0 auto 0; text-align: center; font-size: 26pt; font-weight: 900; color: rgba(0,0,0,.08); transform: rotate(-18deg); pointer-events: none; letter-spacing: .08em; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; width: 210mm; margin: 10px auto; }
    .actions button { border: 1px solid #0f766e; background: #0f766e; color: white; border-radius: 6px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
    @page { size: A4; margin: 5mm; }
    @media print {
      body { background: white; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Imprimir / salvar PDF</button></div>
  <main class="page">
    ${ambienteHomologacao ? '<div class="watermark">SEM VALOR FISCAL</div>' : ''}
    <div class="danfe">
      <div class="receipt">
        <div class="receipt-text">
          RECEBEMOS DE <strong>${esc(d.emit.xNome)}</strong> OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO.
          <div class="receipt-sign">DATA DE RECEBIMENTO &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; IDENTIFICACAO E ASSINATURA DO RECEBEDOR</div>
        </div>
        <div class="receipt-nfe">
          <div>NF-e</div>
          <div>Nº ${esc(d.ide.nNF)}</div>
          <div>SÉRIE ${esc(d.ide.serie || '1')}</div>
        </div>
      </div>

      <div class="top">
        <div class="box">
          <div class="logo">${esc(d.emit.xFant || d.emit.xNome)}</div>
          <div class="small"><strong>${esc(d.emit.xNome)}</strong></div>
          <div class="small">${esc(d.emit.xLgr)} ${esc(d.emit.nro)} - ${esc(d.emit.xBairro)}</div>
          <div class="small">${esc(d.emit.xMun)} - ${esc(d.emit.uf)} - CEP ${esc(d.emit.cep)}</div>
          <div class="small">CNPJ: ${esc(formatDoc(d.emit.cnpj))}</div>
          <div class="small">IE: ${esc(d.emit.ie)} ${d.emit.fone ? `- Fone: ${esc(formatPhone(d.emit.fone))}` : ''}</div>
        </div>
        <div class="box center">
          <div class="danfe-title">DANFE</div>
          <div class="danfe-sub">DOCUMENTO AUXILIAR DA<br>NOTA FISCAL ELETRÔNICA</div>
          <div class="entrada-saida">
            <span>0 - ENTRADA</span>
            <span>1 - SAÍDA</span>
            <b>${esc(d.ide.tpNF || '1')}</b>
          </div>
          <div class="nfnum">Nº ${esc(d.ide.nNF)}<br>SÉRIE ${esc(d.ide.serie || '1')}<br>FOLHA 1/1</div>
        </div>
        <div class="box chave">
          <div class="label center">CONTROLE DO FISCO</div>
          ${barcode || '<div class="barcode-fallback"></div>'}
          <div class="label center">CHAVE DE ACESSO</div>
          <div class="key">${esc(formatChave(d.chave))}</div>
          <div class="consulta">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz autorizadora</div>
        </div>
      </div>

      <div class="grid g2 last" style="margin-top:1.4mm">
        <div class="field"><span class="label">NATUREZA DA OPERAÇÃO</span><span class="value">${esc(d.ide.natOp)}</span></div>
        <div class="field"><span class="label">PROTOCOLO DE AUTORIZAÇÃO DE USO</span><span class="value">${esc(d.prot.nProt)} ${esc(dateTime(d.prot.dhRecbto))}</span></div>
      </div>
      <div class="grid g3 last" style="margin-top:1.2mm">
        <div class="field"><span class="label">INSCRIÇÃO ESTADUAL</span><span class="value">${esc(d.emit.ie)}</span></div>
        <div class="field"><span class="label">INSCR. EST. SUBST. TRIBUTÁRIO</span><span class="value"></span></div>
        <div class="field"><span class="label">CNPJ</span><span class="value">${esc(formatDoc(d.emit.cnpj))}</span></div>
      </div>

      <div class="section-title">Destinatario / Remetente</div>
      <div class="grid g3">
        <div class="field"><span class="label">NOME / RAZÃO SOCIAL</span><span class="value">${esc(d.dest.xNome)}</span></div>
        <div class="field"><span class="label">CPF / CNPJ</span><span class="value">${esc(formatDoc(d.dest.doc))}</span></div>
        <div class="field"><span class="label">DATA DA EMISSÃO</span><span class="value">${esc(dateOnly(d.ide.dhEmi))}</span></div>
      </div>
      <div class="grid g6">
        <div class="field"><span class="label">ENDEREÇO</span><span class="value">${esc([d.dest.xLgr, d.dest.nro].filter(Boolean).join(', ') || 'Nao informado')}</span></div>
        <div class="field"><span class="label">BAIRRO / DISTRITO</span><span class="value">${esc(d.dest.xBairro)}</span></div>
        <div class="field"><span class="label">CEP</span><span class="value">${esc(d.dest.cep)}</span></div>
        <div class="field"><span class="label">DATA SAÍDA / ENTRADA</span><span class="value">${esc(dataSaida)}</span></div>
        <div class="field"><span class="label">HORA SAÍDA</span><span class="value">${esc(horaSaida)}</span></div>
        <div class="field"><span class="label">INSCRIÇÃO ESTADUAL</span><span class="value">${esc(d.dest.ie)}</span></div>
      </div>
      <div class="grid g4 last">
        <div class="field"><span class="label">MUNICÍPIO</span><span class="value">${esc(d.dest.xMun)}</span></div>
        <div class="field"><span class="label">UF</span><span class="value">${esc(d.dest.uf)}</span></div>
        <div class="field"><span class="label">FONE / FAX</span><span class="value"></span></div>
        <div class="field"><span class="label">PAÍS</span><span class="value">BRASIL</span></div>
      </div>

      <div class="section-title">Calculo do imposto</div>
      <div class="grid g5">
        <div class="field"><span class="label">BASE DE CÁLC. DO ICMS</span><span class="value">${moneyDanfe(d.total.vBC)}</span></div>
        <div class="field"><span class="label">VALOR DO ICMS</span><span class="value">${moneyDanfe(d.total.vICMS)}</span></div>
        <div class="field"><span class="label">BASE CÁLC. ICMS ST</span><span class="value">${moneyDanfe(d.total.vBCST)}</span></div>
        <div class="field"><span class="label">VALOR ICMS ST</span><span class="value">${moneyDanfe(d.total.vST)}</span></div>
        <div class="field"><span class="label">VALOR TOTAL DOS PRODUTOS</span><span class="value">${moneyDanfe(d.total.vProd)}</span></div>
      </div>
      <div class="grid g5 last">
        <div class="field"><span class="label">VALOR DO FRETE</span><span class="value">${moneyDanfe(d.total.vFrete)}</span></div>
        <div class="field"><span class="label">VALOR DO SEGURO</span><span class="value">${moneyDanfe(d.total.vSeg)}</span></div>
        <div class="field"><span class="label">DESCONTO</span><span class="value">${moneyDanfe(d.total.vDesc)}</span></div>
        <div class="field"><span class="label">OUTRAS DESPESAS</span><span class="value">${moneyDanfe(d.total.vOutro)}</span></div>
        <div class="field"><span class="label">VALOR TOTAL DA NOTA</span><span class="value">${moneyDanfe(d.total.vNF)}</span></div>
      </div>

      <div class="section-title">Transportador / Volumes transportados</div>
      <div class="grid g4">
        <div class="field"><span class="label">NOME / RAZÃO SOCIAL</span><span class="value">${esc(d.transp.xNome || 'SEM FRETE')}</span></div>
        <div class="field"><span class="label">FRETE POR CONTA</span><span class="value">${esc(freteLabel(d.transp.modFrete))}</span></div>
        <div class="field"><span class="label">CNPJ / CPF</span><span class="value">${esc(formatDoc(d.transp.doc))}</span></div>
        <div class="field"><span class="label">INSCRIÇÃO ESTADUAL</span><span class="value">${esc(d.transp.ie)}</span></div>
      </div>
      <div class="grid g5 last">
        <div class="field"><span class="label">MUNICÍPIO</span><span class="value">${esc(d.transp.xMun)}</span></div>
        <div class="field"><span class="label">UF</span><span class="value">${esc(d.transp.uf)}</span></div>
        <div class="field"><span class="label">QUANTIDADE</span><span class="value">${esc(d.transp.qVol)}</span></div>
        <div class="field"><span class="label">ESPÉCIE / MARCA</span><span class="value">${esc([d.transp.especie, d.transp.marca].filter(Boolean).join(' / '))}</span></div>
        <div class="field"><span class="label">PESO LÍQ. / BRUTO</span><span class="value">${esc([d.transp.pesoL, d.transp.pesoB].filter(Boolean).join(' / '))}</span></div>
      </div>

      <div class="section-title">Dados dos produtos / servicos</div>
      <table class="products">
        <thead>
          <tr>
            <th>CÓD.</th><th>DESCRIÇÃO DOS PRODUTOS / SERVIÇOS</th><th>NCM/SH</th><th>CST</th><th>CFOP</th><th>UN</th><th>QTD.</th><th>VLR. UNIT.</th><th>VLR. TOTAL</th><th>BC ICMS</th><th>VLR. ICMS</th><th>VLR. IPI</th><th>ALIQ. ICMS</th><th>ALIQ. IPI</th>
          </tr>
        </thead>
        <tbody>${itensRows || '<tr><td colspan="14">Nenhum item encontrado no XML.</td></tr>'}</tbody>
      </table>

      <div class="section-title">Dados adicionais</div>
      <div class="additional">
        <div>
          <strong>INFORMAÇÕES COMPLEMENTARES</strong><br>
          Documento gerado a partir do XML autorizado armazenado no Sistema Arte e Molduras.<br>
          Forma de pagamento: ${esc(pagamentoLabel(d.pag.tPag))} - Valor pago: ${moneyDanfe(d.pag.vPag || d.total.vNF)}<br>
          Chave de acesso: ${esc(formatChave(d.chave))}
        </div>
        <div>
          <strong>RESERVADO AO FISCO</strong>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`;
}

module.exports = { extractDanfeData, renderDanfeHtml };
