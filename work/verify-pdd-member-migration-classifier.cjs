'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifyHit, classifyReport } = require('../tools/classify-member-migration-references.cjs');

test('explicit member occurrence is REPLACE', () => {
  const line = 'const x = member["氏名"];';
  const column = line.indexOf('氏名') + 1;
  assert.deepEqual(
    classifyHit('氏名', { text: line, raw_text: line, column }, 'gas/x.js'),
    { classification: 'REPLACE', reason: 'explicit-member-field' }
  );
});

test('same-line non-member occurrence is not REPLACE', () => {
  const line = 'return member["氏名"] || teacher["氏名"];';
  const column = line.lastIndexOf('氏名') + 1;
  assert.notEqual(
    classifyHit('氏名', { text: line, raw_text: line, column }, 'gas/x.js').classification,
    'REPLACE'
  );
});

test('row field access is REVIEW because provenance is unknown', () => {
  const line = 'const x = row["状態"];';
  const column = line.indexOf('状態') + 1;
  assert.deepEqual(
    classifyHit('状態', { text: line, raw_text: line, column }, 'gas/x.js'),
    { classification: 'REVIEW', reason: 'row-provenance-required' }
  );
});

test('header lookup is REVIEW because provenance is unknown', () => {
  const line = 'const i = headers.indexOf("氏名");';
  const column = line.indexOf('氏名') + 1;
  assert.deepEqual(
    classifyHit('氏名', { text: line, raw_text: line, column }, 'gas/x.js'),
    { classification: 'REVIEW', reason: 'header-provenance-required' }
  );
});

test('documentation is KEEP', () => {
  assert.equal(classifyHit('氏名', { text: '氏名', column: 1 }, 'docs/x.md').classification, 'KEEP');
});

test('baseline snapshot is KEEP', () => {
  const line = 'const x = member["氏名"];';
  const column = line.indexOf('氏名') + 1;
  assert.deepEqual(
    classifyHit('氏名', { text: line, raw_text: line, column }, 'work/x-baseline.txt'),
    { classification: 'KEEP', reason: 'baseline-snapshot' }
  );
});

test('migration specification tests are KEEP', () => {
  assert.equal(
    classifyHit('氏名', { text: '氏名', column: 1 }, 'work/verify-pdd-member-mapping.cjs').classification,
    'KEEP'
  );
});

test('ordinary work files are REVIEW', () => {
  assert.equal(
    classifyHit('氏名', { text: 'const x="氏名";', column: 10 }, 'work/verify-other.cjs').classification,
    'REVIEW'
  );
});

test('report preserves every scanned hit exactly once', () => {
  const scan = {
    entity: 'member',
    results: [{
      before: '氏名', after: 'member_name', action: 'review', hit_count: 2,
      files: [{ file: 'gas/x.js', hits: [
        { line: 1, column: 18, text: 'const a = member["氏名"];' },
        { line: 2, column: 18, text: 'const b = teacher["氏名"];' }
      ]}]
    }]
  };
  const out = classifyReport(scan);
  const hits = out.results[0].files[0].hits;
  assert.equal(hits.length, 2);
  assert.equal(out.results[0].classifications.REPLACE +
               out.results[0].classifications.KEEP +
               out.results[0].classifications.REVIEW, 2);
});

test('classifier source only writes the explicitly requested report path', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../tools/classify-member-migration-references.cjs'), 'utf8');
  const writes = [...src.matchAll(/fs\.writeFileSync\s*\(([^,\n]+)/g)].map(m => m[1].trim());
  assert.ok(writes.length <= 1);
  if (writes.length === 1) assert.match(writes[0], /path\.resolve\(output\)/);
});


test('report classifies indented explicit member occurrence as REPLACE using raw_text coordinates', () => {
  const line = '    current_rank: String(member["現在級段位"] || "").trim(),';
  const scan = {
    entity: 'member',
    results: [{
      before: '現在級段位',
      after: 'current_rank',
      action: 'review',
      hit_count: 1,
      files: [{
        file: 'gas/04_AttendanceProgress.js',
        hits: [{
          line: 90,
          column: line.indexOf('現在級段位') + 1,
          text: line.trim(),
          raw_text: line
        }]
      }]
    }]
  };
  const out = classifyReport(scan);
  const hit = out.results[0].files[0].hits[0];
  assert.equal(hit.classification, 'REPLACE');
  assert.equal(hit.reason, 'explicit-member-field');
});


test('classifier source is KEEP and cannot classify its own example as REPLACE', () => {
  const line = '    // A line can contain member["氏名"] and teacher["氏名"] simultaneously.';
  const column = line.indexOf('氏名') + 1;
  const result = classifyHit(
    '氏名',
    { text: line.trim(), raw_text: line, column },
    'tools/classify-member-migration-references.cjs'
  );
  assert.equal(result.classification, 'KEEP');
  assert.equal(result.reason, 'migration-spec');
});
