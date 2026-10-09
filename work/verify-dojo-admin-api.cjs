'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
function fixture() {
  const calls = [];
  const api = createAdminApi({
    verifyIdToken: async token => token === 'admin' ? {uid:'A',admin:true} : {uid:'B',admin:false},
    getTimeTravel: async () => ({enabled:false}),
    saveTimeTravel: async body => ({saved:body}),
    readMember: async id => { calls.push(id); return id === 'M1' ? {member_id:id} : null; },
    readMembers: async ids => { calls.push([...ids]); return ids.map(id => id === 'M1' ? {member_id:id} : null); }
  });
  return {api,calls};
}
test('TimeTrip and Member share admin authentication and route correctly', async () => {
  const {api,calls}=fixture();
  const req=(url,authorization='Bearer admin',method='GET',body=null)=>api({url,authorization,method,body});
  assert.equal((await req('/api/admin/time-travel')).body.enabled,false);
  assert.deepEqual((await req('/api/admin/members/M1')).body,{member_id:'M1'});
  assert.deepEqual(calls,['M1']);
  assert.equal((await req('/api/admin/members/M2')).status,404);
  assert.equal((await req('/api/admin/members/M1','')).status,401);
  assert.equal((await req('/api/admin/members/M1','Bearer user')).status,403);
  assert.equal((await req('/api/admin/members/M1','Bearer admin','POST')).status,405);
  assert.equal((await req('/api/admin/members/%2F')).status,400);
  assert.equal((await req('/api/admin/unknown')).status,404);
  assert.deepEqual(calls,['M1','M2']);
});

test('Member batch route validates auth, input, order and missing records', async () => {
  const {api,calls} = fixture();
  const req = (method, body, authorization = 'Bearer admin') =>
    api({url:'/api/admin/members',method,body,authorization});
  assert.equal((await req('POST',{ids:['M1']},'')).status,401);
  assert.equal((await req('POST',{ids:['M1']},'Bearer user')).status,403);
  assert.equal((await req('GET',null)).status,405);
  for (const ids of [null, 'M1', ['M1','bad/id'], Array(101).fill('M1')]) {
    assert.equal((await req('POST',{ids})).status,400);
  }
  assert.deepEqual((await req('POST',{ids:['M1','M2','M1']})).body,
    {members:[{member_id:'M1'},null,{member_id:'M1'}]});
  assert.deepEqual(calls,[['M1','M2','M1']]);
});
