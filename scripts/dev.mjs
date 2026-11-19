import http from 'node:http';
import fs from 'node:fs';
import { localDatabase } from './local-db.mjs';
import { createWorker } from '../server/worker.mjs';
import { loadAssets } from './assets.mjs';
import { postgresPool, closePostgresPool } from '../server/postgres.mjs';
import { postgresDatabase } from '../server/postgres-database.mjs';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
fs.mkdirSync('.local',{recursive:true});
const db=process.env.DATABASE_URL?null:localDatabase('.local/keion.sqlite');
const env=db?{DB:db.DB,LOCAL_DEV:true}:{DATABASE:postgresDatabase(postgresPool())};
const port=Number(process.env.PORT||4173);
const server=http.createServer(async(req,res)=>{
  try{
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>512000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const request=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    const response=await createWorker(loadAssets()).fetch(request,env);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.writeHead(500);res.end('Server error');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
process.on('SIGINT',()=>server.close(async()=>{db?.close();await closePostgresPool();process.exit(0);}));
