// ══════════════════════════════════════════
//  routes/auth.js — Register & Login
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { signToken, requireAuth } = require('../middleware/auth');
const { serializeUser } = require('../utils/serialize');
const { normalizePhone, isStrongEnoughPassword, titleCase } = require('../utils/validate');

const router = express.Router();

// POST /auth/register
router.post('/register', async (req, res, next) => {
  try {
    const {
      phone, password, first_name, last_name, role, region,
      farm_size, crops, payment_method,
      truck_number, truck_capacity, license_number,
      business_name, business_type, tin_number,
    } = req.body;

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return res.status(422).json({ detail: 'Namba ya simu si sahihi. Mfano: +255712345678 au 0712345678' });
    }
    if (!isStrongEnoughPassword(password)) {
      return res.status(422).json({ detail: 'Password lazima iwe na herufi 6 au zaidi' });
    }
    if (!first_name || first_name.trim().length < 2 || !last_name || last_name.trim().length < 2) {
      return res.status(422).json({ detail: 'Jina la kwanza na la familia linahitajika (herufi 2+)' });
    }
    if (!['mkulima', 'dereva', 'biashara'].includes(role)) {
      return res.status(403).json({ detail: 'Huwezi kujisajili kama Admin. Wasiliana na msimamizi.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [cleanPhone]);
    if (existing.rows[0]) {
      return res.status(409).json({ detail: `Namba ${cleanPhone} tayari imesajiliwa. Ingia kwa nenosiri lako.` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userId = crypto.randomUUID();
      const hashed = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO users (id, phone, password, role, status, first_name, last_name, region)
         VALUES ($1,$2,$3,$4,'active',$5,$6,$7)`,
        [userId, cleanPhone, hashed, role, titleCase(first_name), titleCase(last_name), region || null]
      );

      if (role === 'mkulima') {
        await client.query(
          `INSERT INTO farmer_profiles (id, user_id, farm_size, crops, farm_region, payment_method, trust_score, tier)
           VALUES ($1,$2,$3,$4,$5,$6,500,'Shaba')`,
          [crypto.randomUUID(), userId, farm_size || 0, crops || '', region || null, payment_method || 'M-Pesa']
        );
      } else if (role === 'dereva') {
        await client.query(
          `INSERT INTO driver_profiles (id, user_id, truck_number, truck_capacity, license_number, is_available, rating)
           VALUES ($1,$2,$3,$4,$5,true,5.0)`,
          [crypto.randomUUID(), userId, truck_number || null, truck_capacity || 0, license_number || null]
        );
      } else if (role === 'biashara') {
        await client.query(
          `INSERT INTO business_profiles (id, user_id, business_name, business_type, tin_number, business_region)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [crypto.randomUUID(), userId, business_name || null, business_type || 'Mfanyabiashara', tin_number || null, region || null]
        );
      }

      await client.query('COMMIT');

      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const token = signToken(rows[0]);
      res.status(201).json({ access_token: token, token_type: 'bearer', user: await serializeUser(rows[0]) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return res.status(422).json({ detail: 'Namba ya simu si sahihi. Mfano: +255712345678 au 0712345678' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [cleanPhone]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password))) {
      return res.status(401).json({ detail: 'Namba ya simu au nenosiri si sahihi' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ detail: 'Akaunti yako imezuiwa. Wasiliana na msimamizi.' });
    }

    await pool.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
    const token = signToken(user);
    res.json({ access_token: token, token_type: 'bearer', user: await serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(await serializeUser(req.user));
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout (stateless JWT — client discards the token)
router.post('/logout', requireAuth, (req, res) => {
  res.json({ message: `Kwa heri, ${req.user.first_name}! Umetoka salama.`, success: true });
});

module.exports = router;
