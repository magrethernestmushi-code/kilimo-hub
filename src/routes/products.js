// ══════════════════════════════════════════
//  routes/products.js — Bidhaa (marketplace products for business buyers)
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /products — open to everyone
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /products — [Admin]
router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, emoji, grade, region, retail_price, group_price, stock_kg } = req.body;
    if (!name) return res.status(422).json({ detail: 'Jina la bidhaa linahitajika' });
    if (!(retail_price > 0) || !(group_price > 0)) return res.status(422).json({ detail: 'Bei lazima iwe zaidi ya 0' });

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO products (id, name, emoji, grade, region, retail_price, group_price, stock_kg, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
      [id, name, emoji || '🌾', grade || 'Daraja A', region || null, retail_price, group_price, stock_kg || 0, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /products/:id — [Admin] (soft-delete: mark inactive rather than destroy history)
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE products SET is_active = false, updated_at = now() WHERE id = $1 RETURNING name', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ detail: 'Bidhaa haijapatikana' });
    res.json({ message: `${rows[0].name} imeondolewa sokoni.`, success: true });
  } catch (err) { next(err); }
});

module.exports = router;
