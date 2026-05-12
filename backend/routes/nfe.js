const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { auth }        = require('../middlewares/auth');
const { getNFEWizard } = require('../utils/nfe');
const { montarNFe }   = require('../domain/nfeRules');
const db              = require('../database');

/**
 * POST /api/nfe/emitir/:ordemId
 * Emite NF-e para uma OS. Requer status Pronto ou Entregue.
 * Lock anti-duplicata via nfe_status='emitindo'.
 */
router.post('/emitir/:ordemId', auth(['admin', 'caixa']), async (req, res, next) => {
  const ordemId = req.params.ordemId;

  try {
    // ── 1. Verificações iniciais ───────────────────────────────────────────────
    const ordem = db.getOne('SELECT * FROM ordens WHERE id=?', [ordemId]);
    if (!ordem) return res.status(404).json({ erro: 'OS não encontrada' });

    if (ordem.nfe_status === 'autorizado')
      return res.status(409).json({ erro: 'NF-e já emitida para esta OS' });

    if (ordem.nfe_status === 'emitindo')
      return res.status(409).json({ erro: 'Emissão já em andamento para esta OS' });

    const statusPermitidos = ['Pronto', 'Entregue'];
    if (!statusPermitidos.includes(ordem.status))
      return res.status(422).json({ erro: `OS deve estar com status ${statusPermitidos.join(' ou ')} para emitir NF-e` });

    // ── 2. Lock anti-duplicata ─────────────────────────────────────────────────
    db.run('UPDATE ordens SET nfe_status=? WHERE id=?', ['emitindo', ordemId]);

    // ── 3. Buscar dados relacionados ───────────────────────────────────────────
    const itens = db.getAll(
      `SELECT oi.*, oi.descricao, oi.quantidade, oi.valorunitario,
              p.ncm, p.cfop, p.csosn, p.unidade, p.origem
       FROM ordem_itens oi
       LEFT JOIN produtos p ON oi.produtoid = p.id
       WHERE oi.ordemid=? AND oi.deletedat IS NULL`,
      [ordemId]
    );

    if (!itens || itens.length === 0) {
      db.run('UPDATE ordens SET nfe_status=NULL WHERE id=?', [ordemId]);
      return res.status(422).json({ erro: 'OS não possui itens para emitir NF-e' });
    }

    const cliente = ordem.clienteid
      ? db.getOne('SELECT * FROM clientes WHERE id=?', [ordem.clienteid])
      : null;

    // ── 4. Gerar número sequencial ─────────────────────────────────────────────
    const serie = ordem.nfe_serie || '1';
    // RETURNING funciona no SQLite >= 3.35 (Node better-sqlite3 usa versão embutida recente)
    const seq = db.getOne(
      'UPDATE nfe_sequencias SET ultimo_numero = ultimo_numero + 1 WHERE serie=? RETURNING ultimo_numero',
      [serie]
    );
    if (!seq) {
      db.run('UPDATE ordens SET nfe_status=NULL WHERE id=?', [ordemId]);
      return res.status(500).json({ erro: `Sequência NF-e para série ${serie} não encontrada` });
    }
    const numero = seq.ultimo_numero;

    // ── 5. Dados do emitente ───────────────────────────────────────────────────
    const emitente = {
      CNPJ:    (process.env.NFE_CNPJ_EMITENTE  || '').replace(/\D/g, ''),
      xNome:   process.env.NFE_RAZAO_SOCIAL     || 'ARTE E MOLDURAS',
      xFant:   process.env.NFE_NOME_FANTASIA    || 'Arte e Molduras',
      IE:      (process.env.NFE_IE_EMITENTE     || '').replace(/\D/g, ''),
      CRT:     '1', // Simples Nacional
      enderEmit: {
        xLgr:   process.env.NFE_LOGRADOURO      || '',
        nro:    process.env.NFE_NUMERO           || 'S/N',
        xBairro: process.env.NFE_BAIRRO         || '',
        cMun:   process.env.NFE_COD_MUNICIPIO   || '3127701', // Ipatinga-MG
        xMun:   process.env.NFE_MUNICIPIO       || 'Ipatinga',
        UF:     'MG',
        CEP:    (process.env.NFE_CEP            || '').replace(/\D/g, ''),
        cPais:  '1058',
        xPais:  'Brasil',
        fone:   (process.env.NFE_FONE           || '').replace(/\D/g, ''),
      },
    };

    // ── 6. Montar XML e chamar SEFAZ ───────────────────────────────────────────
    const nfeData = montarNFe({ ordem, itens, cliente, emitente, numero, serie });
    const wizard  = getNFEWizard();
    const resultado = await wizard.NFeAutorizacao({ NFe: nfeData });

    const infProt  = resultado?.protNFe?.infProt;
    const protocolo = infProt?.nProt  || null;
    const chave     = infProt?.chNFe  || null;
    const cStat     = infProt?.cStat  || null;
    const xMotivo   = infProt?.xMotivo || 'Sem retorno da SEFAZ';
    const xml       = resultado?.xmlAssinado || resultado?.nfeProc || '';

    // cStat 100 = autorizado, 150 = autorizado fora do prazo
    if (!['100','150'].includes(String(cStat))) {
      db.run('UPDATE ordens SET nfe_status=? WHERE id=?', ['rejeitado', ordemId]);
      return res.status(422).json({
        erro: `SEFAZ rejeitou: ${cStat} — ${xMotivo}`,
        cStat,
        xMotivo,
      });
    }

    // ── 7. Persistir resultado ─────────────────────────────────────────────────
    db.run(
      `UPDATE ordens SET
         nfe_numero=?, nfe_serie=?, nfe_chave=?, nfe_protocolo=?,
         nfe_status=?, nfe_xml=?, nfe_emitida_em=datetime('now','localtime')
       WHERE id=?`,
      [String(numero), serie, chave, protocolo, 'autorizado', xml, ordemId]
    );

    // ── 8. Salvar XML em disco (obrigação legal: 5 anos) ──────────────────────
    try {
      const xmlDir = path.resolve(__dirname, '..', 'data', 'nfe_xmls');
      fs.mkdirSync(xmlDir, { recursive: true });
      if (chave && xml) {
        fs.writeFileSync(path.join(xmlDir, `${chave}-nfe.xml`), xml, 'utf8');
      }
    } catch (fsErr) {
      // Não aborta — XML já está no banco
      console.error('[NFe] Falha ao salvar XML em disco:', fsErr.message);
    }

    res.json({ ok: true, numero, serie, chave, protocolo, cStat });

  } catch (err) {
    // Liberar lock em qualquer erro inesperado
    try { db.run('UPDATE ordens SET nfe_status=NULL WHERE id=?', [ordemId]); } catch {}
    next(err);
  }
});

/**
 * GET /api/nfe/status/:ordemId
 * Retorna os dados de NF-e de uma OS sem reemitir.
 */
router.get('/status/:ordemId', auth(['admin', 'caixa', 'atendente']), (req, res, next) => {
  try {
    const ordem = db.getOne(
      'SELECT nfe_numero, nfe_serie, nfe_chave, nfe_protocolo, nfe_status, nfe_emitida_em FROM ordens WHERE id=?',
      [req.params.ordemId]
    );
    if (!ordem) return res.status(404).json({ erro: 'OS não encontrada' });
    res.json(ordem);
  } catch (err) { next(err); }
});

module.exports = router;
