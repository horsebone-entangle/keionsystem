import fs from 'node:fs';
import { loadAssets } from './assets.mjs';
const modules=['constants','database','crypto','api','worker'];
const code=modules.map(name=>fs.readFileSync(`server/${name}.mjs`,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/server/index.js',code+'\nconst assets='+JSON.stringify(loadAssets())+';\nexport default createWorker(assets);\n');
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
// D1's remote parser rejects CRLF inside trigger bodies. Keep the already
// applied table migration byte-for-byte; normalize only the failed trigger file.
const triggerPath='dist/.openai/drizzle/0001_booking_guards.sql';
fs.writeFileSync(triggerPath,fs.readFileSync(triggerPath,'utf8').replace(/\r\n/g,'\n'));
console.log('Built Worker with all seven pages and database migrations.');
