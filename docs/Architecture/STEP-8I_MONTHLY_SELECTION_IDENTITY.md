# Step 8I — MonthlySelection identity contract

## Source semantics
GAS `daoBillingFindMonthlySelection_` searches by `billing_group_id` and `target_month`. `billingMonthlyCollect` treats the same plan as an idempotent retry and rejects a different plan. Existing GAS append/find is not proof of concurrency-safe uniqueness.

## Proposed Firestore storage identity
Collection: `monthly_selections` (proposed, not confirmed deployed).
Document ID: `ms_` + base64url(ASCII billing_group_id) + `_` + `YYYY-MM`. This is deterministic and injective within the validated group ID domain. Validate document ID against record fields on reads/migrations.

## Uniqueness and migration constraints
A deterministic ID alone does NOT guarantee uniqueness if legacy documents use random IDs. Before activating reads/writes, audit existing records and migrate or reject conflicting duplicates. On writes use a Firestore transaction or create-only precondition at the canonical ID; same-plan retries must verify the existing record, different-plan attempts must fail. Do not overwrite on conflict. Define a migration rollback and idempotency test before production use.

## Current scope
Only key generation, validation, schema metadata, and unit tests. No Firestore writes, migration, WebConnect exposure, GAS changes, or QR URL change. Existing billing adapter continues to require explicit collection configuration.
