'use strict';
// Step 8E: server-only lifecycle policy. An injected atomic repository is mandatory.
// The repository transaction MUST enforce uniqueness and compare-and-set across
// BOTH uid and reverse identity keys in one Firestore transaction/commit.
const UID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TYPES = new Set(['member', 'teacher']);
function key(type, id) { return type + ':' + id; }
function validate(uid, type, id) {
  if (typeof uid !== 'string' || !UID.test(uid) || !TYPES.has(type) ||
      typeof id !== 'string' || !ID.test(id)) throw new Error('INVALID_ACCOUNT_LINK');
}
function createDojoAccountLifecycle(repository) {
  if (!repository || typeof repository.transaction !== 'function')
    throw new TypeError('ATOMIC_TRANSACTION_REQUIRED');
  // transaction(fn) must provide getUid/getIdentity and createUid/createIdentity,
  // plus setUid/setIdentity; all reads/writes must commit atomically.
  async function provision({uid, type, id}) {
    validate(uid, type, id);
    return repository.transaction(async tx => {
      const [account, owner] = await Promise.all([tx.getUid(uid), tx.getIdentity(key(type,id))]);
      if (account || owner) throw new Error('ACCOUNT_LINK_CONFLICT');
      const doc = {uid, disabled:false, member_id:type==='member'?id:null,
        teacher_id:type==='teacher'?id:null};
      await tx.createUid(uid,doc);
      await tx.createIdentity(key(type,id),{uid, type, id, disabled:false});
      return {uid,type,id};
    });
  }
  async function disable({uid, type, id}) {
    validate(uid,type,id);
    return repository.transaction(async tx => {
      const [account,owner] = await Promise.all([tx.getUid(uid),tx.getIdentity(key(type,id))]);
      const field=type==='member'?'member_id':'teacher_id';
      if (!account || account.uid!==uid || account[field]!==id ||
          !owner || owner.uid!==uid || owner.type!==type || owner.id!==id)
        throw new Error('ACCOUNT_LINK_MISMATCH');
      if (account.disabled===true && owner.disabled===true) return {disabled:true};
      if (account.disabled!==false || owner.disabled!==false) throw new Error('ACCOUNT_LINK_MISMATCH');
      await tx.setUid(uid,{...account,disabled:true});
      await tx.setIdentity(key(type,id),{...owner,disabled:true});
      // Keep the reverse index reserved after disabling. Never auto-reassign.
      return {disabled:true};
    });
  }
  return Object.freeze({provision,disable});
}
module.exports={createDojoAccountLifecycle};
