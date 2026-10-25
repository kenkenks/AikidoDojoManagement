"use strict";

const { DEV_PROJECT_ID, DEV_TARGET, RUN_ID_PATTERN } = require("./story902-pre-execution-gate.cjs");

const SUCCESS_STATES = new Set(["NOT_PREPARED", "PREPARED", "TIME_SET", "VERIFIED", "RESTORED"]);
const EVENT_ID_PATTERN = /^902-E\d{3}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function controllerError(code, message, cause) {
  const error = new Error(message);
  error.name = "Story902TimeTripError";
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function validDateTime(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function validateGateInput(gate) {
  if (!gate || typeof gate !== "object" || gate.timeTripOperationAllowed !== true)
    throw controllerError("PRE_EXECUTION_GATE_BLOCKED", "pre-execution gate does not allow TimeTrip operations");
  if (gate.status !== "PRE_EXECUTION_READY" || gate.candidate !== true || gate.businessExecutionAllowed !== false)
    throw controllerError("PRE_EXECUTION_GATE_INVALID", "pre-execution gate structure is inconsistent");
  if (!RUN_ID_PATTERN.test(String(gate.runId || "")))
    throw controllerError("PRE_EXECUTION_GATE_INVALID", "pre-execution gate Run ID is invalid");
  if (!EVENT_ID_PATTERN.test(String(gate.eventId || "")))
    throw controllerError("PRE_EXECUTION_GATE_INVALID", "pre-execution gate eventId is invalid");

  const expected = gate.expectedTimeTrip;
  if (!expected || typeof expected !== "object")
    throw controllerError("PRE_EXECUTION_GATE_INVALID", "expectedTimeTrip is required");
  if (expected.projectId !== DEV_PROJECT_ID || expected.target !== DEV_TARGET || expected.enabled !== true)
    throw controllerError("PRE_EXECUTION_GATE_INVALID", "expectedTimeTrip is not restricted to the enabled DEV target");
  if (!validDateTime(expected.now) || !validDateTime(expected.sourceExecutionDateTime))
    throw controllerError("PRE_EXECUTION_GATE_INVALID", "expected TimeTrip datetime is invalid");
  if (!MONTH_PATTERN.test(String(expected.targetMonth || "")) || expected.sourceExecutionDateTime.slice(0, 7) !== expected.targetMonth)
    throw controllerError("PRE_EXECUTION_GATE_INVALID", "expected TimeTrip month does not match the source datetime");
  if (Date.parse(expected.now) !== Date.parse(expected.sourceExecutionDateTime))
    throw controllerError("PRE_EXECUTION_GATE_INVALID", "expected TimeTrip datetime representations do not identify the same instant");
  return clone(expected);
}

function normalizeBaseline(readback) {
  if (!readback || typeof readback !== "object" || readback.ok !== true)
    throw controllerError("BASELINE_INVALID", "TimeTrip baseline read was not explicitly successful");
  if (typeof readback.enabled !== "boolean")
    throw controllerError("BASELINE_INVALID", "TimeTrip baseline enabled must be boolean");
  if (readback.enabled === false) {
    if (readback.now !== "" || readback.target_month !== "")
      throw controllerError("BASELINE_INVALID", "disabled TimeTrip baseline must contain empty now and target_month");
    return { enabled: false, now: "", target_month: "" };
  }
  if (!validDateTime(readback.now) || !MONTH_PATTERN.test(String(readback.target_month || "")))
    throw controllerError("BASELINE_INVALID", "enabled TimeTrip baseline requires valid now and target_month");
  return { enabled: true, now: new Date(readback.now).toISOString(), target_month: readback.target_month };
}

function matchesBaseline(actual, baseline) {
  if (!actual || actual.ok !== true || actual.enabled !== baseline.enabled) return false;
  if (baseline.enabled === false) return actual.now === "" && actual.target_month === "";
  return validDateTime(actual.now)
    && Date.parse(actual.now) === Date.parse(baseline.now)
    && actual.target_month === baseline.target_month;
}

function matchesExpected(actual, expected) {
  if (!actual || actual.ok !== true) return false;
  if (actual.enabled !== true || actual.target_month !== expected.targetMonth) return false;
  if (Date.parse(actual.now) !== Date.parse(expected.now)) return false;
  if (actual.effective) {
    if (actual.effective.time_travel_enabled !== true) return false;
    if (actual.effective.target_month !== expected.targetMonth) return false;
  }
  return true;
}

function createTimeTripController({ adapter } = {}) {
  if (!adapter || typeof adapter.read !== "function" || typeof adapter.set !== "function" || typeof adapter.restore !== "function")
    throw controllerError("ADAPTER_INVALID", "adapter.read/set/restore are required");

  let state = "NOT_PREPARED";
  let baseline = null;
  let expected = null;
  let lastReadback = null;
  const diagnostics = [];

  function record(operation, status, detail = {}) {
    diagnostics.push({ operation, status, ...clone(detail) });
  }

  async function prepare(preExecutionGate) {
    if (state !== "NOT_PREPARED") throw controllerError("STATE_INVALID", `prepare is not allowed from ${state}`);
    let checkedExpected;
    try {
      checkedExpected = validateGateInput(preExecutionGate);
    } catch (error) {
      record("prepare", "FAIL", { code: error.code || "PRE_EXECUTION_GATE_INVALID" });
      throw error;
    }
    try {
      baseline = normalizeBaseline(await adapter.read());
      expected = checkedExpected;
      state = "PREPARED";
      record("prepare", "PASS", { runId: preExecutionGate.runId, eventId: preExecutionGate.eventId });
      return getState();
    } catch (error) {
      state = "PREPARE_FAILED";
      record("prepare", "FAIL", { code: error.code || "ADAPTER_READ_FAILED" });
      throw controllerError("PREPARE_FAILED", "failed to capture the TimeTrip baseline", error);
    }
  }

  async function set() {
    if (state !== "PREPARED") throw controllerError("STATE_INVALID", `set is not allowed from ${state}`);
    try {
      await adapter.set(clone(expected));
      state = "TIME_SET";
      record("set", "PASS");
      return getState();
    } catch (error) {
      state = "SET_FAILED";
      record("set", "FAIL", { code: error.code || "ADAPTER_SET_FAILED" });
      throw controllerError("TIME_TRIP_SET_FAILED", "TimeTrip set failed; business execution remains prohibited", error);
    }
  }

  async function verify() {
    if (state !== "TIME_SET") throw controllerError("STATE_INVALID", `verify is not allowed from ${state}`);
    try {
      lastReadback = clone(await adapter.read());
      if (!matchesExpected(lastReadback, expected)) {
        state = "VERIFY_FAILED";
        record("verify", "FAIL", { code: "TIME_TRIP_MISMATCH" });
        throw controllerError("TIME_TRIP_VERIFY_FAILED", "TimeTrip readback does not match the requested value");
      }
      state = "VERIFIED";
      record("verify", "PASS");
      return getState();
    } catch (error) {
      if (state !== "VERIFY_FAILED") {
        state = "VERIFY_FAILED";
        record("verify", "FAIL", { code: error.code || "ADAPTER_READ_FAILED" });
      }
      if (error.code === "TIME_TRIP_VERIFY_FAILED") throw error;
      throw controllerError("TIME_TRIP_VERIFY_FAILED", "TimeTrip verification failed; business execution remains prohibited", error);
    }
  }

  async function restore() {
    if (baseline === null) throw controllerError("RESTORE_BASELINE_MISSING", "restore is unavailable before a baseline is captured");
    if (state === "RESTORED") return getState();
    try {
      await adapter.restore(clone(baseline));
      const restoredReadback = clone(await adapter.read());
      lastReadback = restoredReadback;
      if (!matchesBaseline(restoredReadback, baseline))
        throw controllerError("TIME_TRIP_RESTORE_MISMATCH", "TimeTrip restore readback does not match the baseline");
      state = "RESTORED";
      record("restore", "PASS");
      return getState();
    } catch (error) {
      state = "RESTORE_FAILED";
      record("restore", "FAIL", { code: error.code || "ADAPTER_RESTORE_FAILED" });
      throw controllerError("TIME_TRIP_RESTORE_FAILED", "TimeTrip restore failed; the environment requires manual inspection", error);
    }
  }

  function getState() {
    return {
      state,
      successfulLifecycleState: SUCCESS_STATES.has(state),
      timeTripVerified: state === "VERIFIED",
      businessExecutionAllowed: false,
      baseline: clone(baseline),
      expected: clone(expected),
      lastReadback: clone(lastReadback),
      diagnostics: clone(diagnostics)
    };
  }

  return { prepare, set, verify, restore, getState };
}

module.exports = {
  createTimeTripController,
  matchesExpected,
  matchesBaseline,
  normalizeBaseline,
  validateGateInput
};
