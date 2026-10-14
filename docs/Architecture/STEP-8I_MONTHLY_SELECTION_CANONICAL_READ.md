# Step 8I: MonthlySelection canonical read and legacy detection

- Read `monthly_selections/{monthlySelectionDocumentId(billing_group_id,target_month)}` using existing Firestore Core `readById`.
- Also query by `billing_group_id` and `target_month` with limit 2 to detect old auto-ID documents and duplicates.
- No rows in either path means unselected. Any legacy-only row, duplicate, or disagreement fails closed; no migration or write is performed.
- This assumes the query API returns all matches up to its limit and documents are stored with the expected fields. An operational audit is still required before relying on the absence of legacy records; concurrent changes between two reads are not atomic.
- This is an adapter only; WebConnect member state remains unconnected. GAS, QR target and registration are unchanged.
