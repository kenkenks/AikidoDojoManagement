'use strict';
// Firebase Fee fields -> existing attendance screen DTO contract.
// The caller must distinguish a completed lookup with no selection (null)
// from a failed/unavailable lookup (throw). Never turn read errors into zero fees.
const id = value => typeof value === 'string' ? value.trim() : '';
function active(row) {
  const state = id(row.status);
  return state === '' || state === '有効' || state === 'TRUE';
}
function createBillingSelectionReader({readMonthlySelection, readFees, readPlanSelectionRules, targetMonth}) {
  if ([readMonthlySelection, readFees, readPlanSelectionRules, targetMonth].some(f => typeof f !== 'function')) {
    throw new TypeError('billing read dependencies required');
  }
  return async function readBillingSelection(member) {
    const memberId = id(member?.member_id);
    const groupId = id(member?.billing_group_id);
    if (!memberId) throw new Error('MEMBER_ID_REQUIRED');
    const month = await targetMonth();
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) throw new Error('INVALID_TARGET_MONTH');
    const [selection, fees, rules] = await Promise.all([
      groupId ? readMonthlySelection(groupId, month) : Promise.resolve(null),
      readFees(), readPlanSelectionRules()
    ]);
    if (selection !== null && (typeof selection !== 'object' || Array.isArray(selection))) throw new Error('INVALID_MONTHLY_SELECTION');
    if (!Array.isArray(fees) || !Array.isArray(rules)) throw new Error('INVALID_BILLING_MASTER');
    const feeById = new Map();
    for (const fee of fees) {
      if (!fee || typeof fee !== 'object') throw new Error('INVALID_FEE');
      if (!active(fee)) continue;
      const planId = id(fee.plan_id);
      if (!planId || feeById.has(planId)) throw new Error('INVALID_OR_DUPLICATE_FEE');
      feeById.set(planId, fee);
    }
    const feeDto = planId => {
      const fee = feeById.get(planId);
      if (!fee) throw new Error('UNKNOWN_OR_INACTIVE_PLAN');
      const amount = fee.unit_price == null ? 0 : fee.unit_price;
      const cap = fee.maximum_amount == null ? 0 : fee.maximum_amount;
      if (!Number.isFinite(amount) || !Number.isFinite(cap)) throw new Error('INVALID_FEE_AMOUNT');
      return {plan_id:planId, plan_name:id(fee.display_name) || planId,
        fee_type:id(fee.membership_fee_type), amount, cap_amount:cap};
    };
    if (selection) {
      const planId = id(selection.plan_id);
      if (!planId) throw new Error('INVALID_SELECTED_PLAN');
      const dto = feeDto(planId);
      return {member_id:memberId, target_month:month, selected:true,
        plan_id:planId, plan_name:dto.plan_name, candidates:[dto]};
    }
    const memberType = id(member.member_type);
    const ids = new Set();
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') throw new Error('INVALID_PLAN_RULE');
      if (id(rule.member_type) !== memberType) continue;
      const planId = id(rule.selectable_plan_id);
      if (planId) ids.add(planId);
    }
    const candidates = [...ids].map(feeDto);
    return {member_id:memberId, target_month:month, selected:false,
      plan_id:'', plan_name:'', candidates};
  };
}
module.exports = {createBillingSelectionReader};
