import { postgresPool, closePostgresPool } from '../server/postgres.mjs';

try {
  await postgresPool().query('SELECT 1 AS connected');
  console.log('PostgreSQL connection OK');
} catch {
  console.error('PostgreSQL connection failed. Check DATABASE_URL, network access and TLS certificates.');
  process.exitCode = 1;
} finally {
  await closePostgresPool();
}
