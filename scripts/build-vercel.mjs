import fs from 'node:fs';
import path from 'node:path';
import { assetFiles } from './assets.mjs';

// Only explicitly public assets are copied; no credentials, source or SQL.
fs.rmSync('public', { recursive: true, force: true });
for (const file of assetFiles) {
  fs.mkdirSync(path.dirname('public/' + file), { recursive: true });
  fs.copyFileSync(file, 'public/' + file);
}
console.log('Vercel public assets built.');
