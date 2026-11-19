import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { postgresPool, closePostgresPool } from '../server/postgres.mjs';

export async function migratePostgres(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(724019, 1)');
    await client.query('CREATE TABLE IF NOT EXISTS _keion_migrations(name text PRIMARY KEY, checksum text NOT NULL)');
    await client.query('REVOKE ALL ON TABLE _keion_migrations FROM PUBLIC');
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const name of fs.readdirSync(directory).filter(x => x.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM _keion_migrations WHERE name=$1', [name]);
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO _keion_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  try {
    await migratePostgres(postgresPool());
    console.log('PostgreSQL migrations applied. Existing legacy tables are never overwritten.');
  } catch {
    console.error('Migration failed and rolled back. Check connection settings and existing tables. Do not run the legacy schema.sql.');
    process.exitCode = 1;
  } finally { await closePostgresPool(); }
}
