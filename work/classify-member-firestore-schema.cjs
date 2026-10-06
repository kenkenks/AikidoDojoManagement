'use strict';

const AFTER_FIELDS = Object.freeze([
  'member_id','member_name','member_name_kana','member_type','status','billing_group_id',
  'joined_date','withdrawn_date','suspension_start_month','suspension_end_month','birth_date',
  'insurance_type','email','phone','remarks','current_rank','rank_source','rank_updated_at',
  'rank_start_date','carried_training_count','eligible_training_count'
]);
const LEGACY_OBSERVED_FIELDS = Object.freeze(['member_id', 'name', 'status']);

function sameKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, i) => key === wanted[i]);
}

function hasOnlyKnownAfterFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  if (actual.length === 0) return false;
  const allowed = new Set(AFTER_FIELDS);
  return actual.every((key) => allowed.has(key));
}

function classifyMemberFirestoreSchema(fields) {
  if (sameKeys(fields, LEGACY_OBSERVED_FIELDS)) return 'LEGACY_OBSERVED';
  if (hasOnlyKnownAfterFields(fields)) return 'AFTER_COMPATIBLE';
  return 'MISMATCH';
}

module.exports = { AFTER_FIELDS, LEGACY_OBSERVED_FIELDS, classifyMemberFirestoreSchema };
