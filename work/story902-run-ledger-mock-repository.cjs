"use strict";

const {
  createReservedRecord, stableEventKey, transition, markInterrupted,
  updateTimeTrip, failure
} = require("./story902-run-ledger-model.cjs");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMockRunLedgerRepository({ clock = () => new Date().toISOString() } = {}) {
  const claims = new Map();
  let queue = Promise.resolve();

  function atomic(operation) {
    const pending = queue.then(operation, operation);
    queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async function reserve(input) {
    return atomic(() => {
      const key = stableEventKey(input);
      const existing = claims.get(key);
      if (existing) {
        const code = existing.manifestFingerprint !== input.manifestFingerprint ||
          existing.fixtureFingerprint !== input.fixtureFingerprint ||
          existing.eventFingerprint !== input.eventFingerprint
          ? "EVENT_CLAIM_FINGERPRINT_CONFLICT"
          : "EVENT_CLAIM_ALREADY_EXISTS";
        throw failure(code, { ownerRunId: existing.runId, state: existing.state });
      }
      const record = createReservedRecord(input, clock());
      claims.set(key, record);
      return clone(record);
    });
  }

  async function get(key) {
    return clone(claims.get(key) || null);
  }

  async function apply(key, expectedVersion, operation) {
    return atomic(() => {
      const current = claims.get(key);
      if (!current) throw failure("EVENT_CLAIM_NOT_FOUND");
      if (current.version !== expectedVersion) throw failure("EVENT_CLAIM_VERSION_CONFLICT");
      const next = operation(current);
      claims.set(key, next);
      return clone(next);
    });
  }

  function recordSendIntent(key, version, input) {
    return apply(key, version, current => transition(current, "recordSendIntent", input, clock()));
  }

  function markInFlight(key, version) {
    return apply(key, version, current => transition(current, "markInFlight", {}, clock()));
  }

  function finish(key, version, input) {
    return apply(key, version, current => transition(current, "finish", input, clock()));
  }

  function recoverInterrupted(key, version) {
    return apply(key, version, current => {
      const recovered = markInterrupted(current, clock());
      if (recovered && recovered.record) return Object.freeze({
        ...current,
        recoveryRequired: recovered.recoveryRequired,
        businessExecutionAllowed: false,
        version: current.version + 1
      });
      return recovered;
    });
  }

  function setTimeTripState(key, version, state, evidenceDigest = null) {
    return apply(key, version, current => updateTimeTrip(current, state, evidenceDigest));
  }

  return Object.freeze({
    kind: "STORY902_MOCK_RUN_LEDGER_REPOSITORY",
    reserve, get, recordSendIntent, markInFlight, finish,
    recoverInterrupted, setTimeTripState,
    size: () => claims.size
  });
}

module.exports = { createMockRunLedgerRepository };
