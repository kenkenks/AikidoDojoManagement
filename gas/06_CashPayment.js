// 06_CashPayment.gs
//  現金要求を作る
//  現金受領フローを進める
//
// ================================
// 現金支払い要求
// ================================
//
function requestCashPayment(memberId) {
  try {
    const ctx = createSheetContext();

    const status = getPaymentStatus(memberId);

    if (!status.ok) {
      return {
        ok: false,
        message: status.message
      };
    }

    const unpaidAmount = Number(status.unpaidAmount || 0);

    if (unpaidAmount <= 0) {
      return {
        ok: false,
        message: "未払いの請求はありません。"
      };
    }

    const requestId =
      "CASH-" + Utilities.getUuid().slice(0, 8);

    appendCashRequest(ctx, {
      requestId,
      requestedAt: sup_now(ctx),
      memberId,
      billingGroupId: status.billingGroupId,
      targetMonth: normalizeMonth(status.targetMonth),
      amount: unpaidAmount,
      status: "要求中"
    });

    const vctx = collectPaymentStatusContext(
      memberId,
      normalizeMonth(status.targetMonth),
      ctx
    );

    const viewRow = buildPaymentStatusViewRow(
      memberId,
      normalizeMonth(status.targetMonth),
      vctx
    );

    updateFeeStatusView(
      memberId,
      normalizeMonth(status.targetMonth),
      viewRow
    );

    invalidateFeeStatusView(ctx);

    return {
      ok: true,
      message: "現金支払い要求を送信しました"
    };

  } catch (e) {
    return {
      ok: false,
      message: e.message
    };
  }
}

function appendCashRequest(ctx, request) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("09_現金支払い要求");

  sheet.appendRow([
    request.requestId,
    request.requestedAt || sup_now(ctx),
    request.memberId,
    request.billingGroupId,
    request.targetMonth,
    request.amount,
    request.status || "要求中"
  ]);

  invalidateCashRequests(ctx);
}

//要求中の現金支払いを表示
function showCashRequests() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("09_現金支払い要求");

  if (!sheet) {
    Browser.msgBox("09_現金支払い要求 シートがありません。");
    return;
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const pending = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    if (row[col["状態"]] === "要求中") {
      pending.push({
        rowNumber: r + 1,
        requestId: row[col["request_id"]],
        memberId: row[col["member_id"]],
        billingGroupId: row[col["billing_group_id"]],
        targetMonth: normalizeMonth(row[col["target_month"]]),
        amount: Number(row[col["金額"]] || 0)
      });
    }
  }

  if (pending.length === 0) {
    Browser.msgBox("要求中の現金支払いはありません。");
    return;
  }

  const message = pending.map(p =>
    `${p.requestId} / ${p.memberId} / ${p.targetMonth} / ${p.amount}円`
  ).join("\n");

  const result = Browser.inputBox(
    "現金支払い要求",
    "受領する request_id を入力してください。\n\n" + message,
    Browser.Buttons.OK_CANCEL
  );

  if (result === "cancel" || !result) return;

  approveCashRequest(result.trim());
}

function showCashConfirmDialog() {
  const html = HtmlService
    .createHtmlOutputFromFile("cash_confirm")
    .setWidth(500)
    .setHeight(600);

  SpreadsheetApp.getUi().showModalDialog(html, "現金受け取り確認");
}

function getPendingCashRequestsForConfirm() {
  const ctx = createSheetContext();

  const requests = getPaymentEvidences(ctx);
  const members = getMembers(ctx);

  return requests
    .filter(r =>
      String(r["状態"]).trim() === "要求中"
    )
    .map(r => {
      const member = members.find(m =>
        String(m["member_id"]).trim() === String(r["member_id"]).trim()
      );

      return {
        requestId: String(r["request_id"] || ""),
        memberId: String(r["member_id"] || ""),
        memberName: member ? member["氏名"] : r["member_id"],
        billingGroupId: String(r["billing_group_id"] || ""),
        targetMonth: normalizeMonth(r["target_month"]),
        amount: Number(r["金額"] || 0),
      };
    });
}

//受領処理
function approveCashRequest(requestId, ctx) {
  ctx = ensureSheetContext(ctx);

  const requestSheet = ctx.ss.getSheetByName("09_現金支払い要求");
  const values = requestSheet.getDataRange().getValues();
  const headers = values[0];

  const col = {};
  headers.forEach((h, i) => col[h] = i);

  let targetRow = -1;
  let req = null;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    if (String(row[col["request_id"]]).trim() === String(requestId).trim()) {
      targetRow = r + 1;
      req = {
        memberId: row[col["member_id"]],
        billingGroupId: row[col["billing_group_id"]],
        targetMonth: normalizeMonth(row[col["target_month"]]),
        amount: Number(row[col["金額"]] || 0),
        status: row[col["状態"]]
      };
      break;
    }
  }

  if (!req) {
    return { ok: false, message: "指定された request_id が見つかりません。" };
  }

  if (req.status !== "要求中") {
    return { ok: false, message: "この要求はすでに処理済みです。" };
  }

  appendPayment(ctx, {
    paymentId: "PAY-" + Utilities.getUuid().slice(0, 8),
    paidAt: sup_now(ctx),
    targetMonth: req.targetMonth,
    billingGroupId: req.billingGroupId,
    memberId: "",
    method: "現金",
    amount: req.amount,
    paymentType: requestId,
    note: "現金支払い要求から受領"
  });

  updateInvoiceStatusByPayment(
    req.targetMonth,
    req.billingGroupId,
    ctx
  );

  requestSheet
    .getRange(targetRow, col["状態"] + 1)
    .setValue("受領済");

  invalidateCashRequests(ctx);

  const vctx = collectPaymentStatusContext(
    req.memberId,
    req.targetMonth,
    ctx
  );

  const viewRow = buildPaymentStatusViewRow(
    req.memberId,
    req.targetMonth,
    vctx
  );

  updateFeeStatusView(
    req.memberId,
    req.targetMonth,
    viewRow
  );

  invalidateFeeStatusView(ctx);

  return {
    ok: true,
    message: `${req.amount}円を現金受領として登録しました。`
  };
}

function approveCashRequests(requestIds) {
  if (!requestIds || requestIds.length === 0) {
    return {
      ok: false,
      message: "選択された現金要求がありません。"
    };
  }

  const ctx = createSheetContext();

  let count = 0;
  const errors = [];

  requestIds.forEach(requestId => {
    const result = approveCashRequest(requestId, ctx);

    if (result.ok) {
      count++;
    } else {
      errors.push(`${requestId}: ${result.message}`);
    }
  });

  if (errors.length > 0) {
    return {
      ok: false,
      message: `${count}件反映、${errors.length}件失敗しました。\n` + errors.join("\n")
    };
  }

  return {
    ok: true,
    message: `${count}件の現金受領を反映しました。`
  };
}
