# Remaining master Copy — ZIP96

Six additional master sources, schemas and a read-only-by-default batch.

## Safety / semantics
- Only development Firestore `dojo-management-dev`; append-only (no overwrite).
- PlanSelectionRule ID: URI-encoded `member_type~selectable_plan_id`; ExaminationStandard ID: URI-encoded `現在級段位~次回審査級段位`. Validate uniqueness in dry-run.
- TrainingSlot start/end are `HH:mm` in the spreadsheet timezone; **not** Firestore timestamps. Verify against application consumers before switching DAO reads.
- Optional empty numeric values are omitted using existing bridge. Unknown source columns fail closed.
- This does not connect existing attendance/billing APIs to Firestore.

## Commands
1. `npm run target:build -- dev-gas`
2. `npm run target:push -- dev-gas`
3. `node work/verify-remaining-master-schemas.cjs`
4. `node work/command-batch.cjs --file work/batch/remaining-masters.json` (read-only preflight)
5. Only after reviewing results: `node work/gas2firebase-copy.cjs --table Fee --execute --confirm dojo-management-dev --limit 1`
6. Verify the one document and repeat for each table before full batch execution.

No automatic production writes. Check Firestore collection names against DAO integration before enabling app reads.
