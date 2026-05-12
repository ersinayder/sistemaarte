const express = require('express')
const router  = express.Router()
const { getDB } = require('../database')
const { auth }  = require('../middlewares/auth')

function pad(n, len) { return String(n).padStart(len, '0') }

// Usa a tabela nfe_sequencias que já existe no schema (database.js v4)
function proximoNumero(db, serie = '1') {
  const row = db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get(serie)
  if (!row) {
    db.prepare('INSERT INTO nfe_sequencias (serie, ultimo_numero) VALUES (?, 1)').run(serie)
    return pad(1, 9)
  }
  const proximo = row.ultimo_numero + 1
  db.prepare('UPDATE nfe_sequencias SET ultimo_numero = ? WHERE serie = ?').run(proximo, serie)
  return pad(proximo, 9)
}

// GET /api/nfe — lista OSs com nfe_status preenchido
router.get('/', auth, (req, res) => {
  try {
    const rows = getDB().prepare(`
      SELECT o.*, c.name AS clientenome
      FROM ordens o
      LEFT JOIN clientes c ON o.clienteid = c.id
      WHERE o.nfe_status IS NOT NULL
      ORDER BY o.nfe_emitida_em DESC
    `).all()
    res.json({ notas: rows })
  } catch (e) {
    console.error('[NF-e] GET /:', e.message)
    res.status(500).json({ erro: 'Erro ao listar notas fiscais' })
  }
})

// POST /api/nfe/emitir/:id
router.post('/emitir/:id', auth, (req, res) => {
  const db = getDB()
  try {
    const os = db.prepare(`
      SELECT o.*, c.name AS clientenome, c.cpf, c.logradouro,
             c.numero AS c_numero, c.bairro, c.cidade, c.uf, c.cep
      FROM ordens o
      LEFT JOIN clientes c ON o.clienteid = c.id
      WHERE o.id = ?
    `).get(req.params.id)

    if (!os)                                  return res.status(404).json({ erro: 'OS não encontrada' })
    if (os.nfe_status === 'autorizado')        return res.status(409).json({ erro: 'NF-e já autorizada para esta OS' })
    if (!['Pronto','Entregue'].includes(os.status))
      return res.status(422).json({ erro: `Status inválido para emissão: ${os.status}` })

    db.prepare(`UPDATE ordens SET nfe_status = 'emitindo' WHERE id = ?`).run(os.id)

    // --- Mock SEFAZ (substituir por SDK real: Focus NFe, eNotas etc.) ----------
    const serie    = '1'
    const numero   = proximoNumero(db, serie)
    const cnpj     = (process.env.CNPJ_EMITENTE || '12345678000195').replace(/\D/g,'')
    const aamm     = new Date().toISOString().slice(0,7).replace('-','')
    const chave    = `35${aamm}${cnpj}55${pad(serie,3)}${numero}${pad(Math.floor(Math.random()*1e9),9)}${pad(Math.floor(Math.random()*1e9),9)}`
    const protocolo= `1${pad(Math.floor(Math.random()*1e11),11)}`
    // --------------------------------------------------------------------------

    const agora = new Date().toISOString()
    db.prepare(`
      UPDATE ordens SET
        nfe_status     = 'autorizado',
        nfe_numero     = ?,
        nfe_serie      = ?,
        nfe_chave      = ?,
        nfe_protocolo  = ?,
        nfe_emitida_em = ?
      WHERE id = ?
    `).run(numero, serie, chave, protocolo, agora, os.id)

    res.json({ ok: true, numero, serie, chave, protocolo, emitida_em: agora })

  } catch (e) {
    console.error('[NF-e] POST /emitir:', e.message)
    try { db.prepare(`UPDATE ordens SET nfe_status = 'rejeitado' WHERE id = ? AND nfe_status = 'emitindo'`).run(req.params.id) } catch(_){}
    res.status(500).json({ erro: 'Erro interno ao emitir NF-e' })
  }
})

module.exports = router
