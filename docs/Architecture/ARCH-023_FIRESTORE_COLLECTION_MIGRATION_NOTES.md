# Firestore collection migration notes

Status: working notes (2026-10-13); not a claim of production deployment.

## Confirmed: Dojo primary-key repair (Step 8E)

- `dojos/HONBU` and `dojos/TENROKU`: `location_id` backfilled into document bodies.
- Follow-up dry-run returned `already_ok` for both and `writes: 0`.
- The shared copy renderer uses `includeDocumentIdField: true` for new copies.
- Existing documents are not rewritten by the append-only copy command. Use explicit, scoped repair with dry-run first.

## Schema transformation responsibilities

- Source GAS logical fields -> Firestore physical fields: `tableSchema()` resolves the portable YAML and `schema/copy-field-glossary.json`; `renderFirestoreDocuments()` projects records.
- Firestore physical fields -> logical DTO: `restoreFirestoreRecord()` already exists in `shared/Schema_Renderer_Firestore.js`. **Its existence does not prove that each DAO read path invokes it.** Verify the actual call path before changing runtime behavior.
- Existing-document key repair is a data migration. Per-read DTO projection is a schema-boundary transformation; keep their responsibilities separate while reusing the schema mapping.
- Do not introduce a second field-name dictionary. Do not infer Firestore document keys from display names.

## Other master collections

`Teacher`, `Fee`, `PlanSelectionRule`, `TrainingSlot`, `BillingBlock`, `Rank`, and `ExaminationStandard` are supported by the existing GAS -> Firestore copy tool. `Member` and `Setting` have separate handling and are not included in the master schema round-trip check.

Before a real copy or repair for any collection:

1. Verify the portable YAML, glossary mapping, and primary-key projection locally (`node --test work/verify-master-schema-roundtrip.cjs`).
2. Run the existing copy command in dry-run or preflight mode for the specific table. Preflight requires a working GAS build and Firestore credentials; it is read-only.
3. Review `planned_create` / `planned_skip` and any errors. Execute only after confirming the target project and intended records. Existing records are skipped by the append-only copy; use a separate scoped repair if their keys are absent.
4. Confirm real data and DAO consumer behavior separately; a schema round-trip test does not prove Firestore data migration or Cloud Run deployment.

Priority for attendance integration: `TrainingSlot` (`training_slots`) and `BillingBlock` (`billing_blocks`). Do not assume their Firestore records are already migrated without inspecting real preflight results.

## Step 8G: read-only attendance master inspection

`work/verify-attendance-firestore-masters.cjs --location-id HONBU` checks real Firestore
`dojos`, `billing_blocks`, and `training_slots` without writing. It validates
embedded keys against actual document-ID lookups, restores logical DTOs using
existing Schema definitions, and checks TrainingSlot -> BillingBlock references.
It does **not** deploy or modify DAO runtime behavior. Query results are bounded;
`at_limit` is flagged as incomplete. A missing embedded key in a query result
cannot be safely repaired without first identifying its actual document ID.

## Step 8H: document-ID diagnostics for missing embedded keys

`queryEqual` can opt into `{includeDocumentId:true}` to return `{id,fields}`
from the Firestore response document name. Default callers still receive fields only.
The attendance master inspector reports the real document ID for missing embedded
primary keys. This enables explicit-ID dry-run with `repair-firestore-primary-keys.cjs`.
No writes are performed by inspection; do not auto-repair or guess IDs.
