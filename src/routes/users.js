// ══════════════════════════════════════════
//  routes/users.js — Watumiaji
// ══════════════════════════════════════════
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { serializeUser } = require('../utils/serialize');
const { titleCase, isStrongEnoughPassword } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

// GET /users — [Admin] list all users, optional role/search filter + pagination
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const clauses = [];
    const params = [];
    if (role) { params.push(role); clauses.push(`role = $${params.length}`); }
    if (search) { params.push(`%${search}%`); clauses.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;
    params.push(lim, offset);
    const { rows } = await pool.query(
      `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(await Promise.all(rows.map(serializeUser)));
  } catch (err) { next(err); }
});

// GET /users/:id — self or admin
router.get('/:id', async (req, res, next) => {
  try {
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ detail: 'Huna ruhusa kuona taarifa za mtumiaji mwingine' });
    }
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Mtumiaji hajapatikana' });
    res.json(await serializeUser(rows[0]));
  } catch (err) { next(err); }
});

// PUT /users/me/update
router.put('/me/update', async (req, res, next) => {
  try {
    const u = req.user;
    const { first_name, last_name, email, region, farm_size, crops, payment_method,
      truck_number, truck_capacity, is_available, current_location, business_name, business_type } = req.body;

    const sets = []; const params = [];
    if (first_name) { params.push(titleCase(first_name)); sets.push(`first_name = $${params.length}`); }
    if (last_name) { params.push(titleCase(last_name)); sets.push(`last_name = $${params.length}`); }
    if (email !== undefined) { params.push(email); sets.push(`email = $${params.length}`); }
    if (region !== undefined) { params.push(region); sets.push(`region = $${params.length}`); }
    if (sets.length) {
      params.push(u.id);
      await pool.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    }

    if (u.role === 'mkulima') {
      const fsets = []; const fparams = [];
      if (farm_size !== undefined) { fparams.push(farm_size); fsets.push(`farm_size = $${fparams.length}`); }
      if (crops !== undefined) { fparams.push(crops); fsets.push(`crops = $${fparams.length}`); }
      if (payment_method !== undefined) { fparams.push(payment_method); fsets.push(`payment_method = $${fparams.length}`); }
      if (fsets.length) { fparams.push(u.id); await pool.query(`UPDATE farmer_profiles SET ${fsets.join(', ')}, updated_at = now() WHERE user_id = $${fparams.length}`, fparams); }
    } else if (u.role === 'dereva') {
      const dsets = []; const dparams = [];
      if (truck_number !== undefined) { dparams.push(truck_number); dsets.push(`truck_number = $${dparams.length}`); }
      if (truck_capacity !== undefined) { dparams.push(truck_capacity); dsets.push(`truck_capacity = $${dparams.length}`); }
      if (is_available !== undefined) { dparams.push(is_available); dsets.push(`is_available = $${dparams.length}`); }
      if (current_location !== undefined) { dparams.push(current_location); dsets.push(`current_location = $${dparams.length}`); }
      if (dsets.length) { dparams.push(u.id); await pool.query(`UPDATE driver_profiles SET ${dsets.join(', ')}, updated_at = now() WHERE user_id = $${dparams.length}`, dparams); }
    } else if (u.role === 'biashara') {
      const bsets = []; const bparams = [];
      if (business_name !== undefined) { bparams.push(business_name); bsets.push(`business_name = $${bparams.length}`); }
      if (business_type !== undefined) { bparams.push(business_type); bsets.push(`business_type = $${bparams.length}`); }
      if (bsets.length) { bparams.push(u.id); await pool.query(`UPDATE business_profiles SET ${bsets.join(', ')}, updated_at = now() WHERE user_id = $${bparams.length}`, bparams); }
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [u.id]);
    res.json(await serializeUser(rows[0]));
  } catch (err) { next(err); }
});

// POST /users/me/change-password
router.post('/me/change-password', async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    if (!(await bcrypt.compare(old_password || '', req.user.password))) {
      return res.status(400).json({ detail: 'Nenosiri la zamani si sahihi' });
    }
    if (!isStrongEnoughPassword(new_password)) {
      return res.status(422).json({ detail: 'Password lazima iwe na herufi 6 au zaidi' });
    }
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = now() WHERE id = $2', [hashed, req.user.id]);
    res.json({ message: 'Nenosiri limebadilishwa kikamilifu!', success: true });
  } catch (err) { next(err); }
});

// PATCH /users/:id/status — [Admin]
router.patch('/:id/status', requireRole('admin'), async (req, res, next) => {
  try {
    const { new_status } = req.body;
    if (!['active', 'inactive', 'banned'].includes(new_status)) {
      return res.status(422).json({ detail: 'Hali si sahihi' });
    }
    const { rows } = await pool.query(
      'UPDATE users SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [new_status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ detail: 'Mtumiaji hajapatikana' });
    res.json(await serializeUser(rows[0]));
  } catch (err) { next(err); }
});

// DELETE /users/:id — [Admin]
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM users WHERE id = $1 RETURNING first_name, last_name', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Mtumiaji hajapatikana' });
    res.json({ message: `Mtumiaji ${rows[0].first_name} ${rows[0].last_name} amefutwa.`, success: true });
  } catch (err) { next(err); }
});

module.exports = router;
