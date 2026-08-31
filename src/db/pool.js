// ══════════════════════════════════════════
//  pool.js — PostgreSQL connection pool
// ══════════════════════════════════════════
const { Pool, types } = require('pg');
const fs = require('fs');
const path = require('path');

// pg returns BIGINT (OID 20) as strings by default, to avoid precision loss
// past 2^53. TZS amounts in this app never get remotely close to that, so
// parse them as real numbers — otherwise every amount field silently becomes
// a string in the API response, which breaks frontend math (e.g. "400000" + 1).
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set. Add a PostgreSQL database and set DATABASE_URL as an environment variable.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL; local/dev connections do not use it.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

async function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
}

module.exports = { pool, initSchema };
