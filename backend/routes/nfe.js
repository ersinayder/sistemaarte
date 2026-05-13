'use strict';
const express          = require('express');
const router           = express.Router();
const { getDB }        = require('../database');
const { auth }         = require('../middlewares/auth');
const { getNFEWizard, callSEFAZ } = require('../utils/nfe');
const { montarNFe }    = require('../domain/nfeRules');

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

// GET /api/nfe
router.get('/', auth, (req, res) => {
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
router.post('/emitir/:id', auth, async (req, res) => {
  const db = getDB();
  try {
    const os = db.prepare(`
      SELECT o.*, c.name AS clientenome, c.cpf, c.logradouro,
             c.numero AS c_numero, c.bairro, c.cidade, c.uf, c.cep
      FROM ordens o
      LEFT JOIN clientes c ON o.clienteid = c.id
      WHERE o.id = ?
    `).get(req.params.id);

    if (!os)                                    return res.status(404).json({ erro: 'OS nao encontrada' });
    if (os.nfe_status === 'autorizado')          return res.status(409).json({ erro: 'NF-e ja autorizada para esta OS' });
    if (!['Pronto', 'Entregue'].includes(os.status))
      return res.status(422).json({ erro: `Status invalido para emissao: ${os.status}` });

    const itens = db.prepare(`
      SELECT oi.*, p.nome, p.ncm, p.cfop, p.unidade, p.origem_fiscal, p.csosn
      FROM ordem_itens oi
      LEFT JOIN produtos p ON oi.produto_id = p.id
      WHERE oi.ordem_id = ?
    `).all(os.id);

    if (!itens.length)
      return res.status(422).json({ erro: 'OS nao possui itens - nao e possivel emitir NF-e' });

    db.prepare(`UPDATE ordens SET nfe_status = 'emitindo' WHERE id = ?`).run(os.id);

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

    console.log(`[NF-e] Iniciando emissao OS#${os.id} numero=${numero} tpAmb=${process.env.NFE_AMBIENTE === 'producao' ? '1(PROD)' : '2(HOMOL)'}`);

    const wizard    = getNFEWizard();
    const resultado = await callSEFAZ(() => wizard.NFeAutorizacao({ NFe: payload }));

    console.log(`[NF-e] Resposta SEFAZ:`, JSON.stringify(resultado).slice(0, 300));

    const cStat      = String(resultado?.cStat || resultado?.retEnviNFe?.infRec?.cStat || '');
    const autorizado = cStat === '100';

    if (!autorizado) {
      const motivo = resultado?.xMotivo || resultado?.retEnviNFe?.xMotivo || `cStat ${cStat}`;
      db.prepare(`UPDATE ordens SET nfe_status = 'rejeitado' WHERE id = ?`).run(os.id);
      console.error(`[NF-e] Rejeitado OS#${os.id}: cStat=${cStat} motivo=${motivo}`);
      return res.status(422).json({ erro: `SEFAZ rejeitou: ${motivo}`, cStat });
    }

    const chave     = resultado.chNFe    || resultado.retEnviNFe?.protNFe?.infProt?.chNFe    || '';
    const protocolo = resultado.nProt    || resultado.retEnviNFe?.protNFe?.infProt?.nProt    || '';
    const agora     = resultado.dhRecbto || new Date().toISOString();

    db.prepare(`
      UPDATE ordens SET
        nfe_status     = 'autorizado',
        nfe_numero     = ?,
        nfe_serie      = ?,
        nfe_chave      = ?,
        nfe_protocolo  = ?,
        nfe_emitida_em = ?
      WHERE id = ?
    `).run(numero, serie, chave, protocolo, agora, os.id);

    console.log(`[NF-e] Autorizada OS#${os.id} chave=${chave} protocolo=${protocolo}`);
    res.json({ ok: true, numero, serie, chave, protocolo, emitida_em: agora });

  } catch (e) {
    console.error('[NF-e] ERRO POST /emitir:', e.message);
    try {
      db.prepare(`UPDATE ordens SET nfe_status = 'rejeitado' WHERE id = ? AND nfe_status = 'emitindo'`)
        .run(req.params.id);
    } catch (_) {}
    res.status(500).json({ erro: 'Erro interno ao emitir NF-e', detalhe: e.message });
  }
});

module.exports = router;
