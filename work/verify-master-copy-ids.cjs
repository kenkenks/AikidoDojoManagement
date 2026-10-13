'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../gas/31_GAS2FirebaseCopySource.js'), 'utf8');
function invoke(name, rows) {
  const ctx = {createSheetContext: () => ({}), getExaminationStandardRows: () => rows, getPlanSelectionRules: () => rows};
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return ctx[name]().records;
}
test('examination standard uses source ES ID, not composite ID', () => {
  const records = invoke('runner_gas2firebase_copy_examinationstandard_source', [{examination_standard_id:'ES001', 現在級段位:'五級', 次回審査級段位:'四級'}]);
  assert.equal(records[0].examination_standard_id, 'ES001');
  assert.equal(Object.hasOwn(records[0], 'copy_standard_id'), false);
});
test('examination standard rejects missing ID', () => {
  assert.throws(() => invoke('runner_gas2firebase_copy_examinationstandard_source', [{現在級段位:'五級', 次回審査級段位:'四級'}]), /COPY_SOURCE_ID_REQUIRED/);
});
test('plan rule uses explicit source ID', () => {
  const records = invoke('runner_gas2firebase_copy_planselectionrule_source', [{plan_selection_rule_id:'PSR001',member_type:'一般',selectable_plan_id:'P001'}]);
  assert.equal(records[0].plan_selection_rule_id, 'PSR001');
  assert.equal(Object.hasOwn(records[0], 'copy_rule_id'), false);
});
test('plan rule rejects implicit composite ID', () => {
  assert.throws(() => invoke('runner_gas2firebase_copy_planselectionrule_source', [{member_type:'一般',selectable_plan_id:'P001'}]), /COPY_SOURCE_ID_REQUIRED/);
});
