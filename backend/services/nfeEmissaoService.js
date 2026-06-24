'use strict';

const {
  classificarResultadoEmissao,
  rejeicaoPermiteDevolverNumero,
  validarXmlAutorizacao,
} = require('../domain/nfeEmissionRules');

function onlyMessage(error) {
  return String(error?.message || error || 'Erro desconhecido').slice(0, 500);
}

function fiscalError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function extrairXmlFiscal(valor, depth = 0) {
  if (!valor || depth > 5) return null;

  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (texto.startsWith('<')) return texto;
    if (texto.startsWith('{') || texto.startsWith('[')) {
      try {
        return extrairXmlFiscal(JSON.parse(texto), depth + 1);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  if (Array.isArray(valor)) {
    for (const item of valor) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
    return null;
  }

  if (typeof valor === 'object') {
    for (const key of ['xml', 'xmlAssinado', 'xmlProc', 'nfeProc', 'procNFe']) {
      const xml = extrairXmlFiscal(valor[key], depth + 1);
      if (xml) return xml;
    }
    for (const item of Object.values(valor)) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
  }

  return null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function findInfProt(raw) {
  const candidates = [
    raw?.[0]?.protNFe?.infProt,
    raw?.[0]?.infProt,
    raw?.[0]?.retEnviNFe?.protNFe?.infProt,
    raw?.protNFe?.infProt,
    raw?.infProt,
    raw?.retEnviNFe?.protNFe?.infProt,
    raw?.retEnviNFe?.protNFe?.[0]?.infProt,
    raw?.retEnviNFe?.infProt,
    raw,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === 'object' && (
    candidate.cStat !== undefined
    || candidate.chNFe !== undefined
    || candidate.nProt !== undefined
  )) || {};
}

function extrairRespostaAutorizacao(raw, agora = () => new Date().toISOString()) {
  const infProt = findInfProt(raw);
  const retEnviNFe = raw?.retEnviNFe || raw?.[0]?.retEnviNFe || {};
  const cStat = String(firstDefined(infProt.cStat, raw?.cStat, retEnviNFe.cStat, '') || '').trim();
  const motivo = firstDefined(
    infProt.xMotivo,
    raw?.xMotivo,
    retEnviNFe.xMotivo,
    `cStat ${cStat || 'desconhecido'}`
  );

  return {
    raw,
    cStat,
    chave: String(firstDefined(infProt.chNFe, raw?.chNFe, '') || '').trim(),
    protocolo: String(firstDefined(infProt.nProt, raw?.nProt, '') || '').trim(),
    recebidoEm: firstDefined(infProt.dhRecbto, raw?.dhRecbto, agora()),
    motivo: String(motivo || '').trim(),
    xml: extrairXmlFiscal(raw),
  };
}

function responseBase(tentativa, overrides = {}) {
  return {
    httpStatus: 200,
    ok: false,
    status: tentativa?.status || 'incerto',
    numero: tentativa?.numero,
    serie: tentativa?.serie,
    alertas: [],
    ...overrides,
  };
}

function createNfeEmissaoService({
  attemptRepository,
  persistenceService,
  transmitir,
  montarPayload,
  extrairResposta = extrairRespostaAutorizacao,
  salvarXmlDisco,
  formatarRejeicao,
  timeoutMs = 75_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  logger = console,
  agora = () => new Date().toISOString(),
}) {
  if (!attemptRepository || !persistenceService || !transmitir || !montarPayload) {
    throw new TypeError('attemptRepository, persistenceService, transmitir e montarPayload sao obrigatorios.');
  }

  function reservaAtivaResponse(input, error) {
    const ativa = attemptRepository.buscarAtivaPorOrdem?.(input.ordemId);
    return responseBase(ativa, {
      httpStatus: error.status || 409,
      ok: false,
      status: ativa?.status || 'incerto',
      code: error.code || 'nfe_tentativa_ativa',
      erro: error.message || 'Ja existe uma tentativa ativa para esta OS.',
    });
  }

  function transicionar(tentativa, status, dados = {}) {
    try {
      return attemptRepository.transicionar(tentativa.id, status, dados);
    } catch (error) {
      logger.warn?.('[NF-e] Falha ao transicionar tentativa:', onlyMessage(error));
      return attemptRepository.buscarPorId(tentativa.id) || tentativa;
    }
  }

  function marcarIncerto(tentativa, dados = {}) {
    const atualizada = transicionar(tentativa, 'incerto', dados);
    return responseBase(atualizada, {
      httpStatus: 409,
      ok: false,
      status: 'incerto',
      cStat: dados.cStat ?? dados.cstat,
      erro: dados.motivo || 'Resposta da SEFAZ nao confirmada. Aguarde antes de tentar novamente.',
      chave: dados.chave,
      protocolo: dados.protocolo,
    });
  }

  function finalizarRejeicao(tentativa, resposta) {
    const rejeicao = formatarRejeicao
      ? formatarRejeicao({ cStat: resposta.cStat, xMotivo: resposta.motivo, contexto: 'autorizacao' })
      : {
          mensagem: resposta.motivo || `SEFAZ rejeitou a emissao: cStat ${resposta.cStat}`,
          campo: undefined,
          item: undefined,
          motivoOriginal: resposta.motivo,
        };
    const atualizada = transicionar(tentativa, 'rejeitado', {
      cStat: resposta.cStat,
      motivo: rejeicao.mensagem,
      chave: resposta.chave || null,
      protocolo: resposta.protocolo || null,
      xmlRetorno: resposta.xml || null,
    });
    if (rejeicaoPermiteDevolverNumero(resposta.cStat)) {
      attemptRepository.devolverNumero(tentativa.id);
    }
    return responseBase(atualizada, {
      httpStatus: 422,
      ok: false,
      status: 'rejeitado',
      erro: rejeicao.mensagem,
      cStat: resposta.cStat,
      campo: rejeicao.campo,
      item: rejeicao.item,
      motivoOriginal: rejeicao.motivoOriginal,
    });
  }

  function autorizar(tentativa, input, resposta) {
    if (
      !/^\d{44}$/.test(resposta.chave)
      || !resposta.protocolo
      || !validarXmlAutorizacao(resposta.xml, resposta.chave)
    ) {
      return marcarIncerto(tentativa, {
        cStat: resposta.cStat,
        motivo: 'Autorizacao sem XML legal valido ou chave/protocolo divergente.',
        chave: resposta.chave || null,
        protocolo: resposta.protocolo || null,
        xmlRetorno: resposta.xml || null,
      });
    }

    const atualizada = persistenceService.autorizar({
      tentativaId: tentativa.id,
      ordemId: input.ordemId,
      numero: tentativa.numero,
      serie: tentativa.serie,
      chave: resposta.chave,
      protocolo: resposta.protocolo,
      cStat: resposta.cStat,
      motivo: resposta.motivo,
      xml: resposta.xml,
      cliente: input.cliente,
    });

    const alertas = [];
    if (salvarXmlDisco) {
      try {
        const caminho = salvarXmlDisco(`${resposta.chave}.xml`, resposta.xml);
        if (!caminho) {
          alertas.push('XML autorizado foi salvo no banco, mas nao foi gravado no disco.');
        }
      } catch (error) {
        logger.error?.('[NF-e] Falha ao salvar XML autorizado em disco:', onlyMessage(error));
        alertas.push('XML autorizado foi salvo no banco, mas nao foi gravado no disco.');
      }
    }

    return responseBase(atualizada, {
      httpStatus: 200,
      ok: true,
      status: 'autorizado',
      numero: tentativa.numero,
      serie: tentativa.serie,
      chave: resposta.chave,
      protocolo: resposta.protocolo,
      emitida_em: resposta.recebidoEm || atualizada.concluido_em || agora(),
      cStat: resposta.cStat,
      alertas,
    });
  }

  async function processarResposta(raw, tentativa, input) {
    const resposta = extrairResposta(raw, agora);
    const classificacao = classificarResultadoEmissao(resposta);

    if (classificacao === 'autorizado') {
      try {
        return autorizar(tentativa, input, resposta);
      } catch (error) {
        logger.error?.('[NF-e] Autorizacao recebida mas nao persistida:', onlyMessage(error));
        return marcarIncerto(tentativa, {
          cStat: resposta.cStat,
          motivo: 'Autorizacao recebida, mas persistencia local ficou incerta.',
          chave: resposta.chave || null,
          protocolo: resposta.protocolo || null,
          xmlRetorno: resposta.xml || null,
          erroLocal: onlyMessage(error),
        });
      }
    }

    if (classificacao === 'rejeitado') {
      return finalizarRejeicao(tentativa, resposta);
    }

    return marcarIncerto(tentativa, {
      cStat: resposta.cStat || null,
      motivo: resposta.motivo || 'Resposta fiscal vazia, desconhecida ou nao conclusiva.',
      chave: resposta.chave || null,
      protocolo: resposta.protocolo || null,
      xmlRetorno: resposta.xml || null,
    });
  }

  async function emitir(input) {
    let tentativa;
    try {
      tentativa = attemptRepository.reservar({
        ordemId: input.ordemId,
        serie: input.serie,
        usuarioId: input.usuarioId,
      });
    } catch (error) {
      if (error.status === 409) return reservaAtivaResponse(input, error);
      throw error;
    }

    let payload;
    try {
      payload = await montarPayload({
        ...input,
        numero: tentativa.numero,
        serie: tentativa.serie,
      });
    } catch (error) {
      const atualizada = transicionar(tentativa, 'falha_local', {
        erroLocal: onlyMessage(error),
        motivo: 'Falha local antes da transmissao.',
      });
      attemptRepository.devolverNumero(tentativa.id);
      return responseBase(atualizada, {
        httpStatus: 500,
        ok: false,
        status: 'falha_local',
        erro: 'Falha local antes de transmitir NF-e.',
      });
    }

    let timeoutId;
    const transmissao = Promise.resolve()
      .then(() => transmitir(payload, tentativa))
      .then((raw) => processarResposta(raw, tentativa, input))
      .catch((error) => marcarIncerto(tentativa, {
        cStat: 'comunicacao',
        motivo: 'Falha de comunicacao com a SEFAZ apos reservar a numeracao.',
        erroLocal: onlyMessage(error),
      }));

    transmissao.catch((error) => {
      logger.error?.('[NF-e] Erro tardio na emissao:', onlyMessage(error));
    });

    const timeout = new Promise((resolve) => {
      timeoutId = setTimeoutFn(() => {
        resolve({
          __timeout: true,
          ...marcarIncerto(tentativa, {
            cStat: 'timeout',
            motivo: 'Tempo esgotado aguardando resposta da SEFAZ.',
          }),
        });
      }, timeoutMs);
    });

    const result = await Promise.race([transmissao, timeout]);
    if (!result.__timeout) clearTimeoutFn(timeoutId);
    const { __timeout: _omit, ...publicResult } = result;
    return publicResult;
  }

  return { emitir };
}

module.exports = {
  createNfeEmissaoService,
  extrairRespostaAutorizacao,
  extrairXmlFiscal,
};
