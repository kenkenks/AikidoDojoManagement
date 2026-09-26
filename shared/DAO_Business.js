'use strict';
const { definitions } = require('./DAO_Definitions.js');
const { normalizeStorageId } = require('./StorageId.js');
const { runSteps } = require('./Flow.js');

// 名前で定義を選択し、共通の読取・項目対応を実行する。
function createDao(core, backend, registry = definitions) {
  function resolve(name, recordId) {
    if (!Object.hasOwn(registry, name)) throw new Error('UNKNOWN_DAO_NAME');
    const definition = registry[name];
    if (!Object.hasOwn(definition.sources, backend)) throw new Error('UNKNOWN_DAO_SOURCE');
    const source = definition.sources[backend];
    const id = (definition.normalizeId || normalizeStorageId)(recordId);
    return {definition, source, id};
  }
  function write(method, name, recordId, values) {
    const {definition, source, id} = resolve(name, recordId);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('INVALID_WRITE_VALUES');
    const fields = Object.fromEntries(Object.entries(values).map(([key,value]) => {
      if (!definition.writable?.includes(key) || !Object.hasOwn(source.fields,key)) throw new Error('FIELD_NOT_WRITABLE');
      if (source.fields[key] === source.keyField && value !== id) throw new Error('KEY_MISMATCH');
      return [source.fields[key],value];
    }));
    if (method === 'append' || method === 'upsertByKey') fields[source.keyField] = id;
    return core[method](source,id,fields);
  }
  return {
    append: (name,id,values) => write('append',name,id,values),
    updateByKey: (name,id,values) => write('updateByKey',name,id,values),
    upsertByKey: (name,id,values) => write('upsertByKey',name,id,values),
    readById(name, recordId) { return runSteps((function* () {
    const {definition, source, id} = resolve(name, recordId);
    const row = yield core.readById(source, id);
    if (row === null) return null;
    const mapped = Object.fromEntries(Object.entries(source.fields).map(([field, storedField]) => {
      const value = row[storedField];
      return [field, Object.hasOwn(source.transforms || {}, field) ? source.transforms[field](value) : value];
    }));
    return definition.validate ? definition.validate(mapped, id) : mapped;
  })()); } };
}
module.exports = { createDao };
