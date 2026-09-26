'use strict';
const { byteLength } = require('./StorageId.js');
// 通常の会員オブジェクトとIDの検証。I/Oもクラスも持たない。
function normalizeMemberId(value) {
  if (typeof value !== 'string') throw new Error('INVALID_MEMBER_ID');
  const id = value.trim();
  if (!id || id === '.' || id === '..' || /[\/\\\x00-\x1f]/.test(id) || byteLength(id) > 1500) throw new Error('INVALID_MEMBER_ID');
  return id;
}
function memberObject(row, id) {
  if (!row || row.member_id !== id || typeof row.name !== 'string' || typeof row.status !== 'string') throw new Error('INVALID_MEMBER_DOCUMENT');
  return { member_id: id, name: row.name, status: row.status };
}
module.exports = { normalizeMemberId, memberObject };
