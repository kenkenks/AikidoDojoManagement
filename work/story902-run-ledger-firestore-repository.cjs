"use strict";

const {
  PROJECT_ID, TARGET, STORY_ID, TERMINAL_STATES,
  stableEventKey, createReservedRecord, assertRecord, transition,
  markInterrupted, updateTimeTrip, failure
} = require("./story902-run-ledger-model.cjs");

const COLLECTIONS = Object.freeze({
  runs: "story902_runs",
  claims: "story902_event_claims"
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function validateFirestore(firestore) {
  if (!firestore || typeof firestore.collection !== "function" ||
      typeof firestore.runTransaction !== "function") {
    throw new TypeError("FIRESTORE_TRANSACTION_REQUIRED");
  }
}

function claimState(eventState) {
  if (eventState === "UNKNOWN") return "UNKNOWN";
  return TERMINAL_STATES.has(eventState) ? "TERMINAL" : eventState;
}

function assertRepositoryEvidence(input, requiredEvidenceKind) {
  if (input?.projectId !== PROJECT_ID || input?.target !== TARGET || input?.storyId !== STORY_ID)
    throw failure("DEV_ENVIRONMENT_REQUIRED");
  if (input?.evidenceKind !== requiredEvidenceKind) throw failure("REPOSITORY_EVIDENCE_KIND_REQUIRED", requiredEvidenceKind);
}

function createFirestoreRunLedgerRepository(firestore, {
  clock = () => new Date().toISOString(),
  serverTimestamp = clock,
  evidenceKind = "DEV_LIVE"
} = {}) {
  validateFirestore(firestore);
  if (typeof clock !== "function" || typeof serverTimestamp !== "function")
    throw new TypeError("CLOCK_REQUIRED");
  if (!new Set(["DEV_LIVE", "EMULATOR_ONLY"]).has(evidenceKind))
    throw new TypeError("REPOSITORY_EVIDENCE_KIND_INVALID");

  function refs(input) {
    const key = stableEventKey(input);
    const run = firestore.collection(COLLECTIONS.runs).doc(input.runId);
    return Object.freeze({
      key,
      claim: firestore.collection(COLLECTIONS.claims).doc(key),
      run,
      event: run.collection("events").doc(input.eventId)
    });
  }

  async function readRef(ref) {
    const snapshot = await ref.get();
    return snapshot.exists ? clone(snapshot.data()) : null;
  }

  function conflictFor(existing, input) {
    const mismatch = ["manifestFingerprint", "fixtureFingerprint", "eventFingerprint"]
      .some(name => existing?.[name] !== input[name]);
    return failure(mismatch ? "EVENT_CLAIM_FINGERPRINT_CONFLICT" : "EVENT_CLAIM_ALREADY_EXISTS", {
      ownerRunId: existing?.ownerRunId || existing?.runId || null,
      state: existing?.state || null
    });
  }

  function claimFrom(record, timestamp) {
    return Object.freeze({
      schemaVersion: 1,
      stableEventKey: record.stableEventKey,
      projectId: record.projectId,
      target: record.target,
      storyId: record.storyId,
      executionScopeId: record.executionScopeId,
      eventId: record.eventId,
      ownerRunId: record.runId,
      manifestFingerprint: record.manifestFingerprint,
      fixtureFingerprint: record.fixtureFingerprint,
      eventFingerprint: record.eventFingerprint,
      state: claimState(record.state),
      version: record.version,
      createdAt: timestamp,
      updatedAt: timestamp,
      businessExecutionAllowed: false
    });
  }

  function runFrom(record, timestamp) {
    return Object.freeze({
      schemaVersion: 1,
      runId: record.runId,
      projectId: record.projectId,
      target: record.target,
      storyId: record.storyId,
      executionScopeId: record.executionScopeId,
      manifestFingerprint: record.manifestFingerprint,
      fixtureFingerprint: record.fixtureFingerprint,
      evidenceKind: record.evidenceKind,
      state: "ACTIVE",
      createdAt: timestamp,
      updatedAt: timestamp,
      businessExecutionAllowed: false
    });
  }

  function assertRunCompatible(run, record) {
    if (!run || run.runId !== record.runId || run.projectId !== PROJECT_ID || run.target !== TARGET ||
        run.storyId !== STORY_ID || run.executionScopeId !== record.executionScopeId ||
        run.manifestFingerprint !== record.manifestFingerprint ||
        run.fixtureFingerprint !== record.fixtureFingerprint || run.evidenceKind !== "DEV_LIVE") {
      throw failure("RUN_LEDGER_CONFLICT");
    }
  }

  function assertPair(event, claim, key) {
    assertRecord(event);
    if (!claim || claim.stableEventKey !== key || claim.ownerRunId !== event.runId ||
        claim.eventId !== event.eventId || claim.version !== event.version ||
        claim.state !== claimState(event.state) || claim.businessExecutionAllowed !== false) {
      throw failure("REPOSITORY_INCONSISTENT");
    }
    return event;
  }

  async function readPair(reference) {
    const [event, claim] = await Promise.all([readRef(reference.event), readRef(reference.claim)]);
    if (!event && !claim) return null;
    if (!event || !claim) throw failure("REPOSITORY_INCONSISTENT");
    return clone(assertPair(event, claim, reference.key));
  }

  async function reserve(input) {
    assertRepositoryEvidence(input, evidenceKind);
    const reference = refs(input);
    const now = clock();
    const timestamp = serverTimestamp();
    const record = createReservedRecord(input, now);
    let transactionError = null;
    try {
      await firestore.runTransaction(async tx => {
        const [claimSnapshot, eventSnapshot, runSnapshot] = await Promise.all([
          tx.get(reference.claim), tx.get(reference.event), tx.get(reference.run)
        ]);
        if (claimSnapshot.exists) throw conflictFor(claimSnapshot.data(), input);
        if (eventSnapshot.exists) throw failure("REPOSITORY_INCONSISTENT");
        if (runSnapshot.exists) assertRunCompatible(runSnapshot.data(), record);
        else tx.create(reference.run, runFrom(record, timestamp));
        tx.create(reference.event, record);
        tx.create(reference.claim, claimFrom(record, timestamp));
      });
    } catch (error) {
      if (!error?.outcomeUnknown) throw error;
      transactionError = error;
    }
    if (transactionError) {
      try { await readPair(reference); } catch (readError) {
        if (readError.code === "REPOSITORY_INCONSISTENT") throw readError;
      }
      throw failure("REPOSITORY_OUTCOME_UNKNOWN", { operation: "reserve" });
    }
    const saved = await readPair(reference);
    if (!saved) throw failure("REPOSITORY_OUTCOME_UNKNOWN", { operation: "reserve" });
    return saved;
  }

  async function get(key) {
    if (!/^[a-f0-9]{64}$/.test(String(key || ""))) throw failure("EVENT_CLAIM_KEY_INVALID");
    const claimRef = firestore.collection(COLLECTIONS.claims).doc(key);
    const claim = await readRef(claimRef);
    if (!claim) return null;
    const runRef = firestore.collection(COLLECTIONS.runs).doc(claim.ownerRunId);
    return readPair(Object.freeze({ key, claim: claimRef, run: runRef,
      event: runRef.collection("events").doc(claim.eventId) }));
  }

  async function update(key, expectedVersion, operationName, updater) {
    if (!/^[a-f0-9]{64}$/.test(String(key || ""))) throw failure("EVENT_CLAIM_KEY_INVALID");
    let savedRefs = null;
    try {
      await firestore.runTransaction(async tx => {
        const claimRef = firestore.collection(COLLECTIONS.claims).doc(key);
        const claimSnapshot = await tx.get(claimRef);
        if (!claimSnapshot.exists) throw failure("EVENT_CLAIM_NOT_FOUND");
        const claim = claimSnapshot.data();
        const runRef = firestore.collection(COLLECTIONS.runs).doc(claim.ownerRunId);
        const eventRef = runRef.collection("events").doc(claim.eventId);
        const eventSnapshot = await tx.get(eventRef);
        if (!eventSnapshot.exists) throw failure("REPOSITORY_INCONSISTENT");
        const current = assertPair(eventSnapshot.data(), claim, key);
        if (current.version !== expectedVersion) throw failure("EVENT_CLAIM_VERSION_CONFLICT");
        const next = updater(current);
        assertRecord(next);
        const nextClaim = {
          ...claim,
          state: claimState(next.state),
          version: next.version,
          updatedAt: serverTimestamp(),
          businessExecutionAllowed: false
        };
        tx.set(eventRef, next);
        tx.set(claimRef, nextClaim);
        savedRefs = Object.freeze({ key, claim: claimRef, run: runRef, event: eventRef });
      });
    } catch (error) {
      if (!error?.outcomeUnknown) throw error;
      throw failure("REPOSITORY_OUTCOME_UNKNOWN", { operation: operationName });
    }
    const saved = await readPair(savedRefs);
    if (!saved || saved.version !== expectedVersion + 1)
      throw failure("REPOSITORY_OUTCOME_UNKNOWN", { operation: operationName });
    return saved;
  }

  function recordSendIntent(key, version, input) {
    return update(key, version, "recordSendIntent",
      current => transition(current, "recordSendIntent", input, clock()));
  }

  function markInFlight(key, version) {
    return update(key, version, "markInFlight",
      current => transition(current, "markInFlight", {}, clock()));
  }

  function finish(key, version, input) {
    return update(key, version, "finish",
      current => transition(current, "finish", input, clock()));
  }

  function recoverInterrupted(key, version) {
    return update(key, version, "recoverInterrupted", current => {
      const recovered = markInterrupted(current, clock());
      if (!recovered?.record) return recovered;
      return Object.freeze({
        ...current,
        recoveryRequired: recovered.recoveryRequired,
        businessExecutionAllowed: false,
        version: current.version + 1
      });
    });
  }

  function setTimeTripState(key, version, state, evidenceDigest = null) {
    return update(key, version, "setTimeTripState",
      current => updateTimeTrip(current, state, evidenceDigest));
  }

  return Object.freeze({
    kind: "STORY902_FIRESTORE_RUN_LEDGER_REPOSITORY",
    collections: COLLECTIONS,
    reserve, get, recordSendIntent, markInFlight, finish,
    recoverInterrupted, setTimeTripState
  });
}

module.exports = { COLLECTIONS, createFirestoreRunLedgerRepository };
