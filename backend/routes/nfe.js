/**
 * routes/nfe.js
 * POST /api/nfe/emitir/:ordemId  — emite NF-e modelo 55
 *
 * ANTES DE USAR EM PRODUÇÃO:
 *  1. Preencha o bloco EMITENTE abaixo com os dados reais da empresa.
 *  2. Configure o .env com NFE_CNPJ_EMITENTE, NFE_IE_EMITENTE,
 *     NFE_CERT_PATH, NFE_CERT_PASSWORD, NFE_AMBIENTE.
 *  3. Teste em homologação até receber cStat=100.
 */
'use strict';

const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { auth }        = require('../middlewares/auth');
const { getNFEWizard } = require('../utils/nfe');
const { montarNFe }   = require('../domain/nfeRules');
const db = require('../database');

// ─── Dados do emitente ────────────────────────────────────────────────────────
// Preencha uma vez com os dados reais da empresa.
// CNPJ e IE vêm do .env; endereço fica aqui no código.
function montarEmitente() {
  return {
    CNPJ:  process.env.NFE_CNPJ_EMITENTE,
    xNome: 'ARTE E MOLDURAS LTDA',        // ← razão social exata do cartão CNPJ
    xFant: 'Arte e Molduras',
    IE:    process.env.NFE_IE_EMITENTE,
    CRT:   '1',                            // 1 = Simples Nacional
    enderEmit: {
      xLgr:    'RUA EXEMPLO',             // ← logradouro
      nro:     '100',                     // ← número
      xBairro: 'CENTRO',                  // ← bairro
      cMun:    '3127701',                 // Ipatinga-MG (não alterar)
      xMun:    'Ipatinga',
      UF:      'MG',
      CEP:     '35160000',               // ← CEP sem traço
      cPais:   '1058',
      xPais:   'Brasil',
      fone:    '3100000000',             // ← DDD + número sem formatação
    },
  };
}

// ─── Diretório de XMLs (obrigação legal: guardar 5 anos) ─────────────────────
const XML_DIR = path.resolve(__dirname, '../data/nfe_xmls');

// ─── Rota principal ───────────────────────────────────────────────────────────
router.post('/emitir/:ordemId', auth(['admin', 'caixa']), async (req, res, next) => {
  const ordemId = Number(req.params.ordemId);

  // 1. Buscar OS
  const ordem = db.getOne('SELECT * FROM ordens WHERE id = ?', [ordemId]);
  if (!ordem) return res.status(404).json({ erro: 'OS não encontrada' });

  // 2. Bloquear duplicata (idempotência)
  if (ordem.nfe_status === 'autorizado')
    return res.status(409).json({ erro: 'NF-e já emitida para esta OS', chave: ordem.nfe_chave });

  // 3. Lock otimista — marca como 'emitindo' antes de chamar SEFAZ
  if (ordem.nfe_status === 'emitindo')
    return res.status(409).json({ erro: 'Emissão já em andamento para esta OS' });

  try {
    db.run(`UPDATE ordens SET nfe_status = 'emitindo' WHERE id = ?`, [ordemId]);

    // 4. Itens com dados fiscais dos produtos (JOIN)
    const itens = db.getAll(`
      SELECT
        oi.id, oi.produto_id, oi.nome, oi.quantidade, oi.preco_unitario,
        p.ncm, p.cfop, p.csosn, p.unidade, p.origem_fiscal
      FROM ordem_itens oi
      LEFT JOIN produtos p ON p.id = oi.produto_id
      WHERE oi.ordemid = ?
    `, [ordemId]);

    if (!itens.length)
      throw Object.assign(new Error('OS sem itens — não é possível emitir NF-e'), { status: 422 });

    // 5. Cliente (pode ser null para consumidor final)
    const cliente = ordem.clienteid
      ? db.getOne('SELECT * FROM clientes WHERE id = ?', [ordem.clienteid])
      : null;

    // 6. Gerar número sequencial com UPDATE atômico
    const serie = ordem.nfe_serie || '1';
    db.run(
      `INSERT OR IGNORE INTO nfe_sequencias (serie, ultimo_numero) VALUES (?, 0)`,
      [serie]
    );
    const seq = db.getOne(
      `UPDATE nfe_sequencias SET ultimo_numero = ultimo_numero + 1
       WHERE serie = ? RETURNING ultimo_numero`,
      [serie]
    );
    const numero = seq.ultimo_numero;

    // 7. Montar payload e chamar SEFAZ
    const emitente = montarEmitente();
    const payload  = montarNFe({ ordem, itens, cliente, emitente, numero, serie });

    const wizard    = getNFEWizard();
    const resultado = await wizard.NFeAutorizacao({ NFe: payload });

    const infProt  = resultado?.protNFe?.infProt;
    const protocolo = infProt?.nProt   || '';
    const chave     = infProt?.chNFe   || '';
    const cStat     = infProt?.cStat   || '';
    const xml       = resultado?.xmlAssinado || resultado?.xml || '';

    if (cStat !== '100')
      throw Object.assign(
        new Error(`SEFAZ rejeitou: cStat=${cStat} — ${infProt?.xMotivo || 'sem motivo'}`),
        { status: 422, cStat, xMotivo: infProt?.xMotivo }
      );

    // 8. Persistir resultado
    fs.mkdirSync(XML_DIR, { recursive: true });
    if (xml && chave) fs.writeFileSync(path.join(XML_DIR, `${chave}-nfe.xml`), xml, 'utf8');

    db.run(`
      UPDATE ordens SET
        nfe_numero      = ?,
        nfe_serie       = ?,
        nfe_chave       = ?,
        nfe_protocolo   = ?,
        nfe_status      = 'autorizado',
        nfe_xml         = ?,
        nfe_emitida_em  = datetime('now','localtime')
      WHERE id = ?`,
      [numero, serie, chave, protocolo, xml, ordemId]
    );

    return res.json({ ok: true, numero, serie, chave, protocolo, cStat });

  } catch (err) {
    // Reverter lock em caso de erro
    db.run(`UPDATE ordens SET nfe_status = 'erro' WHERE id = ? AND nfe_status = 'emitindo'`, [ordemId]);
    next(err);
  }
});

module.exports = router;
