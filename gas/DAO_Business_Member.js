// Member persistence boundary.
// DAO Core returns physical database rows; this package exposes the logical Member DTO.

function daoMemberDTOFromDBRow_(row) {
  row = row || {};
  return {
    member_id: row['member_id'],
    member_name: row['member_name'],
    member_name_kana: row['member_name_kana'],
    member_type: row['member_type'],
    status: row['status'],
    billing_group_id: row['billing_group_id'],
    joined_date: row['joined_date'],
    withdrawn_date: row['withdrawn_date'],
    suspension_start_month: row['suspension_start_month'],
    suspension_end_month: row['suspension_end_month'],
    birth_date: row['birth_date'],
    insurance_type: row['insurance_type'],
    email: row['email'],
    phone: row['phone'],
    remarks: row['remarks'],
    current_rank: row['current_rank'],
    rank_source: row['rank_source'],
    rank_updated_at: row['rank_updated_at'],
    rank_start_date: row['rank_start_date'],
    carried_training_count: row['carried_training_count'],
    eligible_training_count: row['eligible_training_count']
  };
}

function daoMemberGetAll_(ctx) {
  ctx = daoContext_(ctx);
  return daoCore_(ctx).read('members', ctx).map(daoMemberDTOFromDBRow_);
}
