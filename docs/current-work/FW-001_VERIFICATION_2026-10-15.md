# FW-001 verification — 2026-10-15

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


Baseline HEAD: `42ff6a9`. Workflow: ARCH-022.

## Historical EPERM verification record (retained)

The following sections describe the earlier direct-SDK verification and its commit proposal. They are historical; the current candidate result and cleanup contract above/below supersede their scope and totals.

## Change reviewed

- `work/fw001-firestore-safety.cjs`: preserve `.next` write/fsync/close and atomic rename; retry only rename EPERM, with 20 ms waits, a 200 ms retry deadline and at most 10 retries. Propagate persistent failures without deleting the original journal or switching to direct overwrite.
- `work/verify-fw001-firestore-safety.test.cjs`: three added tests cover transient EPERM recovery, persistent EPERM preserving both files and preventing remote dispatch, and immediate propagation of non-EPERM errors.
- Code diff: 46 insertions, 1 deletion across two files. No business, target, authentication, build or deployment changes. `git diff --check` passed.

## Executed verification

- `node work/verify-fw001.cjs`: 164 tests, 164 PASS, 0 FAIL, exit 0. This includes the previous 161 tests and three added tests. No real Firestore access.
- Escalated DEV probe: `probe_passed`, exit 0, errors empty.
- Escalated `node work/verify-fw001-firestore-real.cjs --confirm-development`: registration, repeat submission and cancellation assertions passed; status `passed`, exit 0, `lateWritesPossible: false`, errors empty.
- Target: `dojo-management-dev`, database `(default)`.
- Run: `FW001TEST_d649eb5b408444d4b0959778d1ffec52`.
- Automatic cleanup: all 10 journaled documents `deleted_verified` at 2026-10-15 14:38:01 JST.
- Separate `--inspect` for this run: exit 0, all 10 documents `absent`, errors empty, at 2026-10-15 14:38:14 JST. Manual recovery was unnecessary.
- The four pre-existing journals had identical SHA-256 hashes before and after execution. Only the new run journal was created/updated. No commit or deployment performed.

## Git inclusion review

`work/fw001-firestore-runs/` has no tracked files and is excluded by `/work/fw001-firestore-runs/` in `.gitignore`. `git check-ignore -v` confirmed exclusion of all five existing journals. Their SHA-256 hashes remained unchanged during this Git housekeeping step. Do not force-add journals or `.next` files.

Proposed commit scope: `.gitignore`, the two code/test files above and this verification record (four files total). Stage explicit paths only, and verify the staged file list before committing. No files were staged during this review.

Proposed commit message: `fix: retry transient EPERM when saving FW-001 journals`.

## Limits

Persistent permission failures still stop saving; the retry is not a permission bypass. Failures after remote dispatch, process/power loss and late server commits can still require journal-based recovery. Absence is established at the recorded inspection time. This verification does not include deployment or deployed-browser E2E.

## Current cleanup safety contract

The shared inspectOrCleanup implementation checks every journaled path before the first delete: allowed identity, attempted/noncollision entry, existence, ownership and updateTime for present documents. Any preflight failure blocks all deletes. Already absent paths are permitted so a partial cleanup can be inspected safely; the completed live run separately required all ten present before recovery.

Each deletion re-reads ownership and supplies lastUpdateTime from that snapshot. The first failed/uncertain delete, ownership mismatch, changed version, read failure or still-present result stops subsequent deletes in that round. States distinguish deleted_verified, absent, unknown_or_failed, owner_mismatch_not_deleted, still_present and not_processed; preflight_failed blocks dispatch. Uncertain outcomes never count as success. Journal-save failure also prevents subsequent deletes by propagating the error.

Candidate recover returns cleanup_incomplete on an incomplete round; it does not automatically repeat failed deletions. Successful rounds retain waiting, dedicated-scope rediscovery and final absence verification; reappearance or failed verification cannot become PASS. A finite observation window cannot prove that no arbitrarily late commit will ever occur. Additional recovery after an error requires separate approval.

The latest offline suite includes normal ten-document cleanup, all-owner preflight, first-delete failure, partial cleanup followed by update conflict or lost response, bounded communication failures, and reappearance tests: 186/186 PASS.
