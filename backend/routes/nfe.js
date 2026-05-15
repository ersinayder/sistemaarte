'use strict';
const express       = require('express');
const router        = express.Router();
const path          = require('path');
const fs            = require('fs');
const { getDB }     = require('../database');
const { auth }      = require('../middlewares/auth');
const { getNFEWizard, callSEFAZ } = require('../utils/nfe');
const { montarNFe } = require('../domain/nfeRules');

// Diretório canônico para XMLs — obrigação legal 5 anos
const NFE_XMLS_DIR = path.resolve(__dirname, '..', 'data', 'nfe_xmls');

function pad(n, len) { return String(n).padStart(len, '0'); }

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

function emitente() {
  return {
    CNPJ:     (process.env.NFE_CNPJ_EMITENTE || '').replace(/\D/g, ''),
    xNome:    (process.env.NFE_RAZAO_SOCIAL   || 'EMITENTE').toUpperCase(),
    xFant:    (process.env.NFE_NOME_FANTASIA  || '').toUpperCase(),
    enderEmit: {
      xLgr:    process.env.NFE_LOGRADOURO    || '',
      nro:     process.env.NFE_NUMERO        || 'S/N',
      xBairro: process.env.NFE_BAIRRO        || '',
      cMun:    process.env.NFE_COD_MUNICIPIO || '3127701',
      xMun:    process.env.NFE_MUNICIPIO     || 'IPATINGA',
      UF:      'MG',
      CEP:     (process.env.NFE_CEP  || '').replace(/\D/g, ''),
      fone:    (process.env.NFE_FONE || '').replace(/\D/g, ''),
    },
    IE:  (process.env.NFE_IE_EMITENTE || '').replace(/\D/g, ''),
    CRT: process.env.NFE_CRT || '1',
  };
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

// GET /api/nfe
router.get('/', auth(), (req, res) => {
  try {
    const rows = getDB().prepare(`
      SELECT o.*, c.name AS clientenome
      FROM ordens o
      LEFT JOIN clientes c ON o.clienteid = c.id
      WHERE o.nfe_status IS NOT NULL
      ORDER BY o.nfe_emitida_em DESC
    `).all();
    res.json({ notas: rows });
  } catch (e) {
    console.error('[NF-e] GET /:', e.message);
    res.status(500).json({ erro: 'Erro ao listar notas fiscais' });
  }
});

// POST /api/nfe/emitir/:id
router.post('/emitir/:id', auth(), async (req, res) => {
  let respondido = false;
  const db = getDB();
  const osId = req.params.id;

  const guardTimeout = setTimeout(() => {
    if (!respondido) {
      respondido = true;
      console.error(`[NF-e] Guard timeout disparado para OS#${osId}`);
      // Libera mutex se ainda estiver 'emitindo' (guard disparou antes da resposta SEFAZ)
      try { db.prepare(`UPDATE ordens SET nfe_status='rejeitado' WHERE id=? AND nfe_status='emitindo'`).run(osId); } catch(_) {}
      res.status(504).json({ erro: 'Timeout interno: SEFAZ sem resposta apos 40s' });
    }
  }, 40_000);

  try {
    if (!process.env.NFE_CERT_PATH || !process.env.NFE_CERT_PASSWORD) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(500).json({ erro: 'NFE_CERT_PATH ou NFE_CERT_PASSWORD ausentes no .env' });
    }
    if (!process.env.NFE_CNPJ_EMITENTE) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(500).json({ erro: 'NFE_CNPJ_EMITENTE nao configurado no .env' });
    }

    const os = db.prepare(`
      SELECT o.*, c.name AS clientenome, c.cpf, c.logradouro,
             c.numero AS c_numero, c.bairro, c.cidade, c.uf, c.cep
      FROM ordens o
      LEFT JOIN clientes c ON o.clienteid = c.id
      WHERE o.id = ?
    `).get(osId);

    if (!os) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(404).json({ erro: 'OS nao encontrada' });
    }
    if (os.nfe_status === 'autorizado') {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(409).json({ erro: 'NF-e ja autorizada para esta OS' });
    }
    if (!['Pronto', 'Entregue'].includes(os.status)) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(422).json({ erro: `Status invalido para emissao: ${os.status}` });
    }

    const itens = db.prepare(`
      SELECT oi.*, p.nome, p.ncm, p.cfop, p.unidade, p.origem_fiscal, p.csosn
      FROM ordem_itens oi
      LEFT JOIN produtos p ON oi.produto_id = p.id
      WHERE oi.ordemid = ?
    `).all(os.id);

    if (!itens.length) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(422).json({ erro: 'OS nao possui itens - nao e possivel emitir NF-e' });
    }

    // ── MUTEX: tenta adquirir o lock de emissao ────────────────────────────────
    // UPDATE só executa se o status NÃO for 'emitindo' nem 'autorizado'.
    // Se changes === 0, outro processo já pegou o lock — rejeita com 409.
    const lock = db.prepare(`
      UPDATE ordens
      SET nfe_status = 'emitindo'
      WHERE id = ? AND (nfe_status IS NULL OR nfe_status NOT IN ('emitindo', 'autorizado'))
    `).run(osId);

    if (lock.changes === 0) {
      clearTimeout(guardTimeout); respondido = true;
      return res.status(409).json({
        erro: 'NF-e ja esta sendo emitida ou ja foi autorizada. Aguarde e tente novamente.'
      });
    }
    // ── fim do mutex ───────────────────────────────────────────────────────────

    const serie  = '1';
    const numero = proximoNumero(db, serie);

    const payload = montarNFe({
      ordem:    os,
      itens,
      cliente:  os,
      emitente: emitente(),
      numero:   parseInt(numero, 10),
      serie,
    });

    const tpAmbLabel = process.env.NFE_AMBIENTE === 'producao' ? '1(PROD)' : '2(HOMOL)';
    console.log(`[NF-e] Iniciando emissao OS#${os.id} numero=${numero} tpAmb=${tpAmbLabel}`);
    console.log('[NF-e] Payload ide:', JSON.stringify(payload.infNFe.ide));
    console.log('[NF-e] Payload dest:', JSON.stringify(payload.infNFe.dest));
    console.log('[NF-e] Payload det[0]:', JSON.stringify(payload.infNFe.det?.[0]));

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
      db.prepare(`UPDATE ordens SET nfe_status='rejeitado' WHERE id=? AND nfe_status='emitindo'`).run(osId);
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(504).json({ erro: 'Sem resposta da SEFAZ', detalhe: sefazErr.message });
      }
      return;
    }

    console.log(`[NF-e] Resposta SEFAZ (500 chars):`, JSON.stringify(resultado).slice(0, 500));

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
      db.prepare(`UPDATE ordens SET nfe_status='rejeitado' WHERE id=?`).run(osId);
      console.error(`[NF-e] Rejeitado OS#${os.id}: cStat=${cStat} motivo=${motivo}`);
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(422).json({ erro: `SEFAZ rejeitou: ${motivo}`, cStat });
      }
      return;
    }

    // Serializar XML da resposta para armazenamento (obrigação legal 5 anos)
    const xmlAutorizacao = typeof resultado === 'string'
      ? resultado
      : JSON.stringify(resultado, null, 2);

    // Salvar em banco (campo nfe_xml) + arquivo em backend/data/nfe_xmls/{chave}.xml
    db.prepare(`
      UPDATE ordens SET
        nfe_status     = 'autorizado',
        nfe_numero     = ?,
        nfe_serie      = ?,
        nfe_chave      = ?,
        nfe_protocolo  = ?,
        nfe_emitida_em = ?,
        nfe_xml        = ?
      WHERE id = ?
    `).run(numero, serie, chave, protocolo, agora, xmlAutorizacao, osId);

    if (chave) {
      salvarXmlDisco(`${chave}.xml`, xmlAutorizacao);
    }

    console.log(`[NF-e] Autorizada OS#${os.id} chave=${chave} protocolo=${protocolo}`);
    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.json({ ok: true, numero, serie, chave, protocolo, emitida_em: agora });
    }

  } catch (e) {
    console.error('[NF-e] ERRO POST /emitir:', e.message, e.stack);
    // Garante que o mutex nunca fique travado em 'emitindo' após exceção inesperada
    try { db.prepare(`UPDATE ordens SET nfe_status='rejeitado' WHERE id=? AND nfe_status='emitindo'`).run(osId); } catch(_) {}
    if (!respondido) {
      clearTimeout(guardTimeout); respondido = true;
      res.status(500).json({ erro: 'Erro interno ao emitir NF-e', detalhe: e.message });
    }
  }
});

