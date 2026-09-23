# Expansion plan: eight approved stages

Preserve existing functions and purchase invoice immutability. Dedicated payments/banking remain outside this scope. Stages 1–6 were merged in PR #4 on 22 September 2026; the subsequent verification and reliability package reached main after green CI. See `RELIABILITY.md` for operations, tests and deliberate limits.

| Stage | Implemented | Limits / operational action |
| --- | --- | --- |
| 1. Warehouse | Company-scoped commands/UI, transactional movements and stocktaking, immutable audit, idempotency, historical-value cancellation and reservation guards. | Legacy company-less inventory remains separate; incompatible historical movements require manual reconciliation. |
| 2. Cost workflow | Sequential approval, assignees, comments and in-app notifications; source purchase invoice immutable. | Policy enrollment is explicit, not automatic. |
| 3. Accountant workspace | Shared tasks, close/reopen guards and immutable currency-separated period snapshots. | Periods use document issue dates; accountants must reconcile actual tax periods. |
| 4. OCR | Private originals, structured proposals, manual review and durable leased jobs. | OCR.space requires its own configured API key; manual review works without it. |
| 5. Profitability | Company projects, source links, materials, labor and separate currency buckets. | Whole-source assignment; no percentage splits or conversion between currencies. |
| 6. PDF templates | Versioned layouts, frozen parties/templates, archived print revisions and repeatable bytes. | Legacy data predating snapshots cannot be reconstructed; standard-font Polish transliteration remains. |
| 7. Performance/mobile | Company-scoped server search and 30-row keyset pages on invoice list and command palette; touch-friendly invoice cards; dashboard and analytics now receive compact company-scoped server summaries. | Legacy accounting/forms still require full invoice bootstrap; overview still scans invoice lines inside the server process. |
| 8. Reliability | MongoDB/API and Chromium checks, durable OCR/webhook/KSeF workers, incident IDs, encrypted backup and isolated restore drill. | Hosting alert sink, off-host backup storage, secrets and production scheduling require operator setup; no production restore was performed. |

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
