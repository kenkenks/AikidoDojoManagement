'use strict';
// Generated from schema/Setting.yml by tools/build-portable-data-definition.mjs. Do not edit.
const settingDefinition = {
  "writable": [
    "key",
    "value"
  ],
  "sources": {
    "firestore": {
      "collection": "settings",
      "keyField": "key",
      "fields": {
        "key": "key",
        "value": "value"
      }
    },
    "gas": {
      "sheet": "99_設定",
      "keyColumn": 1,
      "valueColumn": 2,
      "keyField": "キー",
      "fields": {
        "key": "キー",
        "value": "値"
      }
    }
  }
};
module.exports = { settingDefinition };
