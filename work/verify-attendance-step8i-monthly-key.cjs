'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {monthlySelectionDocumentId: key, assertMonthlySelectionIdentity: verify} = require('../cloud/attendance/monthly-selection-key.cjs');
test('same group and month yield deterministic document ID', () => {
  assert.equal(key('BG001','2026-10'), key('BG001','2026-10'));
  assert.notEqual(key('BG001','2026-10'), key('BG001','2026-11'));
});
test('separator characters in group IDs cannot collide', () => {
  const pairs = [['A_B','2026-10'],['A','2026-10'],['A-B','2026-10'],['A__B','2026-10']];
  assert.equal(new Set(pairs.map(([g,m]) => key(g,m))).size, pairs.length);
});
test('invalid or noncanonical identities fail closed', () => {
  for (const g of ['', ' A', 'A/B', 'A B', 'a'.repeat(129), null]) assert.throws(() => key(g,'2026-10'));
  for (const m of ['2026-00','2026-13','2026-1','202610',null]) assert.throws(() => key('BG001',m));
});
test('document identity and record fields must match', () => {
  const row = {billing_group_id:'BG001',target_month:'2026-10',plan_id:'P001'};
  assert.equal(verify(row,key('BG001','2026-10')),key('BG001','2026-10'));
  assert.throws(() => verify(row,key('BG002','2026-10')), /MISMATCH/);
  assert.throws(() => verify({...row,target_month:'2026-11'},key('BG001','2026-10')), /MISMATCH/);
});
