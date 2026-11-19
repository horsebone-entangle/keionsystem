import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { localDatabase } from '../scripts/local-db.mjs';
import { api, todayJST } from '../server/api.mjs';
import { digest, hashPassword } from '../server/crypto.mjs';
import { SLOT_IDS } from '../server/constants.mjs';

async function fixture(t) {
  const db=localDatabase();t.after(()=>db.close());
  const call=async(path,body,cookie='',headers={},clientIp='192.0.2.1')=>{
    const response=await api(new Request('https://test.example/api/'+path,{
      method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',cookie,...headers},
      body:body===undefined?undefined:JSON.stringify(body),
    }),{DB:db.DB,LOCAL_DEV:true,CLIENT_IP:clientIp});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
  };
  const hash=await hashPassword('test-password-long');
  db.sqlite.prepare('INSERT INTO settings VALUES(1,3,8,4,?)').run(JSON.stringify(Object.fromEntries(Array.from({length:7},(_,i)=>[i,SLOT_IDS]))));
  for(const id of ['owner','a','b'])db.sqlite.prepare('INSERT INTO members(student_id,name,role,password_hash,created_at) VALUES(?,?,?,?,?)').run(id,id,id==='owner'?'admin':'member',hash,new Date().toISOString());
  const login=await call('login',{studentId:'a',password:'test-password-long'});
  return {db,call,cookie:login.cookie.split(';')[0],login};
}

test('security: unauthenticated and ordinary-member administrative mutations are denied',async t=>{
  const {call,cookie}=await fixture(t);
  for(const route of ['settings','room-days','room-slots','members/role','members/import','requests/review']){
    assert.equal((await call(route,{})).status,401,route);
    assert.equal((await call(route,{},cookie)).status,403,route);
  }
  assert.equal((await call('setup',{},'',{'oai-authenticated-user-id':'forged-owner'})).status,403);
});

test('security: SQL injection, fake sessions and identity spoofing do not bypass authorization',async t=>{
  const {call,cookie,db}=await fixture(t);
  assert.equal((await call('login',{studentId:"owner' OR 1=1--",password:'wrong'})).status,400);
  assert.equal((await call('state',undefined,'keion_session='+'a'.repeat(64))).body.user,null);
  assert.equal((await call('members/role',{student_id:'a',role:'admin',user:{role:'admin'}},cookie)).status,403);
  assert.equal(db.sqlite.prepare('SELECT role FROM members WHERE student_id=?').get('a').role,'member');
  assert.equal((await call('reservations/cancel',{id:"' OR 1=1--",student_id:'owner'},cookie)).status,404);
});

test('security: cross-origin requests, invalid JSON shapes and long passwords are rejected',async t=>{
  const {call,cookie}=await fixture(t);
  assert.equal((await call('password/change',{},cookie,{origin:'https://evil.example'})).status,403);
  assert.equal((await call('password/change',{},cookie,{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await call('password/change',[],cookie)).status,400);
  assert.equal((await call('login',{studentId:'a',password:'x'.repeat(129)})).status,401);
  assert.equal((await call('requests',{request_type:'create',band_name:'bad',member_entries:[null]},cookie)).status,400);
});

test('security: cookie flags, hashed token storage and expired sessions',async t=>{
  const {call,db,login,cookie}=await fixture(t);
  for(const flag of ['HttpOnly','Secure','SameSite=Strict'])assert.ok(login.cookie.includes(flag));
  const token=cookie.split('=')[1];
  assert.equal(db.sqlite.prepare('SELECT token_hash FROM sessions').get().token_hash,await digest(token));
  db.sqlite.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await call('state',undefined,cookie)).body.user,null);
});

test('security: HTML escaping encodes stored markup and attribute delimiters',()=>{
  const context=vm.createContext({document:{body:{dataset:{page:'portal'}},addEventListener(){}},window:{addEventListener(){}},structuredClone});
  vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context);
  const escape=vm.runInContext('escapeHtml',context);
  assert.equal(escape('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escape('"\'&'), '&quot;&#39;&amp;');
});

test('security: ordinary members cannot enumerate other identities, roles or booking student IDs',async t=>{
  const {call,cookie,db}=await fixture(t);
  db.sqlite.prepare('INSERT INTO bands(id,name) VALUES(?,?)').run('test-band','Visible Band');
  db.sqlite.prepare('INSERT INTO band_members(band_id,student_id) VALUES(?,?)').run('test-band','b');
  const other=await call('login',{studentId:'b',password:'test-password-long'});
  assert.equal((await call('reservations',{date:todayJST(),slot_id:'p1a',reservation_type:'band',band_id:'test-band'},other.cookie.split(';')[0])).status,201);
  assert.equal((await call('reservations',{date:todayJST(),slot_id:'p1b',reservation_type:'personal'},cookie)).status,201);
  const state=await call('state',undefined,cookie);
  assert.equal(state.body.user.role,'member');
  assert.deepEqual(state.body.members,[{student_id:'a',name:'a',role:'member'}]);
  assert.deepEqual(state.body.bandMembers,[]);
  const hidden=state.body.reservations.find(x=>x.slot_id==='p1a');
  assert.equal(hidden.student_id,null);
  assert.equal(hidden.id,null);
  assert.equal(hidden.bands.name,'Visible Band');
  assert.equal(state.body.reservations.find(x=>x.slot_id==='p1b').student_id,'a');
  const admin=await call('login',{studentId:'owner',password:'test-password-long'});
  const full=(await call('state',undefined,admin.cookie.split(';')[0])).body;
  assert.equal(full.members.length,3);
  assert.equal(full.reservations.find(x=>x.slot_id==='p1a').student_id,'b');
});

test('security: attacker login failures do not lock a victim on another trusted source',async t=>{
  const {call}=await fixture(t);
  for(let i=0;i<15;i++)assert.equal((await call('login',{studentId:'owner',password:'wrong'})).status,401);
  assert.equal((await call('login',{studentId:'owner',password:'test-password-long'})).status,429);
  assert.equal((await call('login',{studentId:'a',password:'test-password-long'})).status,200);
  assert.equal((await call('login',{studentId:'owner',password:'test-password-long'},'',{},'192.0.2.2')).status,200);
  assert.equal((await call('login',{studentId:'owner',password:'wrong'},'',{'x-forwarded-for':'192.0.2.2','x-real-ip':'192.0.2.2'})).status,429);
});

test('security: school network logins do not share an IP-wide attempt quota',async t=>{
  const {call}=await fixture(t);
  for(let i=0;i<100;i++)assert.equal((await call('login',{studentId:'missing_'+i,password:'wrong'},'',{},'192.0.2.99')).status,401);
  assert.equal((await call('login',{studentId:'another_id',password:'wrong'},'',{},'192.0.2.99')).status,401);
  assert.equal((await call('login',{studentId:'a',password:'test-password-long'},'',{},'192.0.2.99')).status,200);
});

test('security: malformed administrative CSV rows return 400 without partial changes',async t=>{
  const {call,db}=await fixture(t);
  const login=await call('login',{studentId:'owner',password:'test-password-long'});
  for(const row of [null,[],false,'invalid'])assert.equal((await call('members/import',{members:[{student_id:'new',name:'New'},row]},login.cookie.split(';')[0])).status,400);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM members').get().n,3);
});
