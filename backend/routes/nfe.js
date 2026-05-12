'use strict';
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { auth }          = require('../middlewares/auth');
const { getNFEWizard }  = require('../utils/nfe');
const { montarNFe }     = require('../domain/nfeRules');
const db                = require('../database');

// POST /api/nfe/emitir/:ordemId
router.post('/emitir/:ordemId', auth(['admin', 'caixa']), async (req, res, next) => {
  const ordemId = Number(req.params.ordemId);
  if (!ordemId) return res.status(400).json({ erro: 'ordemId inválido' });

  try {
    const ordem = db.getOne('SELECT * FROM ordens WHERE id=? AND deletedat IS NULL', [ordemId]);
    if (!ordem) return res.status(404).json({ erro: 'OS não encontrada' });
    if (ordem.nfe_status === 'autorizado')
      return res.status(409).json({ erro: 'NF-e já emitida para esta OS' });

    // Marcar como "emitindo" para evitar duplicata em concurrent requests
    db.run(
      "UPDATE ordens SET nfe_status='emitindo' WHERE id=? AND (nfe_status IS NULL OR nfe_status='erro')",
      [ordemId]
    );

    const itens = db.getAll(
      `SELECT oi.*, p.ncm, p.cfop, p.csosn, p.unidade, p.origem_fiscal
       FROM ordem_itens oi
       LEFT JOIN produtos p ON oi.produto_id = p.id
       WHERE oi.ordemid=?`,
      [ordemId]
    );
    if (!itens.length)
      return res.status(422).json({ erro: 'OS sem itens — adicione produtos antes de emitir' });

    const cliente = ordem.clienteid
      ? db.getOne('SELECT * FROM clientes WHERE id=?', [ordem.clienteid])
      : null;

    const serie = ordem.nfe_serie || '1';

    // Incrementar sequência com transação para evitar race condition
    const seq = db.getOne(
      'UPDATE nfe_sequencias SET ultimo_numero = ultimo_numero + 1 WHERE serie=? RETURNING ultimo_numero',
      [serie]
    );
    if (!seq) return res.status(500).json({ erro: 'Sequência NF-e não encontrada para série ' + serie });
    const numero = seq.ultimo_numero;

    const emitente = {
      CNPJ:  process.env.NFE_CNPJ_EMITENTE,
      xNome: process.env.NFE_RAZAO_SOCIAL   || 'ARTE E MOLDURAS LTDA',
      xFant: process.env.NFE_NOME_FANTASIA  || 'Arte e Molduras',
      IE:    process.env.NFE_IE_EMITENTE    || '',
      CRT:   '1', // Simples Nacional
      enderEmit: {
        xLgr:    process.env.NFE_END_LOGRADOURO || '',
        nro:     process.env.NFE_END_NUMERO     || 'S/N',
        xBairro: process.env.NFE_END_BAIRRO     || '',
        cMun:    '3127701',
        xMun:    'Ipatinga',
        UF:      'MG',
        CEP:     (process.env.NFE_END_CEP || '').replace(/\D/g, ''),
        cPais:   '1058',
        xPais:   'Brasil',
      },
    };

    const nfeData = montarNFe({ ordem, itens, cliente, emitente, numero, serie });

    const wizard    = getNFEWizard();
    const resultado = await wizard.NFeAutorizacao({ NFe: nfeData });

    const protocolo = resultado?.protNFe?.infProt?.nProt  || null;
    const chave     = resultado?.protNFe?.infProt?.chNFe  || null;
    const xml       = resultado?.xmlAssinado               || '';

    // Persistir no banco
    db.run(
      `UPDATE ordens SET
         nfe_numero=?, nfe_chave=?, nfe_protocolo=?, nfe_status=?,
         nfe_xml=?, nfe_emitida_em=datetime('now','localtime')
       WHERE id=?`,
      [numero, chave, protocolo, 'autorizado', xml, ordemId]
    );

    // Salvar XML em disco (obrigação legal: 5 anos)
    if (xml && chave) {
      const xmlDir = path.join(__dirname, '..', 'data', 'nfe_xmls');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, `${chave}-nfe.xml`), xml, 'utf8');
    }

    res.json({ ok: true, numero, chave, protocolo });
  } catch (err) {
    // Reverter status em caso de erro SEFAZ
    try {
      db.run("UPDATE ordens SET nfe_status='erro' WHERE id=? AND nfe_status='emitindo'", [ordemId]);
    } catch (_) {}
    next(err);
  }
});

// GET /api/nfe/status/:ordemId — consulta rápida de status
router.get('/status/:ordemId', auth(['admin', 'caixa', 'viewer']), (req, res) => {
  const ordemId = Number(req.params.ordemId);
  const row = db.getOne(
    'SELECT nfe_numero, nfe_chave, nfe_protocolo, nfe_status, nfe_emitida_em FROM ordens WHERE id=?',
    [ordemId]
  );
  if (!row) return res.status(404).json({ erro: 'OS não encontrada' });
  res.json(row);
});

module.exports = router;
