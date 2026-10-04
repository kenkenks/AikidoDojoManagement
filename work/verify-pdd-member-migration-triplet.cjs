'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const beforePath = path.join(root, 'schema/migration/Member/Member.before.json');
const mappingPath = path.join(root, 'schema/migration/Member/Member.mapping.json');
const afterPath = path.join(root, 'schema/migration/Member/Member.after.json');
const { buildAfter } = require('../tools/build-member-migration-after.cjs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('Member.after is exactly reproducible from Before + Mapping', () => {
  const before = readJson(beforePath);
  const mapping = readJson(mappingPath);
  const committedAfter = readJson(afterPath);
  assert.deepEqual(committedAfter, buildAfter(before, mapping));
});

test('Member triplet keeps entity and source identity', () => {
  const before = readJson(beforePath);
  const mapping = readJson(mappingPath);
  const after = readJson(afterPath);

  assert.equal(before.entity, 'member');
  assert.equal(mapping.entity, before.entity);
  assert.equal(after.entity, before.entity);
  assert.equal(after.source, before.source);
  assert.equal(after.sheet, before.sheet);
});

test('Member.after has one portable target for every Before header', () => {
  const before = readJson(beforePath);
  const after = readJson(afterPath);

  assert.equal(after.headers.length, before.headers.length);
  assert.equal(new Set(after.headers).size, after.headers.length);

  for (const header of after.headers) {
    assert.match(header, /^[a-z][a-z0-9_]*$/);
  }
});

test('Member.after contains no Japanese field names', () => {
  const after = readJson(afterPath);
  const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
  for (const header of after.headers) {
    assert.equal(japanese.test(header), false, header);
  }
});

test('Member mapping preserves Before order when generating After', () => {
  const before = readJson(beforePath);
  const mapping = readJson(mappingPath);
  const after = readJson(afterPath);
  const byBefore = new Map(mapping.changes.map(c => [c.before, c.after]));

  assert.deepEqual(after.headers, before.headers.map(h => byBefore.get(h)));
});

test('After Builder rejects an incomplete Mapping', () => {
  const before = readJson(beforePath);
  const mapping = readJson(mappingPath);
  const incomplete = {
    ...mapping,
    changes: mapping.changes.slice(0, -1)
  };

  assert.throws(
    () => buildAfter(before, incomplete),
    /Missing mapping for Before header/
  );
});
