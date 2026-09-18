import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
export function localDatabase(filename=':memory:') {
  const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY)');
  const journal=JSON.parse(fs.readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const entry of journal.entries){
    if(sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(entry.tag))continue;
    sqlite.exec('BEGIN');try{sqlite.exec(fs.readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));sqlite.prepare('INSERT INTO _local_migrations(name) VALUES(?)').run(entry.tag);sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
  const binding={
    prepare(sql){let args=[];return {bind(...values){args=values;return this;},first(){return sqlite.prepare(sql).get(...args)||null;},all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};},
    batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}},
  };
  return {DB:binding,sqlite,close:()=>sqlite.close()};
}
