'use strict';
const express       = require('express');
const router        = express.Router();
const path          = require('path');
const fs            = require('fs');
const { getDB }     = require('../database');
const { auth }      = require('../middlewares/auth');
const {
  getNFEWizard,
  callSEFAZ,
  getSefazErrorInfo,
  deveDevolverNumeroNFeAposFalhaAutorizacao,
  formatarRejeicaoSefaz,
} = require('../utils/nfe');
const { montarNFe } = require('../domain/nfeRules');
const { createNfeInutilizacaoService } = require('../services/nfeInutilizacaoService');
const { transmitirInutilizacaoNFe } = require('../utils/nfeInutilizacao');
const { renderDanfeHtml } = require('../utils/danfe');
const { sendPrintHtml } = require('../utils/print/base');
const {
  tpAmbAtual,
  getCertificadoConfig,
  getEmitenteConfig,
  getAutXmlParaNFe,
  getCnpjEmitente,
  getSerieNFe,
} = require('../utils/nfeConfig');
const {
  aplicarOverrideClienteNFe,
  aplicarOverridesItensNFe,
  normalizarItensAvulsosNFe,
  serializarItemPreviaNFe,
  validarClienteFiscalNFe,
  validarEmitenteFiscalNFe,
  validarItensFiscaisNFe,
} = require('../domain/nfeEmissionRules');
const {
  buscarNotaAtivaParaOrdem,
  criarNotaEmitindo,
  listarEventosNota,
  listarNotasFiscais,
  marcarNotaAutorizada,
  marcarNotaCancelada,
  marcarNotaRejeitada,
  montarDocumentoFiscalAvulso,
  moverNotaParaLixeira,
  resolverNotaPorChave,
  resolverNotaPorId,
  restaurarNotaDaLixeira,
  substituirItensNota,
} = require('../services/nfeNotasService');

// Rotas fiscais leem/escrevem a entidade canonica nfe_notas na fase 1.
// Diretório canônico para XMLs — obrigação legal 5 anos
const NFE_XMLS_DIR = path.resolve(__dirname, '..', 'data', 'nfe_xmls');
const CCE_COND_USO =
  'A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.';
const STATUS_NFE_EMISSAO = ['Aguardando', 'Em Produção', 'Pronto', 'Entregue'];
const STATUS_NFE_LIXEIRA = ['rejeitado'];
const NFE_ROUTE_TIMEOUT_MS = 75_000;
const CODIGO_UF = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

function pad(n, len) { return String(n).padStart(len, '0'); }

