// PayPay会員ルートの月額宣言 Regression Runner
// CLEAN後のテスト会員を指定して実行する。
// 例: runner_paypayMemberMonthlyDeclaration("M001", "P001");
function runner_paypayMemberMonthlyDeclaration(memberId, planId) {
  const ctx = createSheetContext();
  const before = getPaymentStatus(memberId, ctx);

  if (!before || before.ok !== true) {
    return { ok: false, phase: "before", before: before };
  }
  if (before.status !== "未宣言") {
    return {
      ok: false,
      phase: "precondition",
      before: before,
      message: "CLEAN後の未宣言会員で実行してください。"
    };
  }

  const actual = paypayCode_start({
    member_id: memberId,
    plan_id: planId,
    teacher_id: "RUNNER_PAYPAY_MEMBER"
  }, ctx);

  const after = getPaymentStatus(memberId, ctx);
  const ok =
    actual && actual.ok === true &&
    after && after.ok === true &&
    after.status !== "未宣言" &&
    Array.isArray(after.invoiceItems) &&
    after.invoiceItems.length > 0;

  const result = {
    ok: ok,
    before: before,
    actual: actual,
    after: after,
    message: ok
      ? "PayPay会員ルートで月額宣言と請求生成を確認しました。"
      : "PayPay会員ルートで月額宣言または請求生成を確認できませんでした。"
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
