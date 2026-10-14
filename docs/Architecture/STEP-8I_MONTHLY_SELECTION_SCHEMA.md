# Step 8I — monthly selection logical schema (proposed)

Source of truth in ZIP116: `DB_MonthlySelectionDTO` in `gas/03_BillingRecord.js`, persisted via logical DAO key `monthlySelections`, GAS sheet `04_月次選択`. Query path: `billingCoreGetMonthlySelection_` → `daoBillingFindMonthlySelection_`.

Added `schema/MonthlySelection.yml` mapping the seven existing DTO fields. Proposed Firestore collection `monthly_selections` is **a design decision, not proof that this collection exists or contains migrated data**. No new document ID or uniqueness semantics have been assumed. The read adapter already requires explicit `monthlySelectionCollection`; do not wire it to production until migration, query/index support, and data uniqueness are verified. The existing GAS flow, API, QR URL, and write lock remain unchanged.

Next: verify collection and migration contract against live Firestore, establish stable key / unique `(billing_group_id,target_month)` constraint for writes, then explicitly configure the adapter. Tests are static contract tests only, not Firestore integration tests.
