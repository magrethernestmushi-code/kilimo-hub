// ══════════════════════════════════════════
//  serialize.js — shape DB rows into API responses
// ══════════════════════════════════════════
const { pool } = require('../db/pool');

function tierForScore(score) {
  if (score > 700) return 'Dhahabu';
  if (score > 600) return 'Fedha';
  return 'Shaba';
}

// Attaches the correct sub-profile (farmer/driver/business) to a user row
// and strips the password hash. Used by /auth and /users responses.
async function serializeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  safe.full_name = `${user.first_name} ${user.last_name}`;
  safe.farmer_profile = null;
  safe.driver_profile = null;
  safe.business_profile = null;

  if (user.role === 'mkulima') {
    const { rows } = await pool.query('SELECT * FROM farmer_profiles WHERE user_id = $1', [user.id]);
    if (rows[0]) safe.farmer_profile = rows[0];
  } else if (user.role === 'dereva') {
    const { rows } = await pool.query('SELECT * FROM driver_profiles WHERE user_id = $1', [user.id]);
    if (rows[0]) safe.driver_profile = rows[0];
  } else if (user.role === 'biashara') {
    const { rows } = await pool.query('SELECT * FROM business_profiles WHERE user_id = $1', [user.id]);
    if (rows[0]) safe.business_profile = rows[0];
  }
  return safe;
}

module.exports = { tierForScore, serializeUser };
