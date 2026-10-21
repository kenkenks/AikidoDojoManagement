'use strict';
// Pure business projection from 04_AttendanceProgress.js; storage/authorization remain caller responsibilities.
const str = value => String(value ?? '').trim();
const active = row => ['', '有効', '在籍', 'TRUE'].includes(str(row?.['状態']));
function nonnegative(value) {
  if (value == null || str(value) === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('INVALID_PROGRESS_COUNT');
  return Math.floor(n);
}
function date(value) {
  if (value == null || str(value) === '') return '';
  const s = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(s + 'T00:00:00Z').toISOString().slice(0,10) !== s)
    throw new Error('INVALID_PROGRESS_DATE');
  return s;
}
function projectAttendanceProgress({member, attendanceRows, standard, rankOption}) {
  if (!member || !Array.isArray(attendanceRows) || !standard || !rankOption ||
      !str(member.member_id) || !['', '有効', '在籍', 'TRUE'].includes(str(member.status)))
    throw new Error('PROGRESS_INPUT_UNAVAILABLE');
  const start = date(member.rank_start_date);
  const carried = nonnegative(member.carried_training_count);
  const override = nonnegative(member.eligible_training_count);
  const standardCount = standard.progress_display_enabled === true ? nonnegative(standard.required_training_count) : 0;
  const required = override || standardCount;
  const requiredDays = standard.progress_display_enabled === true ? nonnegative(standard.required_training_days) : 0;
  const keys = new Set(), dates = new Set();
  for (const row of attendanceRows) {
    if (!row || typeof row !== 'object') throw new Error('INVALID_PROGRESS_ATTENDANCE');
    if (str(row.member_id) !== str(member.member_id) || !active(row)) continue;
    const d = date(row['稽古日']);
    if (!d || (start && d < start)) continue;
    keys.add(d + '|' + (str(row.slot_id) || 'LEGACY_NO_SLOT'));
    dates.add(d);
  }
  const recorded = keys.size, training = carried + recorded;
  // Days are distinct attendance dates since rank_start_date. No carry-over days are assumed.
  const trainingDays = dates.size;
  const remainingDays = requiredDays > 0 ? Math.max(requiredDays - trainingDays, 0) : null;
  const remaining = required > 0 ? Math.max(required - training, 0) : null;
  return {ok:true, member_id:str(member.member_id), member_name:str(member.member_name),
    current_rank:str(member.current_rank), current_rank_id:str(rankOption.rank_id),
    rank_sort_order:Number(rankOption.sort_order || 999999), next_rank:str(standard.next_rank),
    examination_note:str(standard.note), rank_source:str(member.rank_source),
    rank_updated_at:member.rank_updated_at || '', rank_start_date:start,
    carried_training_count:carried, recorded_training_count:recorded, training_count:training,
    required_training_count:required,
    required_training_count_source:override > 0 ? '会員個別' : standardCount > 0 ? '審査基準マスタ' : '未設定',
    remaining_training_count:remaining, training_days:trainingDays,
    required_training_days:requiredDays, remaining_training_days:remainingDays,
    examination_ready:required > 0 && remaining === 0 && (requiredDays === 0 || remainingDays === 0),
    recent_attendance_dates:[...dates].sort().slice(-5).reverse()};
}
module.exports = {projectAttendanceProgress};
