// ══════════════════════════════════════════
//  routes/loans.js — Mikopo (Credit Scoring Engine)
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { tierForScore } = require('../utils/serialize');

const router = express.Router();
router.use(requireAuth);

// GET /loans — your own loans, or all loans if Admin
router.get('/', async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const { rows } = await pool.query('SELECT * FROM loans ORDER BY created_at DESC');
      return res.json(rows);
    }
    const { rows } = await pool.query('SELECT * FROM loans WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /loans — apply for a loan; trust score is snapshotted server-side from the farmer's real record.
// Admins may create a loan on behalf of a specific farmer by passing user_id.
router.post('/', async (req, res, next) => {
  try {
    const { bank_name, amount, interest_rate, purpose, user_id } = req.body;
    if (!bank_name) return res.status(422).json({ detail: 'Jina la benki linahitajika' });
    if (!(amount > 0)) return res.status(422).json({ detail: 'Kiasi cha mkopo lazima kiwe zaidi ya 0' });

    let targetUserId = req.user.id;
    if (user_id && req.user.role === 'admin') {
      const { rows: targetRows } = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = 'mkulima'`, [user_id]);
      if (!targetRows[0]) return res.status(404).json({ detail: 'Mkulima huyo hajapatikana' });
      targetUserId = user_id;
    }

    let score = 500;
    const { rows: farmerRows } = await pool.query('SELECT trust_score FROM farmer_profiles WHERE user_id = $1', [targetUserId]);
    if (farmerRows[0]) score = farmerRows[0].trust_score;

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO loans (id, user_id, bank_name, amount, interest_rate, purpose, trust_score, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Inasubiri') RETURNING *`,
      [id, targetUserId, bank_name, amount, interest_rate || '8%', purpose || 'Kilimo', score]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /loans/:id/approve — [Admin]. Bumps the farmer's trust score, same as the original design.
router.patch('/:id/approve', requireRole('admin'), async (req, res, next) => {
  try {
    const { rows: loanRows } = await pool.query('SELECT * FROM loans WHERE id = $1', [req.params.id]);
    const loan = loanRows[0];
    if (!loan) return res.status(404).json({ detail: 'Mkopo haujapatikana' });

    const { rows } = await pool.query(
      `UPDATE loans SET status = 'Imeidhinishwa', approved_by = $1, approved_at = now(), updated_at = now() WHERE id = $2 RETURNING *`,
      [req.user.id, loan.id]
    );

    const { rows: farmerRows } = await pool.query('SELECT * FROM farmer_profiles WHERE user_id = $1', [loan.user_id]);
    if (farmerRows[0]) {
      const newScore = Math.min(farmerRows[0].trust_score + 20, 1000);
      await pool.query('UPDATE farmer_profiles SET trust_score = $1, tier = $2, updated_at = now() WHERE user_id = $3', [newScore, tierForScore(newScore), loan.user_id]);
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /loans/:id/reject — [Admin]
router.patch('/:id/reject', requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE loans SET status = 'Imekataliwa', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ detail: 'Mkopo haujapatikana' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
