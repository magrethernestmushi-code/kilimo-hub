// ══════════════════════════════════════════
//  routes/orders.js — Maagizo (business buyers ordering products)
// ══════════════════════════════════════════
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /orders — your own orders (business), or all orders (admin)
router.get('/', async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const { rows } = await pool.query(
        `SELECT o.*, p.name AS product_name, p.emoji, bp.business_name
         FROM orders o LEFT JOIN products p ON p.id = o.product_id
         LEFT JOIN business_profiles bp ON bp.id = o.buyer_id
         ORDER BY o.created_at DESC LIMIT 200`
      );
      return res.json(rows);
    }
    const { rows: bizRows } = await pool.query('SELECT id FROM business_profiles WHERE user_id = $1', [req.user.id]);
    if (!bizRows[0]) return res.json([]);
    const { rows } = await pool.query(
      `SELECT o.*, p.name AS product_name, p.emoji FROM orders o
       LEFT JOIN products p ON p.id = o.product_id
       WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`,
      [bizRows[0].id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /orders — Biashara only, buys a product at its group_price
router.post('/', requireRole('biashara'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { product_id, quantity_kg } = req.body;
    if (!product_id || !(quantity_kg > 0)) return res.status(422).json({ detail: 'Bidhaa na kiasi (kg) vinahitajika' });

    await client.query('BEGIN');
    const { rows: prodRows } = await client.query('SELECT * FROM products WHERE id = $1 AND is_active = true FOR UPDATE', [product_id]);
    const product = prodRows[0];
    if (!product) { await client.query('ROLLBACK'); return res.status(404).json({ detail: 'Bidhaa haijapatikana' }); }
    if (product.stock_kg < quantity_kg) { await client.query('ROLLBACK'); return res.status(400).json({ detail: `Akiba haitoshi. Iliyopo: ${product.stock_kg} kg` }); }

    const { rows: bizRows } = await client.query('SELECT * FROM business_profiles WHERE user_id = $1', [req.user.id]);
    const biz = bizRows[0];
    if (!biz) { await client.query('ROLLBACK'); return res.status(400).json({ detail: 'Profile ya biashara haijapatikana' }); }

    const totalPrice = Math.round(product.group_price * quantity_kg);
    const orderId = crypto.randomUUID();
    const { rows } = await client.query(
      `INSERT INTO orders (id, buyer_id, product_id, quantity_kg, unit_price, total_price, status)
       VALUES ($1,$2,$3,$4,$5,$6,'Inasubiri') RETURNING *`,
      [orderId, biz.id, product.id, quantity_kg, product.group_price, totalPrice]
    );
    await client.query('UPDATE products SET stock_kg = stock_kg - $1, updated_at = now() WHERE id = $2', [quantity_kg, product.id]);
    await client.query('UPDATE business_profiles SET total_purchases = total_purchases + $1, total_orders = total_orders + 1, updated_at = now() WHERE id = $2', [totalPrice, biz.id]);
    await client.query(
      `INSERT INTO transactions (id, user_id, type, amount, payment_method, status, notes)
       VALUES ($1,$2,'Agizo',$3,'M-Pesa','Imekamilika',$4)`,
      [crypto.randomUUID(), req.user.id, totalPrice, `Aliagiza ${quantity_kg}kg ya ${product.name}`]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /orders/:id/status — [Admin]
router.patch('/:id/status', requireRole('admin'), async (req, res, next) => {
  try {
    const { new_status } = req.body;
    if (!['Inasubiri', 'Imethibitishwa', 'Imesafirishwa', 'Imekamilika'].includes(new_status)) {
      return res.status(422).json({ detail: 'Hali si sahihi' });
    }
    const { rows } = await pool.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [new_status, req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Agizo halijapatikana' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
