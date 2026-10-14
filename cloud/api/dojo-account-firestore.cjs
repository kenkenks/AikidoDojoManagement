'use strict';
// Step 8D: server-only, read-only account lookup. Provisioning is deliberately out of scope.
const { createDojoPrincipalResolver } = require('./dojo-principal.cjs');
const UID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SOURCE = Object.freeze({ collection: 'dojo_auth_accounts' });
function createDojoAccountFirestoreLookup(core) {
  if (!core || typeof core.readById !== 'function') throw new TypeError('Firestore core.readById required');
  return async function findAccountByUid(uid) {
    if (typeof uid !== 'string' || !UID.test(uid)) return null;
    const account = await core.readById(SOURCE, uid);
    if (!account || typeof account !== 'object' || Array.isArray(account)) return null;
    // Fail closed: do not trust the document key alone if the stored UID differs.
    if (account.uid !== uid || account.disabled !== false) return null;
    return {uid: account.uid, disabled: account.disabled,
      member_id: account.member_id, teacher_id: account.teacher_id};
  };
}
function createFirestoreDojoPrincipalResolver(core) {
  return createDojoPrincipalResolver({findAccountByUid:createDojoAccountFirestoreLookup(core)});
}
module.exports = { createDojoAccountFirestoreLookup, createFirestoreDojoPrincipalResolver };
