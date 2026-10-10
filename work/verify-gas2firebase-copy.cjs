'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { copy } = require('./gas2firebase-copy.cjs');
const schema = { entity: 'Member', collection: 'members', documentIdField: 'member_id', fields: [
  { logicalName: 'member_id', physicalName: 'member_id', type: 'string', documentId: true, required: true },
  { logicalName: 'member_name', physicalName: 'member_name', type: 'string', required: true }
] };
const records = [{ member_id: 'A', member_name: 'Sample' }, { member_id: 'B', member_name: 'Test' }];
test('dry-run never touches DAO', async () => {
  const result = await copy({ records, schema, core: { readById() { throw Error('SHOULD_NOT_READ'); } } });
  assert.equal(result.total, 2); assert.equal(result.writes, 0); assert.equal(result.mode, 'dry-run');
});
test('execute creates only missing records and verifies', async () => {
  const data = new Map([['A', { member_name: 'Existing' }]]);
  const core = { async readById(_, id) { return data.get(id) || null; }, async append(_, id, fields) { data.set(id, fields); } };
  const result = await copy({ records, schema, core, execute: true, confirm: 'dojo-management-dev' });
  assert.equal(result.created, 1); assert.equal(result.skipped, 1); assert.equal(result.writes, 1);
  assert.deepEqual(data.get('A'), { member_name: 'Existing' });
});
test('rejects duplicates before any writes', async () => {
  await assert.rejects(copy({ records: [records[0], records[0]], schema }), /COPY_DUPLICATE_DOCUMENT_ID/);
});
test('execute requires explicit confirmation', async () => {
  await assert.rejects(copy({ records, schema, execute: true }), /COPY_EXECUTE_CONFIRMATION_REQUIRED/);
});
test('rejects unsupported direction', async () => {
  await assert.rejects(copy({ records, schema, source: 'firestore' }), /COPY_DIRECTION_UNSUPPORTED/);
});
test('preflight reports existing IDs without writes', async () => {
  const core = { async readByIds(_, ids) { assert.deepEqual(ids, ['A', 'B']); return [{member_name:'Existing'}, null]; },
    async append() { throw Error('SHOULD_NOT_WRITE'); } };
  const result = await copy({ records, schema, core, preflight: true });
  assert.equal(result.planned_create, 1);
  assert.equal(result.planned_skip, 1);
  assert.equal(result.writes, 0);
});
test('execute refuses incomplete preflight before writing', async () => {
  let writes = 0;
  const core = { async readByIds() { return [null]; }, async append() { writes++; } };
  await assert.rejects(copy({ records, schema, core, execute: true, confirm: 'dojo-management-dev' }), /COPY_PREFLIGHT_INCOMPLETE/);
  assert.equal(writes, 0);
});

test('verify-existing diagnoses mismatched fields without writing', async () => {
  const core = {
    async readByIds() { return [{member_name:'Changed',member_id:'A'}, null]; },
    async append() { throw Error('SHOULD_NOT_WRITE'); }
  };
  const result = await copy({ records, schema, core, verifyExisting: true });
  assert.equal(result.mismatched, 1);
  assert.equal(result.writes, 0);
  assert.equal(result.differences[0].id, 'A');
  assert.equal(result.differences[0].fields[0].field, 'member_name');
});
test('execute counts successful append before read-back mismatch', async () => {
  let count = 0;
  const core = {
    async readByIds() { return [null, null]; },
    async readById() { return {member_name:'Altered'}; },
    async append() { count++; }
  };
  const result = await copy({ records, schema, core, execute: true, confirm:'dojo-management-dev' });
  assert.equal(result.ok, false);
  assert.equal(result.writes, 1);
  assert.equal(count, 1);
  assert.equal(result.mismatch.id, 'A');
});
test('verify-existing ignores object property ordering', async () => {
  const core = { async readByIds() { return [{member_name:'Sample'}, null]; } };
  const result = await copy({ records, schema, core, verifyExisting:true });
  assert.equal(result.verified, 1);
  assert.equal(result.mismatched, 0);
});

test('execute --limit 1 creates only one missing record', async () => {
  const data = new Map();
  const core = {
    async readByIds(_, ids) { return ids.map(id => data.get(id) ?? null); },
    async readById(_, id) { return data.get(id) ?? null; },
    async append(_, id, fields) { if (data.has(id)) throw Error('EXISTS'); data.set(id, fields); }
  };
  const result = await copy({ records, schema, core, execute: true, confirm: 'dojo-management-dev', limit: 1 });
  assert.equal(result.created, 1);
  assert.equal(result.verified, 1);
  assert.equal(result.writes, 1);
  assert.equal(data.size, 1);
  assert.equal(result.planned_create, 2);
});
test('limit counts creations, not skipped existing records', async () => {
  const data = new Map([['A', {member_name: 'Sample'}]]);
  const core = {
    async readByIds(_, ids) { return ids.map(id => data.get(id) ?? null); },
    async readById(_, id) { return data.get(id) ?? null; },
    async append(_, id, fields) { data.set(id, fields); }
  };
  const result = await copy({ records, schema, core, execute: true, confirm: 'dojo-management-dev', limit: 1 });
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.writes, 1);
});
test('rejects zero, negative, noninteger limit and limit without execute', async () => {
  for (const limit of [0, -1, 1.5, NaN]) {
    await assert.rejects(copy({ records, schema, limit, execute: true }), /COPY_LIMIT_INVALID/);
  }
  await assert.rejects(copy({ records, schema, limit: 1 }), /COPY_LIMIT_REQUIRES_EXECUTE/);
});

test('Setting requires explicit key allowlist before any read', async () => {
  await assert.rejects(copy({ table: 'Setting', records: [], schema }), /COPY_SETTING_KEYS_REQUIRED/);
});
test('Setting can render explicitly selected keys with portable schema', async () => {
  const result = await copy({ table: 'Setting', keys: ['PUBLIC_SETTING'], records: [{key:'PUBLIC_SETTING',value:'enabled'}] });
  assert.equal(result.collection, 'settings');
  assert.equal(result.total, 1);
  assert.equal(result.writes, 0);
});
