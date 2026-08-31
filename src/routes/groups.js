// ══════════════════════════════════════════
//  routes/groups.js — Ununuzi wa Pamoja (Collective Buying)
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /groups — open to everyone (browsing doesn't require login)
router.get('/', async (req, res, next) => {
  try {
    const { status, region } = req.query;
    const clauses = []; const params = [];
    if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
    if (region) { params.push(region); clauses.push(`region = $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT * FROM groups ${where} ORDER BY created_at DESC`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /groups — [Admin] create a new group-buy
router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { product, emoji, grade, region, retail_price, group_price, target_members, deadline } = req.body;
    if (!product || product.trim().length < 2) return res.status(422).json({ detail: 'Jina la bidhaa linahitajika' });
    if (!region) return res.status(422).json({ detail: 'Mkoa unahitajika' });
    if (!(retail_price > 0) || !(group_price > 0)) return res.status(422).json({ detail: 'Bei lazima iwe zaidi ya 0' });
    if (group_price >= retail_price) return res.status(422).json({ detail: 'Bei ya pamoja lazima iwe chini ya bei ya kawaida' });
    if (!(target_members >= 2 && target_members <= 500)) return res.status(422).json({ detail: 'Idadi ya wanachama lazima iwe kati ya 2 na 500' });

    const savings = Math.round(((retail_price - group_price) / retail_price) * 100);
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO groups (id, product, emoji, grade, region, retail_price, group_price, savings_pct, target_members, deadline, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Hai',$11) RETURNING *`,
      [id, product, emoji || '🌾', grade || 'Daraja A', region, retail_price, group_price, savings, target_members, deadline || 'Masaa 24', req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// POST /groups/:id/join — Mkulima only
router.post('/:id/join', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!['mkulima', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ detail: 'Wakulima tu wanaweza kujiunga na vikundi' });
    }
    await client.query('BEGIN');
    const { rows: groupRows } = await client.query('SELECT * FROM groups WHERE id = $1 FOR UPDATE', [req.params.id]);
    const group = groupRows[0];
    if (!group) { await client.query('ROLLBACK'); return res.status(404).json({ detail: 'Kikundi hakijapatikana' }); }
    if (group.status !== 'Hai') { await client.query('ROLLBACK'); return res.status(400).json({ detail: 'Kikundi hiki hakipo wazi tena' }); }

    const { rows: farmerRows } = await client.query('SELECT * FROM farmer_profiles WHERE user_id = $1', [req.user.id]);
    const farmer = farmerRows[0];
    if (!farmer) { await client.query('ROLLBACK'); return res.status(400).json({ detail: 'Profile ya mkulima haijapatikana' }); }

    const { rows: existingRows } = await client.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND farmer_id = $2', [group.id, farmer.id]
    );
    if (existingRows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ detail: 'Tayari umejiunga na kikundi hiki' }); }

    await client.query(
      'INSERT INTO group_members (id, group_id, farmer_id) VALUES ($1,$2,$3)',
      [crypto.randomUUID(), group.id, farmer.id]
    );
    const newCount = group.current_members + 1;
    const newStatus = newCount >= group.target_members ? 'Imejaa' : group.status;
    await client.query('UPDATE groups SET current_members = $1, status = $2, updated_at = now() WHERE id = $3', [newCount, newStatus, group.id]);

    await client.query(
      `INSERT INTO transactions (id, user_id, type, amount, payment_method, status, notes)
       VALUES ($1,$2,'Kikundi',$3,$4,'Imekamilika',$5)`,
      [crypto.randomUUID(), req.user.id, Math.round(group.group_price), farmer.payment_method, `Alijiunga na kikundi cha ${group.product}`]
    );

    await client.query('COMMIT');

    const remaining = group.target_members - newCount;
    if (newStatus === 'Imejaa') {
      return res.json({ message: '🎉 Kikundi kimejaa! Bei ya pamoja imefunguliwa!', success: true });
    }
    res.json({ message: `✓ Umejiunge! Wanaohitajika: ${remaining}`, success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /groups/:id — [Admin]
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM groups WHERE id = $1 RETURNING product', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Kikundi hakijapatikana' });
    res.json({ message: `Kikundi cha ${rows[0].product} kimefutwa.`, success: true });
  } catch (err) { next(err); }
});

module.exports = router;
