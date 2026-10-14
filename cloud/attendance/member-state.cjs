'use strict';
// Business composition boundary for GAS getMemberAttendanceState.
// Never synthesize examination/billing facts from the Member record.
const { createAttendanceSavedState } = require('./saved-state.cjs');
const active = value => ['', '有効', '在籍', 'TRUE'].includes(String(value ?? '').trim());
function createMemberAttendanceState({ memberDao, attendanceDao, readProgress, readBillingSelection, validateScope }) {
  if (typeof memberDao?.readById !== 'function' || typeof attendanceDao?.queryEqual !== 'function' ||
      typeof readProgress !== 'function' || typeof readBillingSelection !== 'function' ||
      typeof validateScope !== 'function') throw new TypeError('MEMBER_STATE_DEPENDENCIES_REQUIRED');
  const savedState = createAttendanceSavedState({memberDao,attendanceDao});
  return async function readMemberAttendanceState(params = {}) {
    const saved = await savedState(params);
    if (!saved.ok) return saved;
    const member = await memberDao.readById({collection:'members'}, params.member_id);
    if (!member || !active(member.status)) return {ok:false,message:'有効な会員が見つかりません。'};
    await validateScope(params.location_id,params.billing_block_id);
    const [progress,billing] = await Promise.all([readProgress(params.member_id),readBillingSelection(member)]);
    if (progress?.ok !== true || !billing || !Array.isArray(billing.candidates) ||
        typeof billing.selected !== 'boolean' || !Number.isFinite(progress.training_count) ||
        !Number.isFinite(progress.required_training_count) || typeof progress.examination_ready !== 'boolean' ||
        !Array.isArray(progress.recent_attendance_dates)) throw new Error('MEMBER_STATE_BUSINESS_DATA_UNAVAILABLE');
    return {
      ok:true, member_id:params.member_id,
      member_name:progress.member_name, current_rank:progress.current_rank,
      rank_sort_order:progress.rank_sort_order, next_rank:progress.next_rank,
      rank_source:progress.rank_source, training_count:progress.training_count,
      required_training_count:progress.required_training_count,
      required_training_count_source:progress.required_training_count_source,
      remaining_training_count:progress.remaining_training_count,
      examination_ready:progress.examination_ready,
      recent_attendance_dates:progress.recent_attendance_dates,
      selected_slot_ids:saved.selected_slot_ids,
      billing_plan_id:billing.plan_id, billing_plan_name:billing.plan_name,
      billing_plan_selected:billing.selected, billing_plan_candidates:billing.candidates
    };
  };
}
module.exports={createMemberAttendanceState};
