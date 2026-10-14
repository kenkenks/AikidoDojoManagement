# Step 8I — Attendance progress business projection

- Source: `gas/04_AttendanceProgress.js`, `attendanceProgress_getMemberSummaries`.
- New `cloud/attendance/progress-summary.cjs` is a pure, testable calculation boundary. It accepts an already-scoped member, attendance rows, examination standard, and rank option. It does not access Firestore or expose HTTP routes.
- Attendance is counted by unique `稽古日|slot_id` after rank start date; missing slot uses `LEGACY_NO_SLOT`. Carried count is added, individual eligible training count overrides standards, and zero requirement is never exam-ready.
- **Pending**: identify/migrate examination standards master and rank option map, implement bounded DAO reads, verify date formats and GAS equivalence with real fixtures, connect to member-state composition and WebConnect only after all dependencies are available.
- No GAS changes, no API addition, no attendance writes, no QR URL switch.
