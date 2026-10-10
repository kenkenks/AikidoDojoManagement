'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runBatch } = require('./command-batch.cjs');
const plan = require('./batch/dojo-teacher.json');
test('preflight invokes Copy in JSON order without writes', async () => {
  const seen = [];
  const result = await runBatch(plan, { copy: async args => { seen.push(args); return {ok:true,writes:0}; } });
  assert.deepEqual(seen.map(x => x.table), ['Dojo', 'Teacher']);
  assert.ok(seen.every(x => x.preflight && !x.execute));
  assert.equal(result.completed, 2);
});
test('batch stops on first failed Copy', async () => {
  let calls = 0;
  const result = await runBatch(plan, { copy: async () => { calls++; throw Error('NO_SCHEMA'); } });
  assert.equal(calls, 1); assert.equal(result.ok, false);
});
test('execute requires confirmation before invoking Copy', async () => {
  await assert.rejects(runBatch(plan, { execute: true, copy: () => { throw Error('SHOULD_NOT_CALL'); } }), /CONFIRMATION/);
});
test('rejects embedded execution flags', async () => {
  const bad = {version:1,jobs:[{command:'data.copy',args:{table:'Dojo',execute:true}}]};
  await assert.rejects(runBatch(bad, { copy: () => { throw Error('SHOULD_NOT_CALL'); } }), /BATCH_JOB_MODE_FORBIDDEN/);
});
