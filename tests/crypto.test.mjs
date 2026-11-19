import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, passwordNeedsRehash } from '../server/crypto.mjs';

test('new password hashes use 600000 iterations and legacy hashes still verify',async()=>{
  const legacy=await hashPassword('legacy-password','a'.repeat(64),100000);
  const current=await hashPassword('legacy-password');
  assert.equal(await verifyPassword('legacy-password',legacy),true);
  assert.equal(await verifyPassword('wrong-password',legacy),false);
  assert.equal(passwordNeedsRehash(legacy),true);
  assert.equal(passwordNeedsRehash(current),false);
  assert.match(current,/^pbkdf2-sha256\$600000\$/);
  assert.equal(await verifyPassword('legacy-password',current),true);
  assert.equal(await verifyPassword('legacy-password',current.replace('600000','9999999999')),false);
});
