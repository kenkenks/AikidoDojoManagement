// Step 5-1F: read-only source bridge for the real GAS Member -> Firestore dry-run.
// Returns one existing logical Member DTO to the authorized clasp caller.
// No writes and no logging of member values are performed here.
function runner_member_firestore_dry_run_source() {
  const members = daoMemberGetAll_(createSheetContext());
  if (!Array.isArray(members) || members.length === 0) {
    return { ok: false, diagnostic: 'MEMBER_FIRESTORE_DRY_RUN_SOURCE', error: 'MEMBER_NOT_FOUND' };
  }
  return {
    ok: true,
    diagnostic: 'MEMBER_FIRESTORE_DRY_RUN_SOURCE',
    member: members[0]
  };
}
