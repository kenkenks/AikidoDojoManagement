# Step 8I — member_attendance_state business composition (pre-wiring)

GAS `gas/04_Attendance.js#getMemberAttendanceState` combines: active member, validated scope, saved attendance, `attendanceProgress_getMemberSummary`, and `attendance_getBillingSelectionState_` (monthly selection / fee rules).

This patch extracts the Firestore-side **composition boundary** only. It intentionally does **not** connect `member_attendance_state` to WebConnect or the browser: the Firestore progress and billing readers are not yet available and returning default zero counts or a fabricated fee plan would corrupt business meaning. `readProgress`, `readBillingSelection`, and `validateScope` are required injectable business services, not optional placeholders. Missing or malformed business results fail closed.

Next: inspect and port the underlying attendance progress and monthly billing selection read models, test parity with GAS fixtures, then wire this reader to the existing Dispatcher with UID↔member_id authorization. No GAS edits, new endpoint, QR URL switch, or attendance writes in this step.
