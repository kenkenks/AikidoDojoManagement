# FW-001 Firebase attendance port

## Current verified status — 2026-10-15

FW-001 DEV candidate verification is complete. The current offline suite is **186/186 PASS**, 0 FAIL, exit 0; git diff --check passed. Earlier test counts below are historical results, not the current total.

- Project: dojo-management-dev; database: (default).
- Candidate: dojo-time-travel-admin-00039-pex. Normal serving revision dojo-time-travel-admin-00024-728 remained at 100%.
- Run: FW001TEST_83f59b07a48f44b1aed1603a9eb8c412.
- Registration, repeat submission and cancellation: all three confirmed and independently verified against Firestore.
- Repeat retained the original IDs and ten-document count. Cancellation retained those IDs, recorded cancellation metadata, kept invoice/View amounts at 1,000 yen and reduced View attendance details to zero.
- All ten dedicated documents were recovered. Final read-only absence check: **2026-10-15 17:03:51 JST**, all ten absent and dedicated scope queries empty.
- Final journal: status: passed; step: 3; verifiedStep: 3; stopped: true; pending: false; lateWritesPossible: false; errors empty. stopped prevents further staged operations after recovery.
- No promotion to normal traffic or Firebase Hosting publication was performed. DEV candidate placement is complete; broader release is outside this verification.
- P001 fee-display mapping, broader load/contention validation and populated-data rollout audits remain separate tasks and do not block this scoped FW-001 verification completion.

The journal and generated browser scripts remain ignored local evidence; do not add them to Git. This status records completed authorization, not permission to repeat live operations. See [verification record](FW-001_VERIFICATION_2026-10-15.md) and [candidate procedure](FW-001_CANDIDATE_TEST_SAFETY.md).


Baseline: AikidoDojoManagement-main(119).zip. Date: 2026-10-15.

## Canonical path and ARCH-022

attendance.html → existing POST /api/webconnect (attendance_batch) → WebConnectCore.resolve → authenticated handler → Firestore DAO transaction → unchanged registerAttendanceBatchLocked_.

1. Deficiency: Firebase registration is disabled and not dispatched; the canonical GAS functions require a synchronous DAO and host bindings.
2. Allowed changes: existing Firebase DAO, host bindings, existing TimeTrip build, existing WebConnect/HTTP wiring and Firebase browser branch.
3. Do not bypass: existing registration orchestration, Billing Jobs, Attendance Core, DTOs, DAO Business or View projection/build functions.
4. Local seam solution: read the transaction snapshot first, execute unchanged synchronous business functions over it, buffer their DAO writes and commit on success. No alternate Core or Facade.
5. Extend the existing TimeTrip artifact and build; no additional generator, generated runtime artifact, build command or API URL. The host environment and master field mapper contain no business calculations.
6. This is the authorized FW-001 port, not horizontal rollout of an experiment. Removing the registration export/DAO/wiring leaves GAS and TimeTrip independent.

All canonical GAS files are packaged byte-for-byte in a function scope. Source hashes are verified by tests. The original orchestration still calls monthly selection/invoice, attendance registration/cancellation, usage billing, self-declared rank update and Payment Status View projection.

## Storage

| GAS data | Firestore collection | Document ID |
|---|---|---|
| 04_月次選択 | monthly_selections | existing monthlySelectionDocumentId(group,month) |
| 05_請求明細 | invoices | existing invoice_id |
| 06_入金ログ | payments (read only here) | existing mapping |
| 07_出席ログ | attendances | existing attendance_id |
| 09_決済エビデンス | paymentEvidences (read only here) | existing mapping |
| 20_会費状態View | payment_status_views | view_ + monthlySelectionDocumentId(member,month) |
| 01_会員マスタ | members | member_id |

Existing business DTO field names are retained, including Japanese attendance/invoice/View fields. Dates are serialized as ISO strings; operational date/month follows existing TimeTrip settings and Asia/Tokyo. Registration does not alter settings.

Monthly selection uses the already connected Firebase reader's monthly_selections, not the obsolete generic monthlySelections mapping. payment_status_views is the Firestore storage counterpart of the existing GAS View: its contents come from unchanged View functions. These port mappings are centralized in the Firebase DAO; the patch runs no migration.

Master field mapping follows existing schema/copy-field-glossary. schema:build regenerates the existing Attendance_Master_Schemas JSON for all required masters. The same mapper serves write facts and rank/progress reads. The separate P001 fee-display reader issue remains pending; invoice registration reads correctly restored fee amounts/types.

## Transaction and authorization

Read all Firestore facts first. Expose existing synchronous DAO methods over that snapshot and buffer writes. A failed canonical result or per-member Core error does not commit partial writes. Read/write the existing member-month View and group-month selection in the same transaction, giving concurrent batches shared conflict points without adding a guard collection.

Read both current-month charge facts and requested-date attendance scope. Queries fail above 500 records; input is bounded to 50 members and staged writes to 450 documents. Optimization/larger-scale handling is deferred.

Authorize every item before attendance DAO access: linked members may write only themselves; linked teachers must match teacher_id; admin retains administration access. Canonical business validates active members, accepting teacher, location/block and slots. Unrelated read authorization is unchanged.

GAS transport/source stays unchanged. Firebase sends authenticated JSON and then rereads member_attendance_state, including billing/progress/rank.

## Verification and limitations

```powershell
npm run schema:build
npm run target:build -- dev-gas
npm run target:build -- dev-firebase
node work/verify-fw001.cjs
```

Historical initial verification: 131 tests PASS: full pipeline, retry, cancel/re-register, usage cap/payments, failure rollback, simulated concurrent retry, whole-batch authorization, page-script sending/readback and actual HTTP dispatch/method rejection. These use transaction/DOM doubles, not deployed Firebase.

The original TimeTrip fixture expected GET despite ZIP119 using batchGet. This failure was reproduced on untouched 119; only its fixture was corrected. TimeTrip Core/business was not changed.

Historical initial status (superseded by the current verified status above): Development Firestore read probe timed out at 30 seconds. No fixture or business writes were started. Real SDK roundtrip/contention, permissions/index requirements and deployed browser E2E remain unverified. No commit, push or deployment.

Opt-in authenticated development checks:

```powershell
node work/verify-fw001-firestore-real.cjs --confirm-development --probe
node work/verify-fw001-firestore-real.cjs --confirm-development
```

The second creates unique test fixtures in dojo-management-dev, tests registration/repeat/cancel, and cleans only its own documents. Offline verification never runs it.

## Separate follow-up tasks (outside FW-001 completion)

- Resolved for the scoped DEV candidate run: real Firestore roundtrip and authenticated candidate browser operations. General production release verification remains outside scope.
- P001/fee read values: billing-firestore returns English fee fields but billing-selection reads Japanese fields; investigate/fix separately. Registration calculations are verified with English physical fees.
- Preserve GAS semantics: empty-slot items skip usage-billing synchronization. Cancellation billing policy/group aggregation changes are outside this port.
- Optimize bounded master/scope reads and measure real contention. No additional conflict guard schema or new feature.
- Existing noncanonical month-selection or conflicting identities are rejected, never silently duplicated/overwritten. Audit populated data before rollout.
