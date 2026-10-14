# Step 8D — Firestore UID account lookup (read-only foundation)

## Decision and boundaries

The existing `Member` and `Teacher` schemas have no verified Firebase UID field. Keep the authentication link separate from business records. This patch introduces a **proposed** server-owned Firestore collection `dojo_auth_accounts`, document ID = Firebase Auth UID. Fields: `uid` (must match document ID), `disabled` (must explicitly be `false`), and optional `member_id` / `teacher_id` (at least one required by the Step 8C resolver). The server reads only a single UID document using the existing Firestore core `readById`; it does not query by email or accept browser-provided member/teacher identity. The collection name and schema must be reviewed before any provisioning or deployment.

`cloud/api/dojo-account-firestore.cjs` exports `createDojoAccountFirestoreLookup(core)` and `createFirestoreDojoPrincipalResolver(core)`. Only pass an already verified Firebase ID token to the latter. Read errors, missing documents, mismatched UID, disabled accounts, and invalid IDs fail closed. The existing `createFirestoreCore` service credentials are required in production; **never expose this DAO to a browser**.

## Not yet implemented

No collection is created by this patch. No account enrollment, uniqueness across accounts for the same member/teacher, lifecycle/revocation propagation, teacher role policy, security rules, Cloud Run handler wiring, or QR credential mechanism. Do not provision accounts or enable attendance access based on this module alone. A UID-keyed document prevents multiple records *for the same UID*, but does **not** prevent one member_id from being linked to multiple UIDs; provisioning must enforce that invariant atomically or by an authoritative reverse index.

GAS, QR URLs, existing admin API and deployment configuration remain unchanged.

Test: `node work/verify-attendance-step8d-firestore.cjs`.
