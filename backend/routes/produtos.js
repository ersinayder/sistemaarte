const express = require('express');
const router  = express.Router();
const { getAll, getOne, run, runInsert } = require('../database');
const { auth } = require('../middlewares/auth');
const { toNumber } = require('../utils/numbers');

// GET /api/produtos?q=termo
router.get('/', auth(['admin','caixa']), (req, res, next) => {
  try {
    const { q } = req.query;
    let rows;
    if (q && q.trim().length > 0) {
      const like = `%${q.trim()}%`;
      rows = getAll(
        'SELECT * FROM produtos WHERE deletedat IS NULL AND (nome LIKE ? OR categoria LIKE ? OR descricao LIKE ?) ORDER BY nome COLLATE NOCASE LIMIT 20',
        [like, like, like]
      );
    } else {
      rows = getAll('SELECT * FROM produtos WHERE deletedat IS NULL ORDER BY nome COLLATE NOCASE');
    }
    res.json(rows);
  } catch(e) { next(e); }
});

// GET /api/produtos/:id
router.get('/:id', auth(['admin','caixa']), (req, res, next) => {
  try {
    const row = getOne('SELECT * FROM produtos WHERE id=? AND deletedat IS NULL', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(row);
  } catch(e) { next(e); }
});

// POST /api/produtos
router.post('/', auth(['admin','caixa']), (req, res, next) => {
  try {
    const {
      nome, categoria, unidade, preco, estoque, estoquemin, descricao,
      ncm, cfop, csosn, origem_fiscal,
    } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    const id = runInsert(
      `INSERT INTO produtos
        (nome, categoria, unidade, preco, estoque, estoquemin, descricao, ncm, cfop, csosn, origem_fiscal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(),
        categoria         || 'Outros',
        unidade           || 'un',
        toNumber(preco),
        toNumber(estoque),
        toNumber(estoquemin),
        descricao?.trim() || '',
        ncm ? String(ncm).replace(/\D/g, '').padStart(8, '0') : null,
        cfop ? String(cfop).replace(/\D/g, '') : '5102',
        csosn ? String(csosn).replace(/\D/g, '') : '400',
        origem_fiscal == null ? 0 : toNumber(origem_fiscal),
      ]
    );
    const novo = getOne('SELECT * FROM produtos WHERE id=?', [id]);
    res.status(201).json(novo);
  } catch(e) { next(e); }
});

// PUT /api/produtos/:id
router.put('/:id', auth(['admin','caixa']), (req, res, next) => {
  try {
    const {
      nome, categoria, unidade, preco, estoque, estoquemin, descricao,
      ncm, cfop, csosn, origem_fiscal,
    } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    const result = run(
      `UPDATE produtos SET nome=?, categoria=?, unidade=?, preco=?, estoque=?, estoquemin=?, descricao=?,
       ncm=?, cfop=?, csosn=?, origem_fiscal=?,
       updatedat=datetime('now','localtime') WHERE id=? AND deletedat IS NULL`,
      [
        nome.trim(),
        categoria         || 'Outros',
        unidade           || 'un',
        toNumber(preco),
        toNumber(estoque),
        toNumber(estoquemin),
        descricao?.trim() || '',
        ncm ? String(ncm).replace(/\D/g, '').padStart(8, '0') : null,
        cfop ? String(cfop).replace(/\D/g, '') : '5102',
        csosn ? String(csosn).replace(/\D/g, '') : '400',
        origem_fiscal == null ? 0 : toNumber(origem_fiscal),
        req.params.id
      ]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Nao encontrado' });
    const updated = getOne('SELECT * FROM produtos WHERE id=?', [req.params.id]);
    res.json(updated);
  } catch(e) { next(e); }
});

// DELETE /api/produtos/:id  →  soft-delete com registro de quem deletou
router.delete('/:id', auth(['admin']), (req, res, next) => {
  try {
    const result = run(
      `UPDATE produtos SET deletedat=datetime('now','localtime'), deletedpor=? WHERE id=? AND deletedat IS NULL`,
      [req.user.id, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Nao encontrado' });
    res.json({ ok: true });
  } catch(e) { next(e); }
});

module.exports = router;
