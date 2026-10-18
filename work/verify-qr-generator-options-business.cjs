'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQrGeneratorOptions } = require('../cloud/qr/generator-options.cjs');
const doc = (id, fields = {}) => ({ id, fields });
test('returns GAS-compatible QR option payload from physical Firestore fields', async () => {
  const rows = {
    members: [doc('M001', { member_name:'山田', member_type:'一般', status:'有効' }), doc('M002', {status:'退会'})],
    fees: [doc('P001', {display_name:'月額', membership_fee_type:'月会費', unit_price:1000,applicable_member_count:2}), doc('P002', {membership_fee_type:'回数料金', maximum_amount:2000})],
    plan_selection_rules: [doc('R001', {member_type:'一般',selectable_plan_id:'P001'})],
    dojos: [doc('D001', {display_name:'本部', status:'有効'})],
    teachers: [doc('T001', {member_id:'M001', position:'師範'})]
  };
  const get = createQrGeneratorOptions({masterDao:{async readPage(source){return {documents:rows[source.collection],nextPageToken:null};}}});
  const result = await get();
  assert.equal(result.ok, true);
  assert.deepEqual(result.members, [{member_id:'M001',member_name:'山田',member_type:'一般'}]);
  assert.equal(result.monthly_plans[0].plan_id, 'P001');
  assert.equal(result.onetime_plans[0].plan_id, 'P002');
  assert.equal(result.locations[0].location_id, 'D001');
  assert.equal(result.teachers[0].teacher_name, '山田');
  assert.equal(result.plan_selection_rules[0].selectable_plan_id, 'P001');
  assert.equal(result.plans[0].applicable_member_count,2);
});
test('follows pagination without truncation', async () => {
  let calls=0;
  const get=createQrGeneratorOptions({pageSize:1,masterDao:{async readPage(source,{pageToken}){
    if(source.collection !== 'members') return {documents:[],nextPageToken:null};
    calls++;
    return pageToken ? {documents:[doc('M2')],nextPageToken:null} : {documents:[doc('M1')],nextPageToken:'next'};
  }}});
  assert.equal((await get()).members.length,2);
  assert.equal(calls,2);
});
test('rejects repeated page tokens', async () => {
  const get=createQrGeneratorOptions({masterDao:{async readPage(){return {documents:[],nextPageToken:'loop'};}}});
  await assert.rejects(get(),/MASTER_PAGE_TOKEN_LOOP/);
});
test('rejects inconsistent document IDs', async () => {
  const get=createQrGeneratorOptions({masterDao:{async readPage(source){return {documents:source.collection==='members'?[doc('M1',{member_id:'M2'})]:[],nextPageToken:null};}}});
  await assert.rejects(get(),/MASTER_ID_MISMATCH/);
});
