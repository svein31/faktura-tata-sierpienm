# Invoice frontend — 2026-10-20

The invoice list now opens a responsive quick preview without navigating away.
The list keeps its search, selection, page and scroll positions; full document
details remain available through a normal link.

## Requested changes

1. **Quick preview.** Lazy-loaded right panel on desktop and full-width panel on
   phones. Shows totals, recorded payments, counterparty, dates, payment method,
   actual KSeF state and the first five line items. Corrections show their change
   in value without inventing a payable/refund amount. No detail API request,
   archived XML/UPO or PDF generation is needed to open it. Existing summary data
   and invoice-search authorization remain the source. A missing/revoked document
   closes the panel and clears selection so it cannot reopen on a later refresh.
2. **Table.** Sticky column headers inside a bounded scroll region, quieter row
   separators, aligned currency amounts and dates, explicit selected/previewed
   rows, accessible preview buttons and compact action menus. Correction remains
   directly available where authorized. Accounting approval is visible in the
   widest layout and available through the existing action menu. Pagination now
   follows the table rather than preceding the page title.
3. **Empty states.** First invoice, no matching filters and unassigned-document
   views have distinct guidance and actions. The same states are visible on
   desktop and phone; previously they were inside the desktop-only container.
4. **Menus.** Shared menu items have consistent minimum heights and wrapping for
   long text; coarse pointers get 44 px targets. Filter controls have bounded,
   responsive widths and explicit accessible labels. Existing portal positioning,
   selected indicators, keyboard navigation and modal containment are retained.
5. **Typography and accessibility.** Consistent date/money formatting, tabular
   digits, calmer type weights and readable secondary labels. Column scopes,
   table instructions, pressed filter states and visible keyboard focus are added.
   The preview supports focus containment/restoration, Escape, visual-viewport
   resizing, safe-area padding, dark mode and reduced motion. Modified invoice
   links retain native new-tab behavior.

Payment badges are now independent of transmission badges. Accepted/rejected KSeF
states never imply payment; canonical paid status takes precedence over deadline,
partial payments remain distinct and correction settlement is not inferred.
This is a presentation change, not a payment or transmission write.

## Verification

- Production build, TypeScript, ESLint and diff checks passed.
- 660 unit tests passed (plus the existing seven requested-fix checks), including
  the payment-label regressions for accepted-but-unpaid, canonical paid, partial
  payment, due-day boundaries, draft/cancelled and correction documents.
- Chromium and WebKit: nine invoice-workflow groups each, including authorized
  cursor pagination, company isolation, ten transmission states, pinned editor
  actions, field errors, preserved inputs and a successful save retry.
- Chromium and WebKit: eight frontend groups each, including sticky headers,
  selection, preview keyboard/focus/scroll behavior, no detail/PDF fetch, access
  revocation and recovery, menus, distinct empty states, 320/390/1280/1920 px,
  dark mode and reduced motion. Final geometry checks await entrance animations.
- Shared-control harness passed in both engines: native form validation/reset,
  disabled options, typeahead, action-menu keyboard handling, viewport-edge
  placement and controls inside transformed, scrolling dialogs.
- The earlier motion suite is checked against the updated list and editor.
- Browsers use disposable loopback databases and synthetic accounts. KSeF polling
  is fixture-only; external providers and dispatch are blocked. No production
  user data or real invoice transmission is used.

Evidence: `/workspace/artifacts/invoice-frontend-20261020/`.

Reproduce after `npm run build` with configured browser/Mongo executables:

```sh
UI_AUDIT_SUITE=invoice-frontend node scripts/audit/ui-motion-isolated.mjs
UI_AUDIT_SUITE=invoice-frontend MOTION_ENGINE=webkit node scripts/audit/ui-motion-isolated.mjs
```

`invoice-frontend-only` runs just the eight frontend groups. Normal runner mode
retains the earlier motion suite. Hosted CI and production checks are recorded
separately; an account billing block is not reported as a passing hosted CI run.
