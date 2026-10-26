"use strict";

const BILLING_CONTRACTS = Object.freeze({ USAGE: "USAGE", MONTHLY: "MONTHLY" });

function finite(value) { return Number.isFinite(value); }
function tagged(contract, value) {
  Object.defineProperty(value, "billing_contract", { value: contract, enumerable: false });
  return Object.freeze(value);
}

function readExpected(event) {
  const value = event?.expected?.businessValues;
  if (!value || value.specificationStatus !== "CONFIRMED") return null;
  const common = {
    registered_count: value.registered_count,
    cancelled_count: value.cancelled_count
  };
  if (!Object.values(common).every(finite)) return null;

  const contract = value.billing_contract ||
    (finite(value.usage_billing_charge_count) && finite(value.planned_amount) ? BILLING_CONTRACTS.USAGE : null);
  if (contract === BILLING_CONTRACTS.USAGE) {
    if (!finite(value.usage_billing_charge_count) || !finite(value.planned_amount)) return null;
    return tagged(contract, { ...common,
      charge_count: value.usage_billing_charge_count, planned_amount: value.planned_amount });
  }
  if (contract === BILLING_CONTRACTS.MONTHLY) {
    if (typeof value.plan_id !== "string" || !value.plan_id || !finite(value.planned_amount) ||
        !Number.isInteger(value.invoice_count) || value.invoice_count < 1) return null;
    return tagged(contract, { ...common, plan_id: value.plan_id,
      usage_billing_skipped: true, invoice_count: value.invoice_count, planned_amount: value.planned_amount });
  }
  return null;
}

function normalizeResponse(body, memberId, expected) {
  if (!body || typeof body !== "object" || Array.isArray(body) || body.ok !== true ||
      ![body.registered_count, body.cancelled_count].every(finite) || !Array.isArray(body.usage_billing)) return null;
  if (expected?.billing_contract === BILLING_CONTRACTS.USAGE) {
    const matching = body.usage_billing.filter(item => item && item.member_id === memberId);
    if (matching.length !== 1 || !finite(matching[0].charge_count) || !finite(matching[0].planned_amount)) return null;
    return tagged(BILLING_CONTRACTS.USAGE, {
      registered_count: body.registered_count, cancelled_count: body.cancelled_count,
      charge_count: matching[0].charge_count, planned_amount: matching[0].planned_amount });
  }
  if (expected?.billing_contract === BILLING_CONTRACTS.MONTHLY) {
    const matching = body.usage_billing.filter(item => item && item.plan_id === expected.plan_id);
    if (matching.length !== 1 || matching[0].ok !== true || matching[0].skipped !== true) return null;
    return tagged(BILLING_CONTRACTS.MONTHLY, {
      registered_count: body.registered_count, cancelled_count: body.cancelled_count,
      plan_id: matching[0].plan_id, usage_billing_skipped: true });
  }
  return null;
}

function comparisonFields(expected) {
  return expected.billing_contract === BILLING_CONTRACTS.USAGE
    ? ["registered_count", "cancelled_count", "charge_count", "planned_amount"]
    : ["registered_count", "cancelled_count", "plan_id", "usage_billing_skipped"];
}

function compareExpected(expected, actual) {
  return Object.freeze(comparisonFields(expected).map(name => Object.freeze({ name, expected: expected[name],
    actual: actual ? actual[name] : null, status: actual && Object.is(expected[name], actual[name]) ? "PASS" : "FAIL" })));
}

function validReadEvidence(attendance, billing, ready) {
  const input = ready.command.input, item = input.attendance_items[0], expected = ready.expected;
  const attendanceMatches = attendance?.ok === true && attendance.member_id === item.member_id &&
    Array.isArray(attendance.selected_slot_ids) && attendance.selected_slot_ids.includes(item.slot_ids[0]) &&
    attendance.billing_plan_selected === true && attendance.billing_plan_id === item.plan_id;
  const billingBase = billing?.ok === true && billing.memberId === item.member_id &&
    billing.targetMonth === input.attendance_date.slice(0, 7);
  if (!attendanceMatches || !billingBase) return false;
  if (expected.billing_contract === BILLING_CONTRACTS.USAGE)
    return Number(billing.billedTotal) === expected.planned_amount;
  return expected.billing_contract === BILLING_CONTRACTS.MONTHLY && billing.planType === item.plan_id &&
    Number.isInteger(billing.invoiceCount) && billing.invoiceCount === expected.invoice_count &&
    Array.isArray(billing.invoiceIds) && billing.invoiceIds.length === expected.invoice_count &&
    Number(billing.billedTotal) === expected.planned_amount;
}

module.exports = { BILLING_CONTRACTS, readExpected, normalizeResponse, compareExpected, validReadEvidence };
