'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settingSeed } = require('../shared/Seed_Setting.js');
const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');

// Seed は論理名だけを持つ。物理名・collection は Definition/Renderer 側の責務。
test('PDD001 Setting seed defines Time Travel defaults as logical records', () => {
  assert.deepEqual(settingSeed, [
    { key: 'TIME_TRAVEL_ENABLED', value: 'FALSE' },
    { key: 'DEBUG_DATE', value: '' },
    { key: 'DEBUG_TARGET_MONTH', value: '' }
  ]);
  for (const record of settingSeed) {
    assert.deepEqual(Object.keys(record).sort(), ['key', 'value']);
    assert.equal(typeof record.key, settingDefinition.schema.fields.key.type);
    assert.equal(typeof record.value, settingDefinition.schema.fields.value.type);
  }
});
