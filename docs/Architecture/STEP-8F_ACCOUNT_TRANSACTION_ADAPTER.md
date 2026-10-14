# Step 8F — Firestore transaction adapter (116 baseline)

## Scope

- `cloud/api/dojo-account-transaction.cjs` connects Step 8E lifecycle policy to the **server-side Firestore Admin SDK** `runTransaction` API.
- `dojo_auth_accounts/{uid}` and `dojo_auth_identity_keys/{type}:{id}` are created or disabled in one transaction. Existing reserved reverse identities are never automatically released.
- Reads happen before writes, matching Firestore transaction constraints. Create operations use `transaction.create`, rejecting concurrent pre-existing documents.
- The adapter accepts an injected Firestore instance. No new HTTP endpoint, IAM change, GAS modification, QR URL change, or production write is included.

## Security / operational gates

- This module is **not wired to WebConnect** and must not be exposed to unauthenticated clients. Provisioning requires a separate authenticated administrative workflow and authoritative validation of target Member/Teacher IDs.
- Cloud Run must use a server-side Firestore instance and appropriate IAM; do not bundle Admin SDK credentials into Hosting assets.
- The reverse-index collection name is new and must be reviewed with Firestore security rules and operational migration before production use.
- Tests use an in-memory transactional double; they do **not** prove real Firestore connectivity, contention behavior, permissions, or actual document creation.
- The existing Step 8D read lookup only consults UID documents; lifecycle writes remain inactive until explicitly integrated.

## Verify

`node work/verify-attendance-step8f-transaction.cjs`

Also rerun Step 8C, 8D and 8E tests.
