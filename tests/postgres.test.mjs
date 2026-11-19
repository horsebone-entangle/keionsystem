import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postgresOptions, closePostgresPool } from '../server/postgres.mjs';

test('PostgreSQL configuration rejects missing and invalid credentials without exposing them', () => {
  for (const value of [undefined, 'secret', 'https://user:secret@host/db', 'postgresql://user@host/db', 'postgresql://user:[YOUR-DATABASE-PASSWORD]@host/db']) {
    assert.throws(() => postgresOptions({ DATABASE_URL: value }), error => !error.message.includes('secret'));
  }
});

test('PostgreSQL pool uses bounded connections and verified TLS', () => {
  const options = postgresOptions({ DATABASE_URL: 'postgresql://user:password@host:6543/postgres' });
  assert.equal(options.max, 2);
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.connectionTimeoutMillis, 10000);
  assert.throws(() => postgresOptions({ DATABASE_URL: 'postgresql://user:password@host/db?sslmode=disable' }));
});

test('closing an unused pool does not require credentials', async () => {
  await closePostgresPool();
});

test('explicit CA certificate takes precedence over a local file path', () => {
  const options = postgresOptions({ DATABASE_URL: 'postgresql://user:password@host/db', DATABASE_CA_CERT: 'test-ca', DATABASE_CA_CERT_PATH: 'missing-file.crt' });
  assert.equal(options.ssl.ca, 'test-ca');
  assert.equal(options.ssl.rejectUnauthorized, true);
});
