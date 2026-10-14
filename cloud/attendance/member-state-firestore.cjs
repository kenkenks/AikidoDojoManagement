'use strict';
// Read-only composition. Not a public route: authentication is enforced by its caller.
const {createMemberAttendanceState} = require('./member-state.cjs');
const {createFirestoreProgressReader} = require('./progress-firestore.cjs');
const {createBillingFirestoreReader} = require('./billing-firestore.cjs');
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function createFirestoreMemberAttendanceState(core, {getTargetMonth, validateScope, monthlySelectionCollection = 'monthly_selections'} = {}) {
  if (!core || typeof core.readById !== 'function' || typeof core.queryEqual !== 'function' ||
      typeof core.readPage !== 'function') throw new TypeError('MEMBER_STATE_FIRESTORE_CORE_REQUIRED');
  if (typeof getTargetMonth !== 'function' || typeof validateScope !== 'function')
    throw new TypeError('MEMBER_STATE_CONTEXT_REQUIRED');
  const memberDao = {readById: async (source, id) => {
    if (!ID.test(id || '')) throw new Error('INVALID_MEMBER_ID');
    const row = await core.readById(source, id);
    if (!row) return null;
    if (row.member_id != null && row.member_id !== id) throw new Error('MEMBER_IDENTITY_CONFLICT');
    return {...row, member_id:id};
  }};
  const attendanceDao = {queryEqual: (source, filters) => core.queryEqual(source, filters)};
  const readProgress = createFirestoreProgressReader(core);
  const readBillingSelection = createBillingFirestoreReader(core, {
    monthlySelectionCollection, targetMonth:getTargetMonth
  });
  return createMemberAttendanceState({memberDao,attendanceDao,readProgress,readBillingSelection,validateScope});
}
module.exports = {createFirestoreMemberAttendanceState};
