'use strict';

const path = require('path');
const fs = require('fs');
const { normalizarPedidoInutilizacao } = require('../domain/nfeInutilizacaoRules');
const { transmitirInutilizacaoNFe } = require('../utils/nfeInutilizacao');

const NFE_XMLS_DIR = path.resolve(__dirname, '..', 'data', 'nfe_xmls');
const STATUS_BLOQUEANTES = ['processando', 'autorizado', 'incerto'];
const sharedBusyState = { busy: false };

function serviceError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    ambiente: row.ambiente,
    ano: row.ano,
    modelo: row.modelo,
    serie: row.serie,
    numero_inicial: row.numero_inicial,
    numero_final: row.numero_final,
    justificativa: row.justificativa,
    status: row.status,
    protocolo: row.protocolo,
    cstat: row.cstat,
    motivo: row.motivo,
    solicitado_por: row.solicitado_por,
    solicitado_em: row.solicitado_em,
    concluido_em: row.concluido_em,
    createdat: row.createdat,
    tem_xml_envio: row.xml_envio ? 1 : 0,
    tem_xml_retorno: row.xml_retorno ? 1 : 0,
  };
}

function getRegistro(db, id) {
  return db.prepare('SELECT * FROM nfe_inutilizacoes WHERE id = ?').get(id);
}

function normalizarNumeroNFeParaComparacao(value) {
  const numero = Number.parseInt(String(value || '').replace(/\D/g, ''), 10);
  return Number.isInteger(numero) ? numero : null;
}

function buscarNumeroUtilizado(db, serie, inicio, fim) {
  const rows = db.prepare(`
    SELECT id, nfe_numero, nfe_serie
    FROM ordens
    WHERE nfe_numero IS NOT NULL
      AND COALESCE(nfe_serie, '1') = ?
  `).all(String(serie));

  return rows.find((row) => {
    const numero = normalizarNumeroNFeParaComparacao(row.nfe_numero);
    return numero >= inicio && numero <= fim;
  }) || null;
}

function buscarSobreposicao(db, contexto, inicio, fim) {
  return db.prepare(`
    SELECT *
    FROM nfe_inutilizacoes
    WHERE ambiente = ?
      AND ano = ?
      AND modelo = ?
      AND serie = ?
      AND status IN (${STATUS_BLOQUEANTES.map(() => '?').join(',')})
      AND numero_inicial <= ?
      AND numero_final >= ?
    ORDER BY id DESC
    LIMIT 1
  `).get(
    contexto.ambiente,
    contexto.ano,
    contexto.modelo,
    String(contexto.serie),
    ...STATUS_BLOQUEANTES,
    fim,
    inicio
  );
}

function validarContexto(contexto) {
  if (!contexto) throw serviceError(422, 'contexto_invalido', 'Configuracao fiscal da NF-e incompleta.');
  if (![1, 2].includes(Number(contexto.ambiente))) {
    throw serviceError(422, 'ambiente_invalido', 'Ambiente fiscal da NF-e invalido.');
  }
  if (!Number.isInteger(Number(contexto.cUF))) {
    throw serviceError(422, 'uf_invalida', 'UF/cUF do emitente invalido para inutilizacao.');
  }
  if (!/^\d{14}$/.test(String(contexto.cnpj || ''))) {
    throw serviceError(422, 'cnpj_invalido', 'CNPJ do emitente invalido para inutilizacao.');
  }
  if (!String(contexto.serie || '').trim()) {
    throw serviceError(422, 'serie_invalida', 'Serie NF-e nao configurada.');
  }
}

function montarPayloadSefaz(pedido, contexto) {
  return {
    cUF: Number(contexto.cUF),
    CNPJ: String(contexto.cnpj),
    ano: pedido.anoSefaz,
    mod: '55',
    serie: String(contexto.serie),
    nNFIni: String(pedido.numeroInicial),
    nNFFin: String(pedido.numeroFinal),
    xJust: pedido.justificativa,
  };
}

