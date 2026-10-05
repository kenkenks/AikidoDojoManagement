// Member persistence boundary.
// DAO Core returns physical database rows; this package exposes the logical Member DTO.

function daoMemberDTOFromDBRow_(row) {
  row = row || {};
  return {
    member_id: row['member_id'],
    member_name: row['氏名'],
    member_name_kana: row['フリガナ'],
    member_type: row['区分'],
    status: row['状態'],
    billing_group_id: row['請求グループID'],
    joined_date: row['入会日'],
    withdrawn_date: row['退会日'],
    suspension_start_month: row['休会開始月'],
    suspension_end_month: row['休会終了月'],
    birth_date: row['生年月日'],
    insurance_type: row['保険区分'],
    email: row['メール'],
    phone: row['電話'],
    remarks: row['備考'],
    current_rank: row['現在級段位'],
    rank_source: row['級段位登録元'],
    rank_updated_at: row['級段位更新日時'],
    rank_start_date: row['級段位起算日'],
    carried_training_count: row['繰越稽古数'],
    eligible_training_count: row['審査可能稽古数']
  };
}

function daoMemberGetAll_(ctx) {
  ctx = daoContext_(ctx);
  return daoCore_(ctx).read('members', ctx).map(daoMemberDTOFromDBRow_);
}
