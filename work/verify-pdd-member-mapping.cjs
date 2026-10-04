'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const beforePath = path.resolve(__dirname, '../schema/migration/Member/Member.before.json');
const mappingPath = path.resolve(__dirname, '../schema/migration/Member/Member.mapping.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('Member.mapping belongs to Member migration', () => {
  const mapping = readJson(mappingPath);
  assert.equal(mapping.entity, 'member');
  assert.ok(Array.isArray(mapping.changes));
});

test('Member.mapping covers every Before header exactly once', () => {
  const before = readJson(beforePath);
  const mapping = readJson(mappingPath);
  const sources = mapping.changes.map(change => change.before);

  assert.deepEqual(sources, before.headers);
  assert.equal(new Set(sources).size, before.headers.length);
});

test('Member.mapping resolves every target name and targets are unique', () => {
  const mapping = readJson(mappingPath);
  const targets = mapping.changes.map(change => change.after);

  for (const target of targets) {
    assert.equal(typeof target, 'string');
    assert.notEqual(target.trim(), '');
  }

  assert.equal(new Set(targets).size, targets.length);
});

test('Member.mapping target field names are portable identifiers', () => {
  const mapping = readJson(mappingPath);

  for (const { after } of mapping.changes) {
    assert.match(after, /^[a-z][a-z0-9_]*$/);
  }
});

test('Member.mapping preserves explicit no-change decisions', () => {
  const mapping = readJson(mappingPath);
  const memberId = mapping.changes.find(change => change.before === 'member_id');

  assert.deepEqual(memberId, {
    before: 'member_id',
    after: 'member_id'
  });
});

test('Member.mapping contains the approved Member vocabulary', () => {
  const mapping = readJson(mappingPath);
  const actual = Object.fromEntries(
    mapping.changes.map(({ before, after }) => [before, after])
  );

  assert.equal(actual['氏名'], 'member_name');
  assert.equal(actual['フリガナ'], 'member_name_kana');
  assert.equal(actual['区分'], 'member_type');
  assert.equal(actual['状態'], 'status');
  assert.equal(actual['請求グループID'], 'billing_group_id');
  assert.equal(actual['入会日'], 'joined_date');
  assert.equal(actual['退会日'], 'withdrawn_date');
  assert.equal(actual['休会開始月'], 'suspension_start_month');
  assert.equal(actual['休会終了月'], 'suspension_end_month');
  assert.equal(actual['生年月日'], 'birth_date');
  assert.equal(actual['保険区分'], 'insurance_type');
  assert.equal(actual['メール'], 'email');
  assert.equal(actual['電話'], 'phone');
  assert.equal(actual['備考'], 'remarks');
  assert.equal(actual['現在級段位'], 'current_rank');
  assert.equal(actual['級段位登録元'], 'rank_source');
  assert.equal(actual['級段位更新日時'], 'rank_updated_at');
  assert.equal(actual['級段位起算日'], 'rank_start_date');
  assert.equal(actual['繰越稽古数'], 'carried_training_count');
  assert.equal(actual['審査可能稽古数'], 'eligible_training_count');
});
