// ══════════════════════════════════════════
//  server.js — Digital Kilimo Hub API
//  Start: npm start   (or: node src/server.js)
// ══════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initSchema } = require('./db/pool');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// ── Routes ──────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/users', require('./routes/users'));
app.use('/groups', require('./routes/groups'));
app.use('/logistics', require('./routes/logistics'));
app.use('/markets', require('./routes/markets'));
app.use('/products', require('./routes/products'));
app.use('/orders', require('./routes/orders'));
app.use('/loans', require('./routes/loans'));
app.use('/alerts', require('./routes/alerts'));
app.use('/admin', require('./routes/admin'));

app.get('/api/status', (req, res) => {
  res.json({
    app: process.env.APP_NAME || 'Digital Kilimo Hub',
    version: '1.0.0',
    status: '✓ Mfumo unafanya kazi',
  });
});

app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// ── Static frontend (website / app / admin) ──
// index.html (website), app.html (farmer app), admin.html (admin dashboard)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// ── Error handler (last) ─────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === '23505') { // unique_violation
    return res.status(409).json({ detail: 'Taarifa hii tayari ipo.' });
  }
  res.status(500).json({ detail: 'Hitilafu ya mfumo. Jaribu tena baadaye.' });
});

async function createFirstAdminIfNeeded() {
  const { rows } = await pool.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (rows[0]) return;

  const phone = process.env.FIRST_ADMIN_PHONE;
  const password = process.env.FIRST_ADMIN_PASSWORD;
  if (!phone || !password) {
    console.warn('⚠ No admin account exists yet, and FIRST_ADMIN_PHONE/FIRST_ADMIN_PASSWORD are not set.');
    console.warn('  Set both as environment variables and restart to create the first admin.');
    return;
  }
  const hashed = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (id, phone, password, role, status, first_name, last_name)
     VALUES ($1,$2,$3,'admin','active','Admin','Mkuu')`,
    [crypto.randomUUID(), phone, hashed]
  );
  console.log(`✓ First admin account created for ${phone}`);
}

async function start() {
  try {
    console.log('🌾 Digital Kilimo Hub — Inaanzisha...');
    await initSchema();
    console.log('✓ Database tables ziko tayari');
    await createFirstAdminIfNeeded();
    app.listen(PORT, () => {
      console.log(`✓ Mfumo uko tayari! http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('✗ Imeshindwa kuanzisha:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
