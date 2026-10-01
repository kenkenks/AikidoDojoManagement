'use strict';

// Setting domain DAO. The application depends only on this contract;
// physical source selection remains at the composition boundary.
function createSettingDao(core, backend, definition) {
  if (!core || typeof core.readById !== 'function' || typeof core.upsertByKey !== 'function') {
    throw new Error('INVALID_SETTING_DAO_CORE');
  }
  if (!definition || !definition.sources || !definition.sources[backend]) {
    throw new Error('UNKNOWN_SETTING_DAO_SOURCE');
  }
  const source = definition.sources[backend];

  return {
    async readById(name, recordId) {
      if (name !== 'setting') throw new Error('UNKNOWN_DAO_NAME');
      const id = String(recordId == null ? '' : recordId).trim();
      if (!id) throw new Error('INVALID_SETTING_ID');
      const row = await core.readById(source, id);
      if (row === null) return null;
      return {
        key: row[source.fields.key] === undefined ? id : row[source.fields.key],
        value: row[source.fields.value]
      };
    },
    async upsertByKey(name, recordId, values) {
      if (name !== 'setting') throw new Error('UNKNOWN_DAO_NAME');
      const id = String(recordId == null ? '' : recordId).trim();
      if (!id) throw new Error('INVALID_SETTING_ID');
      if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.hasOwn(values, 'value')) {
        throw new Error('INVALID_WRITE_VALUES');
      }
      const fields = {
        [source.fields.key]: id,
        [source.fields.value]: values.value
      };
      return core.upsertByKey(source, id, fields);
    }
  };
}

module.exports = { createSettingDao };
