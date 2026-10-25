"use strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createFirestoreTransactionFake({ maxAttempts = 5 } = {}) {
  const documents = new Map();
  const revisions = new Map();
  let commitQueue = Promise.resolve();
  let callbackInvocations = 0;
  let transactionAttempts = 0;
  let outsideEffects = 0;
  let failBeforeCommit = false;
  let loseNextCommitResponse = false;

  class Snapshot {
    constructor(path, entry) { this.path = path; this.exists = entry !== undefined; this._entry = clone(entry); }
    data() { return clone(this._entry); }
  }

  class Ref {
    constructor(path) { this.path = path; this.id = path.split("/").at(-1); }
    collection(name) { return new Collection(`${this.path}/${name}`); }
    async get() { return new Snapshot(this.path, documents.get(this.path)); }
  }

  class Collection {
    constructor(path) { this.path = path; }
    doc(id) {
      if (typeof id !== "string" || !id || id.includes("/")) throw new Error("INVALID_DOCUMENT_ID");
      return new Ref(`${this.path}/${id}`);
    }
  }

  function enqueueCommit(operation) {
    const pending = commitQueue.then(operation, operation);
    commitQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async function runTransaction(callback) {
    if (typeof callback !== "function") throw new TypeError("TRANSACTION_CALLBACK_REQUIRED");
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      transactionAttempts += 1;
      const reads = new Map();
      const writes = [];
      let wrote = false;
      const tx = Object.freeze({
        async get(ref) {
          if (wrote) throw new Error("TRANSACTION_READ_AFTER_WRITE");
          reads.set(ref.path, revisions.get(ref.path) || 0);
          await Promise.resolve();
          return new Snapshot(ref.path, documents.get(ref.path));
        },
        create(ref, value) { wrote = true; writes.push({ type: "create", path: ref.path, value: clone(value) }); },
        set(ref, value) { wrote = true; writes.push({ type: "set", path: ref.path, value: clone(value) }); }
      });
      callbackInvocations += 1;
      const result = await callback(tx);
      try {
        await enqueueCommit(() => {
          if (failBeforeCommit) { failBeforeCommit = false; throw Object.assign(new Error("FAKE_TRANSACTION_FAILED"), { code: "UNAVAILABLE" }); }
          for (const [path, revision] of reads) {
            if ((revisions.get(path) || 0) !== revision)
              throw Object.assign(new Error("FAKE_TRANSACTION_CONFLICT"), { retryableConflict: true });
          }
          for (const write of writes) {
            if (write.type === "create" && documents.has(write.path))
              throw Object.assign(new Error("FAKE_ALREADY_EXISTS"), { code: "ALREADY_EXISTS" });
          }
          for (const write of writes) {
            documents.set(write.path, clone(write.value));
            revisions.set(write.path, (revisions.get(write.path) || 0) + 1);
          }
          if (loseNextCommitResponse) {
            loseNextCommitResponse = false;
            throw Object.assign(new Error("FAKE_COMMIT_RESPONSE_LOST"), { outcomeUnknown: true });
          }
        });
        return result;
      } catch (error) {
        if (error.retryableConflict && attempt < maxAttempts) continue;
        throw error;
      }
    }
    throw new Error("FAKE_TRANSACTION_RETRY_EXHAUSTED");
  }

  return Object.freeze({
    collection: name => new Collection(name),
    runTransaction,
    injectFailureBeforeCommit() { failBeforeCommit = true; },
    injectCommitResponseLoss() { loseNextCommitResponse = true; },
    recordOutsideEffect() { outsideEffects += 1; },
    metrics() { return { callbackInvocations, transactionAttempts, outsideEffects, documentCount: documents.size }; },
    dump() { return clone(Object.fromEntries(documents)); }
  });
}

module.exports = { createFirestoreTransactionFake };