function maskCnpj(cnpj) {
  const digits = String(cnpj || '').replace(/\D/g, '');
  if (digits.length !== 14) return '';
  return `${digits.slice(0, 2)}.***.***/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function obterContextoInutilizacao(db = getDB()) {
  const emitente = getEmitenteConfig();
  const cnpj = getCnpjEmitente();
  const serie = getSerieNFe();
  const ambiente = tpAmbAtual();
  const uf = String(emitente?.enderEmit?.UF || '').toUpperCase();
  const row = db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get(serie);
  const ultimoNumero = Number(row?.ultimo_numero || 0);
  const anoSugerido = new Date().getFullYear();
  const cert = getCertificadoConfig();

  return {
    ambiente,
    ambienteLabel: ambiente === 1 ? 'Producao' : 'Homologacao',
    cUF: CODIGO_UF[uf],
    uf,
    cnpj,
    cnpjMascarado: maskCnpj(cnpj),
    modelo: '55',
    serie,
    anoSugerido,
    ultimoNumero,
    certificadoConfigurado: Boolean(cert.pathCertificado && cert.senhaCertificado),
    avisoPrazo: 'A inutilizacao deve ser solicitada ate o decimo dia do mes seguinte a quebra da sequencia.',
  };
}

function getInutilizacaoService(db = getDB()) {
  return createNfeInutilizacaoService({
    db,
    obterContexto: () => obterContextoInutilizacao(db),
    transmitir: transmitirInutilizacaoNFe,
    classificarErro: getSefazErrorInfo,
  });
}

function dhEventoBRT() {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().replace(/\.\d{3}Z$/, '-03:00');
}

function parseRetEvento(resultado, fallbackDhEvento) {
  const retEvento =
    resultado?.[0]?.retEvento?.infEvento ||
    resultado?.retEnvEvento?.retEvento?.[0]?.infEvento ||
    resultado?.infEvento ||
    resultado?.[0] ||
    resultado;

  return {
    retEvento,
    cStat: String(retEvento?.cStat || ''),
    protocolo: retEvento?.nProt || '',
    dhEvento: retEvento?.dhRegEvento || fallbackDhEvento,
    xMotivo: retEvento?.xMotivo || '',
  };
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

function serializarXmlFiscal(resultado) {
  return extrairXmlFiscal(resultado) || (typeof resultado === 'string'
    ? resultado
    : JSON.stringify(resultado, null, 2));
}

function proximoNumero(db, serie = '1') {
  const row = db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get(serie);
  if (!row) {
    db.prepare('INSERT INTO nfe_sequencias (serie, ultimo_numero) VALUES (?, 1)').run(serie);
    return pad(1, 9);
  }
  const proximo = row.ultimo_numero + 1;
  db.prepare('UPDATE nfe_sequencias SET ultimo_numero = ? WHERE serie = ?').run(proximo, serie);
  return pad(proximo, 9);
}

function devolverNumeroNFeRejeitada(db, serie, numero) {
  const numeroInt = Number.parseInt(numero, 10);
  if (!Number.isInteger(numeroInt) || numeroInt <= 0) return false;

  const result = db.prepare(`
    UPDATE nfe_sequencias
    SET ultimo_numero = ?
    WHERE serie = ? AND ultimo_numero = ?
  `).run(numeroInt - 1, serie, numeroInt);

  if (result.changes > 0) {
    console.warn(`[NF-e] Numero ${numero}/${serie} devolvido a sequencia apos rejeicao fiscal.`);
    return true;
  }

  console.warn(`[NF-e] Numero ${numero}/${serie} nao devolvido: sequencia ja avancou.`);
  return false;
}

function rejeicaoPermiteDevolverNumeroNFe(cStat) {
  // Nao reutilizar numeros que a SEFAZ declarou como duplicados, denegados ou inutilizados.
  const codigo = String(cStat || '').trim();
  return !['204', '205', '206', '302', '303'].includes(codigo);
}

function buscarOrdemParaNFe(db, osId) {
  return db.prepare(`
    SELECT o.*, c.name AS clientenome, c.cpf, c.ie, c.logradouro,
           c.numero AS c_numero, c.bairro, c.cidade, c.uf, c.cep
    FROM ordens o
    LEFT JOIN clientes c ON o.clienteid = c.id
    WHERE o.id = ? AND o.deletedat IS NULL
  `).get(osId);
}

function buscarItensParaNFe(db, ordemId) {
  return db.prepare(`
    SELECT oi.*, p.nome AS produto_nome, p.ncm, p.cfop, p.unidade, p.origem_fiscal, p.csosn
    FROM ordem_itens oi
    LEFT JOIN produtos p ON oi.produto_id = p.id
    WHERE oi.ordemid = ?
  `).all(ordemId);
}

function validarOrdemEmitivel(os, itens) {
  if (!os) return { status: 404, erro: 'OS nao encontrada' };
  if (os.nfe_status === 'autorizado') return { status: 409, erro: 'NF-e ja autorizada para esta OS' };
  if (!STATUS_NFE_EMISSAO.includes(os.status)) {
    return { status: 422, erro: `Status invalido para emissao: ${os.status}` };
  }
  if (!itens.length) {
    return { status: 422, erro: 'OS nao possui itens - nao e possivel emitir NF-e' };
  }
  return null;
}

function serializarPreviaEmissaoNFe({ os, itens, ambiente, serie }) {
  return {
    ordem: {
      id: os.id,
      numero: os.numero,
      status: os.status,
      servico: os.servico,
      descricao: os.descricao,
      pagamento: os.pagamento,
      prazoentrega: os.prazoentrega,
      valortotal: Number(os.valortotal || 0),
      descontovalor: Number(os.descontovalor || 0),
    },
    cliente: {
      id: os.clienteid || null,
      nome: os.clientenome || os.clientenome_os || 'CONSUMIDOR FINAL',
      documento: os.cpf || '',
      ie: os.ie || '',
      logradouro: os.logradouro || '',
      numero: os.c_numero || '',
      bairro: os.bairro || '',
      cidade: os.cidade || '',
      uf: os.uf || '',
      cep: os.cep || '',
    },
    emitente: getEmitenteConfig(),
    fiscal: {
      ambiente,
      serie,
      autXML: getAutXmlParaNFe(os.cpf),
    },
    itens: itens.map(serializarItemPreviaNFe),
  };
}

function clienteAvulsoBase(row = {}) {
  return {
    clienteid: row.id || row.clienteid || null,
    clientenome: row.name || row.clientenome || 'CONSUMIDOR FINAL',
    cpf: row.cpf || '',
    ie: row.ie || '',
    logradouro: row.logradouro || '',
    c_numero: row.numero || row.c_numero || '',
    bairro: row.bairro || '',
    cidade: row.cidade || '',
    uf: row.uf || '',
    cep: row.cep || '',
  };
}

function carregarClienteAvulso(db, raw = {}) {
  const id = Number(raw?.id || raw?.clienteid || 0);
  if (!Number.isInteger(id) || id <= 0) return clienteAvulsoBase();
  const row = db.prepare(`
    SELECT id, name, cpf, ie, logradouro, numero, bairro, cidade, uf, cep
    FROM clientes
    WHERE id = ? AND deletedat IS NULL
  `).get(id);
  return clienteAvulsoBase(row || {});
}

function normalizarClienteAvulso(db, raw = {}) {
  const base = carregarClienteAvulso(db, raw);
  const resultado = aplicarOverrideClienteNFe(base, raw);
  if (!resultado.ok) return resultado;
  return {
    ok: true,
    cliente: {
      ...resultado.cliente,
      clienteid: base.clienteid || Number(raw?.id || raw?.clienteid || 0) || null,
    },
  };
}

function serializarClienteAvulso(cliente = {}) {
  return {
    id: cliente.clienteid || null,
    nome: cliente.clientenome === 'CONSUMIDOR FINAL' && !cliente.cpf ? '' : (cliente.clientenome || ''),
    documento: cliente.cpf || '',
    ie: cliente.ie || '',
    logradouro: cliente.logradouro || '',
    numero: cliente.c_numero || '',
    bairro: cliente.bairro || '',
    cidade: cliente.cidade || '',
    uf: cliente.uf || '',
    cep: cliente.cep || '',
  };
}

function serializarPreviaAvulsa({ documento, cliente, itens }) {
  return {
    origem: 'avulsa',
    ordem: {
      numero: 'Avulsa',
      servico: 'NF-e avulsa',
      pagamento: documento.pagamento || 'Pix',
      valortotal: Number(documento.valortotal || 0),
      descontovalor: Number(documento.descontovalor || 0),
    },
    cliente: serializarClienteAvulso(cliente),
    emitente: getEmitenteConfig(),
    fiscal: {
      ambiente: tpAmbAtual(),
      serie: getSerieNFe(),
      autXML: cliente?.cpf ? getAutXmlParaNFe(cliente.cpf) : [],
    },
    itens: itens || [],
  };
}

function salvarClienteCadastroAposEmissao(db, os, cliente) {
  if (!os.clienteid) return;

  db.prepare(`
    UPDATE clientes SET
      name = ?,
      cpf = ?,
      ie = ?,
      logradouro = ?,
      numero = ?,
      bairro = ?,
      cidade = ?,
      uf = ?,
      cep = ?
    WHERE id = ? AND deletedat IS NULL
  `).run(
    cliente.clientenome || os.clientenome || null,
    cliente.cpf || null,
    cliente.ie || null,
    cliente.logradouro || null,
    cliente.c_numero || null,
    cliente.bairro || null,
    cliente.cidade || null,
    cliente.uf || null,
    cliente.cep || null,
    os.clienteid
  );
}

/**
 * Salva XML de NF-e (autorização ou cancelamento) em backend/data/nfe_xmls/.
 * Falha silenciosa — nunca deve interromper o fluxo principal.
 */
function salvarXmlDisco(nomeArquivo, xmlContent) {
  try {
    fs.mkdirSync(NFE_XMLS_DIR, { recursive: true });
    const arquivo = path.join(NFE_XMLS_DIR, nomeArquivo);
    fs.writeFileSync(arquivo, xmlContent, 'utf8');
    console.log(`[NF-e] XML salvo: ${arquivo}`);
    return arquivo;
  } catch (err) {
    console.error(`[NF-e] Falha ao salvar XML em disco (${nomeArquivo}):`, err.message);
    return null;
  }
}

function registrarEventoFiscal(db, evento) {
  try {
    db.prepare(`
      INSERT INTO nfe_eventos
        (nfeid, ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, texto, xml, createdat)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evento.nfeid || null,
      evento.ordemid || null,
      evento.chave || '',
      evento.tipo,
      evento.nseqevento || 1,
      evento.protocolo || null,
      evento.cstat || null,
      evento.motivo || null,
      evento.texto || null,
      evento.xml || null,
      evento.createdat || new Date().toISOString()
    );
  } catch (err) {
    console.error(`[NF-e] Falha ao registrar evento fiscal (${evento.tipo}):`, err.message);
  }
}

