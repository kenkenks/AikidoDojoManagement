// 80_Prototype.gs
//  デモ支払い
//
// デモPay
//
function demoPay(memberId) {
  try {
    const ctx = createSheetContext();
  
    const members = getMembers(ctx);
  
    const member = members.find(m =>
      String(m["member_id"]).trim() === String(memberId).trim()
    );

    if (!member) {
      return { ok: false, message: "会員が見つかりません" };
    }

    const targetMonth = sup_targetMonth(ctx);

    const billingGroupId = member["請求グループID"];

    const status = getPaymentStatus(memberId);

    if (!status.ok) {
      return status;
    }

    const unpaidAmount = Number(status.unpaidAmount || 0);

    if (unpaidAmount <= 0) {
      return { ok: false, message: "未払いの請求はありません" };
    }

    const paymentId = "PAY-" + Utilities.getUuid().slice(0, 8);

    appendPayment(ctx, {
      paymentId,
      targetMonth,
      billingGroupId,
      memberId: "",
      method: "デモ支払い",
      amount: unpaidAmount,
      paymentType: "DEMO",
      note: "デモ画面から支払済登録"
    });

    updateInvoiceStatusByPayment(
      targetMonth,
      billingGroupId,
      ctx
    );

    const vctx = collectPaymentStatusContext(memberId, targetMonth, ctx);
    const viewRow = buildPaymentStatusViewRow(memberId, targetMonth, vctx);
    updateFeeStatusView(memberId, targetMonth, viewRow);
    invalidateFeeStatusView(ctx);

    return {
      ok: true,
      message: `${unpaidAmount}円を支払済にしました`
    };

  } catch (e) {
    return { ok: false, message: e.message };
  }
}


function appendPayment(ctx, payment) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("06_入金ログ");

  sheet.appendRow([
    payment.paymentId,
    payment.paidAt || sup_now(ctx),
    payment.targetMonth,
    payment.billingGroupId,
    payment.memberId || "",
    payment.method || "デモ支払い",
    payment.amount,
    payment.paymentType || "DEMO",
    payment.note || ""
  ]);

  invalidatePayments(ctx);
}