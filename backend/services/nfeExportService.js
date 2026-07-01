'use strict';

const archiverModule = require('archiver');
const { renderDanfeHtml } = require('../utils/danfe');
const { renderDanfePdf } = require('../utils/pdf/danfePdf');
const { extrairXmlFiscal } = require('../utils/nfeXml');
const {
  buildManifestoExportacaoNFe,
  buildNomeArquivoNFe,
  buildNomeArquivoZip,
  criarErroExportacaoNFe,
  normalizarPedidoExportacaoNFe,
} = require('../domain/nfeExportRules');

const createZipArchive = typeof archiverModule === 'function'
  ? archiverModule
  : (_format, options) => new archiverModule.ZipArchive(options);

function buscarNotasExportaveis(db, { inicio, fim }) {
  return db.prepare(`
    SELECT
      n.id,
      n.origem,
      n.ordemid,
      n.numero,
      n.serie,
      n.chave,
      n.status,
      n.xml,
      n.createdat AS emitida_em
    FROM nfe_notas n
    LEFT JOIN ordens o ON o.id = n.ordemid
    WHERE n.status IN ('autorizado', 'cancelado')
      AND n.chave IS NOT NULL
      AND TRIM(n.chave) <> ''
      AND COALESCE(n.deletedat, CASE WHEN n.origem = 'ordem' THEN o.nfe_deletedat ELSE NULL END) IS NULL
      AND date(n.createdat) BETWEEN date(?) AND date(?)
    ORDER BY
      date(n.createdat) ASC,
      CASE
        WHEN TRIM(COALESCE(n.numero, '')) <> ''
         AND TRIM(n.numero) NOT GLOB '*[^0-9]*'
        THEN CAST(TRIM(n.numero) AS INTEGER)
        ELSE n.id
      END ASC,
      n.id ASC
  `).all(inicio, fim);
}

async function montarEntradasExportacaoNFe({
  pedido,
  notas,
  renderPdf = renderDanfePdf,
  now = new Date(),
}) {
  const entries = [];
  const puladas = [];

  for (const nota of notas) {
    const xml = extrairXmlFiscal(nota.xml || nota.nfe_xml);
    if (!xml) {
      puladas.push({
        numero: nota.numero || nota.nfe_numero,
        chave: nota.chave || nota.nfe_chave,
        motivo: 'XML autorizado ausente ou invalido',
      });
      continue;
    }

    try {
      if (pedido.tipo === 'xml') {
        entries.push({
          name: buildNomeArquivoNFe({ nota, pasta: 'xml', ext: 'xml' }),
          content: xml,
        });
      } else {
        const html = renderDanfeHtml(xml);
        const pdf = await renderPdf(html);
        entries.push({
          name: buildNomeArquivoNFe({ nota, pasta: 'danfe', ext: 'pdf' }),
          content: Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf),
        });
      }
    } catch (err) {
      puladas.push({
        numero: nota.numero || nota.nfe_numero,
        chave: nota.chave || nota.nfe_chave,
        motivo: err.message || 'Falha ao gerar arquivo',
      });
    }
  }

  const exportadas = entries.length;
  entries.push({
    name: 'manifesto.txt',
    content: buildManifestoExportacaoNFe({
      tipo: pedido.tipo,
      inicio: pedido.inicio,
      fim: pedido.fim,
      geradoEm: now,
      encontradas: notas.length,
      exportadas,
      puladas,
    }),
  });

  return { entries, exportadas, puladas };
}

function zipBuffer(entries) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = createZipArchive('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }

    archive.finalize();
  });
}

async function gerarExportacaoNFe({
  db,
  tipo,
  inicio,
  fim,
  renderPdf = renderDanfePdf,
  now = new Date(),
}) {
  const pedido = normalizarPedidoExportacaoNFe({ tipo, inicio, fim });
  const notas = buscarNotasExportaveis(db, pedido);

  if (!notas.length) {
    throw criarErroExportacaoNFe(
      'Nenhuma NF-e exportavel encontrada para o periodo informado.',
      404,
      'sem_notas_exportaveis'
    );
  }

  const { entries, exportadas, puladas } = await montarEntradasExportacaoNFe({
    pedido,
    notas,
    renderPdf,
    now,
  });

  if (!exportadas) {
    throw criarErroExportacaoNFe(
      'Nenhum arquivo exportavel foi gerado para o periodo informado.',
      422,
      'sem_arquivos_exportaveis'
    );
  }

  const buffer = await zipBuffer(entries);
  return {
    buffer,
    filename: buildNomeArquivoZip(pedido),
    contentType: 'application/zip',
    encontradas: notas.length,
    exportadas,
    puladas,
  };
}

module.exports = {
  buscarNotasExportaveis,
  gerarExportacaoNFe,
  montarEntradasExportacaoNFe,
  zipBuffer,
};