function filenameSeguro(value) {
  return String(value || 'nfe').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resumirStatusServico(resultado) {
  const status = resultado?.retConsStatServ || resultado?.consStatServ || resultado || {};
  return {
    cStat: String(status.cStat || resultado?.cStat || ''),
    xMotivo: status.xMotivo || resultado?.xMotivo || '',
    tpAmb: String(status.tpAmb || resultado?.tpAmb || ''),
    verAplic: status.verAplic || resultado?.verAplic || '',
    dhRecbto: status.dhRecbto || resultado?.dhRecbto || '',
    raw: resultado,
  };
}

// GET /api/nfe
router.get('/', auth(['admin', 'caixa']), (req, res) => {
  try {
    const rows = listarNotasFiscais(getDB(), { lixeira: false });
    const alvoHomologacao = Number(process.env.NFE_HOMOLOGACAO_ALVO || 10);
    const autorizadasHomologacao = rows.filter(n => n.nfe_status === 'autorizado').length;
    res.json({
      notas: rows,
      meta: {
        ambiente: tpAmbAtual(),
        autorizadas_homologacao: autorizadasHomologacao,
        alvo_homologacao: alvoHomologacao,
      },
    });
  } catch (e) {
    console.error('[NF-e] GET /:', e.message);
    res.status(500).json({ erro: 'Erro ao listar notas fiscais' });
  }
});

// GET /api/nfe/lixeira
router.get('/lixeira', auth(['admin']), (req, res) => {
  try {
    const rows = listarNotasFiscais(getDB(), { lixeira: true });
    res.json({ notas: rows, meta: { ambiente: tpAmbAtual() } });
  } catch (e) {
    console.error('[NF-e] GET /lixeira:', e.message);
    res.status(500).json({ erro: 'Erro ao listar lixeira de notas fiscais' });
  }
});

// GET /api/nfe/status-servico
// Diagnostico: consulta o status do webservice sem emitir nota nem consumir numeracao.
router.get('/status-servico', auth(['admin', 'caixa']), async (req, res) => {
  const ambiente = tpAmbAtual();
  const inicio = Date.now();

  try {
    const wizard = await getNFEWizard();
    const resultado = await callSEFAZ(() => wizard.NFE_ConsultaStatusServico());
    const status = resumirStatusServico(resultado);
    console.log(`[NF-e] Status servico SEFAZ ambiente=${ambiente} cStat=${status.cStat || '-'} motivo=${status.xMotivo || '-'}`);
    res.json({
      ok: true,
      ambiente,
      duracao_ms: Date.now() - inicio,
      status,
    });
  } catch (err) {
    const sefazInfo = getSefazErrorInfo(err);
    console.error(`[NF-e] Status servico falhou ambiente=${ambiente}:`, err.message);
    res.status(504).json({
      ok: false,
      ambiente,
      duracao_ms: Date.now() - inicio,
      erro: sefazInfo.mensagem,
      tipo: sefazInfo.tipo,
      detalhe: err.message,
      contingencia: false,
    });
  }
});

// GET /api/nfe/inutilizacoes/contexto
router.get('/inutilizacoes/contexto', auth(['admin']), (req, res) => {
  try {
    const contexto = obterContextoInutilizacao(getDB());
    const { cnpj, ...publico } = contexto;
    res.json({ ...publico, cnpj: contexto.cnpjMascarado });
  } catch (e) {
    console.error('[NF-e] GET /inutilizacoes/contexto:', e.message);
    res.status(500).json({ erro: 'Erro ao carregar contexto de inutilizacao NF-e' });
  }
});

// GET /api/nfe/inutilizacoes
router.get('/inutilizacoes', auth(['admin']), (req, res) => {
  try {
    const inutilizacoes = getInutilizacaoService(getDB()).listar();
    res.json({ inutilizacoes, meta: { ambiente: tpAmbAtual() } });
  } catch (e) {
    console.error('[NF-e] GET /inutilizacoes:', e.message);
    res.status(500).json({ erro: 'Erro ao listar inutilizacoes NF-e' });
  }
});

// POST /api/nfe/inutilizacoes
router.post('/inutilizacoes', auth(['admin']), async (req, res) => {
  try {
    const result = await getInutilizacaoService(getDB()).solicitar(req.body || {}, req.user?.id || null);
    res.status(result.httpStatus).json({
      inutilizacao: result.registro,
      alertas: result.alertas || [],
      replayed: Boolean(result.replayed),
    });
  } catch (e) {
    const status = e.status || 500;
    console.error('[NF-e] POST /inutilizacoes:', e.message);
    res.status(status).json({
      erro: e.message || 'Erro ao inutilizar numeracao NF-e',
      code: e.code || 'erro_inutilizacao',
    });
  }
});

// GET /api/nfe/inutilizacoes/:id/xml/:tipo
router.get('/inutilizacoes/:id/xml/:tipo', auth(['admin']), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'Inutilizacao invalida.' });
  }

  try {
    const result = getInutilizacaoService(getDB()).buscarXml(id, req.params.tipo);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.xml);
  } catch (e) {
    const status = e.status || 500;
    console.error('[NF-e] GET /inutilizacoes/:id/xml/:tipo:', e.message);
    res.status(status).json({ erro: e.message || 'Erro ao baixar XML de inutilizacao' });
  }
});

// GET /api/nfe/avulsa/preview
router.get('/avulsa/preview', auth(['admin', 'caixa']), (req, res) => {
  res.json(serializarPreviaAvulsa({
    documento: montarDocumentoFiscalAvulso({ cliente: clienteAvulsoBase(), itens: [], pagamento: 'Pix' }),
    cliente: clienteAvulsoBase(),
    itens: [],
  }));
});

// POST /api/nfe/avulsa/preview
router.post('/avulsa/preview', auth(['admin', 'caixa']), (req, res) => {
  try {
    const itensNormalizados = normalizarItensAvulsosNFe(req.body?.itens || []);
    if (!itensNormalizados.ok) {
      return res.status(400).json({ erro: itensNormalizados.erro });
    }

    const clienteNormalizado = normalizarClienteAvulso(getDB(), req.body?.cliente || {});
    if (!clienteNormalizado.ok) {
      return res.status(400).json({ erro: clienteNormalizado.erro });
    }

    const documento = montarDocumentoFiscalAvulso({
      cliente: clienteNormalizado.cliente,
      itens: itensNormalizados.itens,
      pagamento: req.body?.pagamento || 'Pix',
    });

    res.json(serializarPreviaAvulsa({
      documento,
      cliente: clienteNormalizado.cliente,
      itens: itensNormalizados.itens,
    }));
  } catch (e) {
    console.error('[NF-e] POST /avulsa/preview:', e.message);
    res.status(500).json({ erro: 'Erro ao montar previa de NF-e avulsa' });
  }
});

