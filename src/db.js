const { Pool } = require('pg');
const config = require('./config');

const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false } })
  : null;

async function query(text, params = []) {
  if (!pool) {
    throw new Error('DATABASE_URL not configured');
  }
  return pool.query(text, params);
}

module.exports = { pool, query };
