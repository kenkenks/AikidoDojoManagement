// STORY-902 一か月試験運用 高速コアランナー。
// 実シートと99_設定は変更せず、メモリ内Scenarioとctx.settingsだけを使用する。

function runner_story_simulation_902() {
  const startedAt = Date.now();
  const story = "STORY-902";
  const task = "TASK-DEV-011";
  const scenario = monthlyPilotCore_createScenario_();
  const phases = monthlyPilotCore_phaseDefinitions_();
  const steps = [];

  phases.forEach(function(phase) {
    const phaseStartedAt = Date.now();
    const ctx = monthlyPilotCore_createTimeContext_(phase.system_now, phase.target_month);
    try {
      const applied = monthlyPilotCore_applyEvents_(scenario, phase.events || []);
      const actual = monthlyPilotCore_snapshot_(scenario, phase.target_month, ctx);
      const checks = monthlyPilotCore_verifyPhase_(phase.id, actual, applied);
      const ok = checks.every(function(check) { return check.ok; });
      const step = {
        ok: ok,
        phase: phase.id,
        system_now: monthlyPilotCore_formatSystemTime_(sup_now(ctx)),
        system_today: sup_today(ctx),
        target_month: sup_targetMonth(ctx),
        applied_count: applied.applied_count,
        duplicate_count: applied.duplicate_count,
        elapsed_ms: Date.now() - phaseStartedAt,
        actual: actual,
        checks: checks
      };
      steps.push(step);
      monthlyPilotCore_logPhase_(step);
    } catch (e) {
      const failed = {
        ok: false,
        phase: phase.id,
        system_now: phase.system_now,
        target_month: phase.target_month,
        elapsed_ms: Date.now() - phaseStartedAt,
        message: e.message,
        checks: []
      };
      steps.push(failed);
      monthlyPilotCore_logPhase_(failed);
    }
  });

  const failed = steps.filter(function(step) { return !step.ok; }).length;
  const summary = {
    ok: failed === 0,
    story: story,
    task: task,
    runner_mode: "IN_MEMORY_CORE",
    sheet_writes: 0,
    settings_writes: 0,
    total: steps.length,
    success: steps.length - failed,
    failed: failed,
    elapsed_ms: Date.now() - startedAt,
    steps: steps,
    message: failed === 0 ? story + " PASS" : story + " FAIL"
  };
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function monthlyPilotCore_createScenario_() {
  return {
    processed_event_keys: {},
    invoices: [],
    payments: [],
    attendances: [],
    member_groups: {
      M_CASH: "G_CASH", M_PAYPAY: "G_PAYPAY", M_UNPAID: "G_UNPAID",
      M_NOINVOICE: "G_NOINVOICE", M_NOATTEND: "G_NOATTEND", M_EXAM: "G_EXAM",
      M_FAMILY_A: "G_FAMILY", M_FAMILY_B: "G_FAMILY"
    },
    billing_blocks: [
      { billing_block_id: "B_WEEKDAY", "1課金あたり枠数": 2, "状態": "有効" },
      { billing_block_id: "B_WEEKEND", "1課金あたり枠数": 1, "状態": "有効" }
    ]
  };
}

function monthlyPilotCore_phaseDefinitions_() {
  const month = "2026-07";
  return [
    { id: "Prepare", system_now: "2026-06-30T20:00:00+09:00", target_month: "2026-06", events: [] },
    { id: "MonthOpen", system_now: "2026-07-01T09:00:00+09:00", target_month: month, events: [
      monthlyPilotCore_invoiceEvent_("INV-CASH", "G_CASH", "M_CASH", month, 3000, "月会費"),
      monthlyPilotCore_invoiceEvent_("INV-PAYPAY", "G_PAYPAY", "M_PAYPAY", month, 4000, "月会費"),
      monthlyPilotCore_invoiceEvent_("INV-UNPAID", "G_UNPAID", "M_UNPAID", month, 5000, "月会費"),
      monthlyPilotCore_invoiceEvent_("INV-NOATTEND", "G_NOATTEND", "M_NOATTEND", month, 2500, "月会費"),
      monthlyPilotCore_invoiceEvent_("INV-EXAM-MONTHLY", "G_EXAM", "M_EXAM", month, 3000, "月会費"),
      monthlyPilotCore_invoiceEvent_("INV-FAMILY", "G_FAMILY", "M_FAMILY_A", month, 6000, "家族会費")
    ] },
    { id: "Week1", system_now: "2026-07-05T12:30:00+09:00", target_month: month, events: [
      monthlyPilotCore_attendanceEvent_("ATT-CASH-1", "M_CASH", month, "2026-07-02", "B_WEEKDAY", "S1"),
      monthlyPilotCore_attendanceEvent_("ATT-CASH-2", "M_CASH", month, "2026-07-02", "B_WEEKDAY", "S2"),
      monthlyPilotCore_attendanceEvent_("ATT-NOINVOICE-1", "M_NOINVOICE", month, "2026-07-04", "B_WEEKEND", "S1"),
      monthlyPilotCore_paymentEvent_("PAY-CASH", "G_CASH", "M_CASH", month, 3000, "CASH")
    ] },
    { id: "Week2", system_now: "2026-07-12T12:30:00+09:00", target_month: month, events: [
      monthlyPilotCore_attendanceEvent_("ATT-PAYPAY-1", "M_PAYPAY", month, "2026-07-09", "B_WEEKDAY", "S1"),
      monthlyPilotCore_attendanceEvent_("ATT-PAYPAY-2", "M_PAYPAY", month, "2026-07-09", "B_WEEKDAY", "S2"),
      monthlyPilotCore_paymentEvent_("PAY-PAYPAY", "G_PAYPAY", "M_PAYPAY", month, 4000, "PAYPAY"),
      monthlyPilotCore_paymentEvent_("PAY-FAMILY", "G_FAMILY", "M_FAMILY_A", month, 6000, "PAYPAY")
    ] },
    { id: "MidMonth", system_now: "2026-07-16T20:00:00+09:00", target_month: month, events: [
      monthlyPilotCore_invoiceEvent_("INV-EXAM-EXTRA", "G_EXAM", "M_EXAM", month, 2000, "審査費"),
      monthlyPilotCore_paymentEvent_("PAY-EXAM", "G_EXAM", "M_EXAM", month, 5000, "CASH"),
      monthlyPilotCore_attendanceEvent_("ATT-EXAM-1", "M_EXAM", month, "2026-07-16", "B_WEEKEND", "S1"),
      monthlyPilotCore_attendanceEvent_("ATT-FAMILY-A", "M_FAMILY_A", month, "2026-07-16", "B_WEEKEND", "S1"),
      monthlyPilotCore_attendanceEvent_("ATT-FAMILY-B", "M_FAMILY_B", month, "2026-07-16", "B_WEEKEND", "S1")
    ] },
    { id: "Week4", system_now: "2026-07-26T12:30:00+09:00", target_month: month, events: [
      monthlyPilotCore_attendanceEvent_("ATT-CANCELLED", "M_CASH", month, "2026-07-23", "B_WEEKEND", "S1", "取消"),
      monthlyPilotCore_paymentEvent_("PAY-CASH", "G_CASH", "M_CASH", month, 3000, "CASH")
    ] },
    { id: "MonthEnd", system_now: "2026-07-31T23:50:00+09:00", target_month: month, events: [] },
    { id: "NextMonth", system_now: "2026-08-01T00:10:00+09:00", target_month: "2026-08", events: [
      monthlyPilotCore_invoiceEvent_("INV-AUG-CASH", "G_CASH", "M_CASH", "2026-08", 3000, "月会費"),
      monthlyPilotCore_attendanceEvent_("ATT-AUG-CASH", "M_CASH", "2026-08", "2026-08-01", "B_WEEKEND", "S1")
    ] }
  ];
}

function monthlyPilotCore_applyEvents_(scenario, events) {
  let applied = 0;
  let duplicates = 0;
  (events || []).forEach(function(event) {
    if (scenario.processed_event_keys[event.event_key]) {
      duplicates++;
      return;
    }
    scenario.processed_event_keys[event.event_key] = true;
    if (event.kind === "INVOICE") scenario.invoices.push(event.row);
    if (event.kind === "PAYMENT") scenario.payments.push(event.row);
    if (event.kind === "ATTENDANCE") scenario.attendances.push(event.row);
    applied++;
  });
  return { applied_count: applied, duplicate_count: duplicates };
}

function monthlyPilotCore_snapshot_(scenario, targetMonth, ctx) {
  const month = normalizeMonth(targetMonth);
  const invoices = scenario.invoices.filter(function(row) { return normalizeMonth(row.target_month) === month; });
  const payments = scenario.payments.filter(function(row) { return normalizeMonth(row.target_month) === month; });
  const billed = invoices.reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0);
  const paid = payments.reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0);
  const cash = payments.reduce(function(sum, row) { return sum + (row.payment_method === "CASH" ? row.amount : 0); }, 0);
  const paypay = payments.reduce(function(sum, row) { return sum + (row.payment_method === "PAYPAY" ? row.amount : 0); }, 0);
  const chargeCounts = {};
  ["M_CASH", "M_PAYPAY", "M_UNPAID", "M_NOINVOICE", "M_NOATTEND", "M_EXAM", "M_FAMILY_A", "M_FAMILY_B"].forEach(function(memberId) {
    chargeCounts[memberId] = attendanceCore_calculateChargeCountFromRows_(
      memberId, month, scenario.attendances, scenario.billing_blocks, ctx
    ).charge_count;
  });
  const invoiceGroups = {};
  invoices.forEach(function(row) { invoiceGroups[row.billing_group_id] = true; });
  const attendanceMembers = {};
  scenario.attendances.forEach(function(row) {
    if (normalizeMonth(row.target_month) === month && isActiveMasterRow_(row)) attendanceMembers[row.member_id] = true;
  });
  return {
    system_today: sup_today(ctx),
    target_month: sup_targetMonth(ctx),
    invoice_count: invoices.length,
    billed_total: billed,
    payment_count: payments.length,
    paid_total: paid,
    cash_total: cash,
    paypay_total: paypay,
    unpaid_total: Math.max(billed - paid, 0),
    attendance_without_invoice: Object.keys(attendanceMembers).filter(function(memberId) {
      return !invoiceGroups[scenario.member_groups[memberId]];
    }),
    invoice_without_attendance: Object.keys(invoiceGroups).filter(function(groupId) {
      return !Object.keys(attendanceMembers).some(function(memberId) {
        return scenario.member_groups[memberId] === groupId;
      });
    }),
    charge_counts: chargeCounts
  };
}

