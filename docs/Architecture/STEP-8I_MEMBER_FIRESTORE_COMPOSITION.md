# Step 8I — Member state Firestore composition (read-only)

- `createFirestoreMemberAttendanceState(core, {getTargetMonth, validateScope, monthlySelectionCollection})` connects existing Member state, Progress and Billing readers to one Firestore Core.
- Explicit context injection is required; no guessed time-travel clock or dojo scope.
- Member record identity is checked against the requested document ID. Missing/invalid billing data and scope errors propagate; they are never turned into successful responses.
- This step does **not** connect `member_attendance_state` to WebConnect, alter the browser, or enable attendance writes. Server-side authorization must be added before exposing this function.
- `monthly_selections` is the proposed collection; real data migration, duplicates, actual Firestore E2E and legacy GAS parity are unverified.
