'use strict';
function normalizeStorageId(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[\/\\\x00-\x1f]/.test(value) || Buffer.byteLength(value, 'utf8') > 1500) throw new Error('INVALID_STORAGE_ID');
  return value;
}
function decodeValue(value) {
  if (!value || Object.keys(value).length !== 1) throw new Error('INVALID_STORAGE_VALUE');
  const [kind, data] = Object.entries(value)[0];
  if (['stringValue', 'timestampValue', 'referenceValue', 'bytesValue'].includes(kind) && typeof data === 'string') return data;
  if (kind === 'booleanValue' && typeof data === 'boolean') return data;
  if (kind === 'nullValue' && data === null) return null;
  if (kind === 'integerValue' && typeof data === 'string' && /^-?\d+$/.test(data) && Number.isSafeInteger(Number(data))) return Number(data);
  if (kind === 'doubleValue' && typeof data === 'number' && Number.isFinite(data)) return data;
  if (kind === 'arrayValue' && data && (data.values === undefined || Array.isArray(data.values))) return (data.values || []).map(decodeValue);
  if (kind === 'mapValue' && data) return decodeFields(data.fields || {});
  if (kind === 'geoPointValue' && data && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) return { latitude: data.latitude, longitude: data.longitude };
  throw new Error('UNSUPPORTED_STORAGE_VALUE');
}
function decodeFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('INVALID_STORAGE_FIELDS');
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}
module.exports = { normalizeStorageId, decodeFields };
