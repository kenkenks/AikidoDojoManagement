// ========================================
// 24_WebInterfaceRunner.js
// WEB Interface Runner
// ========================================
//
// PURPOSE
//   Browser の一段手前、WebConnect の doGet / doPost 境界を検証する。
//   Service / Domain 関数を直接呼ばず、実画面と同じ action / mode / payload で通す。
//
// LAYER
//   Domain Runner -> WEB Interface Runner -> Browser E2E
//
// NOTE
//   paymentConfirmedToPosted は実データを更新する。
//   テスト用 Evidence ID を明示して実行すること。

function runner_webInterface_execute_(name, callback) {
  try {
    const value = callback();
    return { ok: true, name: name, value: value };
  } catch (e) {
    return {
      ok: false,
      name: name,
      message: e && e.message ? e.message : String(e),
      stack: e && e.stack ? e.stack : ""
    };
  }
}

function runner_webInterface_outputText_(output) {
  if (!output) return "";
  if (typeof output.getContent === "function") return output.getContent();
  return String(output);
}

function runner_webInterface_parseOutput_(output, callbackName) {
  let text = runner_webInterface_outputText_(output).trim();
  const callback = String(callbackName || "").trim();

  if (callback) {
    const prefix = callback + "(";
    if (text.indexOf(prefix) !== 0 || text.slice(-2) !== ");") {
      throw new Error("JSONP形式が不正です: " + text.slice(0, 120));
    }
    text = text.slice(prefix.length, -2);
  }

  return JSON.parse(text);
}

function runner_webInterface_get_(params) {
  params = Object.assign({}, params || {});
  const callback = params.callback || "";
  const output = doGet({ parameter: params });
  return runner_webInterface_parseOutput_(output, callback);
}

function runner_webInterface_post_(payload) {
  const output = doPost({
    parameter: {},
    postData: {
      contents: JSON.stringify(payload || {})
    }
  });
  return runner_webInterface_parseOutput_(output, "");
}

function runner_webInterface_assert_(results, condition, name, actual, expected) {
  results.push({
    ok: !!condition,
    name: name,
    actual: actual,
    expected: expected
  });
}