// POST /api/nfe/avulsa
router.post('/avulsa', auth(['admin', 'caixa']), async (req, res) => {
  let respondido = false;
  const db = getDB();
  let notaEmitindo = null;
  let numero = null;
  let serie = null;
  let autorizadaNaSefaz = false;

  const guardTimeout = setTimeout(() => {
    if (!respondido) {
      respondido = true;
      console.error('[NF-e] Guard timeout disparado para NF-e avulsa');
      if (notaEmitindo && !autorizadaNaSefaz) {
        try {
          marcarNotaRejeitada(db, notaEmitindo.id, {
            motivo: 'Timeout aguardando resposta da SEFAZ',
          });
        } catch (_) {}
      }
      res.status(504).json({ erro: 'SEFAZ demorou demais para responder. Aguarde alguns instantes, atualize a tela e tente reemitir.' });
    }
  }, NFE_ROUTE_TIMEOUT_MS);

  try {
    const certificado = getCertificadoConfig();
    if (!certificado.pathCertificado || !certificado.senhaCertificado) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(500).json({ erro: 'Certificado NF-e nao configurado. Configure na tela fiscal ou no .env.' });
    }
    if (!getCnpjEmitente()) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(500).json({ erro: 'CNPJ do emitente nao configurado na tela fiscal ou no .env' });
    }

    const itensNormalizados = normalizarItensAvulsosNFe(req.body?.itens || []);
    if (!itensNormalizados.ok) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(400).json({ erro: itensNormalizados.erro });
    }

    const clienteNormalizado = normalizarClienteAvulso(db, req.body?.cliente || {});
    if (!clienteNormalizado.ok) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(400).json({ erro: clienteNormalizado.erro });
    }

    const emitente = getEmitenteConfig();
    const erroEmitenteFiscal = validarEmitenteFiscalNFe(emitente);
    if (!erroEmitenteFiscal.ok) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(400).json({ erro: erroEmitenteFiscal.erro });
    }

    const documento = montarDocumentoFiscalAvulso({
      cliente: clienteNormalizado.cliente,
      itens: itensNormalizados.itens,
      pagamento: req.body?.pagamento || 'Pix',
    });
    serie = getSerieNFe();
    numero = proximoNumero(db, serie);
    const ambiente = tpAmbAtual();

    notaEmitindo = criarNotaEmitindo(db, {
      origem: 'avulsa',
      ordemid: null,
      clienteid: clienteNormalizado.cliente.clienteid || null,
      cliente_snapshot: clienteNormalizado.cliente,
      emitente_snapshot: emitente,
      valortotal: documento.valortotal,
      descontovalor: documento.descontovalor,
      pagamento: documento.pagamento,
      ambiente,
      numero,
      serie,
      criadopor: req.user?.id || null,
    });

    const payload = montarNFe({
      ordem: {
        valortotal: documento.valortotal,
        descontovalor: documento.descontovalor,
        pagamento: documento.pagamento,
      },
      itens: documento.itens,
      cliente: clienteNormalizado.cliente,
      emitente,
      numero: parseInt(numero, 10),
      serie,
      ambiente,
      autXML: clienteNormalizado.cliente?.cpf ? getAutXmlParaNFe(clienteNormalizado.cliente.cpf) : [],
    });

    const wizard = await getNFEWizard();
    let resultado;
    try {
      resultado = await callSEFAZ(() => wizard.NFE_Autorizacao({
        idLote: numero,
        indSinc: 1,
        NFe: payload,
      }));
    } catch (sefazErr) {
      console.error('[NF-e] Erro na chamada SEFAZ avulsa:', sefazErr.message);
      const sefazInfo = getSefazErrorInfo(sefazErr);
      marcarNotaRejeitada(db, notaEmitindo.id, {
        cstat: sefazInfo.cstat,
        motivo: sefazInfo.mensagem,
      });
      if (deveDevolverNumeroNFeAposFalhaAutorizacao(sefazInfo) && rejeicaoPermiteDevolverNumeroNFe(sefazInfo.cstat)) {
        devolverNumeroNFeRejeitada(db, serie, numero);
      }
      registrarEventoFiscal(db, {
        nfeid: notaEmitindo.id,
        ordemid: null,
        chave: notaEmitindo.chave || `NFE-${notaEmitindo.id}`,
        tipo: 'rejeicao',
        cstat: sefazInfo.cstat,
        motivo: sefazInfo.mensagem,
        texto: 'Erro de comunicacao com a SEFAZ durante emissao avulsa',
      });
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(sefazInfo.tipo === 'rejeicao' || sefazInfo.tipo === 'validacao_xml' ? 422 : 504).json({
          erro: sefazInfo.mensagem,
          tipo: sefazInfo.tipo,
          detalhe: sefazErr.message,
          contingencia: false,
        });
      }
      return;
    }

    let cStat = '', chave = '', protocolo = '', agora = new Date().toISOString();
    if (Array.isArray(resultado)) {
      const prot = resultado[0]?.protNFe?.infProt || resultado[0]?.infProt || resultado[0];
      cStat = String(prot?.cStat || '');
      chave = prot?.chNFe || '';
      protocolo = prot?.nProt || '';
      agora = prot?.dhRecbto || agora;
    } else {
      cStat = String(resultado?.cStat || resultado?.retEnviNFe?.protNFe?.infProt?.cStat || '');
      chave = resultado?.chNFe || resultado?.retEnviNFe?.protNFe?.infProt?.chNFe || '';
      protocolo = resultado?.nProt || resultado?.retEnviNFe?.protNFe?.infProt?.nProt || '';
      agora = resultado?.dhRecbto || agora;
    }

    if (cStat !== '100') {
      const motivo = resultado?.[0]?.protNFe?.infProt?.xMotivo
        || resultado?.xMotivo
        || resultado?.retEnviNFe?.xMotivo
        || resultado?.retEnviNFe?.protNFe?.infProt?.xMotivo
        || `cStat ${cStat || 'desconhecido'}`;
      const rejeicao = formatarRejeicaoSefaz({ cStat, xMotivo: motivo, contexto: 'autorizacao' });
      if (rejeicaoPermiteDevolverNumeroNFe(cStat)) {
        devolverNumeroNFeRejeitada(db, serie, numero);
      }
      const xmlRejeicao = serializarXmlFiscal(resultado);
      marcarNotaRejeitada(db, notaEmitindo.id, {
        cstat: cStat || null,
        motivo: rejeicao.mensagem,
        xml: xmlRejeicao,
        chave: chave || null,
      });
      registrarEventoFiscal(db, {
        nfeid: notaEmitindo.id,
        ordemid: null,
        chave: chave || notaEmitindo.chave || `NFE-${notaEmitindo.id}`,
        tipo: 'rejeicao',
        cstat: cStat || null,
        motivo: rejeicao.mensagem,
        texto: `Rejeicao de autorizacao NF-e avulsa. Retorno original: ${rejeicao.motivoOriginal}`,
        xml: xmlRejeicao,
      });
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(422).json({
          erro: rejeicao.mensagem,
          cStat,
          campo: rejeicao.campo,
          item: rejeicao.item,
          motivoOriginal: rejeicao.motivoOriginal,
        });
      }
      return;
    }

    const xmlAutorizacao = serializarXmlFiscal(resultado);
    autorizadaNaSefaz = true;
    db.transaction(() => {
      const itensSnapshot = documento.itens.map(({ id, ...item }) => item);
      substituirItensNota(db, notaEmitindo.id, itensSnapshot);
      marcarNotaAutorizada(db, notaEmitindo.id, {
        chave,
        protocolo,
        xml: xmlAutorizacao,
        emitida_em: agora,
      });
    })();

    if (chave) {
      salvarXmlDisco(`${chave}.xml`, xmlAutorizacao);
    }

    registrarEventoFiscal(db, {
      nfeid: notaEmitindo.id,
      ordemid: null,
      chave,
      tipo: 'autorizacao',
      protocolo,
      cstat: cStat,
      motivo: 'NF-e avulsa autorizada',
      xml: xmlAutorizacao,
      createdat: agora,
    });

    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.json({ ok: true, numero, serie, chave, protocolo, emitida_em: agora, origem: 'avulsa' });
    }
  } catch (e) {
    console.error('[NF-e] ERRO POST /avulsa:', e.message, e.stack);
    if (notaEmitindo && !autorizadaNaSefaz) {
      try {
        marcarNotaRejeitada(db, notaEmitindo.id, {
          motivo: e.message || 'Erro interno ao emitir NF-e avulsa',
        });
      } catch (_) {}
    }
    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.status(500).json({ erro: 'Erro interno ao emitir NF-e avulsa', detalhe: e.message });
    }
  }
});

// GET /api/nfe/:chave/eventos
router.get('/:chave/eventos', auth(['admin', 'caixa']), (req, res) => {
  const { chave } = req.params;
  if (!chave || !/^\d{44}$/.test(chave)) {
    return res.status(400).json({ erro: 'Chave NF-e invalida. Deve conter exatamente 44 digitos.' });
  }

  try {
    const db = getDB();
    const nota = resolverNotaPorChave(db, chave);
    if (!nota) {
      return res.status(404).json({ erro: 'NF-e nao encontrada para esta chave' });
    }

    const eventos = listarEventosNota(db, nota);

    res.json({ eventos });
  } catch (e) {
    console.error('[NF-e] GET /:chave/eventos:', e.message);
    res.status(500).json({ erro: 'Erro ao listar eventos da NF-e' });
  }
});

