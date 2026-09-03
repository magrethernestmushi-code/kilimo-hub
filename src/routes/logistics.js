// ══════════════════════════════════════════
//  routes/logistics.js — Usafirishaji (Dynamic Logistics Link)
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['Inasubiri', 'Imehifadhiwa', 'Safarini', 'Imekamilika'];

// GET /logistics — open to everyone
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = []; let where = '';
    if (status) { params.push(status); where = 'WHERE status = $1'; }
    const { rows } = await pool.query(`SELECT * FROM logistics_trips ${where} ORDER BY created_at DESC`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /logistics — Admin or Dereva
router.post('/', requireAuth, requireRole('admin', 'dereva'), async (req, res, next) => {
  try {
    const { origin, destination, truck_number, capacity_tons, eta, cargo_desc } = req.body;
    if (!origin || !destination) return res.status(422).json({ detail: 'Mwanzo na mwisho wa safari zinahitajika' });
    if (!(capacity_tons > 0)) return res.status(422).json({ detail: 'Uwezo wa gari (tani) unahitajika' });

    let driverId = null;
    if (req.user.role === 'dereva') {
      const { rows } = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
      if (rows[0]) driverId = rows[0].id;
    }

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO logistics_trips (id, driver_id, origin, destination, truck_number, capacity_tons, eta, cargo_desc, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Inasubiri') RETURNING *`,
      [id, driverId, origin, destination, truck_number || null, capacity_tons, eta || null, cargo_desc || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// POST /logistics/:id/book — optionally attach the requester's real GPS pickup location
router.post('/:id/book', requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = req.body || {};
    const { rows: tripRows } = await pool.query('SELECT * FROM logistics_trips WHERE id = $1', [req.params.id]);
    const trip = tripRows[0];
    if (!trip) return res.status(404).json({ detail: 'Safari haijapatikana' });
    if (trip.status !== 'Inasubiri') return res.status(400).json({ detail: 'Safari hii haipo wazi tena' });

    await pool.query(
      `UPDATE logistics_trips SET status = 'Imehifadhiwa', booked_by = $1, pickup_lat = $2, pickup_lng = $3, updated_at = now() WHERE id = $4`,
      [req.user.id, (typeof lat === 'number' ? lat : null), (typeof lng === 'number' ? lng : null), trip.id]
    );
    await pool.query(
      `INSERT INTO transactions (id, user_id, type, amount, payment_method, status, notes)
       VALUES ($1,$2,'Usafirishaji',15000,'M-Pesa','Imekamilika',$3)`,
      [crypto.randomUUID(), req.user.id, `Alihifadhi safari ${trip.truck_number || ''} (${trip.origin} → ${trip.destination})`]
    );
    res.json({ message: `✓ Safari ${trip.truck_number || ''} imehifadhiwa!`, success: true });
  } catch (err) { next(err); }
});

// PATCH /logistics/:id/status — [Admin]
router.patch('/:id/status', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { new_status } = req.body;
    if (!VALID_STATUSES.includes(new_status)) return res.status(422).json({ detail: 'Hali si sahihi' });
    const { rows } = await pool.query(
      'UPDATE logistics_trips SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [new_status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ detail: 'Safari haijapatikana' });

    // A completed delivery bumps the assigned driver's trip count — real signal for their rating.
    if (new_status === 'Imekamilika' && rows[0].driver_id) {
      await pool.query('UPDATE driver_profiles SET trips_completed = trips_completed + 1, updated_at = now() WHERE id = $1', [rows[0].driver_id]);
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /logistics/:id — [Admin]
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM logistics_trips WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Safari haijapatikana' });
    res.json({ message: 'Safari imefutwa.', success: true });
  } catch (err) { next(err); }
});

// GET /logistics/mine — trips created by or assigned to the logged-in driver
router.get('/mine/list', requireAuth, requireRole('dereva', 'admin'), async (req, res, next) => {
  try {
    const { rows: driverRows } = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
    if (!driverRows[0]) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM logistics_trips WHERE driver_id = $1 ORDER BY created_at DESC', [driverRows[0].id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
