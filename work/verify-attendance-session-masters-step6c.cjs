'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createSessionMasterReader} = require('../cloud/attendance/session-masters.cjs');
test('reads existing physical master collections without collection-wide scans', async () => {
  const calls = [];
  const read = createSessionMasterReader({masterDao: {
    readById: async (source, id) => {calls.push(['read', source.collection, id]); return {location_id: id};},
    queryEqual: async (source, filters) => {calls.push(['query', source.collection, filters]); return [];}
  }});
  assert.deepEqual(await read('L001'), {location:{location_id:'L001'},billingBlocks:[],trainingSlots:[]});
  assert.deepEqual(calls[0], ['read','dojos','L001']);
  assert.deepEqual(calls.slice(1).map(x => x[1]).sort(), ['billing_blocks','training_slots']);
  assert.ok(calls.slice(1).every(x => x[2].length === 1 && x[2][0].field === 'location_id' && x[2][0].value === 'L001'));
});
test('missing dojo fails closed without querying other collections', async () => {
  let queried = false;
  const read = createSessionMasterReader({masterDao:{readById:async()=>null,queryEqual:async()=>{queried=true;return [];}}});
  assert.deepEqual(await read('L001'),{location:null,billingBlocks:[],trainingSlots:[]});
  assert.equal(queried,false);
});
test('invalid ids are rejected before DAO calls', async () => {
  let called = false;
  const read = createSessionMasterReader({masterDao:{readById:async()=>{called=true;},queryEqual:async()=>{called=true;}}});
  for (const id of ['', '../x', ' L001', 'a/b', 'a\\b', 1]) await assert.rejects(read(id), /INVALID_LOCATION_ID/);
  assert.equal(called,false);
});
test('invalid DAO responses fail closed', async () => {
  const read = createSessionMasterReader({masterDao:{readById:async()=>({location_id:'L001'}),queryEqual:async()=>null}});
  await assert.rejects(read('L001'),/INVALID_SESSION_MASTERS/);
});