// GET /api/nfe/ordem/:ordemId/eventos
router.get('/ordem/:ordemId/eventos', auth(['admin', 'caixa']), (req, res) => {
  const ordemId = Number(req.params.ordemId);
  if (!Number.isInteger(ordemId) || ordemId <= 0) {
    return res.status(400).json({ erro: 'OS invalida.' });
  }

  try {
    const db = getDB();
    const os = db.prepare('SELECT id FROM ordens WHERE id = ? AND deletedat IS NULL').get(ordemId);
    if (!os) {
      return res.status(404).json({ erro: 'OS nao encontrada.' });
    }

    const eventos = db.prepare(`
      SELECT id, ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, texto, createdat,
             CASE WHEN xml IS NOT NULL AND length(xml) > 0 THEN 1 ELSE 0 END AS tem_xml
      FROM nfe_eventos
      WHERE ordemid = ?
      ORDER BY createdat ASC, id ASC
    `).all(ordemId);

    res.json({ eventos });
  } catch (e) {
    console.error('[NF-e] GET /ordem/:ordemId/eventos:', e.message);
    res.status(500).json({ erro: 'Erro ao listar eventos fiscais da OS' });
  }
});

// GET /api/nfe/:chave/xml/autorizacao
router.get('/:chave/xml/autorizacao', auth(['admin', 'caixa']), (req, res) => {
  const { chave } = req.params;
  if (!chave || !/^\d{44}$/.test(chave)) {
    return res.status(400).json({ erro: 'Chave NF-e invalida. Deve conter exatamente 44 digitos.' });
  }

  try {
    const nota = resolverNotaPorChave(getDB(), chave);
    if (!nota) {
      return res.status(404).json({ erro: 'NF-e nao encontrada para esta chave' });
    }
    if (!nota.xml) {
      return res.status(404).json({ erro: 'XML de autorizacao nao encontrado para esta NF-e' });
    }

    const xml = extrairXmlFiscal(nota.xml);
    if (!xml) {
      return res.status(422).json({ erro: 'XML de autorizacao salvo em formato invalido para esta NF-e' });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameSeguro(chave)}.xml"`);
    res.send(xml);
  } catch (e) {
    console.error('[NF-e] GET /:chave/xml/autorizacao:', e.message);
    res.status(500).json({ erro: 'Erro ao baixar XML de autorizacao' });
  }
});

// GET /api/nfe/:chave/danfe
router.get('/:chave/danfe', auth(['admin', 'caixa']), (req, res) => {
  const { chave } = req.params;
  if (!chave || !/^\d{44}$/.test(chave)) {
    return res.status(400).json({ erro: 'Chave NF-e invalida. Deve conter exatamente 44 digitos.' });
  }

  try {
    const nota = resolverNotaPorChave(getDB(), chave);
    if (!nota) {
      return res.status(404).json({ erro: 'NF-e nao encontrada para esta chave' });
    }
    if (!nota.xml) {
      return res.status(404).json({ erro: 'XML de autorizacao nao encontrado para esta NF-e' });
    }

    const xml = extrairXmlFiscal(nota.xml);
    if (!xml) {
      return res.status(422).json({ erro: 'XML de autorizacao salvo em formato invalido para esta NF-e' });
    }

    const html = renderDanfeHtml(xml);
    sendPrintHtml(res, `danfe-${filenameSeguro(chave)}.html`, html);
  } catch (e) {
    console.error('[NF-e] GET /:chave/danfe:', e.message);
    res.status(e.statusCode || 500).json({ erro: e.statusCode ? e.message : 'Erro ao gerar DANFE' });
  }
});

// GET /api/nfe/eventos/:eventoId/xml
router.get('/eventos/:eventoId/xml', auth(['admin', 'caixa']), (req, res) => {
  const eventoId = Number(req.params.eventoId);
  if (!Number.isInteger(eventoId) || eventoId <= 0) {
    return res.status(400).json({ erro: 'Evento fiscal invalido.' });
  }

  try {
    const evento = getDB().prepare(`
      SELECT e.id, e.chave, e.tipo, e.nseqevento, e.xml, e.ordemid, o.deletedat
      FROM nfe_eventos e
      LEFT JOIN ordens o ON o.id = e.ordemid
      WHERE e.id = ?
    `).get(eventoId);

    if (!evento) {
      return res.status(404).json({ erro: 'Evento fiscal nao encontrado.' });
    }
    if (req.user.role !== 'admin' && (!evento.ordemid || evento.deletedat)) {
      return res.status(404).json({ erro: 'Evento fiscal nao encontrado.' });
    }
    if (!evento.xml) {
      return res.status(404).json({ erro: 'XML nao encontrado para este evento fiscal.' });
    }
    const xml = extrairXmlFiscal(evento.xml);
    if (!xml) {
      return res.status(422).json({ erro: 'XML salvo em formato invalido para este evento fiscal.' });
    }

    const sufixo = evento.tipo === 'cce'
      ? `cce-${pad(evento.nseqevento, 2)}`
      : evento.tipo;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameSeguro(evento.chave)}-${filenameSeguro(sufixo)}.xml"`);
    res.send(xml);
  } catch (e) {
    console.error('[NF-e] GET /eventos/:eventoId/xml:', e.message);
    res.status(500).json({ erro: 'Erro ao baixar XML do evento fiscal' });
  }
});

// GET /api/nfe/emitir/:id/preview
router.get('/emitir/:id/preview', auth(['admin', 'caixa']), (req, res) => {
  try {
    const db = getDB();
    const os = buscarOrdemParaNFe(db, req.params.id);
    const itens = os ? buscarItensParaNFe(db, os.id) : [];
    const erro = validarOrdemEmitivel(os, itens);
    if (erro) return res.status(erro.status).json({ erro: erro.erro });

    res.json(serializarPreviaEmissaoNFe({
      os,
      itens,
      ambiente: tpAmbAtual(),
      serie: getSerieNFe(),
    }));
  } catch (e) {
    console.error('[NF-e] GET /emitir/:id/preview:', e.message);
    res.status(500).json({ erro: 'Erro ao montar previa de emissao da NF-e' });
  }
});

// DELETE /api/nfe/:id  (soft delete operacional da NF-e)
router.delete('/:id', auth(['admin']), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID de NF-e invalido' });
  }

  try {
    const db = getDB();
    const nota = resolverNotaPorId(db, id, { includeDeleted: true });

    if (!nota) return res.status(404).json({ erro: 'NF-e nao encontrada' });
    if (nota.deletedat) return res.json({ ok: true, jaNaLixeira: true });
    if (!STATUS_NFE_LIXEIRA.includes(nota.status)) {
      return res.status(409).json({ erro: 'NF-e autorizada ou cancelada nao pode ser movida para a lixeira' });
    }

    const reason = String(req.body?.motivo || req.body?.reason || 'Ocultada da tela fiscal').trim().slice(0, 250);
    moverNotaParaLixeira(db, id, req.user?.id || null, reason);

    res.json({ ok: true });
  } catch (e) {
    console.error('[NF-e] DELETE /:id:', e.message);
    res.status(500).json({ erro: 'Erro ao mover NF-e para a lixeira' });
  }
});

// POST /api/nfe/:id/restore
router.post('/:id/restore', auth(['admin']), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID de NF-e invalido' });
  }

  try {
    const db = getDB();
    const nota = resolverNotaPorId(db, id, { includeDeleted: true });

    if (!nota || !nota.deletedat) return res.status(404).json({ erro: 'NF-e nao encontrada na lixeira' });

    restaurarNotaDaLixeira(db, id);

    res.json({ ok: true });
  } catch (e) {
    console.error('[NF-e] POST /:id/restore:', e.message);
    res.status(500).json({ erro: 'Erro ao restaurar NF-e' });
  }
});

