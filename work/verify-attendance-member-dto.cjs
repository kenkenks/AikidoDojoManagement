'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'gas', 'DAO_Business_Attendance.js'), 'utf8');

function load(overrides) {
  const sandbox = Object.assign({
    daoContext_: ctx => ctx,
    normalizeId_: value => String(value == null ? '' : value).trim(),
    daoMemberGetAll_: () => [],
    daoCore_: () => ({
      read: table => { throw new Error('unexpected DAO Core read: ' + table); }
    }),
    isActiveMasterRow_: () => true,
    parseAttendanceDate_: value => value,
    formatAttendanceDate_: value => String(value == null ? '' : value)
  }, overrides || {});
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'DAO_Business_Attendance.js' });
  return sandbox;
}

test('Attendance member map consumes logical Member DTOs and preserves DTO values', () => {
  let calls = 0;
  const active = { member_id: ' M001 ', member_name: '佐藤 一郎', status: '在籍' };
  const blankStatus = { member_id: 'M002', member_name: '山田 二郎', status: '' };
  const retired = { member_id: 'M003', member_name: '退会 三郎', status: '退会' };
  const sandbox = load({
    daoMemberGetAll_: () => {
      calls += 1;
      return [active, blankStatus, retired, { member_id: '  ', member_name: 'IDなし', status: '有効' }];
    }
  });

  const result = sandbox.daoAttendanceGetMemberMap_({});
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(result).sort(), ['M001', 'M002']);
  assert.equal(result.M001, active);
  assert.equal(result.M002, blankStatus);
  assert.equal(result.M003, undefined);
});

test('Attendance member map does not read Member physical rows directly', () => {
  let memberReads = 0;
  const sandbox = load({
    daoMemberGetAll_: () => {
      memberReads += 1;
      return [{ member_id: 'M001', member_name: '会員名', status: '有効' }];
    },
    daoCore_: () => ({
      read: table => {
        if (table === 'members') throw new Error('physical Member read must stay behind Member DTO package');
        return [];
      }
    })
  });

  const result = sandbox.daoAttendanceGetMemberMap_({});
  assert.equal(memberReads, 1);
  assert.equal(result.M001.member_name, '会員名');
});