function monthlyPilotCore_verifyPhase_(phaseId, actual, applied) {
  const checks = [monthlyPilotCore_check_("time_target_month", actual.target_month === phaseTargetMonth_(phaseId), phaseTargetMonth_(phaseId), actual.target_month)];
  if (phaseId === "Week1") {
    checks.push(monthlyPilotCore_check_("two_slots_one_charge", actual.charge_counts.M_CASH === 1, 1, actual.charge_counts.M_CASH));
  }
  if (phaseId === "Week4") {
    checks.push(monthlyPilotCore_check_("duplicate_event_detected", applied.duplicate_count === 1, 1, applied.duplicate_count));
    checks.push(monthlyPilotCore_check_("duplicate_payment_skipped", actual.payment_count === 4, 4, actual.payment_count));
    checks.push(monthlyPilotCore_check_("cancelled_attendance_excluded", actual.charge_counts.M_CASH === 1, 1, actual.charge_counts.M_CASH));
  }
  if (phaseId === "MonthEnd") {
    checks.push(monthlyPilotCore_check_("billed_total", actual.billed_total === 25500, 25500, actual.billed_total));
    checks.push(monthlyPilotCore_check_("paid_total", actual.paid_total === 18000, 18000, actual.paid_total));
    checks.push(monthlyPilotCore_check_("cash_total", actual.cash_total === 8000, 8000, actual.cash_total));
    checks.push(monthlyPilotCore_check_("paypay_total", actual.paypay_total === 10000, 10000, actual.paypay_total));
    checks.push(monthlyPilotCore_check_("unpaid_total", actual.unpaid_total === 7500, 7500, actual.unpaid_total));
    checks.push(monthlyPilotCore_check_("attendance_without_invoice", actual.attendance_without_invoice.indexOf("M_NOINVOICE") >= 0, "M_NOINVOICE", actual.attendance_without_invoice));
    checks.push(monthlyPilotCore_check_("invoice_without_attendance", actual.invoice_without_attendance.indexOf("G_NOATTEND") >= 0, "G_NOATTEND", actual.invoice_without_attendance));
    checks.push(monthlyPilotCore_check_("family_group_invoice_covers_members", actual.attendance_without_invoice.indexOf("M_FAMILY_B") < 0, "not included", actual.attendance_without_invoice));
  }
  if (phaseId === "NextMonth") {
    checks.push(monthlyPilotCore_check_("next_month_billed_only", actual.billed_total === 3000, 3000, actual.billed_total));
    checks.push(monthlyPilotCore_check_("previous_payments_not_mixed", actual.paid_total === 0, 0, actual.paid_total));
    checks.push(monthlyPilotCore_check_("next_month_attendance", actual.charge_counts.M_CASH === 1, 1, actual.charge_counts.M_CASH));
  }
  return checks;
}

