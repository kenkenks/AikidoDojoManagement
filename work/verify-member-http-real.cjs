'use strict';
// Read-only HTTP smoke test for a locally running dojo API server.
// DOJO_ADMIN_ID_TOKEN is a Firebase ID token obtained locally; never paste it into chat.
const assert = require('node:assert/strict');
const base = process.env.DOJO_API_BASE_URL || 'http://127.0.0.1:8082';
const token = process.env.DOJO_ADMIN_ID_TOKEN;
const id = process.env.DOJO_TEST_MEMBER_ID || 'TEST_MEMBER_001';
async function call(ids, bearer) {
  const response = await fetch(base + '/api/admin/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(15000)
  });
  return { status: response.status, body: await response.json() };
}
(async () => {
  const hello = await fetch(base + '/hello', { signal: AbortSignal.timeout(5000) });
  assert.equal(hello.status, 200, 'API server health');
  console.log('PASS: local API server /hello');
  const anonymous = await call([id]);
  assert.equal(anonymous.status, 401, 'anonymous access denied');
  console.log('PASS: anonymous request -> 401');
  if (!token) {
    console.log('SKIP: authenticated real Firestore read (DOJO_ADMIN_ID_TOKEN not provided)');
    process.exitCode = 2;
    return;
  }
  const result = await call([id, 'TEST_MISSING_MEMBER_6D', id], token);
  assert.equal(result.status, 200, `authenticated read: ${result.status} ${JSON.stringify(result.body)}`);
  assert.ok(Array.isArray(result.body.members), 'members array');
  assert.equal(result.body.members.length, 3);
  assert.ok(result.body.members[0] && typeof result.body.members[0] === 'object', 'existing member');
  assert.equal(result.body.members[1], null, 'missing member');
  assert.deepEqual(result.body.members[2], result.body.members[0], 'duplicate ID');
  console.log('PASS: authenticated HTTP -> Firestore batchGet');
  console.log('PASS: existing, missing and duplicate IDs in requested order');
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
