# Warehouse overview — 2026-09-19

This incremental release adds `/warehouse` and a read-only `/api/warehouse/overview` endpoint. It does not replace the existing stock engine or change stock quantities.

## Implemented

- Explicit company scope, checked against current membership on every request. All child records are selected through authorized warehouse IDs.
- Separate owner-only legacy archive for warehouses with null/missing companyId. No inferred assignment or business-data migration.
- Stock, document and movement views; search; warehouse filter; low-stock filter; per-item movement history.
- Keyset pages of 30, total matching record count, strict filter validation, no-store responses and no implicit warehouse creation on reads.
- Remount on company changes, immediate suppression of stale filtered rows, abortable requests, error/retry/empty states, mobile-friendly cards.
- Explicit DTOs omit internal ownership/source/target IDs. Historical records have no currency, so this release does not present valuations or add incompatible quantities across units.
- Unknown/missing warehouse roles no longer fall back to owner permissions.
- Unit tests plus HTTP integration checks with a real isolated MongoDB replica set cover company isolation, legacy ownership, paging, low-stock field comparisons, current membership and revocation.

## Not included / next work

The pre-existing write APIs and auto-document helpers remain in place. The subsequent stage 1a replaces stock engine compensation with database transactions and freezes regular movements during stocktaking (see `EXPANSION-PLAN.md`). Company-scoped write authorization and auto-document linkage still need further work before exposing additional write controls. This is not yet a complete WMS or remediation of every warehouse write path.

No warehouse reassignment UI is included: moving historical inventory requires validating source documents and catalog relationships first. No schema changes, production data migration, payments or banking changes are needed for this release. Browser E2E and production deployment are separate from build/API verification.
