'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { copy } = require('./gas2firebase-copy.cjs');
test('Dojo schema retains 状態 and 備考 during dry-run', async () => {
  const result = await copy({
    table: 'Dojo',
    records: [{location_id:'D001', 表示名:'テスト道場', 道場名:'テスト道場', 状態:'有効', 備考:'検証用'}],
    core: { append() { throw Error('WRITE_NOT_ALLOWED'); } }
  });
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.equal(result.writes, 0);
  assert.equal(result.collection, 'dojos');
});
