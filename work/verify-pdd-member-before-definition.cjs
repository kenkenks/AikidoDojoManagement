'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const beforePath = path.resolve(
  __dirname,
  '../schema/migration/Member/Member.before.json'
);

function loadBefore() {
  return JSON.parse(fs.readFileSync(beforePath, 'utf8'));
}

test('Member.before records the observed GAS member sheet identity', () => {
  const before = loadBefore();
  assert.equal(before.entity, 'member');
  assert.equal(before.source, 'gas');
  assert.equal(before.sheet, '01_会員マスタ');
});

test('Member.before contains the 21 observed headers in source order', () => {
  const before = loadBefore();
  assert.deepEqual(before.headers, [
    'member_id',
    '氏名',
    'フリガナ',
    '区分',
    '状態',
    '請求グループID',
    '入会日',
    '退会日',
    '休会開始月',
    '休会終了月',
    '生年月日',
    '保険区分',
    'メール',
    '電話',
    '備考',
    '現在級段位',
    '級段位登録元',
    '級段位更新日時',
    '級段位起算日',
    '繰越稽古数',
    '審査可能稽古数'
  ]);
});

test('Member.before has no blank or duplicate headers', () => {
  const before = loadBefore();
  assert.equal(before.headers.length, 21);

  for (const header of before.headers) {
    assert.equal(typeof header, 'string');
    assert.notEqual(header.trim(), '');
  }

  assert.equal(new Set(before.headers).size, before.headers.length);
});

test('Member.before preserves current names without migration semantics', () => {
  const before = loadBefore();

  assert.ok(before.headers.includes('氏名'));
  assert.ok(before.headers.includes('状態'));

  assert.equal(Object.hasOwn(before, 'mapping'), false);
  assert.equal(Object.hasOwn(before, 'after'), false);
  assert.equal(Object.hasOwn(before, 'fields'), false);
});
