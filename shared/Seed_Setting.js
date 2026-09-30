'use strict';

// PDD001 Setting の初期データ。
// Schema/Renderer は構造、Seed は初期値という責務を分離する。
const settingSeed = Object.freeze([
  Object.freeze({ key: 'TIME_TRAVEL_ENABLED', value: 'FALSE' }),
  Object.freeze({ key: 'DEBUG_DATE', value: '' }),
  Object.freeze({ key: 'DEBUG_TARGET_MONTH', value: '' })
]);

module.exports = { settingSeed };
