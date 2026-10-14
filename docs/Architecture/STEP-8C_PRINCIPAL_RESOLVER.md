# Step 8C: Verified UID → Dojo principal (foundation)

## Existing contracts and decision
- `schema/Member.yml`: `member_id`, `email`; no Firebase UID.
- `schema/Teacher.yml`: `teacher_id` → `member_id`; no Firebase UID.
- `docs/firebase/API-ACCESS-CONTROL.md` explicitly leaves UserAccount storage and QR credential strategy undecided. Member email is **not** a verified UID mapping.
- Admin-only operations retain their existing `admin === true` authorization. No admin handler or route changes in this patch.

## Added foundation
`cloud/api/dojo-principal.cjs` accepts a **previously verified** Firebase token and a server-owned `findAccountByUid(uid)` dependency. The account must explicitly have `disabled: false`, an exact matching `uid`, and at least one valid dojo identifier. It returns a frozen `{uid,member_id,teacher_id}` principal or `null` (fail closed). `canAccessMember` only grants exact self-member scope.

## Not yet integrated / unresolved
No UserAccount Firestore collection, claim provisioning, account enrollment, teacher scope, QR credential verifier, API authorization change, or member login UX is introduced. This is deliberate: storage and QR authentication are still architectural decisions. `findAccountByUid` must eventually read a **trusted server-controlled mapping**, never browser inputs or token custom claims for member/teacher IDs. Do not wire this resolver into live operations until mapping enrollment, revocation, and role/scope policy are specified and tested.

## Safety
- No GAS changes, no new endpoint, no QR URL change, no Cloud Run deployment.
- Existing admin behavior remains intact. No login requirement is imposed on member QR scanning by this module.
- Test: `node work/verify-attendance-step8c-principal.cjs`.
