import { postgresPool, closePostgresPool } from '../server/postgres.mjs';
import { postgresDatabase } from '../server/postgres-database.mjs';
import { hashPassword } from '../server/crypto.mjs';
import { DEFAULT_SETTINGS } from '../server/constants.mjs';

try {
  const { ADMIN_STUDENT_ID: id, ADMIN_NAME: name, ADMIN_PASSWORD: password } = process.env;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id || '') || !name?.trim() || name.trim().length > 120 || !password || password.length < 10 || password.length > 128) {
    throw new Error('ADMIN_CONFIGURATION_INVALID');
  }
  const db = postgresDatabase(postgresPool());
  const results = await db.batch([
    db.statement("INSERT INTO members(student_id,name,role,password_hash,created_at) SELECT ?,?,'admin',?,? WHERE NOT EXISTS(SELECT 1 FROM members)", id, name.trim(), await hashPassword(password), new Date().toISOString()),
    db.statement('INSERT INTO settings(id,personal_open_days,monthly_band_limit,monthly_personal_limit,weekly_open_slots) VALUES(1,3,8,4,?) ON CONFLICT(id) DO NOTHING', JSON.stringify(DEFAULT_SETTINGS.weekly_open_slots)),
  ]);
  if (!results[0].meta.changes) throw new Error('ALREADY_INITIALIZED');
  console.log('Initial administrator created. Remove ADMIN_PASSWORD from .env now.');
} catch {
  console.error('Administrator creation failed. Check ADMIN_STUDENT_ID, ADMIN_NAME, ADMIN_PASSWORD and that the database has no members.');
  process.exitCode = 1;
} finally { await closePostgresPool(); }
