'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createFirestoreCore} = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const config = {projectId:'demo-qrtest', mode:'emulator', host:'127.0.0.1:8080'};
const prefix = 'projects/demo-qrtest/databases/(default)/documents/fees/';
test('readPage returns decoded rows and next page token', async () => {
  const urls = [];
  const core = createFirestoreCore(config, {fetchImpl: async (url, init) => {
    urls.push(url);
    assert.equal(init.method, 'GET');
    return {ok:true, json:async () => ({documents:[{name:prefix+'P001',fields:{plan_id:{stringValue:'P001'}}}],nextPageToken:'NEXT'})};
  }});
  const result = await core.readPage({collection:'fees'}, {pageSize:25,pageToken:'PREV'});
  assert.deepEqual(result, {documents:[{id:'P001',fields:{plan_id:'P001'}}],nextPageToken:'NEXT'});
  assert.match(urls[0], /pageSize=25/);
  assert.match(urls[0], /pageToken=PREV/);
});
test('readPage handles empty collection', async () => {
  const core = createFirestoreCore(config, {fetchImpl: async () => ({ok:true,json:async()=>({})})});
  assert.deepEqual(await core.readPage({collection:'fees'}), {documents:[],nextPageToken:null});
});
test('readPage rejects unbounded size and malformed response', async () => {
  const core = createFirestoreCore(config, {fetchImpl: async () => ({ok:true,json:async()=>({documents:[{name:prefix+'P001/child/x'}]})})});
  await assert.rejects(core.readPage({collection:'fees'},{pageSize:501}), /INVALID_PAGE_PARAMS/);
  await assert.rejects(core.readPage({collection:'fees'}), /INVALID_PAGE_RESPONSE/);
});
