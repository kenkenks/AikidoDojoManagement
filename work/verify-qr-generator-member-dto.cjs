'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'gas', '21_QrGeneratorOptions.js'), 'utf8');

function load(overrides) {
  const sandbox = Object.assign({
    ensureSheetContext: ctx => ctx,
    createSheetContext: () => ({}),
    normalizeId_: value => String(value == null ? '' : value).trim(),
    isActiveMasterRow_: () => true,
    daoMemberGetAll_: () => [],
    getMembers: () => { throw new Error('legacy getMembers must not be used for QR members'); },
    getFees: () => [],
    assertSheetRowHeaders_: () => {},
    getPlanSelectionRules: () => [],
    getLocations: () => [],
    getTeachers: () => []
  }, overrides || {});
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: '21_QrGeneratorOptions.js' });
  return sandbox;
}

test('QR member options consume logical Member DTO fields only', () => {
  let calls = 0;
  const sandbox = load({
    daoMemberGetAll_: () => {
      calls += 1;
      return [
        { member_id: ' M002 ', member_name: ' 山田 二郎 ', member_type: '一般', status: '在籍' },
        { member_id: 'M001', member_name: '佐藤 一郎', member_type: '学生', status: '有効' },
        { member_id: 'M003', member_name: '退会 三郎', member_type: '一般', status: '退会' }
      ];
    }
  });

  const result = sandbox.qrGenerator_getOptions({});
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.members)), [
    { member_id: 'M001', member_name: '佐藤 一郎', member_type: '学生' },
    { member_id: 'M002', member_name: '山田 二郎', member_type: '一般' }
  ]);
});

test('QR teacher path remains on existing physical master-row contract', () => {
  const sandbox = load({
    daoMemberGetAll_: () => [
      { member_id: 'M001', member_name: '会員名', member_type: '一般', status: '在籍' }
    ],
    getTeachers: () => [
      { teacher_id: 'T001', member_id: 'M001', '氏名': '先生名', '状態': '有効' }
    ],
    isActiveMasterRow_: row => row['状態'] === '有効'
  });

  const result = sandbox.qrGenerator_getOptions({});
  assert.deepEqual(JSON.parse(JSON.stringify(result.teachers)), [
    { teacher_id: 'T001', teacher_name: '先生名', member_id: 'M001', role_name: '' }
  ]);
});
