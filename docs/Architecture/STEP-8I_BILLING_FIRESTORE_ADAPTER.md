# Step 8I: monthly billing Firestore read adapter

- Uses existing Firestore Core `queryEqual` and `readPage`; no HTTP endpoint, GAS or QR changes.
- `fees` and `plan_selection_rules` are backed by `schema/Fee.yml` and `schema/PlanSelectionRule.yml`.
- **Unresolved:** ZIP116 contains no MonthlySelection.yml Firestore mapping. Caller MUST explicitly pass `monthlySelectionCollection` after verifying the deployed storage contract. The example collection name in tests is a fixture, **not** a production schema declaration.
- Monthly lookup is scoped to `billing_group_id` and `target_month` and refuses duplicates, invalid state, or read failure. Master reads refuse truncation and cyclic pagination.
- This is an adapter only, not yet wired to `member_attendance_state` or Cloud Run. No production Firestore connection has been tested.
