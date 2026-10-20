# Invoice list productivity — 2026-10-20

## Delivered behavior

- **Previous/next preview.** Buttons and unmodified left/right arrows follow the
  list's current filters and database order. The panel stays mounted and retains
  keyboard focus; only its document content resets its scroll. Navigation crosses
  cursor page boundaries on demand using the existing authorized search endpoint.
  It does not change the underlying list's page, filters or scroll positions.
  The counter explicitly identifies document position within the current page.
  Input/select/menu controls, selected text and modified arrow shortcuts retain
  their normal behavior. No detail/PDF fetch is required.
- **Read recovery and isolation.** A failed next-page read retains the current
  document and offers retry. Access denial, original-row removal or a changed
  source query closes the preview. Closing/unmounting cancels pending reads;
  request generations and source-key checks reject late responses, including a
  rapid return to an earlier query. Other pages are read fresh at boundaries;
  there is no persistent invoice cache.
- **Column choices.** Counterparty, issue date, due date, gross value, payment,
  KSeF, currency and accounting approval can be toggled. Document identity and
  actions always remain available. Column-only preferences are stored locally,
  scoped to authenticated user and company (with a separate unassigned scope).
  Malformed/blocked storage falls back safely and still permits customization.
  Other-tab storage changes synchronize; named saved views can also store column
  choices without breaking earlier views. No additional preference API request
  is added to initial list loading.
- **Selection summary.** Shows document count, net, VAT and gross independently
  for each currency, for selected documents on the current list page. Persisted
  totals take precedence, including zero; missing totals use the existing line
  arithmetic. Negative corrections retain their signs. Duplicate/unknown IDs do
  not inflate totals. Drafts/proformas are explicitly counted in the summary.
  This is a sum of document values, not a currency conversion or sales/cost balance.
- **Pinned identity/actions.** The selection checkbox and document share an opaque
  left column; actions stay at the right edge while optional data columns scroll.
  Column headers also remain pinned vertically. Focus, selection and preview tint
  are preserved; targets remain clear of the native scrollbar gutter.

## Additional defects found during verification

- The workspace header crowded its title/company/account controls on narrow
  desktops. It now uses two rows below 1280 px and expands account details only
  when there is room. Search, company selection, help, theme and account access
  remain available.
- Notification polling now accepts cancellation, stops on component cleanup and
  page departure, resumes after a restored page, and avoids overlapping polls.
  A cancelled old response cannot replace current notifications or set a stale
  authentication error. The existing polling interval and notification rules
  are unchanged.
- Shared action-menu keyboard navigation brings the focused item into view in
  a scrolling menu. Column checkboxes keep their checked semantics and stay open
  after toggling, including Space activation.

## Verification

- Production build, TypeScript, ESLint and diff checks passed.
- 667 existing/new unit tests plus two dedicated notification-cancellation tests
  passed (669 total), as did the existing seven requested-fix checks.
- Chromium and WebKit application checks include nine invoice-workflow groups,
  eight previous frontend groups and nine productivity groups each. They cover
  both server orders, forward/reverse preview boundaries from different starting
  pages, read failures/retry, non-JSON denial, late responses after closing,
  stable modal focus, company-scoped preferences/reload/named views, mixed currency
  and signed correction sums, mobile summaries, all-optional-columns-off, blocked
  storage and pinned geometry at four desktop widths. Header overlap is checked
  at 390/640/768/1024/1280/1440/1920 px.
- Shared-control checks run in both engines, including disabled options, native
  form behavior, keyboard navigation, transformed dialogs and reduced motion.
- Previous loading/save/navigation/highlight motion checks run on the updated app.
- All application browser checks use disposable loopback databases, synthetic
  accounts and blocked external providers; no production invoices are changed.

Evidence: `/workspace/artifacts/invoice-power-20261020/`.

Reproduce after a production build, with configured browser/Mongo executables:

```sh
UI_AUDIT_SUITE=invoice-power node scripts/audit/ui-motion-isolated.mjs
UI_AUDIT_SUITE=invoice-power MOTION_ENGINE=webkit node scripts/audit/ui-motion-isolated.mjs
```

`invoice-power-only` runs just the productivity groups. Hosted CI status and
exact production revision/assets are recorded separately in delivery evidence.
