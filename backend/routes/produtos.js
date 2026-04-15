const express = require('express');
const router  = express.Router();
const { getDB } = require('../database');
const { auth }  = require('../middlewares/auth');

// GET /api/produtos — qualquer autenticado
router.get('/', auth(), (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM produtos ORDER BY nome COLLATE NOCASE').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/produtos/:id
router.get('/:id', auth(), (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/produtos — admin ou caixa
router.post('/', auth(['admin','caixa']), (req, res) => {
  try {
    const db = getDB();
    const { nome, categoria, unidade, preco, estoque, estoquemin, descricao } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/produtos/:id — admin ou caixa
router.put('/:id', auth(['admin','caixa']), (req, res) => {
  try {
    const db = getDB();
    const { nome, categoria, unidade, preco, estoque, estoquemin, descricao } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
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
    if (r.changes === 0) return res.status(404).json({ error: 'Não encontrado' });
    const updated = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/produtos/:id — somente admin
router.delete('/:id', auth(['admin']), (req, res) => {
  try {
    const db = getDB();
    const r  = db.prepare('DELETE FROM produtos WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
