# FW-001 candidate test: supervised staged execution (B)

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


This test infrastructure uses a single local journal as its authoritative state. There is no loopback server or browser bridge. Browser execution is supervised by one operator, in one logged-in DEV tab. Business API/DAO/Cloud Run code is unchanged. Importing the helpers opens no connections and loads no Firebase SDK. Real fixture writes, candidate registration/cancellation and recovery require separate approval.

## Boundaries

- Project `dojo-management-dev`, database `(default)`, revision `dojo-time-travel-admin-00039-pex`, existing fixed candidate URL. A tag is mutable: recheck its revision before starting and before each browser operation. The helper does not independently attest live routing.
- Existing journals without candidate metadata retain the direct-SDK test behavior. Use a NEW journal for this run; do not alter old journals.
- All staged helper transitions acquire an exclusive `.lock` file and reload the latest journal. Stale caller objects are ignored. No automatic lock stealing: after process loss, preserve the lock/journal and investigate before further transitions. Do not call lower-level journal mutators or the old real-test CLI to advance a staged run.
- Existing atomic `.next`/fsync/rename saving is reused. Operation code is returned only after saving AND reopening the journal produces identical data. Failed saving/readback returns no code.

## Procedure for separately authorized runs (completed run recorded above)

The following are library calls to be made by the local operator with a validated DEV SDK instance. They are not a live CLI or an authorization to execute now.

1. Create a journal with existing `createJournal`, then `configure(journal,{date,month})`. Read date/month from existing DEV TimeTravel settings; do not change them. Preserve the new journal path.
2. Call `preflight(db,journal.file)`: dedicated master/selection/View paths and bounded attendance/invoice scopes must be empty.
3. Call `createFixtures(db,journal.file)`. This holds the same journal lock and reuses existing create-only fixture creation, send-before-intent protection, target checks and deadlines. It confirms all six successful creation receipts, existence and ownership. Failure stops the run. Do not create fixtures outside this stage.
4. Call `prepareOperation(db,journal.file,'register')`. It checks all six creation receipts/existence/ownership again, persists test ID, operation number, kind, fixed URL/revision, fixed synthetic input and SHA-256 hash, marks possible dispatch, and verifies disk readback. Only then does it return `{testId,number,inputHash,code}`. Preparation itself sends no HTTP request.
5. In the SAME logged-in DEV QR tab at `https://dojo-management-dev.web.app/qr/qr_generator.html?qr_candidate=1`, run the returned code exactly once. Never manually construct/edit a POST. Do not reload, duplicate tabs, reset the guard, edit input, or replay old code. The code validates page context and the input hash, marks the operation used in this tab before sending, and uses the existing `dojoApiClient.request`. Firebase ID Tokens remain inside that client. Its existing 401 refresh behavior is unchanged.
6. The code sends one registration operation, then performs a GET readback only after a matching successful response. A 15-second browser abort bounds the attempt; it does not prove remote cancellation. It emits only a whitelisted summary: test ID, operation number/kind/URL/hash, confirmed/unknown outcome, HTTP status and match flags. No token, exception, response body or personal data is emitted. Transfer only this summary to the local operator; never export HAR or authorization headers.
7. Call `confirmOperation(db,journal.file,summary)`. It checks the summary against the pending operation, persists the confirmed receipt, and independently rediscovers and verifies Firestore attendance, invoice, rank, View, and all master ownership facts. Only a verified stage unlocks the next operation. A bad/unknown report cannot advance the sequence.
8. Repeat steps 4–7 for `'repeat'`, then `'cancel'`. Cancellation uses the same fixed scope with empty slots. No code for a later stage may be generated before local verification completes.
9. Call `recover(db,journal.file)` after the sequence or a failure. The local state decides whether deletion is allowed; there is NO `confirmRemoteStopped` override.

## Uncertain outcome policy

Preparing an operation conservatively marks possible dispatch. If the code/report is lost or never run, do not regenerate or replay it. Unknown HTTP outcome, timeout, nonmatching success or non-200 registration status stops further registration/cancellation. An unknown operation cannot later be marked successful with a replacement report. The browser's tab guard is a convenience, not a security boundary across reloads/tabs.

