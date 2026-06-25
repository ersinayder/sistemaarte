'use strict';

const { validarXmlAutorizacao } = require('../domain/nfeEmissionRules');

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizarTexto(value) {
  return String(value ?? '').trim();
}

function validarAutorizacaoFiscal(input) {
  const cStat = normalizarTexto(input.cStat);
  const chave = normalizarTexto(input.chave);
  const protocolo = normalizarTexto(input.protocolo);

  if (cStat !== '100' || !/^\d{44}$/.test(chave) || !protocolo) {
    throw serviceError(
      400,
      'nfe_autorizacao_invalida',
      'Autorizacao de NF-e invalida ou incompleta.'
    );
  }

  if (!validarXmlAutorizacao(input.xml, chave)) {
    throw serviceError(400, 'nfe_xml_invalido', 'XML legal de autorizacao invalido.');
  }

  return { cStat, chave, protocolo };
}

function validarClienteFiscalParaPersistencia(cliente) {
  const campos = [
    ['cpf', cliente.cpf],
    ['logradouro', cliente.logradouro],
    ['numero', cliente.c_numero ?? cliente.numero],
    ['bairro', cliente.bairro],
    ['cidade', cliente.cidade],
    ['uf', cliente.uf],
    ['cep', cliente.cep],
  ];
  const faltando = campos
    .filter(([, value]) => !normalizarTexto(value))
    .map(([field]) => field);

  if (faltando.length > 0) {
    throw serviceError(
      400,
      'nfe_cliente_fiscal_invalido',
      `Cliente fiscal incompleto para autorizacao: ${faltando.join(', ')}.`
    );
  }
}

function validarEstadoFiscalDaOrdem(ordem, chave) {
  const status = normalizarTexto(ordem.nfe_status).toLowerCase();
  const chaveAtual = normalizarTexto(ordem.nfe_chave);

  if (status === 'cancelada' || status === 'cancelado') {
    throw serviceError(
      409,
      'nfe_ordem_ja_finalizada',
      'OS ja possui NF-e cancelada e nao pode ser sobrescrita.'
    );
  }

  if (status === 'autorizado' && chaveAtual !== chave) {
    throw serviceError(
      409,
      'nfe_ordem_ja_finalizada',
      'OS ja possui NF-e autorizada com outra chave.'
    );
  }
}

function createNfePersistenceService({
  db,
  attemptRepository,
  nfeAttemptRepository,
  agora = () => new Date().toISOString(),
}) {
  const repository = attemptRepository || nfeAttemptRepository;

  if (!db || !repository) {
    throw new TypeError('db e attemptRepository sao obrigatorios.');
  }

  const autorizarTransaction = db.transaction((input) => {
    const tentativa = repository.buscarPorId(input.tentativaId);
    if (!tentativa) {
      throw serviceError(404, 'nfe_tentativa_nao_encontrada', 'Tentativa de emissao nao encontrada.');
    }
    if (!['processando', 'incerto'].includes(tentativa.status)) {
      throw serviceError(409, 'nfe_tentativa_terminal', 'A tentativa de emissao ja foi finalizada.');
    }
    if (
      Number(tentativa.ordemid) !== Number(input.ordemId)
      || Number(tentativa.numero) !== Number(input.numero)
      || String(tentativa.serie) !== String(input.serie)
    ) {
      throw serviceError(
        409,
        'nfe_tentativa_incompativel',
        'A tentativa nao corresponde a OS, numero ou serie informados.'
      );
    }
    if (typeof input.xml !== 'string' || !input.xml.trim()) {
      throw serviceError(400, 'nfe_xml_invalido', 'XML de autorizacao obrigatorio.');
    }
    const autorizacao = validarAutorizacaoFiscal(input);

    const ordem = db.prepare(`
      SELECT id, clienteid, nfe_status, nfe_chave
      FROM ordens
      WHERE id = ? AND deletedat IS NULL
    `).get(input.ordemId);
    if (!ordem) {
      throw serviceError(409, 'nfe_ordem_invalida', 'OS inexistente ou removida.');
    }
    validarEstadoFiscalDaOrdem(ordem, autorizacao.chave);

    const cliente = input.cliente;
    if (
      cliente?.clienteid != null
      && Number(cliente.clienteid) !== Number(ordem.clienteid)
    ) {
      throw serviceError(
        409,
        'nfe_cliente_invalido',
        'O cliente fiscal nao corresponde ao cadastro vinculado a OS.'
      );
    }
    if (cliente?.clienteid != null) {
      validarClienteFiscalParaPersistencia(cliente);
    }

    const timestamp = agora();
    const numeroFormatado = String(input.numero).padStart(9, '0');
    const ordemResult = db.prepare(`
      UPDATE ordens
      SET nfe_status = 'autorizado',
          nfe_numero = ?,
          nfe_serie = ?,
          nfe_chave = ?,
          nfe_protocolo = ?,
          nfe_emitida_em = ?,
          nfe_xml = ?,
          nfe_cancelado_em = NULL,
          nfe_cancel_protocolo = NULL,
          nfe_cancel_motivo = NULL,
          nfe_deletedat = NULL,
          nfe_deletedpor = NULL,
          nfe_deletedreason = NULL
      WHERE id = ? AND deletedat IS NULL
    `).run(
      numeroFormatado,
      String(input.serie),
      autorizacao.chave,
      autorizacao.protocolo,
      timestamp,
      input.xml,
      input.ordemId
    );
    if (ordemResult.changes !== 1) {
      throw serviceError(409, 'nfe_ordem_invalida', 'Nao foi possivel autorizar a OS ativa.');
    }

    if (cliente?.clienteid != null) {
      const clienteResult = db.prepare(`
        UPDATE clientes
        SET cpf = ?,
            ie = ?,
            logradouro = ?,
            numero = ?,
            bairro = ?,
            cidade = ?,
            uf = ?,
            cep = ?
        WHERE id = ? AND deletedat IS NULL
      `).run(
        cliente.cpf ?? null,
        cliente.ie ?? null,
        cliente.logradouro ?? null,
        cliente.c_numero ?? cliente.numero ?? null,
        cliente.bairro ?? null,
        cliente.cidade ?? null,
        cliente.uf ?? null,
        cliente.cep ?? null,
        cliente.clienteid
      );
      if (clienteResult.changes !== 1) {
        throw serviceError(409, 'nfe_cliente_invalido', 'Cliente fiscal inexistente ou removido.');
      }
    }

    db.prepare(`
      INSERT INTO nfe_eventos
        (ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, xml, createdat)
      VALUES (?, ?, 'autorizacao', 1, ?, ?, ?, ?, ?)
    `).run(
      input.ordemId,
      autorizacao.chave,
      autorizacao.protocolo,
      autorizacao.cStat,
      input.motivo ?? null,
      input.xml,
      timestamp
    );

    return repository.transicionarNaTransacao(
      input.tentativaId,
      'autorizado',
      {
        cStat: autorizacao.cStat,
        motivo: input.motivo ?? null,
        chave: autorizacao.chave,
        protocolo: autorizacao.protocolo,
        xmlRetorno: input.xml,
      }
    );
  });

  function autorizar(input) {
    return autorizarTransaction.immediate(input);
  }

  return { autorizar };
}

module.exports = {
  createNfePersistenceService,
};