// POST /api/nfe/:chave/cancelar
// Body: { motivo: string (min 15 chars) }
router.post('/:chave/cancelar', auth(), async (req, res) => {
  const { chave } = req.params;
  const { motivo } = req.body || {};

  if (!chave || !/^\d{44}$/.test(chave)) {
    return res.status(400).json({ erro: 'Chave NF-e invalida. Deve conter exatamente 44 digitos.' });
  }

  const motivoStr = (motivo || '').trim();
  if (motivoStr.length < 15) {
    return res.status(400).json({ erro: 'Motivo do cancelamento deve ter no minimo 15 caracteres.' });
  }

  if (!process.env.NFE_CERT_PATH || !process.env.NFE_CERT_PASSWORD) {
    return res.status(500).json({ erro: 'NFE_CERT_PATH ou NFE_CERT_PASSWORD ausentes no .env' });
  }

  const db = getDB();

  const os = db.prepare(`SELECT * FROM ordens WHERE nfe_chave = ?`).get(chave);

  if (!os) {
    return res.status(404).json({ erro: 'NF-e nao encontrada para esta chave' });
  }
  if (os.nfe_status === 'cancelado') {
    return res.status(409).json({ erro: 'NF-e ja cancelada' });
  }
  if (os.nfe_status !== 'autorizado') {
    return res.status(422).json({ erro: `Cancelamento impossivel: nfe_status atual e '${os.nfe_status}'` });
  }
  if (!os.nfe_protocolo) {
    return res.status(422).json({ erro: 'Protocolo de autorizacao ausente no banco — nao e possivel cancelar' });
  }

  if (process.env.NFE_AMBIENTE === 'producao' && os.nfe_emitida_em) {
    const emitidaEm = new Date(os.nfe_emitida_em);
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
      res.status(504).json({ erro: 'Timeout interno: SEFAZ sem resposta apos 40s' });
    }
  }, 40_000);

  try {
    const cnpj  = (process.env.NFE_CNPJ_EMITENTE || '').replace(/\D/g, '');
    const tpAmb = process.env.NFE_AMBIENTE === 'producao' ? 1 : 2;

    const cOrgao = Number(chave.substring(0, 2));

    const now      = new Date();
    const brt      = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const dhEvento = brt.toISOString().replace(/\.\d{3}Z$/, '-03:00');

    const eventoPayload = {
      idLote: Date.now(),
      modelo: '55',
      evento: [
        {
          cOrgao,
          tpAmb,
          CNPJ:       cnpj,
          chNFe:      chave,
          dhEvento,
          tpEvento:  '110111',
          nSeqEvento: 1,
          verEvento:  '1.00',
          detEvento: {
            descEvento: 'Cancelamento',
            nProt:      os.nfe_protocolo,
            xJust:      motivoStr,
          },
        },
      ],
    };

    console.log(`[NF-e] Iniciando cancelamento chave=${chave} protocolo=${os.nfe_protocolo}`);
    console.log('[NF-e] eventoPayload:', JSON.stringify(eventoPayload));

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

    console.log(`[NF-e] Resposta cancelamento (500 chars):`, JSON.stringify(resultado).slice(0, 500));

    const retEvento =
      resultado?.[0]?.retEvento?.infEvento ||
      resultado?.retEnvEvento?.retEvento?.[0]?.infEvento ||
      resultado?.infEvento ||
      resultado?.[0] ||
      resultado;

    const cStatResp    = String(retEvento?.cStat || '');
    const nProtResp    = retEvento?.nProt        || '';
    const dhEventoResp = retEvento?.dhRegEvento  || dhEvento;

    const cancelado = ['135', '155'].includes(cStatResp);

    if (!cancelado) {
      const xMotivo = retEvento?.xMotivo || `cStat ${cStatResp || 'desconhecido'}`;
      console.error(`[NF-e] Cancelamento rejeitado: cStat=${cStatResp} motivo=${xMotivo}`);
      if (!respondido) {
        clearTimeout(guardTimeout); respondido = true;
        return res.status(422).json({ erro: `SEFAZ rejeitou cancelamento: ${xMotivo}`, cStat: cStatResp });
      }
      return;
    }

    db.prepare(`
      UPDATE ordens SET
        nfe_status           = 'cancelado',
        nfe_cancelado_em     = ?,
        nfe_cancel_protocolo = ?,
        nfe_cancel_motivo    = ?
      WHERE nfe_chave = ?
    `).run(dhEventoResp, nProtResp, motivoStr, chave);

    const xmlEvento = typeof resultado === 'string'
      ? resultado
      : JSON.stringify(resultado, null, 2);

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