If pending/unknown/possible-late-write state remains, `recover` permits only scope rediscovery and absence/presence reads, never deletion; even the existing low-level cleanup rejects this state. Repeated recovery remains read-only and keeps `remote_outcome_uncertain`. Waiting, browser abort/closure, process exit or temporary absence is not server-stop evidence. The minimal B implementation deliberately has no manual boolean or external-proof override. If reliable evidence cannot be obtained through this protocol, report residuals and seek a separately reviewed recovery plan.

Only an operator-transferred matching successful response from the generated code is accepted as normal-completion evidence. It is not a cryptographically signed receipt. If its POST succeeded but browser/local readback failed, stop further writes; ownership-checked cleanup remains possible because the POST completed. Failure after saving the receipt but before verification cannot unlock another stage.

## Discovery and cleanup

Reuse the existing six fixture collections plus attendances, invoices, monthly_selections and payment_status_views. Attendance queries use dedicated member and dedicated session independently; invoice queries use dedicated member and group independently. Each query is limited to 501, with more than 500 rejected. Selection/View IDs are deterministic.

Validate all discovered owners before admitting any new path. Server-generated attendance IDs must match embedded ID, member, teacher, dojo, billing block, slot, session, date and month. Invoice IDs/fields must match dedicated group/member/month/plan and UUID suffix. Unknown owners are retained and stop deletion. Cleanup rechecks ownership and uses snapshot updateTime on every delete.

For known-complete operations, recovery performs two cleanup/discovery rounds by default, with one-second gaps, then a final scope rediscovery and read-only inspection of all journaled paths. New IDs are inventoried, not just old paths. Delete/query failure or final reappearance never becomes PASS. Scope inventory is bounded but not a guarantee against writes outside the declared scopes or commits after the finite observation window.

## Offline verification and residual risks

`node --test work/verify-fw001-candidate-safety.test.cjs` runs generated browser code inside a VM, injected memory-only HTTP behavior, a memory DB and disposable local journals. It covers the normal staged sequence, save/readback failure, stale/concurrent handles and another-process lock attempt, duplicate/concurrent browser execution, edited input hash, unknown/lost/timed-out responses, report replay/mismatch, incomplete/colliding/unknown fixture creation, ownership change, delayed IDs, final reappearance and cleanup failure. It is part of `node work/verify-fw001.cjs`.

The previous 179-test result applies to the earlier injected-session design. This version replaces those 15 candidate tests with 20 staged-execution tests while retaining the original 164 FW-001 tests. Historical B implementation verification on 2026-10-15: staged suite 20/20 PASS; complete FW-001 suite 184/184 PASS, exit 0 (approved execution outside the sandbox for disposable-journal rename). `git diff --check` passed. No real Firestore/candidate calls were made during that historical offline test execution.

Residual risks accepted for B: single-operator procedure compliance, reports copied correctly and honestly, tab guard reset/reload, mutable tag routing, orphaned locks, filesystem/permission failure, concurrent external modifications and late/out-of-scope server writes. Browser integration has now been exercised against real Firebase Auth and the DEV candidate for this dedicated run; registration/repeat/cancel and cleanup passed. No credentials are generated, saved or exported. No real run, commit or deployment is authorized by this document.

## Current cleanup safety contract

The shared inspectOrCleanup implementation checks every journaled path before the first delete: allowed identity, attempted/noncollision entry, existence, ownership and updateTime for present documents. Any preflight failure blocks all deletes. Already absent paths are permitted so a partial cleanup can be inspected safely; the completed live run separately required all ten present before recovery.

Each deletion re-reads ownership and supplies lastUpdateTime from that snapshot. The first failed/uncertain delete, ownership mismatch, changed version, read failure or still-present result stops subsequent deletes in that round. States distinguish deleted_verified, absent, unknown_or_failed, owner_mismatch_not_deleted, still_present and not_processed; preflight_failed blocks dispatch. Uncertain outcomes never count as success. Journal-save failure also prevents subsequent deletes by propagating the error.

Candidate recover returns cleanup_incomplete on an incomplete round; it does not automatically repeat failed deletions. Successful rounds retain waiting, dedicated-scope rediscovery and final absence verification; reappearance or failed verification cannot become PASS. A finite observation window cannot prove that no arbitrarily late commit will ever occur. Additional recovery after an error requires separate approval.

The latest offline suite includes normal ten-document cleanup, all-owner preflight, first-delete failure, partial cleanup followed by update conflict or lost response, bounded communication failures, and reappearance tests: 186/186 PASS.
