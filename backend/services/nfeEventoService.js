'use strict';

const {
  classificarResultadoEventoFiscal,
  extrairRespostaEventoFiscal,
} = require('../domain/nfeEventoRules');

function onlyMessage(error) {
  return String(error?.message || error || 'Erro desconhecido').slice(0, 500);
}

function responseBase(tentativa, overrides = {}) {
  return {
    httpStatus: 200,
    ok: false,
    status: tentativa?.status || 'incerto',
    tipo: tentativa?.tipo,
    chave: tentativa?.chave,
    nSeqEvento: tentativa?.nseqevento,
    alertas: [],
    ...overrides,
  };
}

function createNfeEventoService({
  db,
  attemptRepository,
  transmitir,
  salvarXmlDisco,
  timeoutMs = 75_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  agora = () => new Date().toISOString(),
  logger = console,
}) {
  if (!db || !attemptRepository || !transmitir) {
    throw new TypeError('db, attemptRepository e transmitir sao obrigatorios.');
  }

  function runTx(fn) {
    const tx = db.transaction(fn);
    return typeof tx.immediate === 'function' ? tx.immediate() : tx();
  }

  function ativaResponse(input, error) {
    const ativa = attemptRepository.buscarAtiva({
      chave: input.chave,
      tipo: input.tipo,
      nSeqEvento: input.nSeqEvento,
    });
    return responseBase(ativa, {
      httpStatus: error.status || 409,
      ok: false,
      code: error.code || 'nfe_evento_tentativa_ativa',
      erro: error.message || 'Ja existe tentativa ativa para este evento fiscal.',
    });
  }

  function registrarEvento(input, resposta) {
    db.prepare(`
      INSERT INTO nfe_eventos
        (ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, texto, xml, createdat)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.ordemId,
      input.chave,
      input.tipo,
      input.nSeqEvento || 1,
      resposta.protocolo || null,
      resposta.cStat || null,
      resposta.motivo || null,
      input.texto || null,
      resposta.xml || null,
      resposta.dhEvento || agora()
    );
  }

  function concluirAutorizado(tentativa, input, resposta) {
    const final = runTx(() => {
      if (input.tipo === 'cancelamento') {
        db.prepare(`
          UPDATE ordens
          SET nfe_status='cancelado',
              nfe_cancelado_em=?,
              nfe_cancel_protocolo=?,
              nfe_cancel_motivo=?
          WHERE id=? AND nfe_chave=?
        `).run(
          resposta.dhEvento || agora(),
          resposta.protocolo || null,
          input.texto || null,
          input.ordemId,
          input.chave
        );
      }

      registrarEvento(input, resposta);
      return attemptRepository.transicionarNaTransacao(tentativa.id, 'autorizado', {
        cStat: resposta.cStat,
        motivo: resposta.motivo,
        protocolo: resposta.protocolo,
        xmlRetorno: resposta.xml,
      });
    });

    const alertas = [];
    if (salvarXmlDisco && resposta.xml) {
      try {
        const suffix = input.tipo === 'cce' ? `cce-${String(input.nSeqEvento || 1).padStart(2, '0')}` : 'canc';
        const saved = salvarXmlDisco(`${input.chave}-${suffix}.xml`, resposta.xml);
        if (!saved) alertas.push('XML do evento salvo no banco, mas nao gravado no disco.');
      } catch (error) {
        logger.error?.('[NF-e] Falha ao salvar XML de evento em disco:', onlyMessage(error));
        alertas.push('XML do evento salvo no banco, mas nao gravado no disco.');
      }
    }

    return responseBase(final, {
      httpStatus: 200,
      ok: true,
      status: 'autorizado',
      protocolo: resposta.protocolo,
      dhEvento: resposta.dhEvento,
      cStat: resposta.cStat,
      alertas,
    });
  }

  function concluirRejeitado(tentativa, resposta) {
    const final = attemptRepository.transicionar(tentativa.id, 'rejeitado', {
      cStat: resposta.cStat,
      motivo: resposta.motivo || `cStat ${resposta.cStat}`,
      protocolo: resposta.protocolo,
      xmlRetorno: resposta.xml,
    });

    return responseBase(final, {
      httpStatus: 422,
      ok: false,
      status: 'rejeitado',
      cStat: resposta.cStat,
      erro: resposta.motivo || `Evento fiscal rejeitado: cStat ${resposta.cStat}`,
    });
  }

  function marcarIncerto(tentativa, dados = {}) {
    let final;
    try {
      final = attemptRepository.transicionar(tentativa.id, 'incerto', dados);
    } catch (error) {
      logger.warn?.('[NF-e] Falha ao marcar evento incerto:', onlyMessage(error));
      final = attemptRepository.buscarPorId(tentativa.id) || tentativa;
    }

    return responseBase(final, {
      httpStatus: 409,
      ok: false,
      status: 'incerto',
      cStat: dados.cStat ?? dados.cstat,
      erro: dados.motivo || 'Resultado do evento fiscal ficou incerto. Consulte antes de reenviar.',
    });
  }

  async function processarResposta(raw, tentativa, input) {
    const resposta = extrairRespostaEventoFiscal(raw, input.dhEvento);
    const classificacao = classificarResultadoEventoFiscal(input.tipo, resposta);

    if (classificacao === 'autorizado') {
      try {
        return concluirAutorizado(tentativa, input, resposta);
      } catch (error) {
        logger.error?.('[NF-e] Evento autorizado mas persistencia ficou incerta:', onlyMessage(error));
        return marcarIncerto(tentativa, {
          cStat: resposta.cStat,
          motivo: 'Evento autorizado, mas persistencia local ficou incerta.',
          protocolo: resposta.protocolo,
          xmlRetorno: resposta.xml,
          erroLocal: onlyMessage(error),
        });
      }
    }

    if (classificacao === 'rejeitado') return concluirRejeitado(tentativa, resposta);

    return marcarIncerto(tentativa, {
      cStat: resposta.cStat || null,
      motivo: resposta.motivo || 'Resposta de evento fiscal vazia ou inconclusiva.',
      protocolo: resposta.protocolo,
      xmlRetorno: resposta.xml,
    });
  }

  async function executar(input) {
    let tentativa;
    try {
      tentativa = attemptRepository.criar({
        ordemId: input.ordemId,
        chave: input.chave,
        tipo: input.tipo,
        nSeqEvento: input.nSeqEvento || 1,
        usuarioId: input.usuarioId,
        payload: input.payload,
      });
    } catch (error) {
      if (error.status === 409) return ativaResponse(input, error);
      throw error;
    }

    let timeoutId;
    const transmissao = Promise.resolve()
      .then(() => transmitir(input.payload, tentativa))
      .then((raw) => processarResposta(raw, tentativa, input))
      .catch((error) => marcarIncerto(tentativa, {
        cStat: 'comunicacao',
        motivo: 'Falha de comunicacao com a SEFAZ apos iniciar evento fiscal.',
        erroLocal: onlyMessage(error),
      }));

    transmissao.catch((error) => {
      logger.error?.('[NF-e] Erro tardio no evento fiscal:', onlyMessage(error));
    });

    const timeout = new Promise((resolve) => {
      timeoutId = setTimeoutFn(() => {
        resolve({
          __timeout: true,
          ...marcarIncerto(tentativa, {
            cStat: 'timeout',
            motivo: 'Tempo esgotado aguardando resposta da SEFAZ para evento fiscal.',
          }),
        });
      }, timeoutMs);
    });

    const result = await Promise.race([transmissao, timeout]);
    if (!result.__timeout) clearTimeoutFn(timeoutId);
    const { __timeout: _omit, ...publicResult } = result;
    return publicResult;
  }

  return { executar };
}

module.exports = { createNfeEventoService };
