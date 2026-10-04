'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  EXCLUDED_RELATIVE_FILES,
  findLiteralHits
} = require('../tools/scan-member-migration-references.cjs');

test('Scanner excludes the Member migration triplet itself', () => {
  assert.equal(EXCLUDED_RELATIVE_FILES.has('schema/migration/Member/Member.before.json'), true);
  assert.equal(EXCLUDED_RELATIVE_FILES.has('schema/migration/Member/Member.mapping.json'), true);
  assert.equal(EXCLUDED_RELATIVE_FILES.has('schema/migration/Member/Member.after.json'), true);
});

test('literal scanner reports every occurrence with line and column', () => {
  const hits = findLiteralHits('氏名: x\n状態: 氏名\n氏名氏名', '氏名');

  assert.deepEqual(
    hits.map(hit => [hit.line, hit.column]),
    [[1, 1], [2, 5], [3, 1], [3, 3]]
  );
});

test('literal scanner does not interpret migration names as regular expressions', () => {
  assert.equal(findLiteralHits('a.b aXb a.b', 'a.b').length, 2);
});

test('Scanner source is read-only with respect to repository files', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../tools/scan-member-migration-references.cjs'),
    'utf8'
  );

  assert.doesNotMatch(source, /writeFileSync\s*\(\s*file\b/);
  assert.doesNotMatch(source, /renameSync|unlinkSync|rmSync/);
});

test('Scanner supports an optional JSON report output', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../tools/scan-member-migration-references.cjs'),
    'utf8'
  );

  assert.match(source, /JSON\.stringify\(report/);
  assert.match(source, /process\.argv\[2\]/);
});
