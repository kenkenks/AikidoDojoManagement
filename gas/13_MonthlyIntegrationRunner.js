// STORY-902 総合結合Runner。
// マスタは読取り専用。2099-07の選択対象トランザクションだけを初期化・登録する。

const STORY_902_INTEGRATION_MONTH = "2099-07";
const STORY_902_INTEGRATION_SOURCE = "runner_story_integration_902";

function runner_story_integration_902_preflight() {
  const ctx = createSheetContext();
  const result = monthlyIntegration902_collectConfig_(ctx);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runner_story_integration_902() {
  const startedAt = Date.now();
  const ctx = createSheetContext();
  const preflight = monthlyIntegration902_collectConfig_(ctx);
  if (!preflight.ok) {
    Logger.log(JSON.stringify(preflight, null, 2));
    return {
      ok: false,
      story: "STORY-902-INTEGRATION",
      phase: "Preflight",
      preflight: preflight,
      message: "Preflightに失敗しました。マスタ不足を解消してください。"
    };
  }

  ctx.settings = {
    TIME_TRAVEL_ENABLED: "TRUE",
    DEBUG_DATE: "2099-07-01T09:00:00+09:00",
    DEBUG_TARGET_MONTH: STORY_902_INTEGRATION_MONTH,
    DEBUG: "TRUE"
  };

  const config = preflight.config;
  const steps = [];
  let cleanup = null;
  let billing = null;
  let attendance = null;
  let cash = null;
  let paypay = null;
  let exam = null;

  monthlyIntegration902_runStep_(steps, "Prepare", "前回Scenarioを初期化する", function() {
    paymentReception_ensureSchema(ctx);
    cleanup = monthlyIntegration902_cleanup_(config, ctx);
    return { ok: true, cleanup: cleanup, message: "2099-07の選択対象データを初期化しました。" };
  });

  monthlyIntegration902_runStep_(steps, "Billing", "本番Billingで月次請求を作成する", function() {
    monthlyIntegration902_setTime_(ctx, "2099-07-01T09:00:00+09:00");
    const results = config.members.map(function(member) {
      return {
        role: member.role,
        member_id: member.member_id,
        result: billingMonthlyAccept(member.member_id, config.monthly_plan_id, ctx)
      };
    });
    const failed = results.filter(function(item) { return !item.result || item.result.ok !== true; });
    billing = { ok: failed.length === 0, results: results, failed: failed };
    billing.message = billing.ok ? "全Personaの月次請求を作成しました。" : "月次請求の作成に失敗しました。";
    return billing;
  });

  monthlyIntegration902_runStep_(steps, "Attendance", "本番Attendanceで出席を登録する", function() {
    monthlyIntegration902_setTime_(ctx, "2099-07-02T10:30:00+09:00");
    const items = config.members.filter(function(member) {
      return member.role !== "UNPAID";
    }).map(function(member) {
      return { member_id: member.member_id, slot_ids: config.slot_ids };
    });
    attendance = registerAttendanceBatchLocked_({
      teacher_id: config.teacher_id,
      location_id: config.location_id,
      billing_block_id: config.billing_block_id,
      attendance_date: "2099-07-02",
      attendance_session_id: "RUN-STORY902-ATT-20990702",
      attendance_items: items,
      source: STORY_902_INTEGRATION_SOURCE
    }, ctx);
    return attendance;
  });

  monthlyIntegration902_runStep_(steps, "Cash", "現金をREQUESTEDからPOSTEDまで反映する", function() {
    monthlyIntegration902_setTime_(ctx, "2099-07-09T11:00:00+09:00");
    cash = monthlyIntegration902_payMember_(
      config.members_by_role.CASH,
      "CASH",
      config,
      "RUN-STORY902-CASH-20990709",
      ctx
    );
    return cash;
  });

  monthlyIntegration902_runStep_(steps, "PayPay", "PayPayをREQUESTEDからPOSTEDまで反映する", function() {
    monthlyIntegration902_setTime_(ctx, "2099-07-12T11:00:00+09:00");
    paypay = monthlyIntegration902_payMember_(
      config.members_by_role.PAYPAY,
      "PAYPAY",
      config,
      "RUN-STORY902-PAYPAY-20990712",
      ctx
    );
    return paypay;
  });

  monthlyIntegration902_runStep_(steps, "ExaminationFee", "審査費を追加して現金入金する", function() {
    monthlyIntegration902_setTime_(ctx, "2099-07-16T20:00:00+09:00");
    const member = config.members_by_role.EXAM;
    const extra = billingExtraEnsureInvoice(member.member_id, config.exam_plan_id, ctx);
    if (!extra || extra.ok !== true) return extra;
    exam = monthlyIntegration902_payMember_(
      member,
      "CASH",
      config,
      "RUN-STORY902-EXAM-20990716",
      ctx
    );
    exam.extra_invoice = extra;
    return exam;
  });

  monthlyIntegration902_runStep_(steps, "Verify", "実シートと集計結果を検証する", function() {
    monthlyIntegration902_setTime_(ctx, "2099-07-31T23:50:00+09:00");
    return monthlyIntegration902_verify_(config, ctx);
  });

  const failed = steps.filter(function(step) { return !step.ok; }).length;
  const summary = {
    ok: failed === 0,
    story: "STORY-902-INTEGRATION",
    task: "TASK-DEV-011",
    runner_mode: "SHEET_INTEGRATION",
    target_month: STORY_902_INTEGRATION_MONTH,
    master_writes: 0,
    total: steps.length,
    success: steps.length - failed,
    failed: failed,
    elapsed_ms: Date.now() - startedAt,
    config: config,
    steps: steps,
    message: failed === 0 ? "STORY-902-INTEGRATION PASS" : "STORY-902-INTEGRATION FAIL"
  };
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function monthlyIntegration902_collectConfig_(ctx) {
  ctx = ensureSheetContext(ctx);
  const errors = [];
  const warnings = [];
  const requiredSheets = [
    "01_会員マスタ", "03_料金マスタ", "04_月次選択", "05_請求明細",
    "06_入金ログ", "07_出席ログ", "09_決済エビデンス", "10_道場マスタ",
    "11_先生マスタ", "12_稽古枠マスタ", "13_課金枠マスタ", "20_会費状態View"
  ];
  requiredSheets.forEach(function(sheetName) {
    if (!ctx.ss.getSheetByName(sheetName)) errors.push("シートがありません: " + sheetName);
  });
  if (errors.length > 0) return { ok: false, errors: errors, warnings: warnings };

  const teacher = getTeachers(ctx).find(function(row) {
    return isActiveMasterRow_(row) && isTrueValue_(row["出席受付可"]);
  });
  if (!teacher) errors.push("出席受付可能な先生がいません。");

  let scope = null;
  getBillingBlocks(ctx).some(function(block) {
    if (!isActiveMasterRow_(block)) return false;
    const blockId = normalizeId_(block["billing_block_id"]);
    const locationId = normalizeId_(block["location_id"]);
    const location = getLocations(ctx).find(function(row) {
      return isActiveMasterRow_(row) && normalizeId_(row["location_id"]) === locationId;
    });
    const slots = getTrainingSlots(ctx).filter(function(row) {
      return isActiveMasterRow_(row) &&
        normalizeId_(row["location_id"]) === locationId &&
        normalizeId_(row["billing_block_id"]) === blockId;
    });
    if (!location || slots.length === 0) return false;
    scope = { location: location, block: block, slots: slots };
    return true;
  });
  if (!scope) errors.push("有効な道場・課金枠・稽古枠の組合せがありません。");

  const fees = getFees(ctx).filter(isActiveMasterRow_);
  const monthlyFee = fees.find(function(row) {
    return normalizeId_(row["plan_id"]) && String(row["会費タイプ"] || "").trim() !== "審査費" &&
      Number(row["回数単価"] || row["金額"] || 0) > 0;
  });
  const examFee = fees.find(function(row) {
    return normalizeId_(row["plan_id"]) && String(row["会費タイプ"] || "").trim() === "審査費" &&
      Number(row["回数単価"] || row["金額"] || 0) > 0;
  });
  if (!monthlyFee) errors.push("金額が設定された月会費プランがありません。");
  if (!examFee) errors.push("金額が設定された審査費プランがありません。");

  const members = [];
  const usedGroups = {};
  getMembers(ctx).forEach(function(row) {
    if (members.length >= 4 || !isActiveMasterRow_(row)) return;
    const memberId = normalizeId_(row["member_id"]);
    const groupId = normalizeId_(row["請求グループID"]);
    if (!memberId || !groupId || usedGroups[groupId]) return;
    usedGroups[groupId] = true;
    members.push({ member_id: memberId, member_name: String(row["氏名"] || ""), billing_group_id: groupId });
  });
  if (members.length < 4) errors.push("異なる請求グループの有効会員が4名必要です。現在: " + members.length + "名");

  const roles = ["CASH", "PAYPAY", "UNPAID", "EXAM"];
  const membersByRole = {};
  members.forEach(function(member, index) {
    member.role = roles[index];
    membersByRole[member.role] = member;
  });

  ["09_決済エビデンス", "06_入金ログ"].forEach(function(sheetName) {
    const sheet = ctx.ss.getSheetByName(sheetName);
    const map = getHeaderMap_(sheet).map;
    const missing = PAYMENT_RECEPTION_SCOPE_HEADERS.filter(function(header) { return map[header] === undefined; });
    if (missing.length > 0) warnings.push(sheetName + "へRunner実行時に列を追加します: " + missing.join(", "));
  });

  const config = errors.length === 0 ? {
    target_month: STORY_902_INTEGRATION_MONTH,
    teacher_id: normalizeId_(teacher["teacher_id"]),
    location_id: normalizeId_(scope.location["location_id"]),
    billing_block_id: normalizeId_(scope.block["billing_block_id"]),
    slot_ids: scope.slots.slice(0, 2).map(function(row) { return normalizeId_(row["slot_id"]); }),
    monthly_plan_id: normalizeId_(monthlyFee["plan_id"]),
    monthly_plan_amount: Number(monthlyFee["回数単価"] || monthlyFee["金額"] || 0),
    exam_plan_id: normalizeId_(examFee["plan_id"]),
    exam_plan_amount: Number(examFee["回数単価"] || examFee["金額"] || 0),
    members: members,
    members_by_role: membersByRole,
    source: STORY_902_INTEGRATION_SOURCE
  } : null;

  return {
    ok: errors.length === 0,
    read_only: true,
    errors: errors,
    warnings: warnings,
    config: config,
    message: errors.length === 0 ? "総合結合Runnerを実行できます。" : "必要なマスタが不足しています。"
  };
}

function monthlyIntegration902_cleanup_(config, ctx) {
  const groupIds = config.members.map(function(member) { return member.billing_group_id; });
  const memberIds = config.members.map(function(member) { return member.member_id; });
  const invoices = getInvoices(ctx).filter(function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH &&
      groupIds.indexOf(normalizeId_(row["billing_group_id"])) >= 0;
  });
  const invoiceIds = invoices.map(function(row) { return normalizeId_(row["invoice_id"]); });
  const deleted = {};
  deleted["09_決済エビデンス"] = monthlyIntegration902_deleteRows_("09_決済エビデンス", function(row) {
    return invoiceIds.indexOf(normalizeId_(row["invoice_id"])) >= 0;
  }, ctx);
  deleted["06_入金ログ"] = monthlyIntegration902_deleteRows_("06_入金ログ", function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH &&
      groupIds.indexOf(normalizeId_(row["billing_group_id"])) >= 0;
  }, ctx);
  deleted["07_出席ログ"] = monthlyIntegration902_deleteRows_("07_出席ログ", function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH &&
      memberIds.indexOf(normalizeId_(row["member_id"])) >= 0;
  }, ctx);
  deleted["20_会費状態View"] = monthlyIntegration902_deleteRows_("20_会費状態View", function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH &&
      groupIds.indexOf(normalizeId_(row["billing_group_id"])) >= 0;
  }, ctx);
  deleted["05_請求明細"] = monthlyIntegration902_deleteRows_("05_請求明細", function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH &&
      groupIds.indexOf(normalizeId_(row["billing_group_id"])) >= 0;
  }, ctx);
  deleted["04_月次選択"] = monthlyIntegration902_deleteRows_("04_月次選択", function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH &&
      groupIds.indexOf(normalizeId_(row["billing_group_id"])) >= 0;
  }, ctx);
  return { ok: true, deleted: deleted };
}

