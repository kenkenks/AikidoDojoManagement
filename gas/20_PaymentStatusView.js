// 20_PaymentStatusView.gs
//   会費状態Viewを作る
//   会費状態Viewを更新する
//   会費状態Viewを取得する

// ==============================
// View更新（メイン）
// ==============================
function paymentStatusView_refresh(memberId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);

  // 引数なし実行は View/TB の端子構造だけを精査する。
  // 対象がない状態で業務データ行を作らない。
  paymentStatusView_ensureViewHeaders_(paymentStatusView_schemaTemplate_(), ctx);

  if (!memberId || !targetMonth) {
    return {
      ok: true,
      schema_checked: true,
      row_updated: false,
      reason: "NO_TARGET"
    };
  }

  const viewContext =
    paymentStatusView_collectContext(memberId, targetMonth, ctx);

  const row =
    paymentStatusView_buildRow(memberId, targetMonth, viewContext);

  paymentStatusView_update(memberId, targetMonth, row, ctx);

  invalidateFeeStatusView(ctx);

  return {
    ok: true,
    row
  };
}

// ==============================
// 情報収集
// ==============================
function paymentStatusView_collectContext(memberId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);

  const t0 = Date.now();
  perfLog("START paymentStatusView_collectContext", t0);

  const members = getMembers(ctx);
  const fees = getFees(ctx);
  const invoices = getInvoices(ctx);
  const payments = getPayments(ctx);
  const attendances = getAttendances(ctx);
  const cashRequests = getPaymentEvidences(ctx);

  const member = members.find(m =>
    String(m["member_id"]).trim() === String(memberId).trim()
  );

  if (!member) {
    return { ok: false, message: "会員が見つかりません。" };
  }

  const memberName = member["氏名"];
  const billingGroupId = member["請求グループID"];
  const normalizedTargetMonth = normalizeMonth(targetMonth);

  const cashPayCount = filterBySheetByDate(
    memberId,
    cashRequests,
    "target_month",
    normalizedTargetMonth
  ).length;

  const lessonCount =
    calculateAttendanceChargeCount(memberId, normalizedTargetMonth, ctx).charge_count;

  const groupPayments = payments.filter(function(payment) {
    return normalizeMonth(payment["target_month"]) === normalizedTargetMonth &&
      normalizeId_(payment["billing_group_id"]) === normalizeId_(billingGroupId);
  });
  const paidTotal = groupPayments.reduce(function(sum, payment) {
    return sum + Number(payment["入金額"] || payment["金額"] || 0);
  }, 0);
  const cashPaidTotal = paymentStatusView_sumPaymentMethod_(groupPayments, "CASH");
  const paypayPaidTotal = paymentStatusView_sumPaymentMethod_(groupPayments, "PAYPAY");
  const otherPaidTotal = paidTotal - cashPaidTotal - paypayPaidTotal;
  const paymentCount = groupPayments.length;

  // 09_決済エビデンス自体には target_month を持たない。
  // 対象月は evidence が参照する 05_請求明細から収集する。
  // Viewはここで業務判断せず、正本間の既存参照関係をたどって情報を集約するだけ。
  const invoiceById = {};
  invoices.forEach(function(invoice) {
    const invoiceId = normalizeId_(invoice["invoice_id"]);
    if (invoiceId) invoiceById[invoiceId] = invoice;
  });
  const groupEvidences = cashRequests.filter(function(evidence) {
    const evidenceInvoice = invoiceById[normalizeId_(evidence["invoice_id"])];
    const evidenceTargetMonth = evidenceInvoice
      ? normalizeMonth(evidenceInvoice["target_month"])
      : normalizeMonth(evidence["target_month"]);
    return evidenceTargetMonth === normalizedTargetMonth &&
      (normalizeId_(evidence["billing_group_id"]) === normalizeId_(billingGroupId) ||
       normalizeId_(evidence["member_id"]) === normalizeId_(memberId));
  });
  const evidenceRequestedCount = paymentStatusView_countEvidenceStatus_(groupEvidences, "REQUESTED");
  const evidenceConfirmedCount = paymentStatusView_countEvidenceStatus_(groupEvidences, "CONFIRMED");
  const evidencePostedCount = paymentStatusView_countEvidenceStatus_(groupEvidences, "POSTED");

  const cashRequestsLen = filterBySheet(
    memberId,
    cashRequests,
    "状態",
    "要求中"
  ).length;

  const selection = billing_getMonthlySelection(
    billingGroupId,
    normalizedTargetMonth,
    ctx
  );

  // 05_請求明細は月会費だけでなく審査費等の追加請求も正本とする。
  // 月次選択がなくても請求明細が存在すればViewへ反映する。
  const memberInvoices = invoices.filter(inv =>
    normalizeMonth(inv["target_month"]) === normalizedTargetMonth &&
    String(inv["billing_group_id"]).trim() === String(billingGroupId).trim()
  );

  if (!selection && memberInvoices.length === 0) {
    return {
      ok: true,
      memberId,
      memberName,
      billingGroupId,
      invoiceIds: [],
      invoiceCount: 0,
      invoiceSummary: "",
      invoiceItems: [],
      targetMonth: normalizedTargetMonth,
      planType: "",
      status: "未宣言",
      billedTotal: 0,
      paidTotal,
      unpaidAmount: 0,
      monthlyCap: 0,
      lessonCount,
      isPaid: false,
      isCapped: false,
      todayAttendanceRegistered: paymentStatusView_isAttendedToday(memberId, attendances, ctx),
      cashRequestsLen,
      cashPayCount,
      cashPaidTotal,
      paypayPaidTotal,
      otherPaidTotal,
      paymentCount,
      evidenceRequestedCount,
      evidenceConfirmedCount,
      evidencePostedCount,
      message: "今月の会費タイプを選択してください。"
    };
  }

  const planId = selection ? selection["plan_id"] : "追加請求";

  if (memberInvoices.length === 0) {
    return {
      ok: true,
      memberId,
      memberName,
      billingGroupId,
      invoiceIds: [],
      invoiceCount: 0,
      invoiceSummary: "",
      invoiceItems: [],
      targetMonth: normalizedTargetMonth,
      planType: planId,
      status: "請求なし",
      billedTotal: 0,
      paidTotal,
      unpaidAmount: 0,
      monthlyCap: 0,
      lessonCount,
      isPaid: false,
      isCapped: false,
      todayAttendanceRegistered: paymentStatusView_isAttendedToday(memberId, attendances, ctx),
      cashRequestsLen,
      cashPayCount,
      cashPaidTotal,
      paypayPaidTotal,
      otherPaidTotal,
      paymentCount,
      evidenceRequestedCount,
      evidenceConfirmedCount,
      evidencePostedCount,
      message: "※今月の請求はまだ作成されていません。"
    };
  }

  const invoiceItems = paymentStatusView_makeInvoiceItems_(memberInvoices);
  const unpaidInvoiceItems = invoiceItems.filter(function(item) {
    return item.status !== "支払済" && item.status !== "免除";
  });
  const invoiceIds = invoiceItems.map(function(item) {
    return item.invoice_id;
  }).filter(function(id) {
    return !!id;
  });

  const invoiceSummary = invoiceItems.map(function(item) {
    return item.label + " " + item.amount + "円";
  }).join(" / ");

  const billedTotal = memberInvoices.reduce(
    (sum, inv) => sum + Number(inv["請求予定額"] || inv["金額"] || 0),
    0
  );

  const monthlyCap = memberInvoices.reduce(
    (max, inv) => Math.max(max, Number(inv["上限金額"] || 0)),
    0
  );

  const isCapped = monthlyCap > 0 && billedTotal >= monthlyCap;
  const unpaidAmount = Math.max(billedTotal - paidTotal, 0);
  const paid = unpaidAmount === 0;
  const isPaid = paid && billedTotal > 0;
  const status =
    billedTotal === 0
      ? "免除"
      : paid
        ? "支払済"
        : "未払い";

  const message =
    status === "免除"
      ? "今月分は支払い不要です。"
      : status === "支払済"
        ? "今月分は支払い済みです。"
        : "未払いがあります。";

  return {
    ok: true,
    memberId,
    memberName,
    billingGroupId,
    invoiceIds,
    invoiceCount: invoiceIds.length,
    invoiceSummary,
    invoiceItems,
    unpaidInvoiceItems,
    targetMonth: normalizedTargetMonth,
    planType: planId,
    status,
    billedTotal,
    paidTotal,
    unpaidAmount,
    monthlyCap,
    lessonCount,
    isPaid,
    isCapped,
    todayAttendanceRegistered: paymentStatusView_isAttendedToday(memberId, attendances, ctx),
    cashRequestsLen,
    cashPayCount,
    cashPaidTotal,
    paypayPaidTotal,
    otherPaidTotal,
    paymentCount,
    evidenceRequestedCount,
    evidenceConfirmedCount,
    evidencePostedCount,
    message
  };
}

