# FW-001 verification — 2026-10-15

Baseline HEAD: `42ff6a9`. Workflow: ARCH-022.

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
