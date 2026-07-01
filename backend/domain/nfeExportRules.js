'use strict';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TIPOS_VALIDOS = new Set(['xml', 'danfe']);

function criarErroExportacaoNFe(message, status = 400, code = 'exportacao_nfe_invalida') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizarPedidoExportacaoNFe({ tipo, inicio, fim } = {}, { maxDias = 370 } = {}) {
  const tipoNormalizado = String(tipo || '').trim().toLowerCase();
  if (!TIPOS_VALIDOS.has(tipoNormalizado)) {
    throw criarErroExportacaoNFe('Tipo de exportacao invalido. Use xml ou danfe.', 400, 'tipo_invalido');
  }
  if (!isIsoDate(inicio) || !isIsoDate(fim)) {
    throw criarErroExportacaoNFe('Informe inicio e fim no formato YYYY-MM-DD.', 400, 'periodo_invalido');
  }

  const inicioDate = new Date(`${inicio}T00:00:00.000Z`);
  const fimDate = new Date(`${fim}T00:00:00.000Z`);
  if (inicioDate.getTime() > fimDate.getTime()) {
    throw criarErroExportacaoNFe('Periodo inicial nao pode ser maior que o periodo final.', 400, 'periodo_invertido');
  }

  const dias = Math.floor((fimDate.getTime() - inicioDate.getTime()) / MS_PER_DAY) + 1;
  if (dias > maxDias) {
    throw criarErroExportacaoNFe(`Periodo maximo para exportacao de NF-e e de ${maxDias} dias.`, 400, 'periodo_longo');
  }

  return { tipo: tipoNormalizado, inicio, fim, dias };
}

function safeSegment(value, fallback = 'nfe') {
  const raw = String(value || fallback).trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildNomeArquivoZip({ tipo, inicio, fim }) {
  return `nfe-${safeSegment(tipo)}-${inicio}-a-${fim}.zip`;
}

function buildNomeArquivoNFe({ nota, pasta, ext }) {
  const numero = safeSegment(nota?.numero || nota?.nfe_numero || `nfe-${nota?.id || 'sem-numero'}`);
  const chave = safeSegment(nota?.chave || nota?.nfe_chave || `sem-chave-${nota?.id || 'nfe'}`);
  return `${safeSegment(pasta)}/${numero}-${chave}.${safeSegment(ext)}`;
}

function tipoLabel(tipo) {
  return tipo === 'danfe' ? 'DANFE PDF' : 'XML autorizado';
}

function buildManifestoExportacaoNFe({
  tipo,
  inicio,
  fim,
  geradoEm = new Date(),
  encontradas = 0,
  exportadas = 0,
  puladas = [],
}) {
  const lines = [
    'Exportacao de NF-e - Sistema Arte e Molduras',
    `Tipo: ${tipoLabel(tipo)}`,
    `Periodo: ${inicio} a ${fim}`,
    `Gerado em: ${geradoEm.toISOString()}`,
    `Notas encontradas: ${encontradas}`,
    `Arquivos exportados: ${exportadas}`,
    '',
  ];

  if (puladas.length) {
    lines.push('Notas puladas:');
    for (const item of puladas) {
      lines.push(`- ${item.numero || '-'} - ${item.chave || '-'} - ${item.motivo}`);
    }
  } else {
    lines.push('Notas puladas: nenhuma');
  }

  lines.push('');
  return lines.join('\n');
}

module.exports = {
  buildManifestoExportacaoNFe,
  buildNomeArquivoNFe,
  buildNomeArquivoZip,
  criarErroExportacaoNFe,
  normalizarPedidoExportacaoNFe,
};