function runner_webInterface_finish_(runnerName, checks, detail) {
  const result = {
    ok: checks.every(function(check) { return check.ok === true; }),
    runner: runnerName,
    total: checks.length,
    failed: checks.filter(function(check) { return check.ok !== true; }).length,
    checks: checks,
    detail: detail || {}
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

// --------------------------------------------------
// READ Runner
// 先生会費画面が初期表示で利用する WEB API を、画面と同じ引数で通す。
// --------------------------------------------------
function runner_webInterface_paymentScreenRead(input) {
  input = input || {};

  const receptionDate = String(input.reception_date || "").trim();
  const locationId = String(input.location_id || "").trim();
  const billingBlockId = String(input.billing_block_id || "").trim();
  const expectedInvoiceId = String(input.expected_invoice_id || "").trim();
  const expectedMemberId = String(input.expected_member_id || "").trim();
  const expectedMemberName = String(input.expected_member_name || "").trim();
  const expectedPayPayTotal = input.expected_paypay_total;
  const expectedPaymentCount = input.expected_payment_count;
  const callback = "runnerWebCallback";

  if (!receptionDate || !locationId || !billingBlockId) {
    return {
      ok: false,
      runner: "WEB-PAYMENT-READ-001",
      message: "reception_date / location_id / billing_block_id を指定してください。"
    };
  }

  const checks = [];
  const perf = {};
  const totalStartedAt = Date.now();

  let startedAt = Date.now();
  const session = runner_webInterface_get_({
    action: "attendance_session_info",
    location_id: locationId,
    billing_block_id: billingBlockId,
    callback: callback
  });
  perf.attendance_session_info_ms = Date.now() - startedAt;

  // Browser と同じく、決済画面の Summary / CONFIRMED / POSTED は1回で取得する。
  startedAt = Date.now();
  const screenRead = runner_webInterface_get_({
    action: "payment_screen_read",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId,
    payment_method: "PAYPAY",
    callback: callback
  });
  perf.payment_screen_read_ms = Date.now() - startedAt;
  perf.total_ms = Date.now() - totalStartedAt;
  Logger.log("[PERF-RELOAD] " + JSON.stringify(perf));

  const summary = screenRead && screenRead.summary ? screenRead.summary : {};
  const confirmed = screenRead && screenRead.confirmed ? screenRead.confirmed : {};
  const posted = screenRead && screenRead.posted ? screenRead.posted : {};

  runner_webInterface_assert_(checks, session && session.ok === true,
    "attendance_session_info WEB入口", session && session.ok, true);
  runner_webInterface_assert_(checks, screenRead && screenRead.ok === true,
    "payment_screen_read WEB入口", screenRead && screenRead.ok, true);
  runner_webInterface_assert_(checks, confirmed && confirmed.ok === true,
    "payment_screen_read CONFIRMED", confirmed && confirmed.ok, true);
  runner_webInterface_assert_(checks, posted && posted.ok === true,
    "payment_screen_read POSTED", posted && posted.ok, true);

  runner_webInterface_assert_(checks,
    String(summary.location_id || "") === locationId,
    "summary location_id 往復", summary.location_id || "", locationId);
  runner_webInterface_assert_(checks,
    String(summary.billing_block_id || "") === billingBlockId,
    "summary billing_block_id 往復", summary.billing_block_id || "", billingBlockId);
  runner_webInterface_assert_(checks,
    String(summary.reception_date || "") === receptionDate,
    "summary reception_date 往復", summary.reception_date || "", receptionDate);

  runner_webInterface_assert_(checks,
    Array.isArray(summary.payments),
    "summary DTO payments", Array.isArray(summary.payments), true);

  if (expectedPayPayTotal !== undefined && expectedPayPayTotal !== null && expectedPayPayTotal !== "") {
    runner_webInterface_assert_(checks,
      Number(summary.paypay_total || 0) === Number(expectedPayPayTotal),
      "summary PayPay合計", Number(summary.paypay_total || 0), Number(expectedPayPayTotal));
  }
  if (expectedPaymentCount !== undefined && expectedPaymentCount !== null && expectedPaymentCount !== "") {
    runner_webInterface_assert_(checks,
      Number(summary.payment_count || 0) === Number(expectedPaymentCount),
      "summary 入金件数", Number(summary.payment_count || 0), Number(expectedPaymentCount));
  }

  if (expectedInvoiceId) {
    const summaryPayment = (summary.payments || []).find(function(row) {
      return String(row.invoice_id || "") === expectedInvoiceId;
    });
    runner_webInterface_assert_(checks, !!summaryPayment,
      "summary payments 対象請求", summaryPayment ? summaryPayment.invoice_id : "", expectedInvoiceId);

    if (expectedMemberId) {
      runner_webInterface_assert_(checks,
        summaryPayment && String(summaryPayment.member_id || "") === expectedMemberId,
        "summary payments member_id", summaryPayment ? summaryPayment.member_id : "", expectedMemberId);
    }
    if (expectedMemberName) {
      runner_webInterface_assert_(checks,
        summaryPayment && String(summaryPayment.member_name || "") === expectedMemberName,
        "summary payments member_name", summaryPayment ? summaryPayment.member_name : "", expectedMemberName);
    }
  }

  runner_webInterface_assert_(checks,
    Array.isArray(summary.reconciliation_items),
    "summary DTO reconciliation_items", Array.isArray(summary.reconciliation_items), true);
  runner_webInterface_assert_(checks,
    Number.isFinite(Number(summary.attendance_member_count)),
    "summary DTO attendance_member_count", summary.attendance_member_count, "number");
  runner_webInterface_assert_(checks,
    Number.isFinite(Number(summary.outstanding_total)),
    "summary DTO outstanding_total", summary.outstanding_total, "number");

  runner_webInterface_assert_(checks,
    Array.isArray(confirmed.evidences),
    "CONFIRMED DTO evidences", Array.isArray(confirmed.evidences), true);
  runner_webInterface_assert_(checks,
    Array.isArray(posted.evidences),
    "POSTED DTO evidences", Array.isArray(posted.evidences), true);

  runner_webInterface_assert_(checks,
    (confirmed.evidences || []).every(function(row) { return String(row.reception_date || "") === receptionDate; }),
    "CONFIRMED Evidence受付日一致", true, true);
  runner_webInterface_assert_(checks,
    (posted.evidences || []).every(function(row) { return String(row.reception_date || "") === receptionDate; }),
    "POSTED Evidence受付日一致", true, true);

  return runner_webInterface_finish_("WEB-PAYMENT-READ-001", checks, {
    perf: perf,
    session: session,
    summary: summary,
    confirmed: confirmed,
    posted: posted
  });
}

// 現在のテスト環境向けワンクリック入口。
// 日付を変えた場合はここだけ変更する。
function runner_webInterface_paymentScreenRead_TEST() {
  const result = runner_webInterface_paymentScreenRead({
    reception_date: "2026-10-02",
    location_id: "HONBU",
    billing_block_id: "B_KYO_FRI_1030_1230",
    expected_invoice_id: "INV-2026-10-G001-M001-55239935",
    expected_member_id: "M001",
    expected_member_name: "山田太郎",
    expected_paypay_total: 1500,
    expected_payment_count: 1
  });

  if (!result || result.ok !== true) {
    throw new Error("[WEB Interface FAIL] payment read: " + JSON.stringify(result));
  }

  Logger.log("[WEB Interface PASS] payment read");
  return result;
}

// --------------------------------------------------
// Reception Date wiring Runner
// 既存REQUESTED/CONFIRMEDの空受付Contextを、実Web GET(paypay_code_start)で補完し、
// reception_date 指定Queryから対象Evidenceを取得できることを確認する。
// 支払いPOSTは行わない。
// --------------------------------------------------
function runner_webInterface_paymentReceptionDateRepair_TEST() {
  const evidenceId = "PAYPAY-5c685928";
  const receptionDate = "2026-09-14";
  const checks = [];

  const start = runner_webInterface_get_({
    action: "paypay_code_start",
    member_id: "M001",
    plan_id: "P002",
    teacher_id: "T001",
    reception_date: receptionDate,
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230"
  });

  const confirmed = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });

  const target = (confirmed.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });

  runner_webInterface_assert_(checks, start && start.ok === true,
    "paypay_code_start WEB入口", start && start.ok, true);
  runner_webInterface_assert_(checks, confirmed && confirmed.ok === true,
    "payment_evidence_list reception_date WEB入口", confirmed && confirmed.ok, true);
  runner_webInterface_assert_(checks, !!target,
    "対象Evidenceを9/14 Queryで取得", target ? target.evidence_id : "", evidenceId);
  runner_webInterface_assert_(checks, target && String(target.reception_date || "") === receptionDate,
    "対象Evidence reception_date", target ? target.reception_date : "", receptionDate);
  runner_webInterface_assert_(checks, target && String(target.location_id || "") === "HONBU",
    "対象Evidence location_id", target ? target.location_id : "", "HONBU");
  runner_webInterface_assert_(checks, target && String(target.billing_block_id || "") === "B_KYO_MON_1030_1230",
    "対象Evidence billing_block_id", target ? target.billing_block_id : "", "B_KYO_MON_1030_1230");

  return runner_webInterface_finish_("WEB-PAYMENT-RECEPTION-DATE-001", checks, {
    start: start,
    confirmed: confirmed,
    target: target
  });
}

