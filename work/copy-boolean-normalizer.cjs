'use strict';
// Explicit opt-in only. Never treat arbitrary strings, numbers, or blanks as false.
function normalizeBoolean(value) {
  if (value === null || value === undefined || value === '') return { value: undefined, kind: 'unset' };
  if (typeof value === 'boolean') return { value, kind: 'boolean' };
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'false') return { value: normalized === 'true', kind: 'string_boolean' };
  }
  return { value, kind: 'unsupported' };
}
function prepareRecords(records, rules) {
  const stats = {};
  const prepared = records.map(record => {
    const row = { ...record };
    for (const field of rules) {
      const result = normalizeBoolean(row[field]);
      const counts = stats[field] ||= { boolean: 0, string_boolean: 0, unset: 0, unsupported: 0 };
      counts[result.kind]++;
      if (result.kind === 'unsupported') throw new Error(`COPY_BOOLEAN_UNSUPPORTED:${field}:${typeof row[field]}`);
      if (result.kind === 'unset') delete row[field];
      else row[field] = result.value;
    }
    return row;
  });
  return { records: prepared, stats };
}
module.exports = { normalizeBoolean, prepareRecords };