function paymentStatusView_makeInvoiceItems_(invoices) {
  return (invoices || []).map(function(inv) {
    const amount = Number(inv["請求予定額"] || inv["金額"] || 0);
    const label = String(inv["表示名"] || inv["請求種別"] || inv["plan_id"] || "請求明細");

    return {
      invoice_id: normalizeId_(inv["invoice_id"]),
      target_month: normalizeMonth(inv["target_month"]),
      billing_group_id: normalizeId_(inv["billing_group_id"]),
      member_id: normalizeId_(inv["member_id"]),
      plan_id: normalizeId_(inv["plan_id"]),
      billing_type: String(inv["請求種別"] || ""),
      label: label,
      amount: amount,
      status: String(inv["支払状態"] || "")
    };
  }).filter(function(item) {
    return !!item.invoice_id && item.amount > 0;
  });
}

// ==============================
// View行生成
// ==============================
function paymentStatusView_buildRow(memberId, targetMonth, ctx) {
  ctx = ctx || {};

  // 20_View用DTO。変数名の先頭番号は主な取得元シートを示す。
  // Viewの既存ヘッダー／外部レスポンスは互換維持のため変更しない。
  const dto = {
    s01_member_id: memberId,
    s01_member_name: ctx.memberName || "",
    s01_billing_group_id: ctx.billingGroupId || "",
    s04_target_month: normalizeMonth(targetMonth),
    s04_plan_type: ctx.planType || "",
    s05_invoice_ids: (ctx.invoiceIds || []).join("|"),
    s05_invoice_count: Number(ctx.invoiceCount || 0),
    s05_invoice_summary: ctx.invoiceSummary || "",
    s05_invoice_items_json: JSON.stringify(ctx.invoiceItems || []),
    s05_unpaid_invoice_items_json: JSON.stringify(ctx.unpaidInvoiceItems || []),
    s05_billed_total: Number(ctx.billedTotal || 0),
    s05_unpaid_amount: Number(ctx.unpaidAmount || 0),
    s05_status: ctx.status || "",
    s05_monthly_cap: Number(ctx.monthlyCap || 0),
    s06_paid_total: Number(ctx.paidTotal || 0),
    s06_cash_paid_total: Number(ctx.cashPaidTotal || 0),
    s06_paypay_paid_total: Number(ctx.paypayPaidTotal || 0),
    s06_other_paid_total: Number(ctx.otherPaidTotal || 0),
    s06_payment_count: Number(ctx.paymentCount || 0),
    s07_lesson_count: Number(ctx.lessonCount || 0),
    s07_attended_today: !!ctx.todayAttendanceRegistered,
    s09_cash_request_count: Number(ctx.cashRequestsLen || 0),
    s09_evidence_requested_count: Number(ctx.evidenceRequestedCount || 0),
    s09_evidence_confirmed_count: Number(ctx.evidenceConfirmedCount || 0),
    s09_evidence_posted_count: Number(ctx.evidencePostedCount || 0),
    s20_is_paid: !!ctx.isPaid,
    s20_is_capped: !!ctx.isCapped,
    s20_message: ctx.message || "",
    s20_updated_at: sup_now(ctx)
  };

  return {
    target_month: dto.s04_target_month,
    member_id: dto.s01_member_id,
    billing_group_id: dto.s01_billing_group_id,
    invoice_ids: dto.s05_invoice_ids,
    invoice_count: dto.s05_invoice_count,
    invoice_summary: dto.s05_invoice_summary,
    invoice_items_json: dto.s05_invoice_items_json,
    unpaid_invoice_items_json: dto.s05_unpaid_invoice_items_json,
    会員名: dto.s01_member_name,
    会費タイプ: dto.s04_plan_type,
    請求額: dto.s05_billed_total,
    入金額: dto.s06_paid_total,
    現金入金額: dto.s06_cash_paid_total,
    PayPay入金額: dto.s06_paypay_paid_total,
    その他入金額: dto.s06_other_paid_total,
    入金件数: dto.s06_payment_count,
    未払い額: dto.s05_unpaid_amount,
    is_paid: dto.s20_is_paid,
    支払状態: dto.s05_status,
    月額上限: dto.s05_monthly_cap,
    出席回数: dto.s07_lesson_count,
    is_capped: dto.s20_is_capped,
    本日出席済み: dto.s07_attended_today,
    現金支払要求未完了数: dto.s09_cash_request_count,
    Evidence要求中件数: dto.s09_evidence_requested_count,
    Evidence確認済件数: dto.s09_evidence_confirmed_count,
    Evidence反映済件数: dto.s09_evidence_posted_count,
    メッセージ: dto.s20_message,
    更新日時: dto.s20_updated_at
  };
}

