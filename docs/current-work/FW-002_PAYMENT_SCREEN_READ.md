# FW-002 payment_screen_read — Firebase read contract

Baseline: Git `fe20b55`; DEV normal revision `00049-dur`. Local implementation only.

- Existing `/api/webconnect` GET action `payment_screen_read`; verified administrators only, before any fee Reader call.
- Response: GAS-compatible `{ok, summary, confirmed, posted}` using the canonical GAS projection functions.
- `summary` reuses `createReceptionSummaryReader()` unchanged. Its receipt day/dojo/block and migration/conflict checks remain in force.
- Evidence lists use target month (default: SystemContext) and payment method (default: PAYPAY). Do not add receipt day/dojo/block filters to these lists.
- Evidence target month comes from the referenced invoice. Missing references, identity conflicts, incomplete reads and invalid required data fail explicitly.
- The summary Reader and evidence reads share one Firestore read-only transaction. No GET write, repair, View refresh or state transition.

## Approved difference from GAS demo ordering

GAS demo returns evidence in source sheet order. Firebase instead sorts **requested_at descending, then evidence_id ascending** (locale-independent lexical comparison).
Timestamp seconds/nanoseconds and Date values are absolute instants. Zone-less `yyyy-MM-dd HH:mm:ss` / `yyyy/MM/dd HH:mm:ss` strings mean Asia/Tokyo; ISO strings with an explicit zone are normalized to an absolute instant. Timestamp nanoseconds remain significant for sorting.
Missing or invalid requested_at is an error. Never substitute confirmed_at, posted_at, document ID order, or current time. TimeTravel may reverse creation times; sorting still follows requested_at, not append order.
DTO field names and GAS formatting are retained: existing datetime strings remain strings; Timestamp values use the GAS Date formatting path. No sort metadata appears in the response.

## Limits and verification

The reused summary Reader retains its bounded source checks. Evidence acquisition is capped at 500 documents and fails at the cap; invoice/member references use bounded batch reads. No partial or guessed zero result is returned.
Offline tests compare the GAS DTO with the approved ordering change, classify CONFIRMED/POSTED, test independent receipt/target months, mixed timestamp types, ties, invalid dates, limits, missing references, authorization, HTTP GET-only routing and no writes.
Firestore data/index compatibility and authenticated DEV screen reads are not verified by these local tests. No UI, deployment or data migration is included.
