# Step 8E — UID lifecycle and uniqueness policy (not yet wired)

## Scope

This patch adds a **server-only, dependency-injected lifecycle policy**. No HTTP route, GAS change, Firebase deployment, Firestore write, or permission widening occurs. It builds on the Step 8C/8D read-only modules. The 116 ZIP plus previously applied steps remain the baseline.

## Identity and uniqueness

A UID record (`dojo_auth_accounts/{uid}`) and an authoritative reverse index (`dojo_auth_identity_index/{type}:{id}`) must be created atomically. The policy accepts exactly one role per newly provisioned UID (`member` or `teacher`). Both keys must be absent at enrollment; disabled keys remain reserved and are **not** automatically reusable. Disabling updates both documents atomically; mismatches fail closed. A multi-role identity or reassignment needs a separately reviewed migration policy.

## Integration gate — NOT production-ready

`createDojoAccountLifecycle(repository)` requires `repository.transaction(fn)` and transaction methods `getUid`, `getIdentity`, `createUid`, `createIdentity`, `setUid`, `setIdentity`. The in-memory test adapter demonstrates contract behavior **only**. The existing Firestore core `append` / `updateByKey` cannot guarantee cross-document atomicity; do **not** emulate a transaction by sequential writes. A real Firestore transactional adapter with optimistic conflict checks, IAM protection, and failure/retry tests is required before provisioning accounts. Only a trusted admin maintenance workflow may call the lifecycle policy after verifying authorization; never expose it to QR clients.

Existing Step 8D lookup does not consult the reverse index; consistency and role assignment must be established by the future atomic writer. For existing UID documents, a separate migration and reconciliation process is needed. This module does not enable member attendance or change `/api/webconnect`.

Run `node work/verify-attendance-step8e-lifecycle.cjs`.
