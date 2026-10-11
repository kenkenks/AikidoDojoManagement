'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('normalization schema is selected by table, not hard-coded to Teacher', () => {
  const source = fs.readFileSync(path.join(__dirname, 'gas2firebase-copy.cjs'), 'utf8');
  assert.match(source, /path\.join\(ROOT, 'schema', `\$\{table\}\.yml`\)/);
  assert.doesNotMatch(source, /path\.join\(ROOT, 'schema', 'Teacher\.yml'\)/);
});
