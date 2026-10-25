'use strict';
// Firestore-side equivalent of GAS getAttendanceSavedState (read-only).
// The caller must enforce its QR/identity authorization policy before invoking this function.
const MEMBER_SOURCE = {collection: 'members'};
// Keep physical Firestore names aligned with DAO_Definitions.attendance.
const ATTENDANCE_SOURCE = {collection: 'attendances'};
function normalize(value) { return String(value == null ? '' : value).trim(); }
function activeMember(member) {
  if (!member) return false;
  return ['', '有効', '在籍', 'TRUE'].includes(normalize(member.status));
}
// GAS isActiveMasterRow_ accepts only these values; unknown states must not count.
function isActiveAttendance(row) {
  return row && ['', '有効', '在籍', 'TRUE', '確認済'].includes(normalize(row['状態']));
}
function isPendingAttendance(row) { return row && normalize(row['状態']) === '確認待ち'; }
function createAttendanceSavedState({memberDao, attendanceDao}) {
  if (!memberDao || typeof memberDao.readById !== 'function') throw new TypeError('memberDao.readById required');
  if (!attendanceDao || typeof attendanceDao.queryEqual !== 'function') throw new TypeError('attendanceDao.queryEqual required');
  return async function getAttendanceSavedState(params = {}) {
    const memberId = normalize(params.member_id);
    const locationId = normalize(params.location_id);
    const blockId = normalize(params.billing_block_id);
    const date = normalize(params.attendance_date);
    if (!memberId || !locationId || !blockId) return {ok:false,message:'会員・道場・課金枠を指定してください。'};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) ||
        new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) {
      return {ok:false,message:'稽古日を正しく指定してください。'};
    }
    const member = await memberDao.readById(MEMBER_SOURCE, memberId);
    if (!activeMember(member)) return {ok:false,message:'有効な会員が見つかりません。'};
    const rows = await attendanceDao.queryEqual(ATTENDANCE_SOURCE, [
      {field:'稽古日',value:date}, {field:'member_id',value:memberId},
      {field:'location_id',value:locationId}, {field:'billing_block_id',value:blockId}
    ]);
    if (!Array.isArray(rows)) throw new Error('INVALID_ATTENDANCE_ROWS');
    const activeRows=rows.filter(row=>isActiveAttendance(row)||isPendingAttendance(row));
    const pendingSlotIds=[...new Set(rows.filter(isPendingAttendance).map(row=>normalize(row.slot_id)).filter(Boolean))];
    return {
      ok:true, member_id:memberId, current_rank:normalize(member.current_rank),
      selected_slot_ids:[...new Set(activeRows.map(row => normalize(row.slot_id)).filter(Boolean))],
      ...(pendingSlotIds.length?{pending_slot_ids:pendingSlotIds}:{})
    };
  };
}
module.exports = {createAttendanceSavedState};
