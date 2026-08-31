// ══════════════════════════════════════════
//  routes/alerts.js — Tahadhari (Agri-Intelligence: alerts)
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_LEVELS = ['Hatari', 'Angalizo', 'Habari Njema'];

// GET /alerts — open to everyone, optional region filter (always includes nationwide alerts)
router.get('/', async (req, res, next) => {
  try {
    const { region } = req.query;
    const params = ['Tanzania nzima'];
    let where = 'WHERE is_active = true';
    if (region) { params.push(region); where += ` AND (region = $1 OR region = $2)`; }
    const { rows } = await pool.query(
      `SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT 20`,
      region ? params : ['Tanzania nzima']
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /alerts — [Admin]
router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { alert_type, level, region, message } = req.body;
    if (!alert_type) return res.status(422).json({ detail: 'Aina ya tahadhari inahitajika' });
    if (!VALID_LEVELS.includes(level)) return res.status(422).json({ detail: 'Kiwango cha tahadhari si sahihi' });
    if (!region) return res.status(422).json({ detail: 'Mkoa unahitajika' });
    if (!message || message.trim().length < 10) return res.status(422).json({ detail: 'Ujumbe lazima uwe na herufi 10 au zaidi' });

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO alerts (id, alert_type, level, region, message, is_active, sender_id)
       VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *`,
      [id, alert_type, level, region, message, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /alerts/:id — [Admin]
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM alerts WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Tahadhari haijapatikana' });
    res.json({ message: 'Tahadhari imefutwa.', success: true });
  } catch (err) { next(err); }
});

module.exports = router;