function nomeArquivoXml(registro, tipo) {
  return `inut-${registro.ambiente}-${registro.ano}-${registro.serie}-${registro.numero_inicial}-${registro.numero_final}-${tipo}.xml`
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function salvarXmlDiscoDefault(registro, tipo, xml) {
  if (!xml) return null;
  fs.mkdirSync(NFE_XMLS_DIR, { recursive: true });
  const arquivo = path.join(NFE_XMLS_DIR, nomeArquivoXml(registro, tipo));
  fs.writeFileSync(arquivo, xml, 'utf8');
  return { ok: true, arquivo };
}

function extractFiscalStatus(result) {
  return {
    cStat: String(result?.cStat || result?.cstat || ''),
    xMotivo: result?.xMotivo || result?.motivo || '',
    nProt: result?.nProt || result?.protocolo || '',
    dhRecbto: result?.dhRecbto || result?.dhRecebto || '',
    xmlEnvio: result?.xmlEnvio || '',
    xmlRetorno: result?.xmlRetorno || result?.xml || '',
  };
}

function isDefinitiveFiscalError(error, classificarErro) {
  const info = classificarErro?.(error) || {};
  if (info.tipo === 'rejeicao' || info.tipo === 'validacao_xml') return { definitive: true, info };
  const message = String(error?.message || '');
  if (/rejei[cç][aã]o/i.test(message)) return { definitive: true, info: { mensagem: message, cstat: 'rejeicao' } };
  return { definitive: false, info };
}

function isPreTransmissionLocalError(error) {
  return error?.code === 'falha_local_pre_transmissao';
}

function createNfeInutilizacaoService(deps) {
  const db = deps.db;
  const obterContexto = deps.obterContexto;
  const transmitir = deps.transmitir || transmitirInutilizacaoNFe;
  const salvarXml = deps.salvarXml || salvarXmlDiscoDefault;
  const agora = deps.agora || (() => new Date().toISOString());
  const classificarErro = deps.classificarErro || (() => ({ tipo: 'comunicacao' }));
  const busyState = deps.busyState || sharedBusyState;

  async function solicitar(input, usuarioId) {
    if (busyState.busy) throw serviceError(409, 'processando', 'Ja existe uma inutilizacao em processamento.');
    const contexto = obterContexto();
    validarContexto(contexto);

    const parsed = normalizarPedidoInutilizacao(input, { anoAtual: new Date(agora()).getFullYear() });
    if (!parsed.ok) throw serviceError(400, parsed.campo, parsed.erro);
    const pedido = parsed.pedido;
    const contextoFinal = {
      ambiente: Number(contexto.ambiente),
      ano: pedido.ano,
      modelo: '55',
      serie: String(contexto.serie),
      cUF: Number(contexto.cUF),
      cnpj: String(contexto.cnpj),
      ultimoNumero: Number(contexto.ultimoNumero || 0),
    };

    if (pedido.numeroFinal > contextoFinal.ultimoNumero) {
      throw serviceError(409, 'fora_da_sequencia', 'A faixa esta acima do ultimo numero conhecido da serie.');
    }

    const existente = db.prepare('SELECT * FROM nfe_inutilizacoes WHERE idempotency_key = ?').get(pedido.idempotencyKey);
    if (existente) {
      return { httpStatus: 200, replayed: true, registro: rowToApi(existente), alertas: [] };
    }

    busyState.busy = true;
    let registroId;
    try {
      const reservado = db.transaction(() => {
        const replay = db.prepare('SELECT * FROM nfe_inutilizacoes WHERE idempotency_key = ?').get(pedido.idempotencyKey);
        if (replay) return replay;

        const usado = buscarNumeroUtilizado(db, contextoFinal.serie, pedido.numeroInicial, pedido.numeroFinal);
        if (usado) {
          throw serviceError(409, 'numero_utilizado', `Numero ${usado.nfe_numero} ja consta em uma NF-e local.`);
        }

        const sobreposicao = buscarSobreposicao(db, contextoFinal, pedido.numeroInicial, pedido.numeroFinal);
        if (sobreposicao) {
          throw serviceError(409, 'faixa_sobreposta', 'Faixa sobreposta a inutilizacao ja registrada ou incerta.');
        }

        const result = db.prepare(`
          INSERT INTO nfe_inutilizacoes
            (ambiente, ano, modelo, serie, numero_inicial, numero_final, justificativa,
             status, idempotency_key, solicitado_por, solicitado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'processando', ?, ?, ?)
        `).run(
          contextoFinal.ambiente,
          contextoFinal.ano,
          contextoFinal.modelo,
          contextoFinal.serie,
          pedido.numeroInicial,
          pedido.numeroFinal,
          pedido.justificativa,
          pedido.idempotencyKey,
          usuarioId || null,
          agora()
        );
        return getRegistro(db, result.lastInsertRowid);
      })();

      if (reservado.idempotency_key === pedido.idempotencyKey && reservado.status !== 'processando') {
        return { httpStatus: 200, replayed: true, registro: rowToApi(reservado), alertas: [] };
      }

      registroId = reservado.id;
      const sefaz = extractFiscalStatus(await transmitir(montarPayloadSefaz(pedido, contextoFinal)));
      const autorizado = sefaz.cStat === '102';
      const status = autorizado ? 'autorizado' : 'rejeitado';
      const alertas = [];
      const xmlEnvio = sefaz.xmlEnvio || '';
      const xmlRetorno = sefaz.xmlRetorno || '';

      db.prepare(`
        UPDATE nfe_inutilizacoes
        SET status = ?, protocolo = ?, cstat = ?, motivo = ?, xml_envio = ?, xml_retorno = ?,
            concluido_em = ?
        WHERE id = ?
      `).run(
        status,
        sefaz.nProt || null,
        sefaz.cStat || null,
        sefaz.xMotivo || null,
        xmlEnvio || null,
        xmlRetorno || null,
        sefaz.dhRecbto || agora(),
        registroId
      );

      if (autorizado) {
        try {
          salvarXml({ ...reservado, status, protocolo: sefaz.nProt, cstat: sefaz.cStat }, 'envio', xmlEnvio);
          salvarXml({ ...reservado, status, protocolo: sefaz.nProt, cstat: sefaz.cStat }, 'retorno', xmlRetorno);
        } catch (err) {
          console.error('[NF-e] Falha ao salvar XML de inutilizacao em disco:', err.message);
          alertas.push('XML autorizado salvo no banco, mas houve falha ao gravar arquivo em disco.');
        }
      }

      const registro = rowToApi(getRegistro(db, registroId));
      return { httpStatus: autorizado ? 201 : 422, registro, alertas };
    } catch (error) {
      if (error.status) throw error;
      if (isPreTransmissionLocalError(error)) {
        if (registroId) {
          db.prepare(`
            UPDATE nfe_inutilizacoes
            SET status = 'falha_local', cstat = ?, motivo = ?, xml_envio = ?, xml_retorno = ?, concluido_em = ?
            WHERE id = ?
          `).run(
            error.code,
            error.message,
            error.xmlEnvio || null,
            error.xmlRetorno || null,
            agora(),
            registroId
          );
          return { httpStatus: 500, registro: rowToApi(getRegistro(db, registroId)), alertas: [] };
        }
        throw serviceError(500, 'falha_local', error.message);
      }
      const fiscal = isDefinitiveFiscalError(error, classificarErro);
      const status = fiscal.definitive ? 'rejeitado' : 'incerto';
      const httpStatus = fiscal.definitive ? 422 : 504;
      const message = fiscal.info?.mensagem || error.message;

      if (registroId) {
        db.prepare(`
          UPDATE nfe_inutilizacoes
          SET status = ?, cstat = ?, motivo = ?, xml_envio = ?, xml_retorno = ?, concluido_em = ?
          WHERE id = ?
        `).run(
          status,
          fiscal.info?.cstat || null,
          message,
          error.xmlEnvio || null,
          error.xmlRetorno || null,
          agora(),
          registroId
        );
        return { httpStatus, registro: rowToApi(getRegistro(db, registroId)), alertas: [] };
      }

      throw serviceError(500, 'falha_local', message);
    } finally {
      busyState.busy = false;
    }
  }

  function listar() {
    return db.prepare(`
      SELECT id, ambiente, ano, modelo, serie, numero_inicial, numero_final, justificativa,
             status, protocolo, cstat, motivo, solicitado_por, solicitado_em, concluido_em,
             createdat,
             CASE WHEN xml_envio IS NOT NULL AND length(xml_envio) > 0 THEN 1 ELSE 0 END AS tem_xml_envio,
             CASE WHEN xml_retorno IS NOT NULL AND length(xml_retorno) > 0 THEN 1 ELSE 0 END AS tem_xml_retorno
      FROM nfe_inutilizacoes
      ORDER BY solicitado_em DESC, id DESC
    `).all();
  }

  function buscarXml(id, tipo) {
    const column = tipo === 'envio' ? 'xml_envio' : tipo === 'retorno' ? 'xml_retorno' : null;
    if (!column) throw serviceError(400, 'tipo_xml_invalido', 'Tipo de XML invalido.');
    const row = db.prepare(`SELECT *, ${column} AS xml FROM nfe_inutilizacoes WHERE id = ?`).get(id);
    if (!row) throw serviceError(404, 'nao_encontrado', 'Inutilizacao nao encontrada.');
    if (!row.xml) throw serviceError(404, 'xml_nao_encontrado', 'XML nao encontrado para esta inutilizacao.');
    return { registro: rowToApi(row), xml: row.xml, filename: nomeArquivoXml(row, tipo) };
  }

  return {
    solicitar,
    listar,
    buscarXml,
  };
}

module.exports = {
  createNfeInutilizacaoService,
  nomeArquivoXml,
};
