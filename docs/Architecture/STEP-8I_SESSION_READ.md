# Step 8I — Firebase attendance session read (partial)

116 ZIP + Step 8C–8H patches. This step connects **attendance_session_info only** to existing WebConnect GET and Firestore session masters. No new endpoint, DAO, or GAS change.

- A verified, server-resolved **member** principal may request session labels and slots for a specified location. Teacher-only, unlinked, and unauthenticated identities remain forbidden.
- Non-admin requests cannot supply `at` (arbitrary historical/future clock). Admin behavior remains unchanged.
- No member roster, attendance state for others, rank options, or write access is exposed.
- Firebase UI still disables submission; QR destination remains unchanged.
- Location access is currently not constrained to a member-specific dojo: session schedule data should be considered accessible to any linked member. If location-specific privacy is required, add a server-owned membership/location binding before deployment.
- `member_attendance_state` and `attendance_rank_options` remain unavailable; this is not a completed Step 8I or E2E.
- Tests are local/mocked, not a deployed Cloud Run or live Firestore check.
