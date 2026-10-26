(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DOJO_STORY902_E470_COMMON = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const CASE_ID = "902-E470";
  const DEV_PROJECT_ID = "dojo-management-dev";

  function unsupported(reason) {
    return Object.freeze({ status:"UNSUPPORTED", reason:String(reason || "not available") });
  }

  function isUnsupported(value) {
    return !!value && value.status === "UNSUPPORTED";
  }

  function requireId(value, field) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
      throw new Error("INVALID_" + String(field || "id").toUpperCase());
    }
    return value;
  }

  function createE470Input(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_E470_INPUT");
    if (value.case_id !== CASE_ID) throw new Error("INVALID_CASE_ID");
    if (typeof value.target_month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.target_month)) {
      throw new Error("INVALID_TARGET_MONTH");
    }
    const month = value.target_month;
    const dateFrom = value.date_from || month + "-01";
    const dateTo = value.date_to || month + "-31";
    if (![dateFrom, dateTo].every(function(date) {
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date.startsWith(month + "-");
    })) throw new Error("INVALID_DATE_RANGE");
    if (!Array.isArray(value.member_ids) || value.member_ids.length === 0) throw new Error("MEMBER_IDS_REQUIRED");
    const memberIds = Array.from(new Set(value.member_ids.map(function(id) { return requireId(id, "member_id"); })));
    if (!Array.isArray(value.reception_scopes)) throw new Error("RECEPTION_SCOPES_REQUIRED");
    const scopes = value.reception_scopes.map(function(scope, index) {
      if (!scope || typeof scope !== "object" || Array.isArray(scope)) throw new Error("INVALID_SCOPE_" + index);
      const receptionDate = String(scope.reception_date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(receptionDate) || !receptionDate.startsWith(month + "-")) {
        throw new Error("INVALID_SCOPE_DATE_" + index);
      }
      return Object.freeze({
        reception_date:receptionDate,
        location_id:requireId(scope.location_id, "location_id"),
        billing_block_id:requireId(scope.billing_block_id, "billing_block_id")
      });
    });
    const expected = value.expected && typeof value.expected === "object" && !Array.isArray(value.expected)
      ? JSON.parse(JSON.stringify(value.expected)) : {};
    return Object.freeze({
      case_id:CASE_ID,
      target_month:month,
      date_from:dateFrom,
      date_to:dateTo,
      member_ids:Object.freeze(memberIds),
      reception_scopes:Object.freeze(scopes),
      expected:Object.freeze(expected)
    });
  }

  function numberOrUnsupported(value, label) {
    const number = Number(value);
    return Number.isFinite(number) ? number : unsupported(label + " is absent");
  }

  function attendanceMinutes(body, targetMonth) {
    const source = body && body.attendance_by_date;
    if (!source || (typeof source !== "object" && !Array.isArray(source))) {
      return unsupported("attendance_by_date is absent");
    }
    let total = 0;
    if (Array.isArray(source)) {
      for (const item of source) {
        const date = String(item && (item.attendance_date || item.date) || "");
        if (!date.startsWith(targetMonth + "-")) continue;
        const minutes = Number(item.confirmed_minutes ?? item.training_minutes ?? item.minutes);
        if (!Number.isFinite(minutes)) return unsupported("attendance minutes are absent");
        total += minutes;
      }
    } else {
      for (const pair of Object.entries(source)) {
        const date = pair[0], raw = pair[1];
        if (!date.startsWith(targetMonth + "-")) continue;
        const minutes = Number(raw && typeof raw === "object"
          ? raw.confirmed_minutes ?? raw.training_minutes ?? raw.minutes : raw);
        if (!Number.isFinite(minutes)) return unsupported("attendance minutes are absent");
        total += minutes;
      }
    }
    return total;
  }

  function normalizeReception(body) {
    return Object.freeze({
      payment_count:numberOrUnsupported(body.payment_count, "payment_count"),
      cash_total:numberOrUnsupported(body.cash_total, "cash_total"),
      paypay_total:numberOrUnsupported(body.paypay_total, "paypay_total"),
      total_amount:numberOrUnsupported(body.total_amount, "total_amount"),
      outstanding_total:numberOrUnsupported(body.outstanding_total, "outstanding_total")
    });
  }

  function sumSupported(items, key) {
    const values = items.map(function(item) { return item[key]; });
    if (values.some(isUnsupported)) return unsupported(key + " is not available for every scope");
    return values.reduce(function(sum, value) { return sum + value; }, 0);
  }

  function normalizeMonthlyStatus(body) {
    const summary = body && body.summary;
    if (!summary || typeof summary !== "object") return unsupported("teacher_payment_status.summary is absent");
    const result = {};
    for (const key of ["invoice_count", "payment_count", "billed_total", "paid_total", "unpaid_total"]) {
      result[key] = numberOrUnsupported(summary[key], key);
    }
    return Object.freeze(result);
  }

  function buildJudge(expected, actual) {
    const checks = [];
    function compare(name, expectedValue, actualValue) {
      if (isUnsupported(actualValue)) checks.push({ name:name, status:"UNSUPPORTED", expected:expectedValue, actual:actualValue });
      else checks.push({ name:name, status:Object.is(actualValue, expectedValue) ? "PASS" : "FAIL", expected:expectedValue, actual:actualValue });
    }
    const attendanceExpected = expected.attendance_minutes_by_member || {};
    for (const pair of Object.entries(attendanceExpected)) {
      const memberId = pair[0], value = pair[1];
      compare("attendance_minutes:" + memberId, value,
        actual.attendance.members[memberId] ?? unsupported("member result is absent"));
    }
    const paymentExpected = expected.payments || {};
    for (const pair of Object.entries(paymentExpected)) {
      const key = pair[0], value = pair[1];
      compare("payments:" + key, value,
        actual.payments.totals[key] ?? unsupported(key + " is absent"));
    }
    const monthlyExpected = expected.monthly_billing || {};
    for (const pair of Object.entries(monthlyExpected)) {
      const key = pair[0], value = pair[1], monthly = actual.monthly_billing;
      compare("monthly_billing:" + key, value,
        isUnsupported(monthly) ? monthly : monthly[key] ?? unsupported(key + " is absent"));
    }
    const failed = checks.filter(function(check) { return check.status === "FAIL"; }).length;
    const unavailable = checks.filter(function(check) { return check.status === "UNSUPPORTED"; }).length;
    return Object.freeze({
      status:failed ? "FAIL" : unavailable ? "PARTIAL" : "PASS",
      checks:Object.freeze(checks),
      passed:checks.filter(function(check) { return check.status === "PASS"; }).length,
      failed:failed,
      unsupported:unavailable
    });
  }

  function createAttendanceProgressResult(inputValue, transportResult, options) {
    const input = createE470Input(inputValue);
    if (input.member_ids.length !== 1) throw new Error("SINGLE_MEMBER_REQUIRED");
    if (!transportResult || transportResult.action !== "attendance_progress_summary" ||
        transportResult.method !== "GET" || transportResult.http_status !== 200 ||
        !transportResult.body || transportResult.body.ok !== true) {
      throw new Error("INVALID_ATTENDANCE_PROGRESS_RESPONSE");
    }
    const memberId = input.member_ids[0];
    if (transportResult.body.member_id !== memberId) throw new Error("MEMBER_RESPONSE_MISMATCH");
    const members = Object.freeze({ [memberId]:attendanceMinutes(transportResult.body, input.target_month) });
    const actual = Object.freeze({
      attendance:Object.freeze({ status:"SUPPORTED", members:members }),
      payments:Object.freeze({ status:"UNSUPPORTED", scopes:Object.freeze([]), totals:Object.freeze({}) }),
      monthly_billing:unsupported("not requested by attendance progress transport"),
      attendance_cancellations:unsupported("no common read action exposes monthly cancellation totals"),
      examination_fees:unsupported("no common read action identifies examination-fee totals")
    });
    return Object.freeze({
      schema_version:1,
      case_id:CASE_ID,
      backend:"firebase",
      project_id:DEV_PROJECT_ID,
      target_month:input.target_month,
      executed_at:options && typeof options.now === "function" ? options.now() : new Date().toISOString(),
      mode:"READ_ONLY",
      input:input,
      expected:input.expected,
      actual:actual,
      judge:buildJudge(input.expected, actual),
      calls:Object.freeze([{ action:"attendance_progress_summary", method:"GET", status:200, subject:memberId }])
    });
  }

  return Object.freeze({
    CASE_ID:CASE_ID,
    DEV_PROJECT_ID:DEV_PROJECT_ID,
    unsupported:unsupported,
    isUnsupported:isUnsupported,
    requireId:requireId,
    createE470Input:createE470Input,
    numberOrUnsupported:numberOrUnsupported,
    attendanceMinutes:attendanceMinutes,
    normalizeReception:normalizeReception,
    sumSupported:sumSupported,
    normalizeMonthlyStatus:normalizeMonthlyStatus,
    buildJudge:buildJudge,
    createAttendanceProgressResult:createAttendanceProgressResult
  });
});