// --------------------------------------------------
// WRITE Runner
// CONFIRMED Evidence 1件を、実画面と同じ WEB POST で POSTED にする。
// 前後の一覧と課金枠集計もすべて doGet 経由で確認する。
// --------------------------------------------------
function runner_webInterface_paymentConfirmedToPosted(input) {
  input = input || {};

  const evidenceId = String(input.evidence_id || "").trim();
  const teacherId = String(input.teacher_id || "T001").trim();
  const receptionDate = String(input.reception_date || "").trim();
  const locationId = String(input.location_id || "").trim();
  const billingBlockId = String(input.billing_block_id || "").trim();
  const expectScopePayment = input.expect_scope_payment !== false;

  if (!evidenceId || !receptionDate || !locationId || !billingBlockId) {
    return {
      ok: false,
      runner: "WEB-PAYMENT-POST-001",
      message: "evidence_id / reception_date / location_id / billing_block_id を指定してください。"
    };
  }

  const checks = [];

  const beforeConfirmed = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const beforePosted = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "POSTED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const beforeSummary = runner_webInterface_get_({
    action: "payment_reception_summary",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId
  });

  const target = (beforeConfirmed.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });

  runner_webInterface_assert_(checks, !!target,
    "対象EvidenceがCONFIRMED一覧に存在", target ? target.evidence_id : "", evidenceId);

  if (!target) {
    return runner_webInterface_finish_("WEB-PAYMENT-POST-001", checks, {
      beforeConfirmed: beforeConfirmed,
      beforePosted: beforePosted,
      beforeSummary: beforeSummary
    });
  }

  const postResult = runner_webInterface_post_({
    mode: "payment_evidence_post_selected",
    teacher_id: teacherId,
    evidence_items: [
      { evidence_id: evidenceId }
    ],
    source: "runner_webInterface_paymentConfirmedToPosted"
  });

  const afterConfirmed = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const afterPosted = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "POSTED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const afterSummary = runner_webInterface_get_({
    action: "payment_reception_summary",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId
  });

  const stillConfirmed = (afterConfirmed.evidences || []).some(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });
  const nowPosted = (afterPosted.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });

  runner_webInterface_assert_(checks,
    postResult && postResult.ok === true,
    "payment_evidence_post_selected WEB POST", postResult && postResult.ok, true);
  runner_webInterface_assert_(checks,
    !stillConfirmed,
    "POST後CONFIRMEDから消える", stillConfirmed, false);
  runner_webInterface_assert_(checks,
    !!nowPosted,
    "POST後POSTEDに現れる", nowPosted ? nowPosted.evidence_id : "", evidenceId);
  runner_webInterface_assert_(checks,
    nowPosted && !!String(nowPosted.payment_log_id || ""),
    "POSTED DTO payment_log_id", nowPosted ? nowPosted.payment_log_id : "", "non-empty");
  runner_webInterface_assert_(checks,
    afterSummary && afterSummary.ok === true,
    "POST後 payment_reception_summary WEB入口", afterSummary && afterSummary.ok, true);

  if (expectScopePayment) {
    const amount = Number(target.amount || 0);
    const beforePayPay = Number(beforeSummary.paypay_total || 0);
    const afterPayPay = Number(afterSummary.paypay_total || 0);
    const beforeCount = Number(beforeSummary.payment_count || 0);
    const afterCount = Number(afterSummary.payment_count || 0);

    runner_webInterface_assert_(checks,
      afterPayPay >= beforePayPay + amount,
      "課金枠集計 PayPay反映",
      afterPayPay,
      ">= " + (beforePayPay + amount));
    runner_webInterface_assert_(checks,
      afterCount >= beforeCount + 1,
      "課金枠集計 入金件数反映",
      afterCount,
      ">= " + (beforeCount + 1));
  }

  return runner_webInterface_finish_("WEB-PAYMENT-POST-001", checks, {
    target: target,
    beforeSummary: beforeSummary,
    postResult: postResult,
    afterSummary: afterSummary,
    afterConfirmed: afterConfirmed,
    afterPosted: afterPosted
  });
}