// View/TB の端子定義。値はヘッダー精査にだけ使用する。
function paymentStatusView_schemaTemplate_() {
  return {
    target_month: "",
    member_id: "",
    billing_group_id: "",
    invoice_ids: "",
    invoice_count: 0,
    invoice_summary: "",
    invoice_items_json: "[]",
    unpaid_invoice_items_json: "[]",
    会員名: "",
    会費タイプ: "",
    請求額: 0,
    入金額: 0,
    現金入金額: 0,
    PayPay入金額: 0,
    その他入金額: 0,
    入金件数: 0,
    未払い額: 0,
    is_paid: false,
    支払状態: "",
    月額上限: 0,
    出席回数: 0,
    is_capped: false,
    本日出席済み: false,
    現金支払要求未完了数: 0,
    Evidence要求中件数: 0,
    Evidence確認済件数: 0,
    Evidence反映済件数: 0,
    メッセージ: "",
    更新日時: ""
  };
}

// ==============================
// View更新
// ==============================
function paymentStatusView_update(memberId, targetMonth, updateValues, ctx) {
  paymentStatusView_ensureViewHeaders_(updateValues, ctx);

  upsertViewRow(
    "20_会費状態View",
    ["target_month", "member_id"],
    {
      target_month: normalizeMonth(targetMonth),
      member_id: memberId
    },
    updateValues
  );
}

