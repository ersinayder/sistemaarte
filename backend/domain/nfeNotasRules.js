'use strict';

const ORIGENS_NFE = new Set(['ordem', 'avulsa']);
const STATUS_ATIVOS_ORDEM = new Set(['emitindo', 'autorizado']);

function parseJsonSnapshot(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeOrigemNfe(origem) {
  const value = String(origem || '').trim().toLowerCase();
  if (!ORIGENS_NFE.has(value)) {
    throw new Error(`Origem de NF-e invalida: ${origem || ''}`);
  }
  return value;
}

function isNotaAtivaParaOrdem(nota) {
  if (!nota || nota.deletedat) return false;
  return STATUS_ATIVOS_ORDEM.has(String(nota.status || '').trim());
}

function buildNfeListRow(row = {}) {
  const cliente = parseJsonSnapshot(row.cliente_snapshot);
  const origem = row.origem || 'ordem';
  const isAvulsa = origem === 'avulsa';
  const numeroOs = row.numero_os || row.ordem_numero || row.numero || null;
  const servico = row.servico || (isAvulsa ? 'NF-e avulsa' : '');

  return {
    id: row.id,
    origem,
    ordemid: row.ordemid || null,
    numero: isAvulsa ? 'Avulsa' : numeroOs,
    numero_os: numeroOs,
    clienteid: row.clienteid || null,
    clientenome: row.clientenome || cliente.nome || cliente.clientenome || cliente.name || 'Cliente nao informado',
    servico,
    status: row.ordem_status || row.status_os || null,
    valortotal: Number(row.valortotal || 0),
    nfe_numero: row.numero_nfe || row.nfe_numero || row.numero || null,
    nfe_serie: row.serie || row.nfe_serie || '1',
    nfe_chave: row.chave || row.nfe_chave || null,
    nfe_protocolo: row.protocolo || row.nfe_protocolo || null,
    nfe_status: row.status || row.nfe_status || null,
    nfe_emitida_em: row.emitida_em || row.nfe_emitida_em || row.createdat || null,
    nfe_cancelado_em: row.cancelado_em || row.nfe_cancelado_em || null,
    nfe_cancel_protocolo: row.cancel_protocolo || row.nfe_cancel_protocolo || null,
    nfe_cancel_motivo: row.cancel_motivo || row.nfe_cancel_motivo || null,
    nfe_deletedat: row.deletedat || row.nfe_deletedat || null,
    nfe_deletedpor: row.deletedpor || row.nfe_deletedpor || null,
    nfe_deletedreason: row.deletedreason || row.nfe_deletedreason || null,
    nfe_rejeicao_cstat: row.rejeicao_cstat || row.nfe_rejeicao_cstat || null,
    nfe_rejeicao_motivo: row.rejeicao_motivo || row.nfe_rejeicao_motivo || null,
    nfe_cce_count: Number(row.nfe_cce_count || 0),
    nfe_cce_ultima_em: row.nfe_cce_ultima_em || null,
    nfe_eventos_count: Number(row.nfe_eventos_count || 0),
  };
}

module.exports = {
  buildNfeListRow,
  isNotaAtivaParaOrdem,
  parseJsonSnapshot,
  sanitizeOrigemNfe,
};
