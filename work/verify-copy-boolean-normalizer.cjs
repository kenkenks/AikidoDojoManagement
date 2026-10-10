'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBoolean, prepareRecords } = require('./copy-boolean-normalizer.cjs');
test('booleans are preserved', () => { assert.deepEqual(normalizeBoolean(false), { value: false, kind: 'boolean' }); });
test('only explicit true/false strings are converted', () => {
  assert.deepEqual(normalizeBoolean(' FALSE '), { value: false, kind: 'string_boolean' });
  assert.deepEqual(normalizeBoolean('TRUE'), { value: true, kind: 'string_boolean' });
});
test('empty means absent, not false', () => {
  const result = prepareRecords([{a: ''}, {a: null}], ['a']);
  assert.deepEqual(result.records, [{}, {}]);
  assert.equal(result.stats.a.unset, 2);
});
test('unknown values fail closed', () => {
  for (const value of [0, 1, 'はい', '0', 'yes', [], {}]) {
    assert.throws(() => prepareRecords([{a:value}], ['a']), /COPY_BOOLEAN_UNSUPPORTED:a/);
  }
});
test('non-selected fields are unchanged and counts are provided', () => {
  const result = prepareRecords([{a:true,b:'secret'}, {a:'false',b:4}], ['a']);
  assert.deepEqual(result.records, [{a:true,b:'secret'}, {a:false,b:4}]);
  assert.deepEqual(result.stats.a, {boolean:1,string_boolean:1,unset:0,unsupported:0});
});
