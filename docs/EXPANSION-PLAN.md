# Expansion plan: eight approved stages

Preserve existing functions and purchase invoice immutability. Do not expand payments/banking. Updated release instruction: keep all further work for stages 1–8 on `codex/full-expansion-1-8`. Intermediate commits are checkpoints only. Do not update main until all eight stages are complete and the complete package passes verification. Previously published stage 1a remains on main.

| Stage | State | Remaining work |
| --- | --- | --- |
| 1. Warehouse | Branch: company commands/UI, actor audit, idempotency, stocktaking UI; CI passed for c36ad88 | Browser E2E, history/valuation review and remaining legacy route audit |
| 2. Cost workflow | Branch: sequential review policy, assignees, comments, in-app notifications, CAS decisions and immutable source guards; CI passed for a187614 | Browser E2E; automatic policy enrollment is not enabled |
| 3. Accountant workspace | Branch: shared tasks, missing documents, transactional period guards; closing/reopening API, UI and immutable snapshots added | Full close/reopen integration run and browser E2E |
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

## Stage 2 scope

`/cost-reviews` is an explicit opt-in approval workflow for existing purchase invoices and company expenses. Owner-configured 1–5 distinct assignees are snapshotted per review. Each assignee needs current company export permission; only the current assignee can approve/reject. A final approval updates the existing accounting status in the same transaction. Owners can reopen with a mandatory reason and the latest policy. Rejected/approved histories and comments remain append-only events. No email is sent by this feature; notifications use the existing in-app bell.

Enrolled expenses cannot be overwritten/deleted; old status changes and the invoice bulk approval route cannot bypass reviews. The existing legacy single-step approval flow remains available for documents not enrolled. No financial amounts, invoice lines, payment fields or originals are changed by review decisions. Stage 3 period locks will also need to cover decisions/reopening before final release.

## Shared accountant workspace

The existing accountant page now contains a company/month-specific shared task list for users with current export permissions, separate from the earlier personal checklist. It supports missing documents, completion, assignment and notes. Updates use optimistic version checks and atomic audit/notification writes. It does not claim to close the accounting period.

Shared workspace CI passed at `acab92d`. The next checkpoint adds a transactional company/month guard for invoice CRUD, manual expense CRUD, document inbox conversion, offer/order conversion, settlements, recurrence, incoming KSeF import, enqueue, approval decisions and shared monthly tasks. Expense mutations also compare `updatedAt` so a stale request cannot lock the wrong month after another request moved the document. KSeF incoming invoice and reservation linkage now commit together.

Period guard CI passed at `eab0278`, including actual MongoDB close/write contention. The following checkpoint adds a shared transactional KSeF transmission claim for direct and worker sends, queue/version serialization, in-flight invoice edit/delete protection, and warehouse issue/cancellation period guards. Network operations run outside the transaction; uncertain attempts remain blocked for reconciliation instead of being resent. Existing status polling is retained.

KSeF claim CI passed at `e23b4de` after isolating its test fixtures from the existing webhook-delivery test. The next checkpoint adds close/reopen readiness rules, API/UI, immutable per-currency snapshots, role/version checks, and open-stocktaking blockers. See `ACCOUNTING-PERIODS.md` for the reviewed write paths and operational metadata exceptions. No production periods were closed; integration tests use a disposable database and no live KSeF calls. Browser E2E remains part of the final release gate.
