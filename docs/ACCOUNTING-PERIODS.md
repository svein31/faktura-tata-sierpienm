# Accounting periods

Company periods use document **issue date** (stocktaking uses count date). This is an application write lock, not a tax filing or an automatic VAT-period determination. Unassigned historical documents remain outside company periods.

Owners and accountants with current export permission can close a month. Only its owner can reopen it. Both operations require a reason and the current version. The period row is a database mutex: closing, readiness checks, event creation and audit share one MongoDB transaction. Financial writers update the same row in their own transaction. A conflicting transaction returns 409; it is not silently replayed. A date/company change must lock both old and new periods, and document CAS prevents using a stale period assignment.

Closing is blocked by invoice drafts, unresolved KSeF transmission/rejection, unapproved purchase invoices, unverified expenses, unfinished shared tasks and open stocktakings. Unconverted inbox files are explicitly outside the financial register; users must verify completeness. Later conversion into a closed month requires reopening. Proformas and cancelled invoices are excluded from financial snapshots. KSeF expense counterparts are deduplicated by reference, matching the existing monthly export. Currencies are never summed together.

Each close/reopen creates an append-only event with the actor, reason, version and per-currency summary at that moment. Reopening does not change previous events. Current balances are not substituted for historical snapshots.

At closing, historical invoices with a missing/empty `documentStatus` receive an explicit classification matching their existing generic status (draft/cancelled/issued), with a version increment in the same transaction. No amounts or source lines change. This prevents legacy payment code that updates generic `status` from reintroducing a cancelled document into a closed register. If closing fails, this normalization is rolled back too.

| Write path | Closed-period behavior |
| --- | --- |
| Invoice creation, update and draft deletion | Transaction guard; edits lock old and new dates |
| Manual expenses, financial classification and verification | Guard plus updatedAt CAS; old/new dates checked |
| Inbox approval into an expense | Conversion and period guard in one transaction |
| Offer/order conversion, recurring invoices, advance/final invoices | New invoice's period checked in the issuing transaction |
| Incoming KSeF import | Invoice creation and import reservation linkage share the guarded transaction |
| Legacy purchase approval, multi-step approval/rejection/reopening | Guarded; source amounts remain immutable |
| Shared monthly tasks | Guarded; personal legacy checklist is independent |
| KSeF enqueue and new transmission | Guarded claim; invoice version is frozen for dispatch |
| KSeF status reconciliation | Existing transmissions can finish; unresolved transmission prevents closing |
| WMS document issue/cancellation and stocktaking mutations | Guarded using document/count date, including paired transfer reversal |
| Payment status, email delivery status, reminder/recurrence configuration | Existing operational metadata behavior retained; no expansion of payments |
| Cost-review comments | Nonfinancial history can be appended without reopening |

The API is `/api/accountant/period`; the panel is on the existing accountant page. Read endpoints do not create period records. History uses company-scoped keyset pagination. Tests exercise disposable MongoDB only; no production period has been closed and no live KSeF call is made.

Production release remains held for the complete eight-stage package and browser verification.

Deployment preparation: migration `008-company-workflows` adds query indexes for command receipts, cost reviews and accounting periods/history. It does not reassign or backfill old documents. Rollback removes only indexes created by this migration and preserves all period states, events and receipts. Run it as part of the final deployment procedure; it has not been run against production.
