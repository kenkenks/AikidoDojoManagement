'use strict';
// Step 8C: resolve a verified Firebase identity to dojo-owned identifiers.
// This module is not an HTTP route or a credential verifier. The caller MUST
// verify the ID token first and supply a trusted server-side account lookup.
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function validId(value) { return typeof value === 'string' && ID.test(value); }
function normalizeAccount(account) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return null;
  if (account.disabled !== false) return null; // explicit active account only
  const memberId = account.member_id;
  const teacherId = account.teacher_id;
  if (memberId != null && !validId(memberId)) return null;
  if (teacherId != null && !validId(teacherId)) return null;
  if (!memberId && !teacherId) return null;
  return Object.freeze({ member_id: memberId || null, teacher_id: teacherId || null });
}
function createDojoPrincipalResolver({ findAccountByUid }) {
  if (typeof findAccountByUid !== 'function') throw new TypeError('findAccountByUid is required');
  return async function resolvePrincipal(verifiedToken) {
    // No claims, query parameters, QR payloads, or client session may supply identity links.
    if (!verifiedToken || !validId(verifiedToken.uid)) return null;
    let account;
    try { account = await findAccountByUid(verifiedToken.uid); }
    catch { return null; }
    if (!account || account.uid !== verifiedToken.uid) return null;
    const ids = normalizeAccount(account);
    if (!ids) return null;
    return Object.freeze({ uid: verifiedToken.uid, ...ids });
  };
}
function canAccessMember(principal, memberId) {
  return Boolean(principal && validId(memberId) && principal.member_id === memberId);
}
module.exports = { createDojoPrincipalResolver, canAccessMember };
