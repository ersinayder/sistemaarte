const express = require('express');
const router  = express.Router();
const { getDB } = require('../database');
const { auth }  = require('../middlewares/auth');

// GET /api/produtos?q=termo
router.get('/', auth(), (req, res, next) => {
  try {
    const db = getDB();
    const { q } = req.query;
    let rows;
    if (q && q.trim().length > 0) {
      rows = db.prepare(
        "SELECT * FROM produtos WHERE nome LIKE ? OR categoria LIKE ? OR descricao LIKE ? ORDER BY nome COLLATE NOCASE LIMIT 20"
      ).all(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
    } else {
      rows = db.prepare('SELECT * FROM produtos ORDER BY nome COLLATE NOCASE').all();
    }
    res.json(rows);
  } catch(e) { next(e); }
});

// GET /api/produtos/:id
router.get('/:id', auth(), (req, res, next) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(row);
  } catch(e) { next(e); }
});

// POST /api/produtos
router.post('/', auth(['admin','caixa']), (req, res, next) => {
  try {
    const db = getDB();
    const { nome, categoria, unidade, preco, estoque, estoquemin, descricao } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    const r = db.prepare(`
      INSERT INTO produtos (nome, categoria, unidade, preco, estoque, estoquemin, descricao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      nome.trim(),
      categoria  || 'Outros',
      unidade    || 'un',
      Number(preco)      || 0,
      Number(estoque)    || 0,
      Number(estoquemin) || 0,
      descricao?.trim()  || ''
    );
    const novo = db.prepare('SELECT * FROM produtos WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(novo);
  } catch(e) { next(e); }
});

// PUT /api/produtos/:id
router.put('/:id', auth(['admin','caixa']), (req, res, next) => {
  try {
    const db = getDB();
    const { nome, categoria, unidade, preco, estoque, estoquemin, descricao } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    const r = db.prepare(`
      UPDATE produtos SET nome=?, categoria=?, unidade=?, preco=?, estoque=?, estoquemin=?, descricao=?, updatedat=datetime('now','localtime')
      WHERE id=?
    `).run(
      nome.trim(),
      categoria  || 'Outros',
      unidade    || 'un',
      Number(preco)      || 0,
      Number(estoque)    || 0,
      Number(estoquemin) || 0,
      descricao?.trim()  || '',
      req.params.id
    );
    if (r.changes === 0) return res.status(404).json({ error: 'Nao encontrado' });
    const updated = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch(e) { next(e); }
});

// DELETE /api/produtos/:id
router.delete('/:id', auth(['admin']), (req, res, next) => {
  try {
    const db = getDB();
    const r  = db.prepare('DELETE FROM produtos WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Nao encontrado' });
    res.json({ ok: true });
  } catch(e) { next(e); }
});

module.exports = router;