function paymentStatusView_ensureViewHeaders_(updateValues, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("20_会費状態View");
  if (!sheet) {
    throw new Error("シートが見つかりません: 20_会費状態View");
  }

  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
        return String(header).trim();
      })
    : [];

  const existing = {};
  headers.forEach(function(header) {
    if (header) existing[header] = true;
  });

  const missing = Object.keys(updateValues || {}).filter(function(header) {
    return !existing[header];
  });

  if (missing.length === 0) return;

  sheet
    .getRange(1, headers.length + 1, 1, missing.length)
    .setValues([missing]);
}

// ==============================
// 既存View行の再収集・再記録（メンテナンス）
// ==============================
// View/TB の端子追加・定義変更後に、既存行へ現在値を流し直す。
// 引数なしなら View に現在存在する全 member×month を対象にする。
// targetMonth を指定した場合は、その月の既存行だけを対象にする。
// 新しい業務判断や新規対象の発見は行わず、既存View行を正規 refresh へ通すだけ。
function paymentStatusView_refreshAll(targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);

  paymentStatusView_ensureViewHeaders_(paymentStatusView_schemaTemplate_(), ctx);

  const normalizedTargetMonth = targetMonth ? normalizeMonth(targetMonth) : "";
  const rows = getFeeStatusViewRows(ctx);
  const targets = [];
  const seen = {};

  (rows || []).forEach(function(row) {
    const memberId = normalizeId_(row["member_id"]);
    const rowMonth = normalizeMonth(row["target_month"]);

    // 旧版の誤操作で生成された undefined/空行は再生成対象にしない。
    if (!memberId || !rowMonth || rowMonth === "undefined") return;
    if (normalizedTargetMonth && rowMonth !== normalizedTargetMonth) return;

    const key = rowMonth + "|" + memberId;
    if (seen[key]) return;
    seen[key] = true;
    targets.push({ member_id: memberId, target_month: rowMonth });
  });

  const results = [];
  targets.forEach(function(target) {
    const result = paymentStatusView_refresh(
      target.member_id,
      target.target_month,
      ctx
    );
    results.push({
      member_id: target.member_id,
      target_month: target.target_month,
      ok: !!(result && result.ok)
    });
  });

  return {
    ok: results.every(function(result) { return result.ok; }),
    schema_checked: true,
    refreshed_count: results.length,
    results: results
  };
}

