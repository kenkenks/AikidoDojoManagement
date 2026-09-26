// 会員PayPay → 決済エビデンス → POSTED → 先生側課金枠集計 E2E Runner
//
// CLEAN後の未宣言会員で実行する。
// 例:
//   runner_e2ePayPayReceptionScope("M001", "P002", "HONBU", "B_KYO_MON_1030_1230");
//
// このRunnerは実際に 04/05/06/09/20 を更新する。
function runner_e2ePayPayReceptionScope(memberId, planId, locationId, billingBlockId) {
  const ctx = createSheetContext();
  memberId = normalizeId_(memberId);
  planId = normalizeId_(planId);
  locationId = normalizeId_(locationId);
  billingBlockId = normalizeId_(billingBlockId);

  if (!memberId || !planId || !locationId || !billingBlockId) {
    return { ok: false, phase: "input", message: "memberId / planId / locationId / billingBlockId を指定してください。" };
  }

  const before = getPaymentStatus(memberId, ctx);
  if (!before || before.ok !== true || before.status !== "未宣言") {
    return { ok: false, phase: "precondition", before: before, message: "E2E CLEAN後の未宣言会員で実行してください。" };
  }

  // 会員PayPay開始時点では先生受付Scopeを09へ確定しない。
  const start = paypayCode_start({
    member_id: memberId,
    plan_id: planId,
    location_id: locationId,
    billing_block_id: billingBlockId,
    teacher_id: "RUNNER_E2E_PAYPAY"
  }, ctx);
  if (!start || start.ok !== true) return { ok: false, phase: "start", start: start };

  let evidenceItems = Array.isArray(start.evidenceItems) ? start.evidenceItems : [];

  // 再利用時も active Evidence は受付前のため location/billing/teacher は空のまま。
  const reusedStart = paypayCode_start({
    member_id: memberId,
    plan_id: planId,
    location_id: locationId,
    billing_block_id: billingBlockId,
    teacher_id: "RUNNER_E2E_PAYPAY"
  }, ctx);
  if (!reusedStart || reusedStart.ok !== true) return { ok: false, phase: "reuse_start", start: start, reusedStart: reusedStart };
  evidenceItems = Array.isArray(reusedStart.evidenceItems) ? reusedStart.evidenceItems : [];

  const prePostRows = evidenceItems.map(function(item) {
    const target = paymentEvidence_findRowById_(item.evidence_id, ctx);
    return target ? target.row : null;
  }).filter(Boolean);
  const prePostScopeBlank = prePostRows.length > 0 && prePostRows.every(function(row) {
    return !normalizeId_(row["location_id"]) &&
      !normalizeId_(row["billing_block_id"]) &&
      !normalizeId_(row["teacher_id"]);
  });
  if (!prePostScopeBlank) {
    return { ok: false, phase: "pre_post_scope", start: start, reusedStart: reusedStart, evidenceRows: prePostRows,
      message: "会員PayPayのactive Evidenceに先生受付Scopeが混入しています。" };
  }

  // Step9-A本丸: REQUESTEDをevidence_idで読み、CONFIRMEDへ更新する。
  const record = paypayCode_record({
    member_id: memberId,
    plan_id: planId,
    evidence_code: "E2E-PAYPAY-" + new Date().getTime(),
    evidence_items: evidenceItems
  }, ctx);
  if (!record || record.ok !== true) return { ok: false, phase: "record", record: record };

  const confirmedRows = evidenceItems.map(function(item) {
    const target = paymentEvidence_findRowById_(item.evidence_id, ctx);
    return target ? target.row : null;
  }).filter(Boolean);
  const confirmedOk = confirmedRows.length === evidenceItems.length && confirmedRows.every(function(row) {
    return normalizeId_(row["status"]) === "CONFIRMED" && !!normalizeId_(row["evidence_code"]);
  });
  if (!confirmedOk) {
    return { ok: false, phase: "confirmed", record: record, evidenceRows: confirmedRows,
      message: "PayPay EvidenceをCONFIRMEDへ更新できませんでした。" };
  }

  // 先生が決済更新を受け付けた時点でScopeを確定する。
  const receptionDate = sup_today(ctx);
  const posted = paymentEvidence_postSelectedBatch({
    teacher_id: "RUNNER_E2E_PAYPAY",
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId,
    reception_session_id: "RUNNER-E2E-PAYPAY-" + new Date().getTime(),
    evidence_items: evidenceItems
  }, ctx);
  if (!posted || posted.ok !== true) return { ok: false, phase: "post", posted: posted };

  const evidenceRows = evidenceItems.map(function(item) {
    const target = paymentEvidence_findRowById_(item.evidence_id, ctx);
    return target ? target.row : null;
  }).filter(Boolean);
  const evidenceScopeOk = evidenceRows.length === evidenceItems.length && evidenceRows.every(function(row) {
    return normalizeId_(row["status"]) === "POSTED" &&
      normalizeId_(row["location_id"]) === locationId &&
      normalizeId_(row["billing_block_id"]) === billingBlockId &&
      normalizeId_(row["teacher_id"]) === "RUNNER_E2E_PAYPAY";
  });

  const summary = paymentReception_getScopeSummary({ reception_date: receptionDate, location_id: locationId, billing_block_id: billingBlockId }, ctx);
  const expectedAmount = evidenceRows.reduce(function(sum, row) { return sum + Number(row["amount"] || 0); }, 0);
  const evidenceIds = evidenceRows.map(function(row) { return normalizeId_(row["evidence_id"]); });
  const paymentRows = getPayments(ctx).filter(function(row) {
    return evidenceIds.indexOf(normalizeId_(row["決済ID"])) >= 0 || evidenceIds.indexOf(normalizeId_(row["evidence_id"])) >= 0;
  });
  const paymentScopeOk = paymentRows.length === evidenceRows.length && paymentRows.every(function(row) {
    return normalizeId_(row["location_id"]) === locationId && normalizeId_(row["billing_block_id"]) === billingBlockId;
  });
  const summaryOk = summary && summary.ok === true && Number(summary.paypay_total || 0) >= expectedAmount;

  const result = {
    ok: prePostScopeBlank && confirmedOk && evidenceScopeOk && paymentScopeOk && summaryOk,
    before: before, start: start, reusedStart: reusedStart, record: record, posted: posted,
    expectedPayPayAmount: expectedAmount, evidenceRows: evidenceRows, paymentRows: paymentRows, summary: summary,
    verify: {
      pre_post_scope_blank: prePostScopeBlank,
      confirmed_by_paypay_record: confirmedOk,
      evidence_scope_after_post: evidenceScopeOk,
      payment_scope: paymentScopeOk,
      teacher_scope_summary: summaryOk
    },
    message: prePostScopeBlank && confirmedOk && evidenceScopeOk && paymentScopeOk && summaryOk
      ? "会員PayPayは受付前Scopeなし→CONFIRMED→先生POSTでScope確定→06/集計まで整合しました。"
      : "会員PayPay E2Eの状態/Scope整合性に失敗しました。"
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

// GASエディタからワンクリック実行する入口。
// E2E CLEAN後のテスト会員に合わせて値を変更する。
function runner_e2ePayPayReceptionScope_TEST() {
  const result = runner_e2ePayPayReceptionScope(
    "M001",
    "P002",
    "HONBU",
    "B_KYO_MON_1030_1230"
  );

  Logger.log("[E2E] " + JSON.stringify(result, null, 2));
  if (!result || result.ok !== true) {
    throw new Error("[E2E FAIL] PayPay reception scope: " + JSON.stringify(result));
  }

  Logger.log("[E2E PASS] PayPay reception scope");
  return result;
}

