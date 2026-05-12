/**
 * /api/nfe
 * Rotas de NF-e
 *
 * POST /api/nfe/emitir/:id   — emite (ou simula) NF-e vinculada a uma OS
 * GET  /api/nfe              — lista todas as OSs que possuem nfe_status
 */

const express = require('express')
const router  = express.Router()
const { getDB } = require('../database')
const { auth }  = require('../middlewares/auth')

// ─── helpers ──────────────────────────────────────────────────────────────────
function pad(n, len) { return String(n).padStart(len, '0') }

/**
 * Gera próximo número de NF-e sequencial por série.
 * Salva o estado na tabela kv (chave-valor simples) que já existe no sistema.
 */
async function proximoNumeroNfe(db, serie = '001') {
  const chave = `nfe_seq_${serie}`
  let row = db.prepare('SELECT valor FROM kv WHERE chave = ?').get(chave)
  const atual = row ? parseInt(row.valor, 10) : 0
  const proximo = atual + 1
  if (row) {
    db.prepare('UPDATE kv SET valor = ? WHERE chave = ?').run(String(proximo), chave)
  } else {
    db.prepare('INSERT INTO kv (chave, valor) VALUES (?, ?)').run(chave, String(proximo))
  }
  return pad(proximo, 9) // 000000001
}

/**
 * Garante que as colunas de NF-e existem na tabela ordens.
 * Executado uma vez por startup — safe para rodar múltiplas vezes.
 */
function garantirColunas(db) {
  const cols = db.prepare("PRAGMA table_info(ordens)").all().map(c => c.name)
  const needed = [
    ['nfe_status',     'TEXT'],
    ['nfe_numero',     'TEXT'],
    ['nfe_serie',      'TEXT'],
    ['nfe_chave',      'TEXT'],
    ['nfe_protocolo',  'TEXT'],
    ['nfe_emitida_em', 'TEXT'],
  ]
  for (const [col, type] of needed) {
    if (!cols.includes(col)) {
      db.prepare(`ALTER TABLE ordens ADD COLUMN ${col} ${type}`).run()
      console.log(`[NF-e] Coluna adicionada: ordens.${col}`)
    }
  }

  // Tabela kv (chave-valor) — cria se não existir
  db.prepare(`
    CREATE TABLE IF NOT EXISTS kv (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )
  `).run()
}

// Garante colunas ao carregar o módulo
try {
  garantirColunas(getDB())
} catch (e) {
  console.error('[NF-e] Erro ao garantir colunas:', e.message)
}

// ─── GET /api/nfe ─────────────────────────────────────────────────────────────
// Lista todas as OSs com nfe_status preenchido
router.get('/', auth, (req, res) => {
  try {
    const db  = getDB()
    const rows = db.prepare(`
      SELECT o.*, c.nome AS clientenome
      FROM ordens o
      LEFT JOIN clientes c ON o.cliente_id = c.id
      WHERE o.nfe_status IS NOT NULL
      ORDER BY o.nfe_emitida_em DESC
    `).all()
    res.json({ notas: rows })
  } catch (e) {
    console.error('[NF-e] GET /:', e.message)
    res.status(500).json({ erro: 'Erro ao listar notas fiscais' })
  }
})

// ─── POST /api/nfe/emitir/:id ─────────────────────────────────────────────────
// Emite NF-e para a OS :id
// Em produção: substituir o bloco "SEFAZ" por integração real (Focus NFe, eNotas, etc.)
router.post('/emitir/:id', auth, async (req, res) => {
  const db = getDB()

  try {
    // 1. Buscar OS
    const os = db.prepare(`
      SELECT o.*, c.nome AS clientenome, c.cpf_cnpj, c.email,
             c.logradouro, c.numero AS c_numero, c.bairro, c.cidade, c.uf, c.cep
      FROM ordens o
      LEFT JOIN clientes c ON o.cliente_id = c.id
      WHERE o.id = ?
    `).get(req.params.id)

    if (!os) {
      return res.status(404).json({ erro: 'Ordem de serviço não encontrada' })
    }

    if (os.nfe_status === 'autorizado') {
      return res.status(409).json({ erro: 'NF-e já autorizada para esta OS' })
    }

    if (!['Pronto', 'Entregue'].includes(os.status)) {
      return res.status(422).json({ erro: `Status da OS inválido para emissão: ${os.status}` })
    }

    // 2. Marcar como "emitindo"
    db.prepare(`UPDATE ordens SET nfe_status = 'emitindo' WHERE id = ?`).run(os.id)

    // ── INTEGRAÇÃO SEFAZ ────────────────────────────────────────────────────
    // TODO: substituir este bloco pelo SDK real (Focus NFe, eNotas, etc.)
    // Exemplo com Focus NFe:
    //   const resp = await focusNfe.emitir({ natureza_operacao: 'Prestação de serviços', ... })
    //   const { numero, serie, chave_nfe, protocolo } = resp
    //
    // Por ora: simulação local para validar o fluxo completo.
    const USAR_MOCK = process.env.NFE_MOCK !== 'false'   // desativar com NFE_MOCK=false

    let numero, serie, chave, protocolo

    if (USAR_MOCK) {
      serie     = '001'
      numero    = await proximoNumeroNfe(db, serie)
      chave     = `35${new Date().getFullYear()}${pad(new Date().getMonth()+1,2)}${'12345678000195'.replace(/\D/g,'')}${'55'}${serie}${numero}${pad(Math.floor(Math.random()*1e9),9)}${pad(Math.floor(Math.random()*1e9),9)}`
      protocolo = `1${pad(Math.floor(Math.random()*1e11), 11)}`
    } else {
      // ← integração real aqui
      return res.status(501).json({ erro: 'Integração SEFAZ não configurada. Defina NFE_MOCK=true ou implemente a integração.' })
    }
    // ── FIM SEFAZ ───────────────────────────────────────────────────────────

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

    res.json({
      ok:        true,
      numero,
      serie,
      chave,
      protocolo,
      emitida_em: agora,
    })

  } catch (e) {
    console.error('[NF-e] POST /emitir:', e.message)
    // Reverter status em caso de erro
    try {
      db.prepare(`UPDATE ordens SET nfe_status = 'rejeitado' WHERE id = ? AND nfe_status = 'emitindo'`).run(req.params.id)
    } catch (_) {}
    res.status(500).json({ erro: 'Erro interno ao emitir NF-e. Contate o suporte.' })
  }
})

module.exports = router