// POST /api/nfe/emitir/:id
router.post('/emitir/:id', auth(['admin', 'caixa']), async (req, res) => {
  let respondido = false;
  const db = getDB();
  const osId = req.params.id;
  let notaEmitindo = null;
  let numero = null;
  let serie = null;
  let autorizadaNaSefaz = false;

  const guardTimeout = setTimeout(() => {
    if (!respondido) {
      respondido = true;
      console.error(`[NF-e] Guard timeout disparado para OS#${osId}`);
      if (notaEmitindo && !autorizadaNaSefaz) {
        try {
          marcarNotaRejeitada(db, notaEmitindo.id, {
            motivo: 'Timeout aguardando resposta da SEFAZ',
          });
        } catch (_) {}
      }
      res.status(504).json({ erro: 'SEFAZ demorou demais para responder. Aguarde alguns instantes, atualize a tela e tente reemitir.' });
    }
  }, NFE_ROUTE_TIMEOUT_MS);

  try {
    const certificado = getCertificadoConfig();
    if (!certificado.pathCertificado || !certificado.senhaCertificado) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(500).json({ erro: 'Certificado NF-e nao configurado. Configure na tela fiscal ou no .env.' });
    }
    if (!getCnpjEmitente()) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(500).json({ erro: 'CNPJ do emitente nao configurado na tela fiscal ou no .env' });
    }

    const os = buscarOrdemParaNFe(db, osId);
    const itensBase = os ? buscarItensParaNFe(db, os.id) : [];
    const erroOrdem = validarOrdemEmitivel(os, itensBase);
    if (erroOrdem) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(erroOrdem.status).json({ erro: erroOrdem.erro });
    }

    const overrides = req.body?.itens || req.body?.itensFiscal || [];
    const itensComOverrides = aplicarOverridesItensNFe(itensBase, overrides);
    if (!itensComOverrides.ok) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(400).json({ erro: itensComOverrides.erro });
    }
    const erroItensFiscais = validarItensFiscaisNFe(itensComOverrides.itens);
    if (!erroItensFiscais.ok) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(400).json({ erro: erroItensFiscais.erro });
    }

    const clienteComOverrides = aplicarOverrideClienteNFe(os, req.body?.cliente);
    if (!clienteComOverrides.ok) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(400).json({ erro: clienteComOverrides.erro });
    }

    const emitente = getEmitenteConfig();
    const erroClienteFiscal = validarClienteFiscalNFe(clienteComOverrides.cliente);
    if (!erroClienteFiscal.ok) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(400).json({ erro: erroClienteFiscal.erro });
    }
    const erroEmitenteFiscal = validarEmitenteFiscalNFe(emitente);
    if (!erroEmitenteFiscal.ok) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(400).json({ erro: erroEmitenteFiscal.erro });
    }

    const notaAtiva = buscarNotaAtivaParaOrdem(db, os.id);
    if (notaAtiva) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(409).json({
        erro: 'NF-e ja autorizada ou em emissao para esta OS'
      });
    }
    serie = getSerieNFe();
    numero = proximoNumero(db, serie);
    const ambiente = tpAmbAtual();
    notaEmitindo = criarNotaEmitindo(db, {
      origem: 'ordem',
      ordemid: os.id,
      clienteid: os.clienteid || null,
      cliente_snapshot: clienteComOverrides.cliente,
      emitente_snapshot: emitente,
      valortotal: Number(os.valortotal || 0),
      descontovalor: Number(os.descontovalor || 0),
      pagamento: os.pagamento || 'Pix',
      ambiente,
      numero,
      serie,
      criadopor: req.user?.id || null,
    });

    const payload = montarNFe({
      ordem:    os,
      itens:    itensComOverrides.itens,
      cliente:  clienteComOverrides.cliente,
      emitente,
      numero:   parseInt(numero, 10),
      serie,
      ambiente,
      autXML:   getAutXmlParaNFe(clienteComOverrides.cliente.cpf),
    });

    const tpAmbLabel = ambiente === 1 ? '1(PROD)' : '2(HOMOL)';
    console.log(`[NF-e] Iniciando emissao OS#${os.id} numero=${numero} tpAmb=${tpAmbLabel}`);
    console.log('[NF-e] Payload ide:', JSON.stringify(payload.infNFe.ide));
    console.log(`[NF-e] Payload pronto itens=${payload.infNFe.det?.length || 0}`);

    const wizard = await getNFEWizard();
    let resultado;
    try {
      resultado = await callSEFAZ(() => wizard.NFE_Autorizacao({
        idLote:  numero,
        indSinc: 1,
        NFe:     payload,
      }));
    } catch (sefazErr) {
      console.error('[NF-e] Erro na chamada SEFAZ:', sefazErr.message);
      const sefazInfo = getSefazErrorInfo(sefazErr);
      marcarNotaRejeitada(db, notaEmitindo.id, {
        cstat: sefazInfo.cstat,
        motivo: sefazInfo.mensagem,
      });
      if (deveDevolverNumeroNFeAposFalhaAutorizacao(sefazInfo) && rejeicaoPermiteDevolverNumeroNFe(sefazInfo.cstat)) {
        devolverNumeroNFeRejeitada(db, serie, numero);
      }
      registrarEventoFiscal(db, {
        nfeid: notaEmitindo.id,
        ordemid: os.id,
        chave: notaEmitindo.chave || `NFE-${notaEmitindo.id}`,
        tipo: 'rejeicao',
        cstat: sefazInfo.cstat,
        motivo: sefazInfo.mensagem,
        texto: 'Erro de comunicacao com a SEFAZ durante emissao',
      });
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(sefazInfo.tipo === 'rejeicao' || sefazInfo.tipo === 'validacao_xml' ? 422 : 504).json({
          erro: sefazInfo.mensagem,
          tipo: sefazInfo.tipo,
          detalhe: sefazErr.message,
          contingencia: false,
        });
      }
      return;
    }

    console.log(`[NF-e] Resposta SEFAZ recebida tipo=${Array.isArray(resultado) ? 'array' : typeof resultado}`);

    let cStat = '', chave = '', protocolo = '', agora = new Date().toISOString();

    if (Array.isArray(resultado)) {
      const prot = resultado[0]?.protNFe?.infProt || resultado[0]?.infProt || resultado[0];
      cStat     = String(prot?.cStat    || '');
      chave     = prot?.chNFe           || '';
      protocolo = prot?.nProt           || '';
      agora     = prot?.dhRecbto        || agora;
    } else {
      cStat     = String(resultado?.cStat || resultado?.retEnviNFe?.protNFe?.infProt?.cStat || '');
      chave     = resultado?.chNFe        || resultado?.retEnviNFe?.protNFe?.infProt?.chNFe || '';
      protocolo = resultado?.nProt        || resultado?.retEnviNFe?.protNFe?.infProt?.nProt || '';
      agora     = resultado?.dhRecbto     || agora;
    }

    const autorizado = cStat === '100';

    if (!autorizado) {
      const motivo = resultado?.[0]?.protNFe?.infProt?.xMotivo
        || resultado?.xMotivo
        || resultado?.retEnviNFe?.xMotivo
        || resultado?.retEnviNFe?.protNFe?.infProt?.xMotivo
        || `cStat ${cStat || 'desconhecido'}`;
      const rejeicao = formatarRejeicaoSefaz({ cStat, xMotivo: motivo, contexto: 'autorizacao' });
      if (rejeicaoPermiteDevolverNumeroNFe(cStat)) {
        devolverNumeroNFeRejeitada(db, serie, numero);
      }
      const xmlRejeicao = serializarXmlFiscal(resultado);
      marcarNotaRejeitada(db, notaEmitindo.id, {
        cstat: cStat || null,
        motivo: rejeicao.mensagem,
        xml: xmlRejeicao,
        chave: chave || null,
      });
      registrarEventoFiscal(db, {
        nfeid: notaEmitindo.id,
        ordemid: os.id,
        chave: chave || notaEmitindo.chave || `NFE-${notaEmitindo.id}`,
        tipo: 'rejeicao',
        cstat: cStat || null,
        motivo: rejeicao.mensagem,
        texto: `Rejeicao de autorizacao NF-e. Retorno original: ${rejeicao.motivoOriginal}`,
        xml: xmlRejeicao,
      });
      console.error(`[NF-e] Rejeitado OS#${os.id}: cStat=${cStat} motivo=${motivo}`);
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(422).json({
          erro: rejeicao.mensagem,
          cStat,
          campo: rejeicao.campo,
          item: rejeicao.item,
          motivoOriginal: rejeicao.motivoOriginal,
        });
      }
      return;
    }

    // Serializar XML da resposta para armazenamento (obrigação legal 5 anos)
    const xmlAutorizacao = serializarXmlFiscal(resultado);

    autorizadaNaSefaz = true;
    db.transaction(() => {
      substituirItensNota(db, notaEmitindo.id, itensComOverrides.itens);
      marcarNotaAutorizada(db, notaEmitindo.id, {
        chave,
        protocolo,
        xml: xmlAutorizacao,
        emitida_em: agora,
      });
    })();

    salvarClienteCadastroAposEmissao(db, os, clienteComOverrides.cliente);

    if (chave) {
      salvarXmlDisco(`${chave}.xml`, xmlAutorizacao);
    }

    registrarEventoFiscal(db, {
      nfeid: notaEmitindo.id,
      ordemid: os.id,
      chave,
      tipo: 'autorizacao',
      protocolo,
      cstat: cStat,
      motivo: 'NF-e autorizada',
      xml: xmlAutorizacao,
      createdat: agora,
    });

    console.log(`[NF-e] Autorizada OS#${os.id} chave=${chave} protocolo=${protocolo}`);
    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.json({ ok: true, numero, serie, chave, protocolo, emitida_em: agora });
    }

  } catch (e) {
    console.error('[NF-e] ERRO POST /emitir:', e.message, e.stack);
    if (notaEmitindo && !autorizadaNaSefaz) {
      try {
        marcarNotaRejeitada(db, notaEmitindo.id, {
          motivo: e.message || 'Erro interno ao emitir NF-e',
        });
      } catch (_) {}
    }
    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.status(500).json({ erro: 'Erro interno ao emitir NF-e', detalhe: e.message });
    }
  }
});

