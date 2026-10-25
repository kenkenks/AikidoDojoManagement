"use strict";

// E010 compatibility facade. Attendance behavior is implemented once in the
// shared adapter; established C-2 callers keep their public contract.
const shared = require("./story902-attendance-business-adapter.cjs");
const EVENT_ID = "902-E010";

function compatibilityResult(value) {
  if (value?.status === "BLOCKED" && !value.reason && Array.isArray(value.blockers) && value.blockers.length)
    return Object.freeze({ ...value, reason: value.blockers[0] });
  return value;
}
function unsupported(eventId) {
  return Object.freeze({ status: "BLOCKED", mockExecution: true, businessExecutionAllowed: false,
    autoRetryAllowed: false, reason: { code: "EVENT_NOT_SUPPORTED", detail: eventId || null } });
}
function createCommand(input = {}) {
  return input.eventId === EVENT_ID ? compatibilityResult(shared.createAttendanceCommand(input)) : unsupported(input.eventId);
}
function createE010BusinessAdapter(options) {
  const adapter = shared.createAttendanceBusinessAdapter(options);
  return Object.freeze({ async execute(input = {}) {
    return input.eventId === EVENT_ID ? compatibilityResult(await adapter.execute(input)) : unsupported(input.eventId);
  }});
}

module.exports = { EVENT_ID, createCommand, createE010BusinessAdapter,
  normalizeResponse: shared.normalizeResponse, readExpected: shared.readExpected };
