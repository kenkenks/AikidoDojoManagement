'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
test('monthly selection contract mirrors the GAS persistence DTO fields', () => {
 const dto = read('gas/03_BillingRecord.js').match(/function DB_MonthlySelectionDTO\(selection, ctx\) \{([\s\S]*?)\n\}/);
 assert.ok(dto,'GAS DTO missing');
 const schema = read('schema/MonthlySelection.yml');
 for (const field of ['target_month','member_id','billing_group_id','plan_id','宣言日','状態','備考']) {
  assert.match(dto[1], new RegExp('(?:^|\\s)'+field+'\\s*:','m'));
  assert.ok(schema.includes('name: '+field),field);
 }
});
test('monthly selection source and proposed Firestore collection are explicit', () => {
 const schema = read('schema/MonthlySelection.yml');
 assert.match(schema,/sheet: "04_月次選択"/);
 assert.match(schema,/collection: monthly_selections/);
 assert.match(schema,/Proposed Firestore contract/);
});
test('GAS billing lookup remains DAO business owned', () => {
 assert.match(read('gas/03_BillingCore.js'),/daoBillingFindMonthlySelection_\(/);
 assert.match(read('gas/03_BillingRecord.js'),/append\('monthlySelections'/);
});
