# Invoice workflow UX — 2026-10-19

Invoice details now show one consistent KSeF flow instead of two competing panels.
A saved document, a queued transmission and an accepted invoice are distinct;
a transport reference never stands in for a KSeF number. The editor keeps its
main actions available, and the invoice list remembers the user's working view.

## Changes

- KSeF: readable steps (saved, queued, sent, accepted, UPO), actual rejection
  messages, clear guidance when a transmission result needs verification, and
  explicit demo/test labels. Uncertain legacy acceptance also hides repeat-send actions. UPO download is offered only when available. The
  duplicate transmission card, including its inferred acceptance date, is removed.
- Older rejected invoices: preserve typed processing metadata even without a
  KSeF number/reference; do not invent a send time. If the explanation exists
  only in the queue, authorized invoice detail reads select the latest task's
  status/error/environment. They expose no queue payload, credential or lease.
  This additional query is restricted to rejected details without metadata;
  normal list/bootstrap reads do not fetch queues.
- Legacy environment defaults stay compatible for existing transport consumers.
  An explicit read flag distinguishes a recorded environment from a default,
  so presentation never describes an unknown historic environment as demo.
- Editor: one fixed, responsive action bar for draft save, invoice save and KSeF
  submission, with the current gross total. It leaves space for the phone's
  navigation and safe area and reserves its own height in the editor. Resizing
  measures through requestAnimationFrame with unchanged-height checks, avoiding
  ancestor writes during ResizeObserver delivery in WebKit.
- Invoice list: session view memory is scoped to user and company, with a separate
  unassigned scope. Search, document/payment/approval/currency filters, date order
  and desktop row density restore on return/reload. Stored values are validated;
  blocked/malformed storage falls back to normal controls. Existing named server
  views remain available and can also include sort/density.
- Sorting: both newest-first and oldest-first are applied in Mongo before the
  30-row page limit, with the corresponding ID tie-break and cursor comparison.
  Descending remains the default. KSeF filters are independent of payment status,
  so a paid accepted document still matches the accepted filter.
- Errors: accessible inline messages cover numbering, buyer data, dates, correction
  reason, line names/quantities/prices and exchange-rate fields. The summary links
  to the visible control and opens containing details where needed. Backend field
  errors use the same mapping. Failed writes keep values and offer clear retry
  guidance; changing one line field does not clear another line's error.

The existing validation and transmission fences remain in place. No KSeF dispatch,
PDF generation, payment mutation or onboarding behavior is added or bypassed.

## Onboarding check (requested item 5)

Already implemented and deliberately unchanged:

- `src/components/ui/onboarding-banner.tsx`: “Twój pierwszy dokument, krok po
  kroku”, company data, first draft/buyer/items, preview, dismissible per company.
- `src/components/onboarding/onboarding-tour.tsx`: “Pierwsze kroki”, five guide
  steps, skip/close and actions opening the appropriate screens.

## Verification

- Build, TypeScript, ESLint and diff checks passed.
- 655 unit tests passed, none failed, including presentation/legacy DTO/view
  validation/sort regressions and the existing invoice integrity suite.
- Chromium and WebKit real application checks cover complete ascending/descending
  cursor traversal (including equal dates), company cursor isolation, KSeF filters,
  an authenticated unrelated-account read denial, ten document states, actual
  error metadata and queue fallback, persistence across navigation/reload/company
  changes, real compact row height, pinned actions at 390/1280/1440/1920 px and three
  scroll positions, local/backend field errors, preserved values and a successful
  retry without duplicate creation. No actual provider is called.
- The earlier motion regression is also exercised on the updated editor/list.
- Evidence: `/workspace/artifacts/invoice-ux-20261019/`.

Reproduce the workflow checks after `npm run build`:

```sh
UI_AUDIT_SUITE=invoice-ux node scripts/audit/ui-motion-isolated.mjs
UI_AUDIT_SUITE=invoice-ux MOTION_ENGINE=webkit node scripts/audit/ui-motion-isolated.mjs
```

Use configured browser/Mongo executable variables where required. The runner creates
its own disposable loopback database, blocks external providers, and never uses a
production target or the shell's DATABASE_URL.

Hosted GitHub Actions currently cannot start because of account billing/spending
limits; local verification and production verification are recorded separately.