// ==============================
// View取得
// ==============================
function paymentStatusView_get(memberId, ctx) {
  try {
    if (!memberId) {
      return {
        ok: false,
        message: "memberId が指定されていません。"
      };
    }

    ctx = ensureSheetContext(ctx);

    const targetMonth = sup_targetMonth(ctx);

    const rows = getFeeStatusViewRows(ctx);
    let row = rows.find(r =>
      normalizeMonth(r["target_month"]) === targetMonth &&
      String(r["member_id"]).trim() === String(memberId).trim()
    );

    if (!row) {
      const result = paymentStatusView_refresh(memberId, targetMonth, ctx);
      row = result.row;
    }

    if (!row) {
      return {
        ok: false,
        message: "会費状態を作成できませんでした。"
      };
    }

    return paymentStatusView_convertResponse(row, ctx);

  } catch (e) {
    return {
      ok: false,
      message: "paymentStatusView_get error: " + e.message
    };
  }
}

function paymentStatusView_convertResponse(row, ctx) {
  const invoiceItems = paymentStatusView_parseInvoiceItems_(row["invoice_items_json"]);
  const invoiceIdsText = String(row["invoice_ids"] || "");
  const invoiceIds = invoiceIdsText
    ? invoiceIdsText.split("|").map(function(id) { return String(id).trim(); }).filter(function(id) { return !!id; })
    : invoiceItems.map(function(item) { return item.invoice_id; }).filter(function(id) { return !!id; });

  return {
    ok: true,
    memberId: String(row["member_id"] || ""),
    memberName: String(row["会員名"] || ""),
    billingGroupId: String(row["billing_group_id"] || ""),
    invoiceIds: invoiceIds,
    invoiceCount: Number(row["invoice_count"] || invoiceIds.length || 0),
    invoiceSummary: String(row["invoice_summary"] || ""),
    invoiceItems: invoiceItems,
    unpaidInvoiceItems: paymentStatusView_parseInvoiceItems_(row["unpaid_invoice_items_json"]),
    targetMonth: normalizeMonth(row["target_month"]),
    planType: String(row["会費タイプ"] || ""),
    billedTotal: Number(row["請求額"] || 0),
    paidTotal: Number(row["入金額"] || 0),
    cashPaidTotal: Number(row["現金入金額"] || 0),
    paypayPaidTotal: Number(row["PayPay入金額"] || 0),
    otherPaidTotal: Number(row["その他入金額"] || 0),
    paymentCount: Number(row["入金件数"] || 0),
    unpaidAmount: Number(row["未払い額"] || 0),
    isPaid: row["is_paid"] === true || row["is_paid"] === "TRUE",
    status: String(row["支払状態"] || ""),
    monthlyCap: Number(row["月額上限"] || 0),
    lessonCount: Number(row["出席回数"] || 0),
    isCapped: row["is_capped"] === true || row["is_capped"] === "TRUE",
    todayAttendanceRegistered:
      row["本日出席済み"] === true || row["本日出席済み"] === "TRUE",
    cashRequestsLen: Number(row["現金支払要求未完了数"] || 0),
    evidenceRequestedCount: Number(row["Evidence要求中件数"] || 0),
    evidenceConfirmedCount: Number(row["Evidence確認済件数"] || 0),
    evidencePostedCount: Number(row["Evidence反映済件数"] || 0),
    message: String(row["メッセージ"] || "")
  };
}