function monthlyIntegration902_payMember_(member, method, config, sessionId, ctx) {
  const invoices = getInvoices(ctx).filter(function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH &&
      normalizeId_(row["billing_group_id"]) === member.billing_group_id &&
      normalizeId_(row["支払状態"]) !== "支払済" && Number(row["請求予定額"] || row["金額"] || 0) > 0;
  });
  const results = [];
  invoices.forEach(function(invoice, index) {
    const request = paymentEvidence_request({
      invoice_id: invoice["invoice_id"],
      member_id: invoice["member_id"] || member.member_id,
      payment_method: method,
      location_id: config.location_id,
      billing_block_id: config.billing_block_id,
      teacher_id: config.teacher_id,
      reception_session_id: sessionId,
      remarks: STORY_902_INTEGRATION_SOURCE
    }, ctx);
    const record = paymentEvidence_record({
      evidence_id: request.evidence_id,
      evidence_code: "STORY902-" + method + "-" + (index + 1),
      confirmed_by: config.teacher_id,
      remarks: STORY_902_INTEGRATION_SOURCE
    }, ctx);
    const post = paymentEvidence_post({ evidence_id: request.evidence_id }, ctx);
    results.push({ invoice_id: invoice["invoice_id"], request: request, record: record, post: post });
  });
  return {
    ok: invoices.length > 0 && results.every(function(result) {
      return result.request.ok === true && result.record.ok === true && result.post.ok === true;
    }),
    member_id: member.member_id,
    payment_method: method,
    invoice_count: invoices.length,
    results: results,
    message: invoices.length > 0 ? method + "入金を反映しました。" : "未払い請求がありません。"
  };
}

