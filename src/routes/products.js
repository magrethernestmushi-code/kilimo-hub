// ══════════════════════════════════════════
//  routes/products.js — Mazao ya Mkulima (farmer-first produce listings)
//  A farmer lists their own produce. An admin/agent ("wakala") can also
//  list on a farmer's behalf when the farmer can't do it themselves.
//  Everything downstream (business orders, driver pickups) points back
//  to this listing and the farmer who owns it.
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /products — open to everyone, shows which farmer each listing belongs to
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.first_name AS farmer_first_name, u.last_name AS farmer_last_name, u.phone AS farmer_phone,
              fp.home_lat AS farmer_lat, fp.home_lng AS farmer_lng
       FROM products p
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN farmer_profiles fp ON fp.user_id = p.created_by
       WHERE p.is_active = true ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /products/mine — a farmer's own listings
router.get('/mine', requireAuth, requireRole('mkulima', 'admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE created_by = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /products — [Mkulima] lists their own produce, or [Admin/wakala] lists on behalf of a named farmer
router.post('/', requireAuth, requireRole('mkulima', 'admin'), async (req, res, next) => {
  try {
    const { name, emoji, grade, region, retail_price, group_price, stock_kg, farmer_user_id } = req.body;
    if (!name) return res.status(422).json({ detail: 'Jina la zao linahitajika' });
    if (!(retail_price > 0) || !(group_price > 0)) return res.status(422).json({ detail: 'Bei lazima iwe zaidi ya 0' });
    if (!(stock_kg > 0)) return res.status(422).json({ detail: 'Kiasi (kg) kinahitajika' });

    let ownerId = req.user.id;
    if (req.user.role === 'admin') {
      if (!farmer_user_id) return res.status(422).json({ detail: 'Chagua mkulima unayemsajilia zao hili' });
      const { rows: farmerRows } = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = 'mkulima'`, [farmer_user_id]);
      if (!farmerRows[0]) return res.status(404).json({ detail: 'Mkulima huyo hajapatikana' });
      ownerId = farmer_user_id;
    }

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO products (id, name, emoji, grade, region, retail_price, group_price, stock_kg, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
      [id, name, emoji || '🌾', grade || 'Daraja A', region || null, retail_price, group_price, stock_kg, ownerId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /products/:id — the owning farmer, or admin, can update stock/price
router.put('/:id', requireAuth, requireRole('mkulima', 'admin'), async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ detail: 'Zao halijapatikana' });
    if (req.user.role === 'mkulima' && existing[0].created_by !== req.user.id) {
      return res.status(403).json({ detail: 'Hili si zao lako' });
    }
    const { stock_kg, retail_price, group_price } = req.body;
    const sets = []; const params = [];
    if (stock_kg !== undefined) { params.push(stock_kg); sets.push(`stock_kg = $${params.length}`); }
    if (retail_price !== undefined) { params.push(retail_price); sets.push(`retail_price = $${params.length}`); }
    if (group_price !== undefined) { params.push(group_price); sets.push(`group_price = $${params.length}`); }
    if (!sets.length) return res.status(422).json({ detail: 'Hakuna kilichobadilishwa' });
    params.push(req.params.id);
    const { rows } = await pool.query(`UPDATE products SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`, params);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /products/:id — the owning farmer, or admin (soft-delete: mark inactive, keep history)
router.delete('/:id', requireAuth, requireRole('mkulima', 'admin'), async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ detail: 'Zao halijapatikana' });
    if (req.user.role === 'mkulima' && existing[0].created_by !== req.user.id) {
      return res.status(403).json({ detail: 'Hili si zao lako' });
    }
    const { rows } = await pool.query(
      'UPDATE products SET is_active = false, updated_at = now() WHERE id = $1 RETURNING name', [req.params.id]
    );
    res.json({ message: `${rows[0].name} imeondolewa sokoni.`, success: true });
  } catch (err) { next(err); }
});

module.exports = router;
