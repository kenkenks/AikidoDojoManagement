'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'gas', 'DAO_Business_Member.js'), 'utf8');

function load(overrides) {
  const sandbox = Object.assign({}, overrides || {});
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'DAO_Business_Member.js' });
  return sandbox;
}

test('Member DB row maps to the 21-field logical DTO contract', () => {
  const api = load();
  const physical = {
    member_id: 'M001',
    '氏名': '山田 太郎',
    'フリガナ': 'ヤマダ タロウ',
    '区分': '一般',
    '状態': '在籍',
    '請求グループID': 'BG001',
    '入会日': '2026-01-01',
    '退会日': '',
    '休会開始月': '',
    '休会終了月': '',
    '生年月日': '2000-01-01',
    '保険区分': '一般',
    'メール': 'member@example.com',
    '電話': '000-0000-0000',
    '備考': 'note',
    '現在級段位': '一級',
    '級段位登録元': 'manual',
    '級段位更新日時': '2026-10-05T12:00:00',
    '級段位起算日': '2026-09-01',
    '繰越稽古数': 2,
    '審査可能稽古数': 12
  };

  const dto = api.daoMemberDTOFromDBRow_(physical);
  assert.deepEqual(JSON.parse(JSON.stringify(dto)), {
    member_id: 'M001', member_name: '山田 太郎', member_name_kana: 'ヤマダ タロウ',
    member_type: '一般', status: '在籍', billing_group_id: 'BG001', joined_date: '2026-01-01',
    withdrawn_date: '', suspension_start_month: '', suspension_end_month: '', birth_date: '2000-01-01',
    insurance_type: '一般', email: 'member@example.com', phone: '000-0000-0000', remarks: 'note',
    current_rank: '一級', rank_source: 'manual', rank_updated_at: '2026-10-05T12:00:00',
    rank_start_date: '2026-09-01', carried_training_count: 2, eligible_training_count: 12
  });
  assert.equal(Object.keys(dto).length, 21);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, '氏名'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, '区分'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, '請求グループID'), false);
});

test('daoMemberGetAll_ reads members once and returns only logical DTO rows', () => {
  const calls = [];
  const physical = { member_id: 'M002', '氏名': '佐藤 花子', '区分': '学生', '状態': '有効' };
  const ctx = { marker: 'ctx' };
  const api = load({
    daoContext_: value => value,
    daoCore_: value => ({
      read(table, passedCtx) {
        calls.push([table, passedCtx, value]);
        return [physical];
      }
    })
  });

  const rows = api.daoMemberGetAll_(ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'members');
  assert.equal(calls[0][1], ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].member_id, 'M002');
  assert.equal(rows[0].member_name, '佐藤 花子');
  assert.equal(rows[0].member_type, '学生');
  assert.equal(rows[0].status, '有効');
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0], '氏名'), false);
});