function monthlyIntegration902_verify_(config, ctx) {
  const groups = config.members.map(function(member) { return member.billing_group_id; });
  const invoices = getInvoices(ctx).filter(function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH && groups.indexOf(normalizeId_(row["billing_group_id"])) >= 0;
  });
  const payments = getPayments(ctx).filter(function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH && groups.indexOf(normalizeId_(row["billing_group_id"])) >= 0;
  });
  const evidences = getPaymentEvidences(ctx).filter(function(row) {
    return invoices.some(function(invoice) { return normalizeId_(invoice["invoice_id"]) === normalizeId_(row["invoice_id"]); });
  });
  const attendances = getAttendances(ctx).filter(function(row) {
    return normalizeMonth(row["target_month"]) === STORY_902_INTEGRATION_MONTH && String(row["source"] || "") === STORY_902_INTEGRATION_SOURCE;
  });
  const paidRoles = ["CASH", "PAYPAY", "EXAM"];
  const paidGroups = paidRoles.map(function(role) { return config.members_by_role[role].billing_group_id; });
  const unpaidGroup = config.members_by_role.UNPAID.billing_group_id;
  const checks = [
    monthlyIntegration902_check_("invoice_count", invoices.length === 5, 5, invoices.length),
    monthlyIntegration902_check_("payment_count", payments.length === 4, 4, payments.length),
    monthlyIntegration902_check_("evidence_posted", evidences.length === 4 && evidences.every(function(row) { return normalizeId_(row["status"]) === "POSTED"; }), "4 POSTED", evidences.map(function(row) { return row["status"]; })),
    monthlyIntegration902_check_("attendance_written", attendances.length > 0, ">0", attendances.length),
    monthlyIntegration902_check_("scope_saved", payments.every(function(row) {
      return normalizeId_(row["location_id"]) === config.location_id && normalizeId_(row["billing_block_id"]) === config.billing_block_id && normalizeId_(row["teacher_id"]) === config.teacher_id;
    }), "all scoped", payments.map(function(row) { return [row["location_id"], row["billing_block_id"], row["teacher_id"]]; })),
    monthlyIntegration902_check_("paid_groups", paidGroups.every(function(groupId) {
      return invoices.filter(function(row) { return normalizeId_(row["billing_group_id"]) === groupId; }).every(function(row) { return normalizeId_(row["支払状態"]) === "支払済"; });
    }), paidGroups, invoices.map(function(row) { return [row["billing_group_id"], row["支払状態"]]; })),
    monthlyIntegration902_check_("unpaid_group", invoices.some(function(row) {
      return normalizeId_(row["billing_group_id"]) === unpaidGroup && normalizeId_(row["支払状態"]) === "未払い";
    }), unpaidGroup + " 未払い", invoices.map(function(row) { return [row["billing_group_id"], row["支払状態"]]; }))
  ];
  const reception = paymentReception_getScopeSummary({
    reception_date: "2099-07-09",
    location_id: config.location_id,
    billing_block_id: config.billing_block_id
  }, ctx);
  const status = paymentStatusTeacher_get({
    date_from: "2099-07-01", date_to: "2099-07-31", target_month: STORY_902_INTEGRATION_MONTH
  }, ctx);
  checks.push(monthlyIntegration902_check_("reception_summary", reception.ok === true && reception.payment_count > 0, ">0", reception));
  checks.push(monthlyIntegration902_check_("teacher_status", status.ok === true && status.summary.payment_count === payments.length, payments.length, status.summary.payment_count));
  return {
    ok: checks.every(function(check) { return check.ok; }),
    checks: checks,
    counts: { invoices: invoices.length, payments: payments.length, evidences: evidences.length, attendances: attendances.length },
    reception_summary: reception,
    teacher_status_summary: status.summary,
    message: checks.every(function(check) { return check.ok; }) ? "実シート結合結果が一致しました。" : "実シート結合結果に差異があります。"
  };
}