function paymentStatusView_parseInvoiceItems_(value) {
  const text = String(value || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function paymentStatusView_sumPaymentMethod_(rows, method) {
  return (rows || []).reduce(function(sum, row) {
    const normalized = paymentEvidence_normalizePaymentMethod_(row["支払方法"]);
    return sum + (normalized === method ? Number(row["入金額"] || row["金額"] || 0) : 0);
  }, 0);
}

function paymentStatusView_countEvidenceStatus_(rows, status) {
  return (rows || []).filter(function(row) {
    return normalizeId_(row["status"] || row["状態"]) === status;
  }).length;
}

// ==============================
// Calc
// ==============================
function paymentStatusView_isAttendedToday(memberId, attendances, ctx) {
  const today = sup_today(ctx);

  return attendances.some(a => {
    if (!isActiveMasterRow_(a) || !a["稽古日"]) return false;

    const attendanceDate = formatAttendanceDate_(a["稽古日"], ctx);

    return (
      String(a["member_id"]).trim() === String(memberId).trim() &&
      attendanceDate === today
    );
  });
}

// ==============================
// 読み取り互換入口
// ==============================
function getPaymentStatus(memberId, ctx) {
  return paymentStatusView_get(memberId, ctx);
}

function convertFeeStatusViewRowToResponse(row, ctx) {
  return paymentStatusView_convertResponse(row, ctx);
}

// 09 Evidence の状態変更から対象 member×month のViewを更新する。
// Evidence側はView行を組み立てず、更新対象の解決だけを本Viewモジュールへ委譲する。
function paymentStatusView_refreshByEvidenceId_(evidenceId, ctx) {
  ctx = ensureSheetContext(ctx);
  const evidence = getPaymentEvidences(ctx).find(function(row) {
    return normalizeId_(row["evidence_id"]) === normalizeId_(evidenceId);
  });
  if (!evidence) return { ok: false, message: "Evidenceが見つかりません: " + evidenceId };

  const invoice = getInvoice(normalizeId_(evidence["invoice_id"]), ctx);
  if (!invoice) return { ok: false, message: "請求明細が見つかりません: " + evidence["invoice_id"] };

  return paymentStatusView_refresh(
    normalizeId_(evidence["member_id"] || invoice["member_id"]),
    normalizeMonth(invoice["target_month"]),
    ctx
  );
}