// POST /api/nfe/:chave/cce
// Body: { correcao: string (15 a 1000 chars) }
router.post('/:chave/cce', auth(['admin', 'caixa']), async (req, res) => {
  const { chave } = req.params;
  const correcao = String(req.body?.correcao || req.body?.texto || '').trim();

  if (!chave || !/^\d{44}$/.test(chave)) {
    return res.status(400).json({ erro: 'Chave NF-e invalida. Deve conter exatamente 44 digitos.' });
  }
  if (correcao.length < 15) {
    return res.status(400).json({ erro: 'Texto da Carta de Correcao deve ter no minimo 15 caracteres.' });
  }
  if (correcao.length > 1000) {
    return res.status(400).json({ erro: 'Texto da Carta de Correcao deve ter no maximo 1000 caracteres.' });
  }
  const certificado = getCertificadoConfig();
  if (!certificado.pathCertificado || !certificado.senhaCertificado) {
    return res.status(500).json({ erro: 'Certificado NF-e nao configurado. Configure na tela fiscal ou no .env.' });
  }

  const db = getDB();
  const nota = resolverNotaPorChave(db, chave);

  if (!nota) {
    return res.status(404).json({ erro: 'NF-e nao encontrada para esta chave' });
  }
  if (nota.status === 'cancelado') {
    return res.status(409).json({ erro: 'NF-e cancelada nao pode receber Carta de Correcao.' });
  }
  if (nota.status !== 'autorizado') {
    return res.status(422).json({ erro: `Carta de Correcao impossivel: nfe_status atual e '${nota.status}'` });
  }
  if (nota.createdat) {
    const emitidaEm = new Date(nota.createdat);
    const diffHoras = (Date.now() - emitidaEm.getTime()) / (1000 * 60 * 60);
    if (diffHoras > 720) {
      return res.status(422).json({
        erro: `Prazo de Carta de Correcao expirado. NF-e emitida ha ${diffHoras.toFixed(1)}h (limite: 720h).`
      });
    }
  }

  const last = db.prepare(`
    SELECT MAX(nseqevento) AS maxseq
    FROM nfe_eventos
    WHERE chave = ? AND tipo = 'cce'
  `).get(chave);
  const nSeqEvento = Number(last?.maxseq || 0) + 1;
  if (nSeqEvento > 20) {
    return res.status(422).json({ erro: 'Limite de 20 Cartas de Correcao atingido para esta NF-e.' });
  }

  let respondido = false;
  const guardTimeout = setTimeout(() => {
    if (!respondido) {
      respondido = true;
      console.error(`[NF-e] Guard timeout CC-e chave=${chave}`);
      res.status(504).json({ erro: 'SEFAZ demorou demais para responder. Aguarde alguns instantes, atualize a tela e tente novamente.' });
    }
  }, NFE_ROUTE_TIMEOUT_MS);

  try {
    const cnpj = getCnpjEmitente();
    const cOrgao = Number(chave.substring(0, 2));
    const dhEvento = dhEventoBRT();

    const eventoPayload = {
      idLote: Date.now(),
      modelo: '55',
      evento: [
        {
          cOrgao,
          tpAmb: tpAmbAtual(),
          CNPJ: cnpj,
          chNFe: chave,
          dhEvento,
          tpEvento: '110110',
          nSeqEvento,
          verEvento: '1.00',
          detEvento: {
            descEvento: 'Carta de Correcao',
            xCorrecao: correcao,
            xCondUso: CCE_COND_USO,
          },
        },
      ],
    };

    console.log(`[NF-e] Iniciando CC-e chave=${chave} seq=${nSeqEvento}`);

    const wizard = await getNFEWizard();
    let resultado;
    try {
      resultado = await callSEFAZ(() => wizard.NFE_CartaDeCorrecao(eventoPayload));
    } catch (sefazErr) {
      console.error('[NF-e] Erro SEFAZ CC-e:', sefazErr.message);
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(504).json({ erro: 'Sem resposta da SEFAZ', detalhe: sefazErr.message });
      }
      return;
    }

    console.log(`[NF-e] Resposta CC-e recebida tipo=${Array.isArray(resultado) ? 'array' : typeof resultado}`);

    const parsed = parseRetEvento(resultado, dhEvento);
    const autorizado = parsed.cStat === '135';

    if (!autorizado) {
      const xMotivo = parsed.xMotivo || `cStat ${parsed.cStat || 'desconhecido'}`;
      const rejeicao = formatarRejeicaoSefaz({ cStat: parsed.cStat, xMotivo, contexto: 'cce' });
      console.error(`[NF-e] CC-e rejeitada: cStat=${parsed.cStat} motivo=${xMotivo}`);
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(422).json({
          erro: rejeicao.mensagem,
          cStat: parsed.cStat,
          campo: rejeicao.campo,
          item: rejeicao.item,
          motivoOriginal: rejeicao.motivoOriginal,
        });
      }
      return;
    }

    const xmlEvento = serializarXmlFiscal(resultado);

    registrarEventoFiscal(db, {
      nfeid: nota.id,
      ordemid: nota.ordemid,
      chave,
      tipo: 'cce',
      nseqevento: nSeqEvento,
      protocolo: parsed.protocolo,
      cstat: parsed.cStat,
      motivo: parsed.xMotivo,
      texto: correcao,
      xml: xmlEvento,
      createdat: parsed.dhEvento,
    });

    salvarXmlDisco(`${chave}-cce-${pad(nSeqEvento, 2)}.xml`, xmlEvento);

    console.log(`[NF-e] CC-e registrada chave=${chave} seq=${nSeqEvento} protocolo=${parsed.protocolo}`);

    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.json({
        ok: true,
        chave,
        sequencia: nSeqEvento,
        protocolo: parsed.protocolo,
        dhEvento: parsed.dhEvento,
        cStat: parsed.cStat,
      });
    }
  } catch (e) {
    console.error('[NF-e] ERRO POST /:chave/cce:', e.message, e.stack);
    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.status(500).json({ erro: 'Erro interno ao emitir Carta de Correcao', detalhe: e.message });
    }
  }
});

