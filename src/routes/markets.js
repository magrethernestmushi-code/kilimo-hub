// ══════════════════════════════════════════
//  routes/markets.js — Bei za Soko (Agri-Intelligence: prices)
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /markets — open to everyone
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM market_prices ORDER BY crop');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /markets — [Admin]
router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { crop, grade, price_tzs, price_usd, change_pct, trending_up, market_name, export_price } = req.body;
    if (!crop) return res.status(422).json({ detail: 'Jina la zao linahitajika' });
    if (!(price_tzs > 0)) return res.status(422).json({ detail: 'Bei lazima iwe zaidi ya 0' });
    if (!market_name) return res.status(422).json({ detail: 'Jina la soko linahitajika' });

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO market_prices (id, crop, grade, price_tzs, price_usd, change_pct, trending_up, market_name, export_price, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, crop, grade || 'Daraja A', price_tzs, price_usd || null, change_pct || 0, trending_up !== false, market_name, export_price || '—', req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /markets/:id — [Admin]
router.put('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { crop, grade, price_tzs, price_usd, change_pct, trending_up, market_name, export_price } = req.body;
    const { rows } = await pool.query(
      `UPDATE market_prices SET crop=$1, grade=$2, price_tzs=$3, price_usd=$4, change_pct=$5, trending_up=$6, market_name=$7, export_price=$8, updated_by=$9, updated_at=now()
       WHERE id = $10 RETURNING *`,
      [crop, grade || 'Daraja A', price_tzs, price_usd || null, change_pct || 0, trending_up !== false, market_name, export_price || '—', req.user.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ detail: 'Bei haijapatikana' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /markets/:id — [Admin]
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM market_prices WHERE id = $1 RETURNING crop', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Bei haijapatikana' });
    res.json({ message: `Bei ya ${rows[0].crop} imefutwa.`, success: true });
  } catch (err) { next(err); }
});

module.exports = router;