function monthlyIntegration902_deleteRows_(sheetName, predicate, ctx) {
  const sheet = getRequiredSheet_(sheetName, ctx);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return 0;
  const headers = values[0];
  let deleted = 0;
  for (let rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    const row = {};
    headers.forEach(function(header, column) { row[String(header).trim()] = values[rowIndex][column]; });
    if (predicate(row)) {
      sheet.deleteRow(rowIndex + 1);
      deleted++;
    }
  }
  invalidateSheetRows(ctx, sheetName);
  return deleted;
}

function monthlyIntegration902_runStep_(steps, phase, title, callback) {
  const startedAt = Date.now();
  try {
    const result = callback();
    const step = { ok: !!result && result.ok !== false, phase: phase, title: title, elapsed_ms: Date.now() - startedAt, result: result };
    steps.push(step);
    Logger.log("[STORY-902-INTEGRATION][" + phase + "] " + (step.ok ? "PASS" : "FAIL") + " " + JSON.stringify(result));
  } catch (e) {
    const step = { ok: false, phase: phase, title: title, elapsed_ms: Date.now() - startedAt, message: e.message, result: { ok: false, message: e.message } };
    steps.push(step);
    Logger.log("[STORY-902-INTEGRATION][" + phase + "] FAIL " + e.message);
  }
}

function monthlyIntegration902_setTime_(ctx, systemNow) {
  ctx.settings.TIME_TRAVEL_ENABLED = "TRUE";
  ctx.settings.DEBUG_DATE = systemNow;
  ctx.settings.DEBUG_TARGET_MONTH = STORY_902_INTEGRATION_MONTH;
}

function monthlyIntegration902_check_(name, ok, expected, actual) {
  return { name: name, ok: ok, expected: expected, actual: actual };
}
