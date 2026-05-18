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

function dateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
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

function extractDanfeData(xml) {
  const infNFe = firstBlock(xml, 'infNFe') || xml;
  const ide = firstBlock(infNFe, 'ide');
  const emit = firstBlock(infNFe, 'emit');
  const dest = firstBlock(infNFe, 'dest');
  const enderEmit = firstBlock(emit, 'enderEmit');
  const enderDest = firstBlock(dest, 'enderDest');
  const total = firstBlock(infNFe, 'ICMSTot');
  const transp = firstBlock(infNFe, 'transp');
  const pag = firstBlock(infNFe, 'pag');
  const prot = firstBlock(xml, 'infProt');
  const chave = firstTag(prot, 'chNFe') || firstAttr(xml, 'infNFe', 'Id').replace(/^NFe/i, '');

  const itens = allBlocks(infNFe, 'det').map((det, idx) => {
    const prod = firstBlock(det, 'prod');
    return {
      n: firstAttr(det, 'det', 'nItem') || String(idx + 1),
      cProd: firstTag(prod, 'cProd'),
      xProd: firstTag(prod, 'xProd'),
      ncm: firstTag(prod, 'NCM'),
      cfop: firstTag(prod, 'CFOP'),
      uCom: firstTag(prod, 'uCom'),
      qCom: firstTag(prod, 'qCom'),
      vUnCom: firstTag(prod, 'vUnCom'),
      vProd: firstTag(prod, 'vProd'),
    };
  });

  return {
    chave,
    ide: {
      nNF: firstTag(ide, 'nNF'),
      serie: firstTag(ide, 'serie'),
      dhEmi: firstTag(ide, 'dhEmi'),
      natOp: firstTag(ide, 'natOp'),
      tpNF: firstTag(ide, 'tpNF'),
    },
    emit: {
      xNome: firstTag(emit, 'xNome'),
      xFant: firstTag(emit, 'xFant'),
      cnpj: firstTag(emit, 'CNPJ') || firstTag(emit, 'CNPJCPF'),
      ie: firstTag(emit, 'IE'),
      fone: firstTag(enderEmit, 'fone'),
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
      vNF: firstTag(total, 'vNF'),
      vICMS: firstTag(total, 'vICMS'),
      vBC: firstTag(total, 'vBC'),
    },
    transp: {
      modFrete: firstTag(transp, 'modFrete'),
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

  const itensRows = d.itens.map(item => `
    <tr>
      <td>${esc(item.n)}</td>
      <td>${esc(item.cProd)}</td>
      <td class="desc">${esc(item.xProd)}</td>
      <td>${esc(item.ncm)}</td>
      <td>${esc(item.cfop)}</td>
      <td>${esc(item.uCom)}</td>
      <td class="num">${esc(item.qCom)}</td>
      <td class="num">${money(item.vUnCom)}</td>
      <td class="num">${money(item.vProd)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>DANFE NF-e ${esc(d.ide.nNF)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, Helvetica, sans-serif; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 8mm; background: white; }
    .danfe { border: 1px solid #111; }
    .row { display: grid; grid-template-columns: 1fr; border-bottom: 1px solid #111; }
    .top { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr; min-height: 42mm; }
    .box { border-right: 1px solid #111; padding: 5px; }
    .box:last-child { border-right: 0; }
    .logo { font-size: 16px; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
    .muted { color: #4b5563; font-size: 10px; line-height: 1.35; }
    .title { text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 0.02em; margin-bottom: 4px; }
    .subtitle { text-align: center; font-size: 9px; line-height: 1.35; }
    .nfnum { margin-top: 8px; text-align: center; font-size: 13px; font-weight: 800; }
    .chave { text-align: center; }
    .barcode { height: 14mm; margin: 4px 0; background: repeating-linear-gradient(90deg,#111 0 1px,#fff 1px 3px,#111 3px 5px,#fff 5px 8px); border: 1px solid #111; }
    .key { font-family: "Courier New", monospace; font-size: 11px; font-weight: 700; word-spacing: 2px; }
    .section-title { padding: 3px 5px; background: #e5e7eb; border-bottom: 1px solid #111; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .grid { display: grid; border-bottom: 1px solid #111; }
    .grid:last-child { border-bottom: 0; }
    .g2 { grid-template-columns: 1.6fr 0.8fr 0.8fr; }
    .g3 { grid-template-columns: 1fr 1fr 1fr; }
    .g4 { grid-template-columns: repeat(4, 1fr); }
    .field { min-height: 11mm; border-right: 1px solid #111; padding: 3px 5px; }
    .field:last-child { border-right: 0; }
    .label { display: block; font-size: 7px; color: #374151; text-transform: uppercase; margin-bottom: 2px; }
    .value { display: block; font-size: 10px; font-weight: 700; line-height: 1.25; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-right: 1px solid #111; border-bottom: 1px solid #111; padding: 3px 4px; font-size: 8px; vertical-align: top; }
    th:last-child, td:last-child { border-right: 0; }
    th { background: #e5e7eb; text-transform: uppercase; font-size: 7px; }
    .desc { min-width: 48mm; }
    .num { text-align: right; white-space: nowrap; }
    .footer { min-height: 20mm; padding: 5px; font-size: 9px; line-height: 1.4; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; width: 210mm; margin: 10px auto; }
    .actions button { border: 1px solid #0f766e; background: #0f766e; color: white; border-radius: 6px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
    @page { size: A4; margin: 6mm; }
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
    <div class="danfe">
      <div class="top">
        <div class="box">
          <div class="logo">${esc(d.emit.xFant || d.emit.xNome)}</div>
          <div class="muted">${esc(d.emit.xNome)}</div>
          <div class="muted">CNPJ: ${esc(formatDoc(d.emit.cnpj))} &nbsp; IE: ${esc(d.emit.ie)}</div>
          <div class="muted">${esc(d.emit.endereco)}</div>
          ${d.emit.fone ? `<div class="muted">Fone: ${esc(d.emit.fone)}</div>` : ''}
        </div>
        <div class="box">
          <div class="title">DANFE</div>
          <div class="subtitle">Documento Auxiliar da Nota Fiscal Eletronica</div>
          <div class="nfnum">NF-e ${esc(d.ide.nNF)}<br>Serie ${esc(d.ide.serie || '1')}</div>
          <div class="subtitle">Folha 1/1</div>
        </div>
        <div class="box chave">
          <div class="label">Controle do Fisco</div>
          <div class="barcode" aria-label="Representacao visual da chave de acesso"></div>
          <div class="label">Chave de acesso</div>
          <div class="key">${esc(formatChave(d.chave))}</div>
          <div class="muted" style="margin-top:4px">Protocolo: ${esc(d.prot.nProt)} - ${esc(dateTime(d.prot.dhRecbto))}</div>
        </div>
      </div>

      <div class="section-title">Natureza da operacao</div>
      <div class="grid g2">
        <div class="field"><span class="label">Natureza</span><span class="value">${esc(d.ide.natOp)}</span></div>
        <div class="field"><span class="label">Data de emissao</span><span class="value">${esc(dateTime(d.ide.dhEmi))}</span></div>
        <div class="field"><span class="label">Tipo</span><span class="value">${d.ide.tpNF === '1' ? 'Saida' : 'Entrada'}</span></div>
      </div>

      <div class="section-title">Destinatario / Remetente</div>
      <div class="grid g3">
        <div class="field"><span class="label">Nome / Razao social</span><span class="value">${esc(d.dest.xNome)}</span></div>
        <div class="field"><span class="label">CPF / CNPJ</span><span class="value">${esc(formatDoc(d.dest.doc))}</span></div>
        <div class="field"><span class="label">Inscricao estadual</span><span class="value">${esc(d.dest.ie)}</span></div>
      </div>
      <div class="grid">
        <div class="field"><span class="label">Endereco</span><span class="value">${esc(d.dest.endereco || 'Nao informado')}</span></div>
      </div>

      <div class="section-title">Calculo do imposto</div>
      <div class="grid g4">
        <div class="field"><span class="label">Base ICMS</span><span class="value">${money(d.total.vBC)}</span></div>
        <div class="field"><span class="label">Valor ICMS</span><span class="value">${money(d.total.vICMS)}</span></div>
        <div class="field"><span class="label">Valor produtos</span><span class="value">${money(d.total.vProd)}</span></div>
        <div class="field"><span class="label">Valor NF-e</span><span class="value">${money(d.total.vNF)}</span></div>
      </div>
      <div class="grid g4">
        <div class="field"><span class="label">Frete</span><span class="value">${money(d.total.vFrete)}</span></div>
        <div class="field"><span class="label">Desconto</span><span class="value">${money(d.total.vDesc)}</span></div>
        <div class="field"><span class="label">Modalidade frete</span><span class="value">${esc(d.transp.modFrete || '9')}</span></div>
        <div class="field"><span class="label">Pagamento</span><span class="value">${money(d.pag.vPag || d.total.vNF)}</span></div>
      </div>

      <div class="section-title">Dados dos produtos / servicos</div>
      <table>
        <thead>
          <tr>
            <th>Item</th><th>Cod.</th><th>Descricao</th><th>NCM</th><th>CFOP</th><th>Un.</th><th>Qtd.</th><th>Vlr. unit.</th><th>Vlr. total</th>
          </tr>
        </thead>
        <tbody>${itensRows || '<tr><td colspan="9">Nenhum item encontrado no XML.</td></tr>'}</tbody>
      </table>

      <div class="section-title">Dados adicionais</div>
      <div class="footer">
        Documento gerado a partir do XML autorizado armazenado no Sistema Arte e Molduras.<br>
        Chave de acesso: <strong>${esc(formatChave(d.chave))}</strong>
      </div>
    </div>
  </main>
</body>
</html>`;
}

module.exports = { extractDanfeData, renderDanfeHtml };
