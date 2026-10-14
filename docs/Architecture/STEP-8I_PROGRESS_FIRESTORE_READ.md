# Step 8I: Firestore read-only examination progress adapter

- `createFirestoreProgressReader(core)` uses existing `members`, `attendances`, `examination_standards`, and `ranks` collections as specified in logical schemas.
- Member-scoped `queryEqual` reads up to 500 attendance rows; exactly 500 is treated as incomplete and **fails closed**. A later paginated history reader is needed for larger histories.
- Masters use bounded `readPage` and fail closed on page-limit, repeated tokens, malformed data, or duplicate active rank mappings.
- Calls the existing pure `projectAttendanceProgress` business projection. No HTTP route, WebConnect permission, GAS file, write, or QR URL is changed.
- Real Firestore/Cloud Run E2E and parity with actual GAS dataset remain unverified. Caller must authorize the Firebase UID-to-member mapping before invoking.
