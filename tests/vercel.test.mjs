import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import handler from '../api/index.js';
import { assetFiles } from '../scripts/assets.mjs';

test('Vercel build contains only public assets', () => {
  execFileSync(process.execPath, ['scripts/build-vercel.mjs']);
  const files = fs.readdirSync('public', { recursive: true }).filter(file => fs.statSync('public/' + file).isFile()).map(file => file.replaceAll('\\', '/')).sort();
  assert.deepEqual(files, [...assetFiles].sort());
  assert.ok(!files.includes('config.js'));
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.outputDirectory, 'public');
  const headers=config.headers[0].headers;
  assert.ok(headers.some(x=>x.key==='X-Frame-Options'&&x.value==='DENY'));
  assert.ok(headers.some(x=>x.key==='Content-Security-Policy'&&x.value.includes("frame-ancestors 'none'")));
});

test('Vercel API fails safely without connection credentials', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const response = await handler.fetch(new Request('https://test.example/api/state'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.ok(!(await response.text()).includes('postgresql://'));
  } finally {
    if (previous !== undefined) process.env.DATABASE_URL = previous;
  }
});
