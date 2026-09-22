# Verification and operations

`npm run verify` builds the app, checks TypeScript and lint, runs regression tests, then isolated MongoDB HTTP, warehouse concurrency, OCR lease recovery, backup/restore and Chromium browser tests. Install Chromium with `npx playwright install --with-deps chromium`. These checks never use an inherited production DATABASE_URL; all integration fixtures use a disposable replica set.

Browser checks exercise invoice paging/search and route transitions, creating a project and logging time, publishing a PDF template, and desktop/mobile rendering of the warehouse, cost review, accountant and document workspaces. API tests separately cover permissions, concurrent writes, period closing, OCR retries, immutable PDF versions and purchase document immutability. This is automated regression coverage, not a claim that every possible user action was tested.

## Queues and errors

Existing durable KSeF, OCR, webhook and reminder queues remain authoritative. Netlify now schedules the KSeF worker every minute, alongside the existing other workers. Configure HTTPS APP_URL and CRON_SECRET. An uncertain KSeF result remains `verify_needed`; do not resend it without reconciliation. On other hosts, schedule POST /api/ksef/queue/process with the configured bearer secret. Inspect company queue health in the integration panel.

Unexpected API exceptions emit JSON stderr events containing `application_error`, timestamp, incident and stack fingerprint; raw exceptions, financial payloads and credentials are excluded. HTTP 500 responses include the incident reference. Configure the hosting log sink to alert on these events and cron failures; no paid monitoring provider or outbound notifications are enabled by code alone. The application error boundary provides a retry action.

## Encrypted backup and isolated restore

Use a replica set and a read-capable backup identity. Store BACKUP_DATABASE_URL and BACKUP_KEY (64 hex characters, separately backed up) in an operator-owned secret file, never in Git. `node scripts/backup/run.mjs create /secure/path/name.enc` uses a consistent MongoDB snapshot transaction, BSON-preserving canonical EJSON, gzip and authenticated AES-256-GCM. Collection options and indexes are archived; unsupported views/capped/time-series collections abort. Schema changes and snapshot/transaction limits abort the run instead of publishing a partial archive. For large databases exceeding the transaction lifetime, use managed MongoDB snapshots/PITR instead of increasing limits blindly. The archive is published atomically without overwriting existing files.

Restore: set RESTORE_DATABASE_URL to a **new empty isolated database**, then run `node scripts/backup/run.mjs restore /secure/path/name.enc exact_database_name`. Integrity and record counts are validated before connecting to the restore target. No existing data is dropped. Interrupted restores leave a partial target; inspect and choose a new database for a retry. Test in an isolated network because restored sessions, integration secrets and pending jobs are live data. Do not run application workers against the restored copy. Preserve the MFA and webhook encryption keys separately.

`deploy/backup/fakturo-backup.service` and `.timer` provide an optional daily systemd schedule. Provision a dedicated fakturo-backup user, /opt/fakturo runtime, /etc/fakturo/backup.env (0600) and /var/lib/fakturo-backups (0700, owned by that user). Adjust the node path to the deployment runtime. Enable only after a manual backup and isolated restore succeed. Monitor the unit exit code and archive freshness. Copy encrypted backups to independently protected off-host storage; choose retention with the operator. The repository does not invent storage credentials, delete old backups, enable the production schedule or claim production backups are active.

The automated drill checks exact BSON values and indexes, empty collections, wrong keys, damaged files and refusal to overwrite nonempty targets. It uses synthetic data only.

## Invoice list

The invoice screen and command palette query /api/invoices/search with company scope, literal search, server filters, totals and 30-row keyset pages. Page selections reset on filter/company/page changes. A lightweight /api/data?invoiceMode=list omits invoice bodies for that screen; existing accounting/report/form consumers still request the complete dataset so they cannot silently calculate totals from one page. This preserves their behavior; migration of those legacy consumers to server aggregates remains a separate performance limitation. New indexes are migration 012-invoice-search, reversible without deleting documents.

Warehouse cancellation reverses historical movement value and rejects impossible negative/reserved states. It never silently substitutes today's average purchase price. Later movements may need resolving before a historical receipt can be cancelled.
