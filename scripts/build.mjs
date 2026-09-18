import fs from 'node:fs';
import { loadAssets } from './assets.mjs';
const modules=['constants','database','crypto','api','worker'];
const code=modules.map(name=>fs.readFileSync(`server/${name}.mjs`,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/server/index.js',code+'\nconst assets='+JSON.stringify(loadAssets())+';\nexport default createWorker(assets);\n');
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built Worker with all seven pages and database migrations.');