// 実行例（Evidence IDは毎回明示して使う）:
// runner_webInterface_paymentConfirmedToPosted({
//   evidence_id: "PAYPAY-xxxxxxxx",
//   teacher_id: "T001",
//   reception_date: "2026-09-14",
//   location_id: "HONBU",
//   billing_block_id: "B_KYO_MON_1030_1230",
//   expect_scope_payment: true
// });

/**
 * Apps Script エディタから引数なしで実行するための WRITE Runner 入口。
 * PAYPAY-5c685928 を 2026-09-14 の受付として CONFIRMED -> POSTED へ進める。
 */
function runner_webInterface_paymentConfirmedToPosted_TEST() {
  return runner_webInterface_paymentConfirmedToPosted({
    evidence_id: "PAYPAY-5c685928",
    teacher_id: "T001",
    reception_date: "2026-09-14",
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230",
    expect_scope_payment: true
  });
}

// --------------------------------------------------
// WRITE Runner case: Remote PayPay
// Scopeなし CONFIRMED Evidence を、先生画面の受付Scope付き WEB POST で POSTED にする。
// 既存 WEB-PAYMENT-POST-001 は変更せず、リモート支払い正常系を追加ケースとして検証する。
// --------------------------------------------------
function runner_webInterface_paymentRemoteConfirmedToPosted(input) {
  input = input || {};

  const evidenceId = String(input.evidence_id || "").trim();
  const teacherId = String(input.teacher_id || "T001").trim();
  const receptionDate = String(input.reception_date || "").trim();
  const locationId = String(input.location_id || "").trim();
  const billingBlockId = String(input.billing_block_id || "").trim();

  if (!evidenceId || !teacherId || !receptionDate || !locationId || !billingBlockId) {
    return {
      ok: false,
      runner: "WEB-PAYMENT-POST-REMOTE-001",
      message: "evidence_id / teacher_id / reception_date / location_id / billing_block_id を指定してください。"
    };
  }

  const checks = [];

  // 下段Evidence一覧と同じく、受付日 + status で取得する。課金枠では絞らない。
  const beforeConfirmed = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const beforeSummary = runner_webInterface_get_({
    action: "payment_reception_summary",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId
  });

  const target = (beforeConfirmed.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });

  runner_webInterface_assert_(checks, !!target,
    "対象EvidenceがCONFIRMED一覧に存在", target ? target.evidence_id : "", evidenceId);

  if (!target) {
    return runner_webInterface_finish_("WEB-PAYMENT-POST-REMOTE-001", checks, {
      beforeConfirmed: beforeConfirmed,
      beforeSummary: beforeSummary
    });
  }

  // このケースの本質: 会員側でCONFIRMEDになった時点では道場/課金枠Scopeを持たない。
  runner_webInterface_assert_(checks,
    String(target.location_id || "") === "",
    "CONFIRMED location_id は空", target.location_id || "", "");
  runner_webInterface_assert_(checks,
    String(target.billing_block_id || "") === "",
    "CONFIRMED billing_block_id は空", target.billing_block_id || "", "");

  if (String(target.location_id || "") !== "" || String(target.billing_block_id || "") !== "") {
    return runner_webInterface_finish_("WEB-PAYMENT-POST-REMOTE-001", checks, {
      target: target,
      beforeConfirmed: beforeConfirmed,
      beforeSummary: beforeSummary,
      message: "リモートPayPayケースではないためPOSTを実行しません。"
    });
  }

  const amount = Number(target.amount || 0);
  const beforePayPay = Number(beforeSummary.paypay_total || 0);
  const beforeCount = Number(beforeSummary.payment_count || 0);
  const beforeOutstanding = Number(beforeSummary.outstanding_total || 0);

  // 実ブラウザが送るべき契約を明示する。
  // CONFIRMED時点の空Scopeではなく、先生が受付した時点のScopeをPOSTする。
  const postResult = runner_webInterface_post_({
    mode: "payment_evidence_post_selected",
    teacher_id: teacherId,
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId,
    evidence_items: [
      { evidence_id: evidenceId }
    ],
    count: 1,
    source: "runner_webInterface_paymentRemoteConfirmedToPosted"
  });

  const afterConfirmed = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const afterPosted = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "POSTED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const afterSummary = runner_webInterface_get_({
    action: "payment_reception_summary",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId
  });

  const stillConfirmed = (afterConfirmed.evidences || []).some(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });
  const nowPosted = (afterPosted.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });

  runner_webInterface_assert_(checks,
    postResult && postResult.ok === true,
    "payment_evidence_post_selected WEB POST", postResult && postResult.ok, true);
  runner_webInterface_assert_(checks,
    !stillConfirmed,
    "POST後CONFIRMEDから消える", stillConfirmed, false);
  runner_webInterface_assert_(checks,
    !!nowPosted,
    "POST後POSTEDに現れる", nowPosted ? nowPosted.evidence_id : "", evidenceId);
  runner_webInterface_assert_(checks,
    nowPosted && !!String(nowPosted.payment_log_id || ""),
    "POSTED DTO payment_log_id", nowPosted ? nowPosted.payment_log_id : "", "non-empty");

  // POST時の先生受付Scopeが09 Evidenceへ確定されることを検証する。
  runner_webInterface_assert_(checks,
    nowPosted && String(nowPosted.reception_date || "") === receptionDate,
    "POSTED reception_date は先生受付日", nowPosted ? nowPosted.reception_date : "", receptionDate);
  runner_webInterface_assert_(checks,
    nowPosted && String(nowPosted.location_id || "") === locationId,
    "POSTED location_id は先生受付Scope", nowPosted ? nowPosted.location_id : "", locationId);
  runner_webInterface_assert_(checks,
    nowPosted && String(nowPosted.billing_block_id || "") === billingBlockId,
    "POSTED billing_block_id は先生受付Scope", nowPosted ? nowPosted.billing_block_id : "", billingBlockId);

  runner_webInterface_assert_(checks,
    afterSummary && afterSummary.ok === true,
    "POST後 payment_reception_summary WEB入口", afterSummary && afterSummary.ok, true);

  const afterPayPay = Number(afterSummary.paypay_total || 0);
  const afterCount = Number(afterSummary.payment_count || 0);
  const afterOutstanding = Number(afterSummary.outstanding_total || 0);

  runner_webInterface_assert_(checks,
    afterPayPay >= beforePayPay + amount,
    "課金枠集計 PayPay反映", afterPayPay, ">= " + (beforePayPay + amount));
  runner_webInterface_assert_(checks,
    afterCount >= beforeCount + 1,
    "課金枠集計 入金件数反映", afterCount, ">= " + (beforeCount + 1));

  // 出席由来の未回収が対象金額以上ある場合だけ、同額以上減ることを確認する。
  // 既に未回収0のテストデータでもRunner自体は成立させる。
  if (amount > 0 && beforeOutstanding >= amount) {
    runner_webInterface_assert_(checks,
      afterOutstanding <= beforeOutstanding - amount,
      "未回収額が支払額分減少", afterOutstanding, "<= " + (beforeOutstanding - amount));
  }

  return runner_webInterface_finish_("WEB-PAYMENT-POST-REMOTE-001", checks, {
    target: target,
    beforeSummary: beforeSummary,
    postPayload: {
      teacher_id: teacherId,
      reception_date: receptionDate,
      location_id: locationId,
      billing_block_id: billingBlockId,
      evidence_id: evidenceId
    },
    postResult: postResult,
    afterSummary: afterSummary,
    afterConfirmed: afterConfirmed,
    afterPosted: afterPosted
  });
}

