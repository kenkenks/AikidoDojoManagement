'use strict';
// Server-side Firestore Admin SDK adapter. No HTTP route or client SDK exposure.
const UID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const IDENTITY = /^(member|teacher):[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const UID_COLLECTION = 'dojo_auth_accounts';
const IDENTITY_COLLECTION = 'dojo_auth_identity_keys';
function checkKey(key, pattern) {
  if (typeof key !== 'string' || !pattern.test(key)) throw Error('INVALID_ACCOUNT_KEY');
  return key;
}
function createDojoAccountTransactionRepository(firestore) {
  if (!firestore || typeof firestore.collection !== 'function' ||
      typeof firestore.runTransaction !== 'function') throw TypeError('FIRESTORE_TRANSACTION_REQUIRED');
  return Object.freeze({
    transaction(fn) {
      if (typeof fn !== 'function') throw TypeError('TRANSACTION_CALLBACK_REQUIRED');
      return firestore.runTransaction(async tx => {
        if (!tx || !['get','create','set'].every(name => typeof tx[name] === 'function'))
          throw TypeError('FIRESTORE_TRANSACTION_REQUIRED');
        // Firestore transactions require all reads to occur before any writes.
        let wrote = false;
        const refUid = uid => firestore.collection(UID_COLLECTION).doc(checkKey(uid, UID));
        const refIdentity = key => firestore.collection(IDENTITY_COLLECTION).doc(checkKey(key, IDENTITY));
        async function read(ref) {
          if (wrote) throw Error('TRANSACTION_READ_AFTER_WRITE');
          const snapshot = await tx.get(ref);
          return snapshot.exists ? snapshot.data() : null;
        }
        function create(ref, value) { wrote = true; tx.create(ref, value); }
        function set(ref, value) { wrote = true; tx.set(ref, value); }
        return fn(Object.freeze({
          getUid: uid => read(refUid(uid)),
          getIdentity: key => read(refIdentity(key)),
          createUid: (uid, value) => create(refUid(uid), value),
          createIdentity: (key, value) => create(refIdentity(key), value),
          setUid: (uid, value) => set(refUid(uid), value),
          setIdentity: (key, value) => set(refIdentity(key), value)
        }));
      });
    }
  });
}
function createFirestoreDojoAccountLifecycle(firestore) {
  const {createDojoAccountLifecycle} = require('./dojo-account-lifecycle.cjs');
  return createDojoAccountLifecycle(createDojoAccountTransactionRepository(firestore));
}
module.exports = {createDojoAccountTransactionRepository, createFirestoreDojoAccountLifecycle};
