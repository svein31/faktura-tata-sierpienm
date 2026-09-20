# Expansion plan: eight approved stages

Preserve existing functions and purchase invoice immutability. Do not expand payments/banking. Updated release instruction: keep all further work for stages 1–8 on `codex/full-expansion-1-8`. Intermediate commits are checkpoints only. Do not update main until all eight stages are complete and the complete package passes verification. Previously published stage 1a remains on main.

| Stage | State | Remaining work |
| --- | --- | --- |
| 1. Warehouse | In progress: read-only UI shipped; transactional engine slice implemented | Company-member write authorization, scoped warehouse creation, idempotency keys, write UI, stocktaking UI and valuation rules |
| 2. Cost workflow | Planned | Assignees, comments, multi-stage approval, notifications; no editing original purchase invoices |
| 3. Accountant workspace | Planned | Shared checklist, missing-document tracking, close/reopen periods with enforcement across every write path |
| 4. OCR | Basic manual-review inbox already shipped | Structured field/line extraction, confidence backed by actual provider data, job processing and storage |
| 5. Profitability | Planned | Link costs, materials and tracked time to projects; keep currencies separate |
| 6. PDF templates | Planned | Versioned layouts and immutable issued-document rendering |
| 7. Performance/mobile | Partially shipped in earlier read APIs | Replace full-list consumers safely with server pagination/aggregates; browser-tested mobile improvements |
| 8. Reliability | CI/API tests already shipped | Browser E2E, durable queues, error monitoring, backup configuration and isolated restore drill |

## Stage 1a — transactional warehouse engine

- `applyStockDocument` and `cancelStockDocument` now use MongoDB transactions. Document, inventory, movements, notification and audit writes commit together; no compensating writes overwrite a concurrent operation.
- Explicit transaction-client injection into helpers; MM's two documents share one transaction.
- Warehouse `operationKey` is an optional random serialization token. It needs no backfill and contains no business data. Concurrent mutations conflict at a database write, across processes; API conflicts remain retriable 409 responses. No automatic replay after an ambiguous response.
- Open/save/close stocktaking use transactions and the same lock. Regular movements/cancellations are blocked during an active stocktaking; adjustment documents and closure are atomic.
- Reject invalid numeric data/calendar dates, cross-company or inactive transfer targets and mismatched units/product references. API only permits negative stock on the literal boolean `true`.
- Integration runner exercises last-unit races, double cancellation, injected rollback/audit failure, both MM halves, simultaneous stocktaking opening/closure and freeze/unfreeze. It uses only the existing disposable replica-set URL, not production data.

### Still not solved by 1a

Existing write routes remain user-owned, not a complete shared-company write model. The automatic invoice/expense linkage helpers need their own idempotency/transaction boundary before being enabled. Cancellation valuation still follows historical behavior (current weighted price), not historical-cost reversal. Full warehouse UI, currency-aware valuation, strict reservation policy and warehouse metadata mutation authorization are subsequent slices, not claimed as complete here.

No production database export or access was performed. Production backup/restore setup and OCR integration will require the corresponding configured infrastructure; never extract or invent credentials.
