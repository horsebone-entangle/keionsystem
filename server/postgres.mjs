import pg from 'pg';
import fs from 'node:fs';

let pool;

export function postgresOptions(env = process.env) {
  const value = env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required');
  let url;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL is invalid'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || value.includes('[YOUR-')) {
    throw new Error('DATABASE_URL must contain PostgreSQL connection details');
  }
  // Keep TLS verification enabled; URI options must not override it.
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('ssl')) throw new Error('Configure TLS in the server, not DATABASE_URL');
  }
  const ca = env.DATABASE_CA_CERT || (env.DATABASE_CA_CERT_PATH ? fs.readFileSync(env.DATABASE_CA_CERT_PATH, 'utf8') : undefined);
  return {
    connectionString: value,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  };
}

export function postgresPool() {
  if (!pool) {
    pool = new pg.Pool(postgresOptions());
    // Never log the driver error: it may contain connection or query details.
    pool.on('error', () => console.error('POSTGRES_IDLE_CONNECTION_ERROR'));
  }
  return pool;
}

export async function closePostgresPool() {
  const current = pool;
  pool = undefined;
  if (current) await current.end();
}