/**
 * Apps Script エディタから引数なしで実行するリモートPayPayケース入口。
 * 前提: PAYPAY-ebff2937 が CONFIRMED で、location_id / billing_block_id が空であること。
 * REQUESTED のままなら、会員PayPay画面で決済コード登録まで進めてから実行する。
 */
function runner_webInterface_paymentRemoteConfirmedToPosted_TEST() {
  return runner_webInterface_paymentRemoteConfirmedToPosted({
    evidence_id: "PAYPAY-ebff2937",
    teacher_id: "T001",
    reception_date: "2026-10-05",
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230"
  });
}

/**
 * PayPayコード登録のWeb境界を検証する。
 * 対象は CONFIRMED だが evidence_code / confirmed_at が欠けた修復対象Evidence。
 * Browserを介さず doPost(mode=paypay_code_record) を通し、09 DTOの補完まで確認する。
 */
function runner_webInterface_paypayCodeRecordRepair(input) {
  input = input || {};

  const evidenceId = String(input.evidence_id || "").trim();
  const memberId = String(input.member_id || "").trim();
  const receptionDate = String(input.reception_date || "").trim();
  const evidenceCode = String(input.evidence_code || "WEB-RUNNER-PAYPAY-CODE").trim();
  const checks = [];

  if (!evidenceId) throw new Error("evidence_id がありません。");
  if (!memberId) throw new Error("member_id がありません。");
  if (!receptionDate) throw new Error("reception_date がありません。");
  if (!evidenceCode) throw new Error("evidence_code がありません。");

  const before = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const targetBefore = (before.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });

  runner_webInterface_assert_(checks,
    !!targetBefore,
    "対象EvidenceがCONFIRMED一覧に存在", targetBefore ? targetBefore.evidence_id : "", evidenceId);

  if (!targetBefore) {
    return runner_webInterface_finish_("WEB-PAYPAY-CODE-RECORD-001", checks, {
      before: before
    });
  }

  runner_webInterface_assert_(checks,
    String(targetBefore.evidence_code || "") === "",
    "実行前 evidence_code は空", targetBefore.evidence_code || "", "");

  // 既にコードがある正常CONFIRMEDを誤って上書きしない。
  if (String(targetBefore.evidence_code || "") !== "") {
    return runner_webInterface_finish_("WEB-PAYPAY-CODE-RECORD-001", checks, {
      targetBefore: targetBefore,
      message: "正常CONFIRMEDのためPOSTを中止しました。"
    });
  }

  const postResult = runner_webInterface_post_({
    mode: "paypay_code_record",
    member_id: memberId,
    evidence_code: evidenceCode,
    evidence_items: [
      { evidence_id: evidenceId }
    ],
    source: "runner_webInterface_paypayCodeRecordRepair"
  });

  const after = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const targetAfter = (after.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });

  runner_webInterface_assert_(checks,
    postResult && postResult.ok === true,
    "paypay_code_record WEB POST", postResult && postResult.ok, true);
  runner_webInterface_assert_(checks,
    !!targetAfter,
    "POST後もCONFIRMEDとして存在", targetAfter ? targetAfter.evidence_id : "", evidenceId);
  runner_webInterface_assert_(checks,
    targetAfter && String(targetAfter.evidence_code || "") === evidenceCode,
    "evidence_code が09へ反映", targetAfter ? targetAfter.evidence_code : "", evidenceCode);
  runner_webInterface_assert_(checks,
    targetAfter && !!String(targetAfter.confirmed_at || ""),
    "confirmed_at が09へ反映", targetAfter ? targetAfter.confirmed_at : "", "non-empty");

  return runner_webInterface_finish_("WEB-PAYPAY-CODE-RECORD-001", checks, {
    targetBefore: targetBefore,
    postPayload: {
      member_id: memberId,
      evidence_id: evidenceId,
      evidence_code: evidenceCode
    },
    postResult: postResult,
    targetAfter: targetAfter
  });
}

