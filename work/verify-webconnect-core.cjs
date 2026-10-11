'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../shared/WebConnectCore.js');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
test('WebConnect contract maps TimeTrip GET and POST', () => {
  assert.deepEqual(core.route({method:'GET',action:'time_travel_admin'}), {operation:'timeTravel.read',input:null});
  assert.deepEqual(core.route({method:'POST',action:'time_travel_set',data:{enabled:false}}),
    {operation:'timeTravel.save',input:{enabled:false,now:'',target_month:''}});
  assert.equal(core.route({method:'GET',action:'missing'}),null);
});
test('Cloud Run TimeTrip uses shared WebConnect route, preserves auth and legacy URL', async () => {
  let saved;
  const api = createAdminApi({
    verifyIdToken: async token => ({uid:token,admin:token==='admin'}),
    getTimeTravel: async () => ({enabled:true}),
    saveTimeTravel: async input => {saved=input; return {ok:true};},
    readMember: async () => null,
    readMembers: async () => []
  });
  const req = (url,method='GET',body=null,token='admin') => api({url,method,body,authorization:'Bearer '+token});
  assert.equal((await req('/api/system/admin/time-travel')).body.enabled,true);
  assert.equal((await req('/api/admin/time-travel')).body.enabled,true);
  assert.equal((await req('/api/system/admin/time-travel','GET',null,'user')).status,403);
  assert.equal((await req('/api/system/admin/time-travel','POST',{enabled:false,now:'2026-01-01'})).status,200);
  assert.deepEqual(saved,{enabled:false,now:'2026-01-01',target_month:''});
  assert.equal((await req('/api/system/admin/time-travel','DELETE')).status,405);
});