// POST /api/nfe/:chave/cancelar
// Body: { motivo: string (min 15 chars) }
router.post('/:chave/cancelar', auth(['admin', 'caixa']), async (req, res) => {
  const { chave } = req.params;
  const { motivo } = req.body || {};

  if (!chave || !/^\d{44}$/.test(chave)) {
    return res.status(400).json({ erro: 'Chave NF-e invalida. Deve conter exatamente 44 digitos.' });
  }

  const motivoStr = (motivo || '').trim();
  if (motivoStr.length < 15) {
    return res.status(400).json({ erro: 'Motivo do cancelamento deve ter no minimo 15 caracteres.' });
  }

  const certificado = getCertificadoConfig();
  if (!certificado.pathCertificado || !certificado.senhaCertificado) {
    return res.status(500).json({ erro: 'Certificado NF-e nao configurado. Configure na tela fiscal ou no .env.' });
  }

  const db = getDB();

  const nota = resolverNotaPorChave(db, chave);

  if (!nota) {
    return res.status(404).json({ erro: 'NF-e nao encontrada para esta chave' });
  }
  if (nota.status === 'cancelado') {
    return res.status(409).json({ erro: 'NF-e ja cancelada' });
  }
  if (nota.status !== 'autorizado') {
    return res.status(422).json({ erro: `Cancelamento impossivel: nfe_status atual e '${nota.status}'` });
  }
  if (!nota.protocolo) {
    return res.status(422).json({ erro: 'Protocolo de autorizacao ausente no banco — nao e possivel cancelar' });
  }

  if (tpAmbAtual() === 1 && nota.createdat) {
    const emitidaEm = new Date(nota.createdat);
    const diffHoras = (Date.now() - emitidaEm.getTime()) / (1000 * 60 * 60);
    if (diffHoras > 24) {
      return res.status(422).json({
        erro: `Prazo de cancelamento expirado. NF-e emitida ha ${diffHoras.toFixed(1)}h (limite: 24h).`
      });
    }
  }

  let respondido = false;
  const guardTimeout = setTimeout(() => {
    if (!respondido) {
      respondido = true;
      console.error(`[NF-e] Guard timeout cancelamento chave=${chave}`);
      res.status(504).json({ erro: 'SEFAZ demorou demais para responder. Aguarde alguns instantes, atualize a tela e tente novamente.' });
    }
  }, NFE_ROUTE_TIMEOUT_MS);

  try {
    const cnpj  = getCnpjEmitente();
    const cOrgao = Number(chave.substring(0, 2));
    const dhEvento = dhEventoBRT();

    const eventoPayload = {
      idLote: Date.now(),
      modelo: '55',
      evento: [
        {
          cOrgao,
          tpAmb: tpAmbAtual(),
          CNPJ:       cnpj,
          chNFe:      chave,
          dhEvento,
          tpEvento:  '110111',
          nSeqEvento: 1,
          verEvento:  '1.00',
          detEvento: {
            descEvento: 'Cancelamento',
            nProt:      nota.protocolo,
            xJust:      motivoStr,
          },
        },
      ],
    };

    console.log(`[NF-e] Iniciando cancelamento chave=${chave} protocolo=${nota.protocolo}`);

    const wizard = await getNFEWizard();
    let resultado;
    try {
      resultado = await callSEFAZ(() => wizard.NFE_Cancelamento(eventoPayload));
    } catch (sefazErr) {
      console.error('[NF-e] Erro SEFAZ cancelamento:', sefazErr.message);
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(504).json({ erro: 'Sem resposta da SEFAZ', detalhe: sefazErr.message });
      }
      return;
    }

    console.log(`[NF-e] Resposta cancelamento recebida tipo=${Array.isArray(resultado) ? 'array' : typeof resultado}`);

    const parsed = parseRetEvento(resultado, dhEvento);
    const cStatResp    = parsed.cStat;
    const nProtResp    = parsed.protocolo;
    const dhEventoResp = parsed.dhEvento;

    const cancelado = ['135', '155'].includes(cStatResp);

    if (!cancelado) {
      const xMotivo = parsed.xMotivo || `cStat ${cStatResp || 'desconhecido'}`;
      const rejeicao = formatarRejeicaoSefaz({ cStat: cStatResp, xMotivo, contexto: 'cancelamento' });
      console.error(`[NF-e] Cancelamento rejeitado: cStat=${cStatResp} motivo=${xMotivo}`);
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(422).json({
          erro: rejeicao.mensagem,
          cStat: cStatResp,
          campo: rejeicao.campo,
          item: rejeicao.item,
          motivoOriginal: rejeicao.motivoOriginal,
        });
      }
      return;
    }

    marcarNotaCancelada(db, nota.id, {
      cancelado_em: dhEventoResp,
      protocolo: nProtResp,
      motivo: motivoStr,
    });

    const xmlEvento = serializarXmlFiscal(resultado);

    registrarEventoFiscal(db, {
      nfeid: nota.id,
      ordemid: nota.ordemid,
      chave,
      tipo: 'cancelamento',
      protocolo: nProtResp,
      cstat: cStatResp,
      motivo: parsed.xMotivo,
      texto: motivoStr,
      xml: xmlEvento,
      createdat: dhEventoResp,
    });

    salvarXmlDisco(`${chave}-canc.xml`, xmlEvento);

    console.log(`[NF-e] Cancelamento registrado chave=${chave} nProtCanc=${nProtResp}`);

    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.json({
        ok:        true,
        chave,
        protocolo: nProtResp,
        dhEvento:  dhEventoResp,
        cStat:     cStatResp,
      });
    }

  } catch (e) {
    console.error('[NF-e] ERRO POST /:chave/cancelar:', e.message, e.stack);
    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.status(500).json({ erro: 'Erro interno ao cancelar NF-e', detalhe: e.message });
    }
  }
});

module.exports = router;
