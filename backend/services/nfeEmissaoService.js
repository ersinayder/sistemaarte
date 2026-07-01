'use strict';

const {
  classificarResultadoEmissao,
  listarCStatsRejeicaoReutilizavel,
  rejeicaoPermiteReutilizarNumero,
  validarXmlAutorizacao,
} = require('../domain/nfeEmissionRules');

function onlyMessage(error) {
  return String(error?.message || error || 'Erro desconhecido').slice(0, 500);
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

function numeroFiscal(tentativa) {
  return String(tentativa?.numero || '').padStart(9, '0');
}

function chaveEvento(tentativa, dados = {}) {
  const chave = String(dados.chave || '').trim();
  return chave || `OS-${tentativa.ordemid}`;
}

function createNfeEmissaoService({
  db,
  attemptRepository,
  persistenceService,
  transmitir,
  montarPayload,
  extrairResposta = extrairRespostaAutorizacao,
  salvarXmlDisco,
  formatarRejeicao,
  classificarErro,
  timeoutMs = 75_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  logger = console,
  agora = () => new Date().toISOString(),
  canonicalNotes,
}) {
  if (!attemptRepository || !persistenceService || !transmitir || !montarPayload) {
    throw new TypeError('attemptRepository, persistenceService, transmitir e montarPayload sao obrigatorios.');
  }

  function runFiscalTransaction(fn) {
    if (!db) return fn();
    const tx = db.transaction(fn);
    return typeof tx.immediate === 'function' ? tx.immediate() : tx();
  }

  function projetarStatusOrdem(tentativa, status, dados = {}) {
    if (!db) return;
    db.prepare(`
      UPDATE ordens
      SET nfe_status = ?,
          nfe_numero = ?,
          nfe_serie = ?,
          nfe_chave = ?,
          nfe_protocolo = ?,
          nfe_deletedat = NULL,
          nfe_deletedpor = NULL,
          nfe_deletedreason = NULL
      WHERE id = ? AND deletedat IS NULL
    `).run(
      status,
      numeroFiscal(tentativa),
      String(tentativa.serie),
      dados.chave || null,
      dados.protocolo || null,
      tentativa.ordemid
    );
  }

  function registrarEventoOperacional(tentativa, tipo, dados = {}) {
    if (!db) return;
    db.prepare(`
      INSERT INTO nfe_eventos
        (nfeid, ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, texto, xml, createdat)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      dados.nfeid || null,
      tentativa.ordemid,
      chaveEvento(tentativa, dados),
      tipo,
      dados.protocolo || null,
      dados.cStat ?? dados.cstat ?? null,
      dados.motivo || null,
      dados.texto || null,
      dados.xmlRetorno || null,
      agora()
    );
  }

  function executarHook(nome, tentativa, input, dados = {}) {
    const hook = canonicalNotes?.[nome];
    if (typeof hook !== 'function') return null;
    return hook(tentativa, input, dados);
  }

  function devolverNumeroNaTransacao(tentativa) {
    if (!db) return attemptRepository.devolverNumero(tentativa.id);
    const posterior = db.prepare(`
      SELECT id
      FROM nfe_emissao_tentativas
      WHERE serie = ?
        AND numero = ?
        AND id > ?
      LIMIT 1
    `).get(tentativa.serie, tentativa.numero, tentativa.id);
    if (posterior) return false;

    const result = db.prepare(`
      UPDATE nfe_sequencias
      SET ultimo_numero = ultimo_numero - 1
      WHERE serie = ?
        AND ultimo_numero = ?
    `).run(tentativa.serie, tentativa.numero);
    return result.changes === 1;
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

  function marcarIncerto(tentativa, input = {}, dados = {}) {
    const atualizada = runFiscalTransaction(() => {
      projetarStatusOrdem(tentativa, 'incerto', dados);
      executarHook('marcarNotaIncerta', tentativa, input, dados);
      registrarEventoOperacional(tentativa, 'incerto', {
        ...dados,
        nfeid: input.nfeNotaId,
      });
      if (db) return attemptRepository.transicionarNaTransacao(tentativa.id, 'incerto', dados);
      return transicionar(tentativa, 'incerto', dados);
    });
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

  function finalizarRejeicao(tentativa, input = {}, resposta) {
    const rejeicao = formatarRejeicao
      ? formatarRejeicao({ cStat: resposta.cStat, xMotivo: resposta.motivo, contexto: 'autorizacao' })
      : {
          mensagem: resposta.motivo || `SEFAZ rejeitou a emissao: cStat ${resposta.cStat}`,
          campo: undefined,
          item: undefined,
          motivoOriginal: resposta.motivo,
        };
    const dadosTransicao = {
      cStat: resposta.cStat,
      motivo: rejeicao.mensagem,
      chave: resposta.chave || null,
      protocolo: resposta.protocolo || null,
      xmlRetorno: resposta.xml || null,
    };
    const atualizada = runFiscalTransaction(() => {
      projetarStatusOrdem(tentativa, 'rejeitado', dadosTransicao);
      executarHook('marcarNotaRejeitada', tentativa, input, {
        ...dadosTransicao,
        cstat: dadosTransicao.cStat,
        chave: rejeicaoPermiteReutilizarNumero(resposta.cStat) ? null : dadosTransicao.chave,
        xml: resposta.xml || null,
      });
      registrarEventoOperacional(tentativa, 'rejeicao', {
        ...dadosTransicao,
        nfeid: input.nfeNotaId,
        texto: `Rejeicao de autorizacao NF-e. Retorno original: ${rejeicao.motivoOriginal || rejeicao.mensagem}`,
      });
      const row = db
        ? attemptRepository.transicionarNaTransacao(tentativa.id, 'rejeitado', dadosTransicao)
        : transicionar(tentativa, 'rejeitado', dadosTransicao);
      return row;
    });
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

  function finalizarFalhaLocal(tentativa, input = {}, dados = {}) {
    const atualizada = runFiscalTransaction(() => {
      executarHook('marcarNotaFalhaLocal', tentativa, input, {
        cstat: dados.cStat ?? dados.cstat ?? null,
        motivo: dados.motivo || 'Falha local antes de transmitir NF-e.',
        xml: dados.xmlRetorno || null,
      });
      const row = db
        ? attemptRepository.transicionarNaTransacao(tentativa.id, 'falha_local', dados)
        : transicionar(tentativa, 'falha_local', dados);
      devolverNumeroNaTransacao(tentativa);
      return row;
    });
    return responseBase(atualizada, {
      httpStatus: dados.httpStatus || 422,
      ok: false,
      status: 'falha_local',
      cStat: dados.cStat ?? dados.cstat,
      erro: dados.motivo || 'Falha local antes de transmitir NF-e.',
    });
  }

  function processarErroTransmissao(error, tentativa, input) {
    const info = typeof classificarErro === 'function' ? classificarErro(error) : null;
    if (info?.tipo === 'validacao_xml') {
      return finalizarFalhaLocal(tentativa, input, {
        cStat: info.cStat ?? info.cstat ?? null,
        motivo: info.mensagem || 'XML invalido antes da transmissao.',
        erroLocal: onlyMessage(error),
      });
    }
    if (info?.tipo === 'rejeicao') {
      return finalizarRejeicao(tentativa, input, {
        cStat: String(info.cStat ?? info.cstat ?? '').trim(),
        motivo: info.mensagem || onlyMessage(error),
        chave: info.chave || null,
        protocolo: info.protocolo || null,
        xml: info.xml || null,
      });
    }
    return marcarIncerto(tentativa, input, {
      cStat: info?.cStat ?? info?.cstat ?? 'comunicacao',
      motivo: info?.mensagem || 'Falha de comunicacao com a SEFAZ apos reservar a numeracao.',
      erroLocal: onlyMessage(error),
    });
  }

  function autorizar(tentativa, input, resposta) {
    if (
      !/^\d{44}$/.test(resposta.chave)
      || !resposta.protocolo
      || !validarXmlAutorizacao(resposta.xml, resposta.chave)
    ) {
      return marcarIncerto(tentativa, input, {
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
      itens: input.itens,
      nfeNotaId: input.nfeNotaId,
      emitidaEm: resposta.recebidoEm,
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
        return marcarIncerto(tentativa, input, {
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
      return finalizarRejeicao(tentativa, input, resposta);
    }

    return marcarIncerto(tentativa, input, {
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
        cstatsReutilizaveis: listarCStatsRejeicaoReutilizavel(),
      });
    } catch (error) {
      if (error.status === 409) return reservaAtivaResponse(input, error);
      throw error;
    }

    let executionInput = input;
    try {
      const nota = executarHook('criarNotaEmitindo', tentativa, input) || null;
      if (nota?.id) {
        executionInput = { ...input, nfeNotaId: nota.id };
      }
    } catch (error) {
      return finalizarFalhaLocal(tentativa, input, {
        httpStatus: 500,
        motivo: 'Falha local antes da transmissao.',
        erroLocal: onlyMessage(error),
      });
    }

    let payload;
    try {
      payload = await montarPayload({
        ...executionInput,
        numero: tentativa.numero,
        serie: tentativa.serie,
      });
    } catch (error) {
      return finalizarFalhaLocal(tentativa, executionInput, {
        httpStatus: 500,
        motivo: 'Falha local antes da transmissao.',
        erroLocal: onlyMessage(error),
      });
    }

    let timeoutId;
    const transmissao = Promise.resolve()
      .then(() => transmitir(payload, tentativa))
      .then((raw) => processarResposta(raw, tentativa, executionInput))
      .catch((error) => processarErroTransmissao(error, tentativa, executionInput));

    transmissao.catch((error) => {
      logger.error?.('[NF-e] Erro tardio na emissao:', onlyMessage(error));
    });

    const timeout = new Promise((resolve) => {
      timeoutId = setTimeoutFn(() => {
        resolve({
          __timeout: true,
          ...marcarIncerto(tentativa, executionInput, {
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
