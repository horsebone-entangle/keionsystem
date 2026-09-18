import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localDatabase } from '../scripts/local-db.mjs';
import { api, todayJST } from '../server/api.mjs';
import { SLOT_IDS } from '../server/constants.mjs';
import { createWorker } from '../server/worker.mjs';
import { loadAssets } from '../scripts/assets.mjs';

function client(db){return async(endpoint,body,cookie='',extra={})=>{
 const response=await api(new Request('http://localhost/api/'+endpoint,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',cookie,...extra},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db.DB,LOCAL_DEV:true});
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
};}
const account={studentId:'owner',name:'管理者',password:'a-secure-test-password'};
async function fixture(t){const db=localDatabase();t.after(()=>db.close());const call=client(db),setup=await call('setup',account);assert.equal(setup.status,200);return {db,call,admin:setup.cookie};}
async function addMember(call,admin,id='s001'){
 const result=await call('members/import',{members:[{student_id:id,name:id,role:'member'}]},admin);assert.equal(result.status,200);
 const code=result.body.invitations[0].invitation_code;
 const registered=await call('register',{studentId:id,name:id,password:'member-password',invitationCode:code});assert.equal(registered.status,200);
 return {cookie:registered.cookie,code};
}
async function openAll(call,admin){const weekly=Object.fromEntries(Array.from({length:7},(_,i)=>[i,SLOT_IDS]));assert.equal((await call('settings',{weekly_open_slots:weekly},admin)).status,200);}

test('setup, session identity, invitation registration, password secrecy and logout',async t=>{
 const {db,call,admin}=await fixture(t);
 assert.equal((await call('setup',account)).status,409);
 const anonymous=await call('state');assert.deepEqual(anonymous.body.members,[]);
 assert.equal((await call('settings',{monthly_band_limit:500})).status,401);
 const {cookie,code}=await addMember(call,admin);
 assert.equal((await call('register',{studentId:'s001',name:'s001',password:'changed-password',invitationCode:code})).status,403);
 assert.equal((await call('login',{studentId:'s001',password:'wrong'})).status,401);
 const logged=await call('login',{studentId:'s001',password:'member-password'});assert.equal(logged.status,200);
 const state=await call('state',undefined,cookie);assert.equal(state.body.user.student_id,'s001');assert.ok(!JSON.stringify(state.body).includes('password'));
 assert.match(db.sqlite.prepare('SELECT password_hash FROM members WHERE student_id=?').get('s001').password_hash,/^pbkdf2-sha256/);
 assert.equal((await call('settings',{monthly_band_limit:500},cookie)).status,403);
 assert.equal((await call('members/role',{student_id:'owner',role:'member'},admin)).status,400);
 assert.equal((await call('settings',{},admin,{origin:'https://evil.example'})).status,403);
 await call('logout',{},cookie);assert.equal((await call('state',undefined,cookie)).body.user,null);
});
test('booking rules, simultaneous slot requests, cancellation ownership and monthly quota',async t=>{
 const {call,admin}=await fixture(t);await openAll(call,admin);
 const member=await addMember(call,admin),other=await addMember(call,admin,'s002');
 const booking={date:todayJST(),slot_id:'p1a',reservation_type:'personal'};
 const results=await Promise.all([call('reservations',booking,member.cookie),call('reservations',booking,other.cookie)]);
 assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);
 const owner=results[0].status===201?member:other,nonowner=results[0].status===201?other:member,id=results.find(x=>x.status===201).body.id;
 assert.equal((await call('reservations/cancel',{id},nonowner.cookie)).status,404);
 assert.equal((await call('reservations/cancel',{id},owner.cookie)).status,200);
 await call('settings',{monthly_personal_limit:1},admin);
 assert.equal((await call('reservations',booking,member.cookie)).status,201);
 assert.equal((await call('reservations',{...booking,slot_id:'p1b'},member.cookie)).status,409);
 assert.equal((await call('reservations',{...booking,date:'2020-01-01'},member.cookie)).status,400);
 assert.equal((await call('reservations',{...booking,date:'2026-02-30'},member.cookie)).status,400);
 assert.equal((await call('reservations',{...booking,slot_id:'invalid'},member.cookie)).status,400);
 await call('room-days',{date:booking.date,is_open:false},admin);
 assert.equal((await call('reservations',{...booking,slot_id:'p2a'},other.cookie)).status,409);
 await call('room-days',{date:booking.date,is_open:true},admin);
 await call('room-slots',{date:booking.date,slot_id:'p2a',is_open:false},admin);
 assert.equal((await call('reservations',{...booking,slot_id:'p2a'},other.cookie)).status,409);
});
test('atomic band approvals, membership changes, repeated review and dissolution',async t=>{
 const {db,call,admin}=await fixture(t);await openAll(call,admin);
 const a=await addMember(call,admin),b=await addMember(call,admin,'s002');
 const request={request_type:'create',band_name:'Test Band',member_entries:[{student_id:'s001',name:'s001'}]};
 const created=await call('requests',request,a.cookie);assert.equal(created.status,201);
 assert.equal((await call('requests/review',{id:created.body.id,status:'approved'},a.cookie)).status,403);
 assert.equal((await call('requests/review',{id:created.body.id,status:'approved'},admin)).status,200);
 assert.equal((await call('requests/review',{id:created.body.id,status:'approved'},admin)).status,409);
 const band=(await call('state',undefined,a.cookie)).body.bands[0];
 const booking={date:todayJST(),slot_id:'p1a',reservation_type:'band',band_id:band.id};
 assert.equal((await call('reservations',booking,b.cookie)).status,409);
 assert.equal((await call('reservations',booking,a.cookie)).status,201);
 const update=await call('requests',{...request,request_type:'update_members',member_entries:[{student_id:'s002',name:'s002'}]},a.cookie);
 assert.equal((await call('requests/review',{id:update.body.id,status:'approved'},admin)).status,200);
 assert.equal((await call('reservations',{...booking,slot_id:'p1b'},a.cookie)).status,409);
 assert.equal((await call('reservations',{...booking,slot_id:'p1b'},b.cookie)).status,201);
 assert.equal((await call('requests',{...request,request_type:'dissolve'},a.cookie)).status,403);
 const dissolve=await call('requests',{...request,request_type:'dissolve'},b.cookie);
 assert.equal((await call('requests/review',{id:dissolve.body.id,status:'approved'},admin)).status,200);
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM reservations WHERE cancelled_at IS NULL").get().n,0);
 assert.equal((await call('state',undefined,b.cookie)).body.bands.length,0);
});
test('approval failure rolls back both review and membership edits',async t=>{
 const {db,call,admin}=await fixture(t);const a=await addMember(call,admin);
 const request=await call('requests',{request_type:'create',band_name:'Rollback',member_entries:[{student_id:'s001',name:'s001'}]},a.cookie);
 db.sqlite.prepare('UPDATE members SET name=? WHERE student_id=?').run('Changed','s001');
 assert.equal((await call('requests/review',{id:request.body.id,status:'approved'},admin)).status,409);
 assert.equal(db.sqlite.prepare('SELECT status FROM band_requests WHERE id=?').get(request.body.id).status,'pending');
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM bands').get().n,0);
});
test('CSV import is all-or-nothing and preserves existing passwords',async t=>{
 const {db,call,admin}=await fixture(t);await addMember(call,admin);
 assert.equal((await call('members/import',{members:[{student_id:'s003',name:'New'},{student_id:'s004',name:'Bad',role:'root'}]},admin)).status,400);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM members WHERE student_id=?').get('s003').n,0);
 await call('members/import',{members:[{student_id:'s001',name:'Renamed',password:'replacement-password'}]},admin);
 assert.equal((await call('login',{studentId:'s001',password:'member-password'})).status,200);
 assert.equal((await call('login',{studentId:'s001',password:'replacement-password'})).status,401);
});
test('durable data survives closing and reopening database',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'keion-test-'));const filename=path.join(dir,'db.sqlite');
 try{let db=localDatabase(filename);await client(db)('setup',account);db.close();db=localDatabase(filename);assert.equal((await client(db)('login',account)).status,200);db.close();}finally{fs.rmSync(dir,{recursive:true});}
});
test('all pages and assets are served; source, database and configuration stay private',async()=>{
 const worker=createWorker(loadAssets());
 for(const route of ['/','/register','/reservation','/requests','/admin','/admin/manage-member/','/admin/manage-booking/','/app.js','/styles.css','/favicon.svg'])assert.equal((await worker.fetch(new Request('https://test.example'+route),{})).status,200,route);
 for(const route of ['/server/api.mjs','/.local/keion.sqlite','/.openai/hosting.json','/supabase/schema.sql'])assert.equal((await worker.fetch(new Request('https://test.example'+route),{})).status,404,route);
});
