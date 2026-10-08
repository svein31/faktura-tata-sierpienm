# KSeF and automatic email worker

The Netlify schedule runs once per minute and calls `POST /api/ksef/queue/process`
with a 25 second HTTP timeout. The endpoint uses a 20 second work budget:

* Status reconciliation can use the first 4 seconds, up to 3 candidates.
* Transmission/status tasks stop starting jobs with less than 1 second left
  before the 14 second boundary, up to 10 oldest queued candidates.
* The last 6 seconds are reserved for automatic email, up to 3 ready candidates.
  Earlier completion of KSeF work makes more time available to email.

Every MF request and authentication polling wait shares the phase deadline.
MF requests also have a 5 second per-request timeout in the worker. Existing
interactive routes retain their ordinary provider timeouts. Valid MF sessions
are reused only for the same actor, seller NIP and MF environment, with at least
one minute of validity remaining. This avoids repeating authentication for
every invoice.

Stale KSeF and SMTP leases are recovered before external requests. Ambiguous
transmission or email delivery becomes `verify_needed`, never a blind retry.
PDF preparation stops waiting at the deadline and cannot send an email later.
SMTP cancellation closes the connection and records an uncertain result if the
provider boundary was already crossed. New accounts must verify their email
before automatic messages are sent to customers.

The budget bounds provider waits and starting new work; it is not a guarantee
that a stalled database, cold platform instance or CPU-bound operation finishes
within 20 seconds. Monitor actual duration and backlog rather than assuming
the configured candidate limits equal throughput. A new KSeF invoice ordinarily
requires a send action plus later status/UPO checks; 10 candidates per run is
not a guarantee of 10 completed invoices per minute. Interactive status reads
can also process accepted automatic emails, independently of cron retries.

## Operator backlog probe

`GET /api/ops/queue-health` requires `Authorization: Bearer <CRON_SECRET>` (or
`KSEF_QUEUE_SECRET` when the primary variable is unset). It is never cached and
returns global aggregate counts and dates without invoice IDs, XML, emails or
customer data. Counts include all accounts, not the last 50 tasks shown in the
application. Ready email counts exclude demo documents, future retries and
documents with missing UPO; the sender additionally validates that UPO belongs
to the invoice before sending.

```sh
curl --fail --silent --show-error \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/ops/queue-health"
```

`ksef.oldestDueAgeSeconds` measures delay since `nextAttemptAt`, falling back to
task creation. `email.oldestDueAgeSeconds` uses the scheduled retry time and
otherwise the invoice's last update; it is an operational estimate, since old
outbox records have no separate enqueue timestamp. A missing due item returns
`oldestDueAt: null` and age 0. Historical failed counts are cumulative and must
not be treated as a fresh failure counter.

The schedule logs only counts, elapsed time, configured budget, budget exhaustion
and deferred candidates. Operator monitoring should alert on growing due age,
expired leases, unresolved `verify_needed`, dispatch being paused and missing
successful runs in platform logs. Install additive indexes through
`npm run db:migrate -- up` before deployment; migration 021 preserves records
when repeated or rolled back.

## Verification

`node --test scripts/tests/queue.test.cjs scripts/tests/queue-budget-health.test.cjs scripts/tests/email-delivery-safety.test.cjs`
tests slow MF calls, exhausted budgets, reserved SMTP time, provider cancellation
and authenticated monitoring. `checkQueueHealth(db)` in
`scripts/queue-health-regression.mjs` checks real MongoDB aggregates across two
accounts and more than 50 queued tasks. The automatic email integration hook
checks expired preparation/provider deadlines, verified-sender gating and
fenced concurrent attempts against an isolated replica set with fake providers.

Use staging load tests and platform logs to measure completed invoice actions,
oldest due age, p95/p99 worker duration and provider errors. If backlog still
grows under expected traffic, a persistent worker or more frequent authorized
dispatch is an infrastructure change; deploy and measure it separately from
these application safeguards.
