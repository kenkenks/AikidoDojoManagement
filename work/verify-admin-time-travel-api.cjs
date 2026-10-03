'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminTimeTravelApi } = require('../cloud/time-travel/admin-api.cjs');

test('Admin TimeTrip API requires authenticated admin', async () => {
  const api = createAdminTimeTravelApi({
    verifyIdToken: async token => token === 'admin-token' ? { uid: 'U1', admin: true } : { uid: 'U2', admin: false },
    getTimeTravel: async () => ({ enabled: false }),
    saveTimeTravel: async input => ({ ok: true, input })
  });
  assert.equal((await api({ method: 'GET', url: '/api/admin/time-travel' })).status, 401);
  assert.equal((await api({ method: 'GET', url: '/api/admin/time-travel', authorization: 'Bearer user-token' })).status, 403);
  assert.equal((await api({ method: 'GET', url: '/api/admin/time-travel', authorization: 'Bearer admin-token' })).status, 200);
});

test('Admin TimeTrip API routes GET and POST to application boundary', async () => {
  const calls = [];
  const api = createAdminTimeTravelApi({
    verifyIdToken: async () => ({ uid: 'ADMIN', admin: true }),
    getTimeTravel: async () => { calls.push(['get']); return { enabled: false, now: '', target_month: '' }; },
    saveTimeTravel: async input => { calls.push(['save', input]); return { ok: true, effective: input }; }
  });
  const auth = 'Bearer token';
  const get = await api({ method: 'GET', url: '/api/admin/time-travel', authorization: auth });
  assert.deepEqual(get.body, { enabled: false, now: '', target_month: '' });

  const input = { enabled: true, now: '2099-07-09T10:00:00+09:00', target_month: '2099-07' };
  const post = await api({ method: 'POST', url: '/api/admin/time-travel', authorization: auth, body: input });
  assert.equal(post.status, 200);
  assert.deepEqual(calls, [['get'], ['save', input]]);
});

test('Admin TimeTrip API rejects unknown route and invalid POST body', async () => {
  const api = createAdminTimeTravelApi({
    verifyIdToken: async () => ({ uid: 'ADMIN', admin: true }),
    getTimeTravel: async () => ({}),
    saveTimeTravel: async () => ({ ok: true })
  });
  const auth = 'Bearer token';
  assert.equal((await api({ method: 'GET', url: '/api/admin/other', authorization: auth })).status, 404);
  assert.equal((await api({ method: 'POST', url: '/api/admin/time-travel', authorization: auth, body: null })).status, 400);
});
