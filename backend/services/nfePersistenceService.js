'use strict';

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function createNfePersistenceService({ db, attemptRepository, agora = () => new Date().toISOString() }) {
  if (!db || !attemptRepository) {
    throw new TypeError('db e attemptRepository sao obrigatorios.');
  }

  const autorizarTransaction = db.transaction((input) => {
    const tentativa = attemptRepository.buscarPorId(input.tentativaId);
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

    const ordem = db.prepare(`
      SELECT id, clienteid
      FROM ordens
      WHERE id = ? AND deletedat IS NULL
    `).get(input.ordemId);
    if (!ordem) {
      throw serviceError(409, 'nfe_ordem_invalida', 'OS inexistente ou removida.');
    }

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
      input.chave,
      input.protocolo,
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
        cliente.c_numero ?? null,
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
      input.chave,
      input.protocolo,
      input.cStat == null ? null : String(input.cStat),
      input.motivo ?? null,
      input.xml,
      timestamp
    );

    return attemptRepository.transicionarNaTransacao(
      input.tentativaId,
      'autorizado',
      {
        cStat: input.cStat == null ? null : String(input.cStat),
        motivo: input.motivo ?? null,
        chave: input.chave,
        protocolo: input.protocolo,
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
