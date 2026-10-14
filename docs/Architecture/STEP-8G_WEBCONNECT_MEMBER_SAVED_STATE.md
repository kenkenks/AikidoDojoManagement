# Step 8G — Firebase member-scoped saved attendance read

Base: AikidoDojoManagement-main(116).zip plus applied Step 8C–8F.

- Reuse `/api/webconnect?action=attendance_saved_state` and existing `attendance.savedState` business reader.
- Admin retains existing permissions. A non-admin must present a verified Firebase ID token (revocation checked), have an enabled `dojo_auth_accounts/{uid}` mapping resolved server-side, and request exactly its mapped `member_id`.
- Other actions, including session masters and all writes, remain admin-only or unconnected.
- No QR URL switch, no GAS modifications, no provisioning route, no Firestore deployment.
- `dojo_auth_accounts` must be securely provisioned and Firestore service permissions configured before real use. Browser QR `member_id` is not proof of identity.
- Existing HTTP test fixture adds a mock for the newly injected resolver.

Tests: `node work/verify-attendance-step8g-webconnect.cjs`; `node work/verify-webconnect-http-step7c.cjs`; previous Step 8B–8F suites.

**Limitation:** The attendee flow is not complete. The browser has not been wired to authenticated WebConnect calls; session masters, rank options, attendance writes, and receipts remain pending. This change is a narrow, authorization-controlled read path only.