/** Apps Script エディタから引数なしで実行する入口。 */
function runner_webInterface_paypayCodeRecordRepair_TEST() {
  return runner_webInterface_paypayCodeRecordRepair({
    evidence_id: "PAYPAY-ebff2937",
    member_id: "M001",
    reception_date: "2026-10-05",
    evidence_code: "WEB-RUNNER-PAYPAY-CODE"
  });
}

// --------------------------------------------------
// PayPay WEB E2E Runner
// Browser E2E と同じ業務順序を doGet / doPost 境界だけで一周する。
// 試験データの作成・Evidence ID の引継ぎも Runner 内で完結する。
// 最初に壊れた契約で停止し、前から順にバグを修正できるようにする。
// --------------------------------------------------
function runner_webInterface_paypayE2E(input) {
  input = input || {};

  const memberId = String(input.member_id || "").trim();
  const planId = String(input.plan_id || "").trim();
  const teacherId = String(input.teacher_id || "").trim();
  const receptionDate = String(input.reception_date || "").trim();
  const locationId = String(input.location_id || "").trim();
  const billingBlockId = String(input.billing_block_id || "").trim();
  const evidenceCode = String(input.evidence_code || ("WEB-E2E-PAYPAY-" + new Date().getTime())).trim();
  const checks = [];
  const detail = {};

  if (!memberId || !planId || !teacherId || !receptionDate || !locationId || !billingBlockId) {
    return {
      ok: false,
      runner: "WEB-PAYPAY-E2E-001",
      phase: "input",
      message: "member_id / plan_id / teacher_id / reception_date / location_id / billing_block_id を指定してください。"
    };
  }

  // 1. 会員 PayPay 開始。受付Scopeはまだ確定させない。
  const start = runner_webInterface_get_({
    action: "paypay_code_start",
    member_id: memberId,
    plan_id: planId,
    reception_date: receptionDate,
    location_id: "",
    billing_block_id: "",
    teacher_id: "PAYPAY_MEMBER"
  });
  detail.start = start;

  runner_webInterface_assert_(checks, start && start.ok === true,
    "PayPay開始 WEB入口", start && start.ok, true);

  const requestedItems = start && Array.isArray(start.evidenceItems) ? start.evidenceItems : [];
  const requested = requestedItems.find(function(row) {
    return String(row.status || "") === "REQUESTED";
  }) || requestedItems[0] || null;

  runner_webInterface_assert_(checks, !!requested,
    "REQUESTED Evidence生成", requested ? requested.evidence_id : "", "non-empty");

  if (!start || start.ok !== true || !requested) {
    return runner_webInterface_finish_("WEB-PAYPAY-E2E-001", checks, detail);
  }

  const evidenceId = String(requested.evidence_id || "");
  detail.evidence_id = evidenceId;

  // DTOではなく09をQuery経由で再読込して契約を確認する。
  const requestedList = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "REQUESTED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const requestedRow = (requestedList.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });
  detail.requested = requestedRow;

  runner_webInterface_assert_(checks, !!requestedRow,
    "09 REQUESTEDとして存在", requestedRow ? requestedRow.evidence_id : "", evidenceId);
  runner_webInterface_assert_(checks, requestedRow && String(requestedRow.reception_date || "") === receptionDate,
    "REQUESTED reception_date", requestedRow ? requestedRow.reception_date : "", receptionDate);
  runner_webInterface_assert_(checks, requestedRow && String(requestedRow.location_id || "") === "",
    "REQUESTED location_id は空", requestedRow ? requestedRow.location_id : "", "");
  runner_webInterface_assert_(checks, requestedRow && String(requestedRow.billing_block_id || "") === "",
    "REQUESTED billing_block_id は空", requestedRow ? requestedRow.billing_block_id : "", "");
  runner_webInterface_assert_(checks, requestedRow && String(requestedRow.teacher_id || "") === "",
    "REQUESTED teacher_id は空", requestedRow ? requestedRow.teacher_id : "", "");

  // 前段契約が壊れていれば、その状態を後続処理で汚さずここで止める。
  if (checks.some(function(c) { return c.ok !== true; })) {
    detail.phase = "requested_contract";
    return runner_webInterface_finish_("WEB-PAYPAY-E2E-001", checks, detail);
  }

  // 2. 会員がPayPay決済コードを登録 -> CONFIRMED。
  const record = runner_webInterface_post_({
    mode: "paypay_code_record",
    member_id: memberId,
    evidence_code: evidenceCode,
    evidence_items: [{ evidence_id: evidenceId }],
    source: "runner_webInterface_paypayE2E"
  });
  detail.record = record;
  runner_webInterface_assert_(checks, record && record.ok === true,
    "PayPayコード登録 WEB POST", record && record.ok, true);

  const confirmedList = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const confirmedRow = (confirmedList.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });
  detail.confirmed = confirmedRow;

  runner_webInterface_assert_(checks, !!confirmedRow,
    "09 CONFIRMEDとして存在", confirmedRow ? confirmedRow.evidence_id : "", evidenceId);
  runner_webInterface_assert_(checks, confirmedRow && String(confirmedRow.evidence_code || "") === evidenceCode,
    "CONFIRMED evidence_code", confirmedRow ? confirmedRow.evidence_code : "", evidenceCode);
  runner_webInterface_assert_(checks, confirmedRow && !!String(confirmedRow.confirmed_at || ""),
    "CONFIRMED confirmed_at", confirmedRow ? confirmedRow.confirmed_at : "", "non-empty");
  runner_webInterface_assert_(checks, confirmedRow && String(confirmedRow.location_id || "") === "",
    "CONFIRMED location_id は空", confirmedRow ? confirmedRow.location_id : "", "");
  runner_webInterface_assert_(checks, confirmedRow && String(confirmedRow.billing_block_id || "") === "",
    "CONFIRMED billing_block_id は空", confirmedRow ? confirmedRow.billing_block_id : "", "");
  runner_webInterface_assert_(checks, confirmedRow && String(confirmedRow.teacher_id || "") === "",
    "CONFIRMED teacher_id は空", confirmedRow ? confirmedRow.teacher_id : "", "");

  if (checks.some(function(c) { return c.ok !== true; })) {
    detail.phase = "confirmed_contract";
    return runner_webInterface_finish_("WEB-PAYPAY-E2E-001", checks, detail);
  }

  // 3. 先生受付直前の集計を保存。
  const beforeSummary = runner_webInterface_get_({
    action: "payment_reception_summary",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId
  });
  detail.beforeSummary = beforeSummary;

  // 4. 先生受付 -> POSTED。ここで初めて受付Scopeを確定する。
  const post = runner_webInterface_post_({
    mode: "payment_evidence_post_selected",
    teacher_id: teacherId,
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId,
    evidence_items: [{ evidence_id: evidenceId }],
    count: 1,
    source: "runner_webInterface_paypayE2E"
  });
  detail.post = post;
  runner_webInterface_assert_(checks, post && post.ok === true,
    "先生PayPay受付 WEB POST", post && post.ok, true);

  const postedList = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "POSTED",
    payment_method: "PAYPAY",
    reception_date: receptionDate
  });
  const postedRow = (postedList.evidences || []).find(function(row) {
    return String(row.evidence_id || "") === evidenceId;
  });
  detail.posted = postedRow;

  runner_webInterface_assert_(checks, !!postedRow,
    "09 POSTEDとして存在", postedRow ? postedRow.evidence_id : "", evidenceId);
  runner_webInterface_assert_(checks, postedRow && !!String(postedRow.payment_log_id || ""),
    "POSTED payment_log_id", postedRow ? postedRow.payment_log_id : "", "non-empty");
  runner_webInterface_assert_(checks, postedRow && String(postedRow.reception_date || "") === receptionDate,
    "POSTED reception_date は先生受付日", postedRow ? postedRow.reception_date : "", receptionDate);
  runner_webInterface_assert_(checks, postedRow && String(postedRow.location_id || "") === locationId,
    "POSTED location_id は先生受付Scope", postedRow ? postedRow.location_id : "", locationId);
  runner_webInterface_assert_(checks, postedRow && String(postedRow.billing_block_id || "") === billingBlockId,
    "POSTED billing_block_id は先生受付Scope", postedRow ? postedRow.billing_block_id : "", billingBlockId);

  // 5. 06を経由した先生集計まで確認する。
  const afterSummary = runner_webInterface_get_({
    action: "payment_reception_summary",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId
  });
  detail.afterSummary = afterSummary;

  const amount = Number((postedRow && postedRow.amount) || (confirmedRow && confirmedRow.amount) || 0);
  const beforePayPay = Number(beforeSummary && beforeSummary.paypay_total || 0);
  const beforeCount = Number(beforeSummary && beforeSummary.payment_count || 0);
  const beforeOutstanding = Number(beforeSummary && beforeSummary.outstanding_total || 0);
  const afterPayPay = Number(afterSummary && afterSummary.paypay_total || 0);
  const afterCount = Number(afterSummary && afterSummary.payment_count || 0);
  const afterOutstanding = Number(afterSummary && afterSummary.outstanding_total || 0);

  runner_webInterface_assert_(checks, afterSummary && afterSummary.ok === true,
    "payment_reception_summary WEB入口", afterSummary && afterSummary.ok, true);
  runner_webInterface_assert_(checks, amount > 0 && afterPayPay >= beforePayPay + amount,
    "課金枠集計 PayPay反映", afterPayPay, ">= " + (beforePayPay + amount));
  runner_webInterface_assert_(checks, afterCount >= beforeCount + 1,
    "課金枠集計 入金件数反映", afterCount, ">= " + (beforeCount + 1));

  // Browser E2Eで発見した表示契約もRunnerで検証する。
  // payment_reception_summary.payments[] に、今回POSTした支払いの会員情報が入ること。
  const summaryPayment = ((afterSummary && afterSummary.payments) || []).find(function(row) {
    return String(row.invoice_id || "") === String((postedRow && postedRow.invoice_id) || "");
  });
  const expectedMemberId = String((postedRow && postedRow.member_id) || memberId || "");
  const expectedMemberName = String((postedRow && postedRow.member_name) || "");

  runner_webInterface_assert_(checks, !!summaryPayment,
    "課金枠集計 payments に対象支払が存在", summaryPayment ? summaryPayment.invoice_id : "",
    (postedRow && postedRow.invoice_id) || "non-empty");
  runner_webInterface_assert_(checks, summaryPayment && String(summaryPayment.member_id || "") === expectedMemberId,
    "課金枠集計 payments member_id", summaryPayment ? summaryPayment.member_id : "", expectedMemberId);
  runner_webInterface_assert_(checks, summaryPayment && !!String(summaryPayment.member_name || ""),
    "課金枠集計 payments member_name が空でない", summaryPayment ? summaryPayment.member_name : "", "non-empty");
  if (expectedMemberName) {
    runner_webInterface_assert_(checks, summaryPayment && String(summaryPayment.member_name || "") === expectedMemberName,
      "課金枠集計 payments member_name", summaryPayment ? summaryPayment.member_name : "", expectedMemberName);
  }

  if (amount > 0 && beforeOutstanding >= amount) {
    runner_webInterface_assert_(checks, afterOutstanding <= beforeOutstanding - amount,
      "未回収額が支払額分減少", afterOutstanding, "<= " + (beforeOutstanding - amount));
  }

  detail.phase = "complete";
  return runner_webInterface_finish_("WEB-PAYPAY-E2E-001", checks, detail);
}

