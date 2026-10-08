// Step 5 read-only diagnostic for the real GAS Member value boundary.
// Never logs Member values; only reports value shape/type metadata.

function diagnosticMemberValueShape_(value) {
  return {
    type: value === null ? 'null' : typeof value,
    is_date: Object.prototype.toString.call(value) === '[object Date]',
    is_empty_string: value === '',
    is_nullish: value === null || value === undefined
  };
}

function runner_diagnostic_member_value_types(memberId) {
  const ctx = createSheetContext();
  const members = daoMemberGetAll_(ctx);
  const targetId = memberId == null ? '' : String(memberId).trim();
  const member = targetId
    ? members.find(function(row) { return String(row.member_id || '').trim() === targetId; })
    : members[0];

  if (!member) {
    const missing = {
      ok: false,
      diagnostic: 'MEMBER_VALUE_TYPES',
      reason: targetId ? 'MEMBER_NOT_FOUND' : 'NO_MEMBER_ROWS'
    };
    Logger.log(JSON.stringify(missing, null, 2));
    return missing;
  }

  const fields = [
    'member_id','member_name','member_name_kana','member_type','status','billing_group_id',
    'joined_date','withdrawn_date','suspension_start_month','suspension_end_month','birth_date',
    'insurance_type','email','phone','remarks','current_rank','rank_source','rank_updated_at',
    'rank_start_date','carried_training_count','eligible_training_count'
  ];

  const result = {
    ok: true,
    diagnostic: 'MEMBER_VALUE_TYPES',
    member_selected_by: targetId ? 'member_id' : 'first_row',
    field_count: fields.length,
    fields: Object.fromEntries(fields.map(function(field) {
      return [field, diagnosticMemberValueShape_(member[field])];
    }))
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
