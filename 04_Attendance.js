//出席登録関数を追加
function registerAttendance(memberId) {
  try {
    const ctx = createSheetContext();

    const targetMonth = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

    const selection = getMonthlySelection(memberId, targetMonth, ctx);

    if (!selection) {
      return {
        ok: false,
        message: "今月の会費タイプが未宣言です。先に会費タイプを選択してください。"
      };
    }

    if (selection["会費タイプ"] === "休会") {
      return {
        ok: false,
        message: "休会中のため出席登録できません。"
      };
    }

    appendAttendance(ctx, {
      attendanceId: "ATT-" + Utilities.getUuid().slice(0, 8),
      attendedAt: new Date(),
      memberId,
      targetMonth,
      note: ""
    });

    let result = {
      ok: true,
      message: "出席を登録しました。"
    };

    if (selection["会費タイプ"] === "回数料金") {
      result = updatePerVisitInvoice(memberId, targetMonth, ctx);
    }

    if (selection["会費タイプ"] === "月会費") {
      createOrUpdateMonthlyInvoice(memberId, targetMonth, "月会費", ctx);
      result = {
        ok: true,
        message: "出席を登録しました。月会費は登録済みです。"
      };
    }

    const vctx = collectPaymentStatusContext(memberId, targetMonth, ctx);
    const viewRow = buildPaymentStatusViewRow(memberId, targetMonth, vctx);
    updateFeeStatusView(memberId, targetMonth, viewRow);
    invalidateFeeStatusView(ctx);

    return result;

  } catch (e) {
    return {
      ok: false,
      message: e.message
    };
  }
}

function appendAttendance(ctx, attendance) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("07_出席ログ");

  sheet.appendRow([
    attendance.attendanceId,
    attendance.attendedAt || new Date(),
    attendance.memberId,
    attendance.targetMonth,
    attendance.note || ""
  ]);

  invalidateAttendances(ctx);
}