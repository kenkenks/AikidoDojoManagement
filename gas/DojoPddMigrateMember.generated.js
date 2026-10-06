/* Generated from schema/migration/Member/Member.before.json and Member.after.json. Do not edit. */
function dojoPddDescribeMemberMigration_() {
  return {
    "entity": "member",
    "source": "gas",
    "sheet": "01_会員マスタ",
    "beforeHeaders": [
      "member_id",
      "氏名",
      "フリガナ",
      "区分",
      "状態",
      "請求グループID",
      "入会日",
      "退会日",
      "休会開始月",
      "休会終了月",
      "生年月日",
      "保険区分",
      "メール",
      "電話",
      "備考",
      "現在級段位",
      "級段位登録元",
      "級段位更新日時",
      "級段位起算日",
      "繰越稽古数",
      "審査可能稽古数"
    ],
    "afterHeaders": [
      "member_id",
      "member_name",
      "member_name_kana",
      "member_type",
      "status",
      "billing_group_id",
      "joined_date",
      "withdrawn_date",
      "suspension_start_month",
      "suspension_end_month",
      "birth_date",
      "insurance_type",
      "email",
      "phone",
      "remarks",
      "current_rank",
      "rank_source",
      "rank_updated_at",
      "rank_start_date",
      "carried_training_count",
      "eligible_training_count"
    ]
  };
}
