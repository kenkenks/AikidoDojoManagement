function updateFeeStatusView(memberId, targetMonth, updateValues) {
  upsertViewRow(
    "20_会費状態View",
    ["target_month", "member_id"],
    {
      target_month: targetMonth,
      member_id: memberId
    },
    updateValues
  );
}