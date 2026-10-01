'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runner = fs.readFileSync(path.join(root, 'gas', '27_PddTimeTravelRealSettingRunner.js'), 'utf8');
const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
const settingSheetName = settingDefinition.sources.gas.sheet;

function load({ hasSheet = true } = {}) {
  const values = [['キー', '値']];
  const sheet = {
    getDataRange() { return { getValues() { return values.map(r => r.slice()); } }; }
  };
  let state = { enabled: false, target_month: '' };
  const app = {
    getTimeTravel() { return { enabled: state.enabled, target_month: state.target_month }; },
    saveTimeTravel(input) {
      if (input.enabled) {
        state = { enabled: true, target_month: input.target_month };
        values.splice(1, values.length - 1,
          ['TIME_TRAVEL_ENABLED', 'TRUE'],
          ['DEBUG_DATE', input.now],
          ['DEBUG_TARGET_MONTH', input.target_month]);
      } else {
        state = { enabled: false, target_month: '' };
        values.splice(1, values.length - 1,
          ['TIME_TRAVEL_ENABLED', 'FALSE'],
          ['DEBUG_DATE', ''],
          ['DEBUG_TARGET_MONTH', '']);
      }
      return { ok: true, effective: { time_travel_enabled: state.enabled, target_month: state.target_month } };
    }
  };
  const context = {
    console: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet() { return { getSheetByName(name) { return hasSheet && name === settingSheetName ? sheet : null; } }; } },
    dojoPddDescribeSettingGas_() { return { sheet: settingSheetName, requiredHeaders: ['キー', '値'] }; },
    dojoTimeTravelStep2Application_() { return app; }
  };
  vm.createContext(context);
  vm.runInContext(runner, context);
  return { context, values };
}

test('PDD001 final runner exercises real Setting route and leaves observable disabled state', () => {
  const { context } = load();
  const result = context.runner_pdd001_timeTravelRealSetting();
  assert.equal(result.ok, true);
  assert.equal(result.success, 5);
  assert.deepEqual(Array.from(result.checks), ['READ','CREATE','UPDATE','READ_AGAIN','DISABLE']);
  assert.equal(result.physical[1][0], 'TIME_TRAVEL_ENABLED');
  assert.equal(result.physical[1][1], 'FALSE');
});

test('PDD001 final runner refuses to fabricate missing Setting sheet', () => {
  const { context } = load({ hasSheet: false });
  assert.throws(() => context.runner_pdd001_timeTravelRealSetting(), /PDD001_TIME_TRAVEL_MISSING/);
});
