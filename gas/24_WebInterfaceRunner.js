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
  const callback = "runnerWebCallback";

  if (!receptionDate || !locationId || !billingBlockId) {
    return {
      ok: false,
      runner: "WEB-PAYMENT-READ-001",
      message: "reception_date / location_id / billing_block_id を指定してください。"
    };
  }

  const checks = [];

  const session = runner_webInterface_get_({
    action: "attendance_session_info",
    location_id: locationId,
    billing_block_id: billingBlockId,
    callback: callback
  });

  const summary = runner_webInterface_get_({
    action: "payment_reception_summary",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId,
    callback: callback
  });

  // Evidence一覧は現在の先生画面と同じく課金枠条件を渡さない。
  const confirmed = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "CONFIRMED",
    payment_method: "PAYPAY",
    reception_date: receptionDate,
    callback: callback
  });

  const posted = runner_webInterface_get_({
    action: "payment_evidence_list",
    statuses: "POSTED",
    payment_method: "PAYPAY",
    reception_date: receptionDate,
    callback: callback
  });

  runner_webInterface_assert_(checks, session && session.ok === true,
    "attendance_session_info WEB入口", session && session.ok, true);
  runner_webInterface_assert_(checks, summary && summary.ok === true,
    "payment_reception_summary WEB入口", summary && summary.ok, true);
  runner_webInterface_assert_(checks, confirmed && confirmed.ok === true,
    "payment_evidence_list CONFIRMED WEB入口", confirmed && confirmed.ok, true);
  runner_webInterface_assert_(checks, posted && posted.ok === true,
    "payment_evidence_list POSTED WEB入口", posted && posted.ok, true);

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
    Array.isArray(confirmed.evidences),
    "CONFIRMED DTO evidences", Array.isArray(confirmed.evidences), true);
  runner_webInterface_assert_(checks,
    Array.isArray(posted.evidences),
    "POSTED DTO evidences", Array.isArray(posted.evidences), true);

  runner_webInterface_assert_(checks,
    String(confirmed.reception_date || "") === receptionDate,
    "CONFIRMED reception_date 往復", confirmed.reception_date || "", receptionDate);
  runner_webInterface_assert_(checks,
    String(posted.reception_date || "") === receptionDate,
    "POSTED reception_date 往復", posted.reception_date || "", receptionDate);
  runner_webInterface_assert_(checks,
    (confirmed.evidences || []).every(function(row) { return String(row.reception_date || "") === receptionDate; }),
    "CONFIRMED Evidence受付日一致", true, true);
  runner_webInterface_assert_(checks,
    (posted.evidences || []).every(function(row) { return String(row.reception_date || "") === receptionDate; }),
    "POSTED Evidence受付日一致", true, true);

  return runner_webInterface_finish_("WEB-PAYMENT-READ-001", checks, {
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
    reception_date: "2026-09-14",
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230"
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
