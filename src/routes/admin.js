// ══════════════════════════════════════════
//  routes/admin.js — Admin Mkuu
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// GET /admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const q = (sql, params) => pool.query(sql, params).then(r => r.rows[0]);
    const [farmers, drivers, businesses, total, revenue, groups, trips, loans, alerts] = await Promise.all([
      q(`SELECT count(*)::int AS n FROM users WHERE role = 'mkulima'`),
      q(`SELECT count(*)::int AS n FROM users WHERE role = 'dereva'`),
      q(`SELECT count(*)::int AS n FROM users WHERE role = 'biashara'`),
      q(`SELECT count(*)::int AS n FROM users WHERE role != 'admin'`),
      q(`SELECT COALESCE(sum(amount),0)::bigint AS n FROM transactions WHERE status = 'Imekamilika'`),
      q(`SELECT count(*)::int AS n FROM groups WHERE status = 'Hai'`),
      q(`SELECT count(*)::int AS n FROM logistics_trips WHERE status = 'Safarini'`),
      q(`SELECT count(*)::int AS n FROM loans WHERE status = 'Inasubiri'`),
      q(`SELECT count(*)::int AS n FROM alerts WHERE is_active = true`),
    ]);
    res.json({
      total_farmers: farmers.n, total_drivers: drivers.n, total_businesses: businesses.n,
      total_users: total.n, total_revenue: Number(revenue.n),
      active_groups: groups.n, active_trips: trips.n, pending_loans: loans.n, total_alerts: alerts.n,
    });
  } catch (err) { next(err); }
});

// GET /admin/users/all — detailed summary with role-specific extras
router.get('/users/all', async (req, res, next) => {
  try {
    const { rows: users } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    const [farmers, drivers, businesses] = await Promise.all([
      pool.query('SELECT * FROM farmer_profiles'),
      pool.query('SELECT * FROM driver_profiles'),
      pool.query('SELECT * FROM business_profiles'),
    ]);
    const byUser = (rows) => Object.fromEntries(rows.map(r => [r.user_id, r]));
    const fMap = byUser(farmers.rows), dMap = byUser(drivers.rows), bMap = byUser(businesses.rows);

    res.json(users.map(u => {
      let extra = {};
      if (fMap[u.id]) extra = { trust_score: fMap[u.id].trust_score, tier: fMap[u.id].tier, crops: fMap[u.id].crops };
      else if (dMap[u.id]) extra = { truck: dMap[u.id].truck_number, rating: dMap[u.id].rating, available: dMap[u.id].is_available };
      else if (bMap[u.id]) extra = { business: bMap[u.id].business_name };
      return {
        id: u.id, name: `${u.first_name} ${u.last_name}`, phone: u.phone, role: u.role, status: u.status,
        region: u.region, created_at: u.created_at, last_login: u.last_login, extra,
      };
    }));
  } catch (err) { next(err); }
});

// GET /admin/transactions/all
router.get('/transactions/all', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.first_name, u.last_name FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC LIMIT 500`
    );
    res.json(rows.map(t => ({
      id: t.id.slice(0, 12),
      farmer: t.first_name ? `${t.first_name} ${t.last_name}` : '—',
      type: t.type, amount: t.amount, payment_method: t.payment_method, status: t.status,
      date: t.created_at ? new Date(t.created_at).toLocaleDateString('sw-TZ') : '—',
    })));
  } catch (err) { next(err); }
});

// POST /admin/seed-markets — one-time starter prices, matches the original reference data
router.post('/seed-markets', async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query('SELECT count(*)::int AS n FROM market_prices');
    if (existing[0].n > 0) {
      return res.json({ message: 'Bei za soko tayari zipo.', success: false });
    }
    const defaults = [
      { crop: 'Avokado Hass', grade: 'Daraja A', price_tzs: 2800, change_pct: 3.4, trending_up: true, market_name: 'Dar es Salaam', export_price: 'USD 1.85/kg' },
      { crop: 'Korosho', grade: 'Premium', price_tzs: 14500, change_pct: 1.2, trending_up: true, market_name: 'Mtwara', export_price: 'USD 9.20/kg' },
      { crop: 'Ufuta', grade: 'Export', price_tzs: 3200, change_pct: -0.5, trending_up: false, market_name: 'Zanzibar', export_price: 'USD 2.10/kg' },
      { crop: 'Mchele Bora', grade: 'Daraja 1', price_tzs: 1900, change_pct: 0.8, trending_up: true, market_name: 'Dodoma', export_price: '—' },
      { crop: 'Embe Tamu', grade: 'Export', price_tzs: 2100, change_pct: 1.8, trending_up: true, market_name: 'Morogoro', export_price: 'USD 1.40/kg' },
      { crop: 'Maharagwe', grade: 'Daraja A', price_tzs: 1760, change_pct: 0.3, trending_up: true, market_name: 'Njombe', export_price: '—' },
      { crop: 'Nanasi', grade: 'Daraja A', price_tzs: 850, change_pct: 0.5, trending_up: true, market_name: 'Morogoro', export_price: '—' },
    ];
    for (const p of defaults) {
      await pool.query(
        `INSERT INTO market_prices (id, crop, grade, price_tzs, change_pct, trending_up, market_name, export_price, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [crypto.randomUUID(), p.crop, p.grade, p.price_tzs, p.change_pct, p.trending_up, p.market_name, p.export_price, req.user.id]
      );
    }
    res.json({ message: `Bei ${defaults.length} za awali zimeongezwa!`, success: true });
  } catch (err) { next(err); }
});

// GET /admin/weekly-activity — real transaction counts for the last 4 weeks (no fabricated numbers)
router.get('/weekly-activity', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT to_char(week_start, 'DD Mon') AS label, count::int AS count FROM (
        SELECT date_trunc('week', now()) - (n || ' weeks')::interval AS week_start,
               (SELECT count(*) FROM transactions
                WHERE created_at >= date_trunc('week', now()) - (n || ' weeks')::interval
                  AND created_at <  date_trunc('week', now()) - ((n-1) || ' weeks')::interval) AS count
        FROM generate_series(3, 0, -1) AS n
      ) t ORDER BY week_start`);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
