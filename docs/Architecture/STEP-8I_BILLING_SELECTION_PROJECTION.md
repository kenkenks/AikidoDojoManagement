# Step 8I — Billing selection projection (bounded)

This change extracts the read-only GAS `attendance_getBillingSelectionState_` response contract into an injectable Cloud Run-compatible function. The dependencies are deliberately injected, rather than inventing a Firestore collection for monthly selections. Schema files define `fees` and `plan_selection_rules`, but the monthly-selection Firestore schema/adapter must be verified before wiring.

`readMonthlySelection(groupId, targetMonth)` must return **null only after a successful lookup found no record**; on unavailable data or failed reads it must throw. `readFees()` and `readPlanSelectionRules()` must return complete arrays (no truncated pages). The caller supplies `targetMonth()` with the business month semantics of GAS `sup_targetMonth(ctx)`; this must not silently use the browser clock. Missing/inactive selected plans fail closed rather than fabricating a zero-cost plan.

Not connected to WebConnect or HTTP. No changes to GAS, QR URLs, attendance writes or authentication. Before deployment: establish canonical Firestore storage and schema mapping for monthly selection; verify complete master reads and GAS equivalence against real data.
