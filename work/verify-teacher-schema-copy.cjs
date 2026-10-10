'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { copy } = require('./gas2firebase-copy.cjs');
test('Teacher schema accepts all observed source fields without writing', async () => {
  const result = await copy({
    table: 'Teacher',
    records: [{ teacher_id:'T001', member_id:'M001', 表示名:'先生', 氏名:'先生', 役職:'指導員', 組織役割:'指導', 適用開始日:'2026-01-01', 適用終了日:'', 出席受付可:true, 会費回収可:false, 状態:'有効', 備考:'確認用' }],
    core: { append() { throw Error('WRITE_NOT_ALLOWED'); } }
  });
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.equal(result.writes, 0);
  assert.equal(result.collection, 'teachers');
});

test('Teacher rejects string permission values instead of silently converting', async () => {
  await assert.rejects(copy({ table: 'Teacher', records: [{teacher_id:'T002', 出席受付可:'TRUE'}] }), /TYPE_MISMATCH:出席受付可:boolean/);
});
