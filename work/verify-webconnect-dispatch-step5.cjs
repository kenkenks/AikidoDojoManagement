'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const dispatch = createDispatch(createAdminApi({
  verifyIdToken: async token => ({ uid: token, admin: token === 'admin' }),
  getTimeTravel: async () => ({ enabled: false }),
  saveTimeTravel: async () => ({ ok: true }),
  getSystemContext: async () => ({ ok: true, system_now: '2026-10-13', target_month: '2026-10', time_travel_enabled: false }),
  readMember: async id => ({ id }),
  readMembers: async ids => ids.map(id => ({ id }))
}));
const admin = { authorization: 'Bearer admin' };
test('single member read uses existing authenticated handler', async () => {
  assert.equal((await dispatch({action:'member_read',input:{member_id:'M 01'}})).status,401);
  assert.equal((await dispatch({action:'member_read',input:{member_id:'M 01'},context:{authorization:'Bearer user'}})).status,403);
  const result = await dispatch({action:'member_read',input:{member_id:'M 01'},context:admin});
  assert.equal(result.status,200);
  assert.deepEqual(result.body,{id:'M 01'});
});
test('batch member read uses existing authenticated handler', async () => {
  assert.equal((await dispatch({action:'members_read',input:{ids:['M01']}})).status,401);
  const result = await dispatch({action:'members_read',input:{ids:['M01','M02']},context:admin});
  assert.equal(result.status,200);
  assert.deepEqual(result.body,{members:[{id:'M01'},{id:'M02'}]});
});
test('invalid member inputs fail closed', async () => {
  assert.equal((await dispatch({action:'member_read',input:{member_id:'../a'},context:admin})).status,400);
  assert.equal((await dispatch({action:'members_read',input:{ids:'M01'},context:admin})).status,400);
});