/** Apps Script エディタから引数なしで一周する入口。 */
function runner_webInterface_paypayE2E_TEST() {
  return runner_webInterface_paypayE2E({
    member_id: "M001",
    plan_id: "P002",
    teacher_id: "T001",
    reception_date: "2026-10-05",
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230"
  });
}

// --------------------------------------------------
// REGRESSION Runner
// Browser E2Eで検出した「登録済み一覧の会員名未設定」を、
// payment_reception_summary の読み取りだけで再現する。
// 既存のPOSTED決済を参照するだけで、データは更新しない。
// --------------------------------------------------
function runner_webInterface_paymentSummaryMemberNameRegression_TEST() {
  const checks = [];
  const expected = {
    reception_date: "2026-10-02",
    location_id: "HONBU",
    billing_block_id: "B_KYO_FRI_1030_1230",
    invoice_id: "INV-2026-10-G001-M001-55239935",
    member_id: "M001",
    member_name: "山田太郎"
  };

  const summary = runner_webInterface_get_({
    action: "payment_reception_summary",
    reception_date: expected.reception_date,
    location_id: expected.location_id,
    billing_block_id: expected.billing_block_id
  });

  runner_webInterface_assert_(checks, summary && summary.ok === true,
    "payment_reception_summary WEB入口", summary && summary.ok, true);

  const payment = (summary && summary.payments || []).find(function(row) {
    return String(row.invoice_id || "") === expected.invoice_id;
  });

  runner_webInterface_assert_(checks, !!payment,
    "対象支払が課金枠集計に存在", payment ? payment.invoice_id : "", expected.invoice_id);

  if (payment) {
    runner_webInterface_assert_(checks, String(payment.member_id || "") === expected.member_id,
      "課金枠集計 payments member_id", payment.member_id || "", expected.member_id);
    runner_webInterface_assert_(checks, String(payment.member_name || "") === expected.member_name,
      "課金枠集計 payments member_name", payment.member_name || "", expected.member_name);
  }

  return runner_webInterface_finish_("WEB-PAYMENT-SUMMARY-MEMBER-REGRESSION-001", checks, {
    expected: expected,
    summary: summary,
    payment: payment || null
  });
}