function phaseTargetMonth_(phaseId) {
  if (phaseId === "Prepare") return "2026-06";
  if (phaseId === "NextMonth") return "2026-08";
  return "2026-07";
}

function monthlyPilotCore_check_(name, ok, expected, actual) {
  return { name: name, ok: ok, expected: expected, actual: actual };
}

function monthlyPilotCore_createTimeContext_(systemNow, targetMonth) {
  return {
    settings: {
      TIME_TRAVEL_ENABLED: "TRUE",
      DEBUG_DATE: systemNow,
      DEBUG_TARGET_MONTH: targetMonth,
      DEBUG: "TRUE"
    }
  };
}

function monthlyPilotCore_logPhase_(step) {
  Logger.log("[STORY-902][Time] phase=" + step.phase + " system_now=" + step.system_now + " target_month=" + step.target_month);
  if (step.actual) {
    Logger.log("[STORY-902][Attendance] charge_counts=" + JSON.stringify(step.actual.charge_counts));
    Logger.log("[STORY-902][Payment] cash=" + step.actual.cash_total + " paypay=" + step.actual.paypay_total + " unpaid=" + step.actual.unpaid_total);
  }
  Logger.log("[STORY-902][Verify] " + (step.ok ? "PASS" : "FAIL") + " checks=" + JSON.stringify(step.checks || []));
}

function monthlyPilotCore_formatSystemTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

function monthlyPilotCore_invoiceEvent_(key, groupId, memberId, month, amount, label) {
  return { event_key: key, kind: "INVOICE", row: { invoice_id: key, billing_group_id: groupId, member_id: memberId, target_month: month, amount: amount, label: label } };
}

function monthlyPilotCore_paymentEvent_(key, groupId, memberId, month, amount, method) {
  return { event_key: key, kind: "PAYMENT", row: { payment_id: key, billing_group_id: groupId, member_id: memberId, target_month: month, amount: amount, payment_method: method } };
}

function monthlyPilotCore_attendanceEvent_(key, memberId, month, date, blockId, slotId, status) {
  return { event_key: key, kind: "ATTENDANCE", row: { attendance_id: key, member_id: memberId, target_month: month, "稽古日": date, billing_block_id: blockId, slot_id: slotId, "状態": status || "有効" } };
}
