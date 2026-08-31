// ══════════════════════════════════════════
//  auth.js — JWT verification + role guards
// ══════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');

const SECRET = process.env.SECRET_KEY;
const EXPIRES_IN_MIN = parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '10080', 10); // 1 week default

if (!SECRET) {
  console.error('✗ SECRET_KEY is not set. Set a long random value as an environment variable before accepting real traffic.');
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, {
    expiresIn: `${EXPIRES_IN_MIN}m`,
  });
}

// Verifies the bearer token and attaches the full user row (with role sub-profile) to req.user.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ detail: 'Hakuna token. Ingia kwanza.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, SECRET);
    } catch (e) {
      return res.status(401).json({ detail: 'Token si sahihi au imekwisha muda wake.' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ detail: 'Mtumiaji hajapatikana.' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ detail: 'Akaunti yako imezuiwa. Wasiliana na msimamizi.' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireActive(req, res, next) {
  if (req.user.status !== 'active') {
    return res.status(400).json({ detail: 'Akaunti yako haifanyi kazi.' });
  }
  next();
}

// Usage: requireRole('admin') or requireRole('mkulima', 'admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ detail: `Huna ruhusa. Inahitajika: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireActive, requireRole };
