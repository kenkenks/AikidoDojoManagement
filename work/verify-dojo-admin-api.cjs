'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
function fixture() {
  const calls = [];
  const api = createAdminApi({
    verifyIdToken: async token => token === 'admin' ? {uid:'A',admin:true} : token === 'user' ? {uid:'B',admin:false,member:true} : null,
    getTimeTravel: async () => ({enabled:false}),
    getSystemContext: async () => ({ok:true, system_now:'2099-01-02 03:04:05', target_month:'2099-01', time_travel_enabled:true, timezone:'Asia/Tokyo', enabled:true, now:'SECRET'}),
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

test('Capabilities endpoint requires admin and reports supported routes', async () => {
  const {api} = fixture();
  const req = (authorization, method='GET') => api({url:'/api/admin/capabilities',authorization,method});
  assert.equal((await req('')).status, 401);
  assert.equal((await req('Bearer user')).status, 403);
  assert.equal((await req('Bearer admin','POST')).status, 405);
  const result = await req('Bearer admin');
  assert.equal(result.status, 200);
  assert.equal(result.body.contract, 'dojo-admin-api-v1');
  assert.ok(result.body.capabilities.includes('member.readById'));
  assert.ok(result.body.capabilities.includes('member.readByIds'));
});


test('Public system context: read-only, minimal response, no authentication', async () => {
  const {api} = fixture();
  const request = (authorization, method='GET') => api({url:'/api/system/context',authorization,method});
  const expected = {ok:true,system_now:'2099-01-02 03:04:05',target_month:'2099-01',time_travel_enabled:true,timezone:'Asia/Tokyo'};
  assert.equal((await request('')).status,200);
  assert.deepEqual((await request('')).body,expected);
  assert.deepEqual((await request('Bearer invalid')).body,expected);
  assert.equal((await request('','POST')).status,405);
  assert.equal((await api({url:'/api/admin/time-travel',method:'GET'})).status,401);
  assert.equal((await api({url:'/api/admin/time-travel',authorization:'Bearer user',method:'GET'})).status,403);
});

test('Public system context errors do not leak storage details or verify identities', async () => {
  const api = createAdminApi({
    verifyIdToken:async () => {throw Error('MUST_NOT_VERIFY');},
    getTimeTravel:async () => ({}),saveTimeTravel:async () => ({}),
    getSystemContext:async () => {throw new Error('SECRET_FIRESTORE_FAILURE');},
    readMember:async () => null,readMembers:async () => []
  });
  assert.deepEqual((await api({url:'/api/system/context',method:'GET'})).body,{error:'SYSTEM_CONTEXT_UNAVAILABLE'});
});
