import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migratePostgres } from '../scripts/migrate-postgres.mjs';
import { postgresDatabase, postgresStatement } from '../server/postgres-database.mjs';
import { api, todayJST } from '../server/api.mjs';
import { SLOT_IDS } from '../server/constants.mjs';

// PGlite runs real PostgreSQL SQL, but has one connection and no advisory locks.
async function fixture(t) {
  const engine = new PGlite();
  t.after(() => engine.close());
  let tail = Promise.resolve();
  const query = async (input, values) => {
    const text = typeof input === 'string' ? input : input.text;
    if (text.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (text.includes('CREATE TABLE members')) {
      await engine.exec(text.replaceAll('PERFORM pg_advisory_xact_lock(724019,1);', 'NULL;'));
      return { rows: [], rowCount: 0 };
    }
    const result = await engine.query(text, values || input.values);
    return { ...result, rowCount: result.affectedRows || 0 };
  };
  const pool = {
    async connect() {
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      return { query, release };
    },
    async query(...args) {
      const client = await this.connect();
      try { return await client.query(...args); } finally { client.release(); }
    },
  };
  await migratePostgres(pool);
  await migratePostgres(pool);
  const db = postgresDatabase(pool);
  const call = async (endpoint, body, cookie = '', env = { DATABASE: db, LOCAL_DEV: true }) => {
    const response = await api(new Request('http://localhost/api/' + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const account = { studentId: 'owner', name: 'Owner', password: 'test-admin-password' };
  assert.equal((await call('setup', account, '', { DATABASE: db })).status, 403);
  const admin = await call('setup', account);
  assert.equal(admin.status, 200);
  assert.equal((await call('settings', { weekly_open_slots: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, SLOT_IDS])) }, admin.cookie)).status, 200);
  const imported = await call('members/import', { members: [{ student_id: 's001', name: 'Member' }] }, admin.cookie);
  const member = await call('register', { studentId: 's001', name: 'Member', password: 'member-password', invitationCode: imported.body.invitations[0].invitation_code });
  assert.equal(member.status, 200);
  return { call, db, admin: admin.cookie, member: member.cookie };
}

test('PostgreSQL login, authorization, booking quota, collision and cancellation', async t => {
  const { call, admin, member } = await fixture(t);
  assert.equal((await call('login', { studentId: 's001', password: 'member-password' })).status, 200);
  assert.equal((await call('login', { studentId: 's001', password: 'wrong' })).status, 401);
  assert.equal((await call('settings', {}, member)).status, 403);
  assert.equal((await call('members/role', { student_id: 's001', role: 'admin' }, admin)).status, 200);
  assert.equal((await call('members/role', { student_id: 's001', role: 'member' }, admin)).status, 200);
  await call('settings', { monthly_personal_limit: 1 }, admin);
  const booking = { date: todayJST(), slot_id: 'p1a', reservation_type: 'personal' };
  const results = await Promise.all([call('reservations', booking, member), call('reservations', booking, member)]);
  assert.deepEqual(results.map(x => x.status).sort(), [201, 409]);
  assert.equal((await call('reservations', { ...booking, slot_id: 'p1b' }, member)).status, 409);
  const id = results.find(x => x.status === 201).body.id;
  assert.equal((await call('reservations/cancel', { id }, member)).status, 200);
  assert.equal((await call('reservations', booking, member)).status, 201);
  await call('room-days', { date: todayJST(), is_open: false }, admin);
  assert.equal((await call('reservations', { ...booking, slot_id: 'p2a' }, admin)).status, 409);
});

test('PostgreSQL atomic approvals, malformed entries, membership changes and dissolution', async t => {
  const { call, db, admin, member } = await fixture(t);
  const request = { request_type: 'create', band_name: 'Test', member_entries: [{ student_id: 's001', name: 'Member' }] };
  assert.equal((await call('requests', { ...request, member_entries: 'bad' }, member)).status, 400);
  assert.equal((await call('requests', { ...request, member_entries: [null] }, member)).status, 400);
  const created = await call('requests', request, member);
  await db.run('UPDATE members SET name=? WHERE student_id=?', 'Changed', 's001');
  assert.equal((await call('requests/review', { id: created.body.id, status: 'approved' }, admin)).status, 409);
  assert.equal((await db.one('SELECT status FROM band_requests WHERE id=?', created.body.id)).status, 'pending');
  await db.run('UPDATE members SET name=? WHERE student_id=?', 'Member', 's001');
  assert.equal((await call('requests/review', { id: created.body.id, status: 'approved' }, admin)).status, 200);
  assert.equal((await call('requests/review', { id: created.body.id, status: 'approved' }, admin)).status, 409);
  const booking = { date: todayJST(), slot_id: 'p1a', reservation_type: 'band', band_id: created.body.id };
  assert.equal((await call('reservations', booking, admin)).status, 409);
  assert.equal((await call('reservations', booking, member)).status, 201);
  const update = await call('requests', { ...request, request_type: 'update_members', member_entries: [{ student_id: 'owner', name: 'Owner' }] }, member);
  assert.equal((await call('requests/review', { id: update.body.id, status: 'approved' }, admin)).status, 200);
  assert.equal((await call('reservations', { ...booking, slot_id: 'p1b' }, member)).status, 409);
  const dissolve = await call('requests', { ...request, request_type: 'dissolve' }, admin);
  assert.equal((await call('requests/review', { id: dissolve.body.id, status: 'approved' }, admin)).status, 200);
  assert.equal((await db.all('SELECT * FROM reservations WHERE cancelled_at IS NULL')).length, 0);
});

test('PostgreSQL batch rolls back every statement on failure', async t => {
  const { db } = await fixture(t);
  await assert.rejects(db.batch([
    db.statement('INSERT INTO bands(id,name) VALUES(?,?)', 'a', 'Same'),
    db.statement('INSERT INTO bands(id,name) VALUES(?,?)', 'b', 'Same'),
  ]));
  assert.equal((await db.all('SELECT * FROM bands')).length, 0);
  assert.deepEqual(postgresStatement('SELECT ? AS value', ["' OR 1=1"]), { text: 'SELECT $1 AS value', values: ["' OR 1=1"] });
});

test('PostgreSQL password change revokes sessions and accepts only the new password', async t => {
  const { call, member, db, admin } = await fixture(t);
  const oldHash=(await db.one('SELECT password_hash FROM members WHERE student_id=?','s001')).password_hash;
  const second=await call('login',{studentId:'s001',password:'member-password'});
  const body={currentPassword:'member-password',newPassword:'new-member-password',confirmPassword:'new-member-password'};
  assert.equal((await call('password/change',{...body,currentPassword:'incorrect'},member)).status,403);
  assert.equal((await call('password/change',body,member)).status,200);
  assert.equal((await call('state',undefined,member)).body.user,null);
  assert.equal((await call('state',undefined,second.cookie)).body.user,null);
  assert.equal((await call('state',undefined,admin)).body.user.role,'admin');
  assert.equal((await call('login',{studentId:'s001',password:'member-password'})).status,401);
  assert.equal((await call('login',{studentId:'s001',password:'new-member-password'})).status,200);
  const hash=(await db.one('SELECT password_hash FROM members WHERE student_id=?','s001')).password_hash;
  assert.notEqual(hash,oldHash);
  assert.match(hash,/^pbkdf2-sha256/);
  const changed=await Promise.all([
    call('password/change',{currentPassword:'test-admin-password',newPassword:'next-admin-password',confirmPassword:'next-admin-password'},admin),
    call('password/change',{currentPassword:'test-admin-password',newPassword:'other-admin-password',confirmPassword:'other-admin-password'},admin),
  ]);
  assert.equal(changed.filter(x=>x.status===200).length,1);
});
