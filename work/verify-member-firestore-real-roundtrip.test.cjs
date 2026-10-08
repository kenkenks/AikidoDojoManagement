'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { roundTrip, assertTarget, assertId, COLLECTION, VALUES } = require('./verify-member-firestore-real-roundtrip.cjs');
const profile = { target:'dev-firebase', mode:'development', projectId:'dojo-management-dev', confirmedDevelopmentProject:'dojo-management-dev' };
const id = 'TEST_ROUNDTRIP_MOCK0001';
test('development target and explicit test ID are required', () => {
  assert.throws(() => assertTarget({...profile, projectId:'prod'}), /DEV_FIRESTORE_ONLY/);
  assert.throws(() => assertId('TEST_MEMBER_001'), /EXPLICIT_UNIQUE_TEST_ID_REQUIRED/);
});
test('synthetic values round-trip through DAO', async () => {
  let stored = null, writes = 0;
  const core = {
    async readById(source, key) { assert.equal(source.collection,COLLECTION); assert.equal(key,id); return stored; },
    async append(source, key, fields) { assert.equal(source.collection,COLLECTION); assert.equal(key,id); writes++; stored = {...fields}; }
  };
  const result = await roundTrip({profile,documentId:id,core});
  assert.equal(result.ok,true);
  assert.equal(writes,1);
  assert.deepEqual(stored,VALUES);
  await assert.rejects(roundTrip({profile,documentId:id,core}), /TEST_DOCUMENT_ALREADY_EXISTS/);
  assert.equal(writes,1);
});
