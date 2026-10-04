'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyHit } = require('../tools/classify-member-migration-references.cjs');

test('baseline snapshot is KEEP even with explicit member field', () => {
  const line = 'const currentRank = String(member["現在級段位"] || "").trim();';
  const column = line.indexOf('現在級段位') + 1;
  const result = classifyHit(
    '現在級段位',
    { text: line, raw_text: line, column },
    'work/progress-baseline.txt'
  );
  assert.deepEqual(result, {
    classification: 'KEEP',
    reason: 'baseline-snapshot'
  });
});

test('real GAS explicit member field remains REPLACE', () => {
  const line = 'const currentRank = String(member["現在級段位"] || "").trim();';
  const column = line.indexOf('現在級段位') + 1;
  const result = classifyHit(
    '現在級段位',
    { text: line, raw_text: line, column },
    'gas/04_AttendanceProgress.js'
  );
  assert.equal(result.classification, 'REPLACE');
});
