const fs = require('fs/promises');
const path = require('path');
const { pool } = require('./db');
const { hashPassword } = require('./auth');

const MIGRATION_LOCK_ID = 81248931;

async function readSqlFile(filePath) {
  try {
    const sql = await fs.readFile(filePath, 'utf8');
    return sql.trim() ? sql : '';
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function collectSqlMigrations() {
  const files = [];
  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
  const schemaSql = await readSqlFile(schemaPath);
  if (schemaSql) {
    files.push({ name: 'schema.sql', sql: schemaSql });
  }

  const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
  let migrationNames = [];
  try {
    migrationNames = (await fs.readdir(migrationsDir))
      .filter((name) => name.toLowerCase().endsWith('.sql'))
      .sort();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  for (const fileName of migrationNames) {
    const filePath = path.join(migrationsDir, fileName);
    const sql = await readSqlFile(filePath);
    if (!sql) continue;
    files.push({ name: `migrations/${fileName}`, sql });
  }

  return files;
}

async function runDbBootstrap({ logger = console } = {}) {
  if (!pool) {
    return { skipped: true, reason: 'DATABASE_URL not configured', total: 0, applied: 0 };
  }

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrations = await collectSqlMigrations();
    let applied = 0;

    for (const migration of migrations) {
      const existing = await client.query('SELECT name FROM schema_migrations WHERE name = $1 LIMIT 1', [migration.name]);
      if (existing.rowCount > 0) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        applied += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed (${migration.name}): ${error.message}`);
      }
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');
    const adminFullName = String(process.env.ADMIN_FULL_NAME || '').trim() || 'KitaabPadho Admin';
    const adminPhoneNumber = String(process.env.ADMIN_PHONE_NUMBER || '').trim();

    if (adminEmail || adminPassword) {
      if (!adminEmail || !adminPassword) {
        logger.warn('Admin bootstrap skipped: set both ADMIN_EMAIL and ADMIN_PASSWORD together.');
      } else if (adminPassword.length < 8) {
        logger.warn('Admin bootstrap skipped: ADMIN_PASSWORD must be at least 8 characters.');
      } else {
        const passwordHash = await hashPassword(adminPassword);
        const existingAdmin = await client.query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [adminEmail]);

        if (existingAdmin.rowCount > 0) {
          const adminId = existingAdmin.rows[0].id;
          await client.query(
            `UPDATE users
             SET
              password_hash = $2,
              role = 'admin',
              full_name = COALESCE(NULLIF($3, ''), full_name),
              phone_number = COALESCE(NULLIF($4, ''), phone_number)
             WHERE id = $1`,
            [adminId, passwordHash, adminFullName, adminPhoneNumber]
          );
          logger.log(`Admin bootstrap complete. Updated admin credentials for ${adminEmail}.`);
        } else {
          await client.query(
            `INSERT INTO users (email, full_name, phone_number, password_hash, role)
             VALUES ($1, $2, $3, $4, 'admin')`,
            [adminEmail, adminFullName, adminPhoneNumber || null, passwordHash]
          );
          logger.log(`Admin bootstrap complete. Created admin user ${adminEmail}.`);
        }
      }
    }

    if (applied > 0) {
      logger.log(`Database bootstrap complete. Applied ${applied}/${migrations.length} migration files.`);
    } else {
      logger.log(`Database bootstrap complete. No pending migrations (${migrations.length} files tracked).`);
    }

    return { skipped: false, total: migrations.length, applied };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } catch {
      // ignore unlock failures during shutdown races
    }
    client.release();
  }
}

module.exports = { runDbBootstrap };
