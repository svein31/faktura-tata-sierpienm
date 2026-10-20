# Financial UI redesign — 2026-10-20

Status: local verification passed on the final production build. Deployment
verification is performed against the exact resulting main revision.

## Visual system

The existing Tailwind/component architecture now supplies one visual language
for the authenticated workspace, public pages, authentication and legal pages.
There is no second UI framework or additional runtime dependency.

- Neutral off-white and charcoal surfaces, a muted blue primary and semantic
  success/warning/error colors. Light and dark palettes are defined centrally
  in `src/app/globals.css`; shared Tailwind aliases consume those tokens.
- Self-hosted Inter, consistent shared typography, tabular financial numerals,
  a 4 px spacing unit, 40 px standard controls, 6 px control and 10 px surface
  radii, restrained surface/popup/dialog shadows and 160 ms transitions.
- No decorative gradient cards, colored glow, blurred glass surfaces or neon
  calls to action. The existing logo is deliberately retained. The invoice-row
  selection tint remains functional, and configurable user colors remain available.
- Application-owned UI emoji were replaced with existing Lucide icons or clear
  labels. Customer content and document data are not transformed.

## Coverage and concrete changes

- Sidebar groups, active links, favorites, company/account controls, mobile
  navigation, search palette, theme controls and notification surfaces use the
  shared palette and restrained hierarchy. The sidebar invoice shortcut is an
  outline action, so the screen's main action can remain dominant.
- Dashboard financial data precedes its task list. Cards and chart colors are
  neutral; status and trend colors convey meaning. Calendar amounts, deadlines,
  icons and surfaces no longer use unrelated pink/purple accents.
- Shared buttons, inputs, textareas, selects, tabs, badges, tables, tooltips,
  dialogs, empty states and skeletons were refined. Existing keyboard behavior,
  native form validation, disabled controls and reset/FormData contracts remain.
- Invoice lists, editor/detail/history, proformas, advances, recurring invoices,
  offers, orders/Kanban, costs, finance, contractors/CRM, products, warehouse,
  accounting, KSeF, team, settings and help consume the same surface/status system.
- The team-permission editor and public payment-declaration form use the shared
  dialog, labels and controls. Cancel/save handlers and permission rules retain
  their existing behavior.
- Public invoice tables have an independently scrollable, named keyboard region
  on phones, with print-specific sizing retained. A positioned demo-table scroll
  container fixes the tablet overflow caused by its screen-reader-only heading.
- Legal pages use the common theme instead of a separate navy palette. Legal
  print styling remains black on white. Public/authentication cards, cookie
  controls, landing/video controls and appearance presets follow the same system.
- Loading/data fade, save progress/confirmation, new-row feedback and subtle card
  hover remain. Reduced motion is honored globally and by Framer Motion; static
  positioning transforms remain intact when animations are disabled.

## Boundaries preserved

No API routes, authentication, role enforcement, company isolation, Prisma schema,
Stripe/subscription behavior, KSeF transmission, invoice persistence, tax arithmetic
or PDF-generation logic were changed. `format.ts` changes only VAT badge classes;
`theme-colors.ts` changes only default preview colors.

The integration test's KSeF filter oracle was outdated: it compared independent
KSeF filters with the legacy combined payment/date status helper. The oracle now
uses the established public presentation model for KSeF filters. The original
72-document fixture and contradictory legacy flags remain unchanged. Additional
positive-state fixtures in a separate synthetic company independently assert
expected IDs, including paid accepted documents and a confirmed number with an
old queue flag. No production filter/query behavior was modified.

## Verification evidence

All database/browser tests use disposable loopback MongoDB, synthetic accounts
and blocked external providers. No customer records or live financial providers
were used.

- Production build, TypeScript and ESLint completed successfully.
- Unit suite: 669 tests plus the existing seven requested-fix checks passed.
- Full integration audit: 135 routes, 193 methods, 442 checks, zero failures,
  including security, roles, isolation, invitations, mock payments and KSeF cases.
- Invoice browser regression: 26 workflow groups in Chromium and 26 in WebKit,
  including corrections, saving, filters, preview navigation, column preferences,
  mixed-currency/signed selection totals and pinned-table geometry.
- Before screenshots cover 57 addresses / 93 views. The complete visual matrix
  covers 90 public/private addresses in both themes at 1440, 768 and 390 px
  (540 views). There were no horizontal page overflows, lingering loading states
  or visible application emoji. All 204 axe scans in that matrix reported zero
  violations of their configured WCAG 2 A/AA, 2.1 A/AA and 2.2 AA rule tags.
- Ten contact sheets were inspected, including all 90 addresses. Resulting legal
  theme, contrast, financial hierarchy and mobile invoice-table fixes were retested.
- The final build repeated all 540 screenshots with zero page errors, overflow,
  lingering loading states or UI emoji. CDP diagnostics remained armed without
  modifying application JavaScript or suppressing errors.
- Open-state interaction/a11y checks: 31 groups in Chromium and 31 in WebKit,
  across both themes and all three sizes, with zero browser errors or axe violations.
  They cover team focus trapping/restoration, cancelled permission edits leaving
  the database unchanged, notification dismissal, payment validation and a real
  synthetic declaration, cookie dialogs and reduced-motion icon positioning.
- Shared controls: 14 groups per engine passed, including required validation,
  disabled options, FormData/reset, typeahead, segmented controls, menu focus,
  viewport flipping, transformed modal geometry and reduced motion.
- Loading/save/highlight/navigation motion: 11 groups per engine passed. A passive
  MutationObserver now records the actual 900 ms highlighted-row DOM state before
  a potentially slower WebKit scroll command finishes. The test still requires
  exactly one correct document, a success check, unchanged geometry, no duplicate
  write and no replay on refresh. Production timing/behavior was not changed.
- Token calculations independently verify text/semantic tints at least 4.5:1
  and control outlines at least 3:1 in both default themes. Input/card contrast
  is approximately 3.5:1; primary-button text is 6.2:1 light / 7.6:1 dark.

The browser matrix includes static app routes, sitemap/SEO pages and synthetic
invoice, shared invoice/offer and invitation paths. It does not imply every
possible customer document or permission combination was visually inspected.
Automated axe checks and keyboard tests are not a complete WCAG certification
or a substitute for a manual screen-reader audit on physical assistive devices.

Evidence directory: `/workspace/artifacts/financial-redesign-20261020/`.
It contains before/after screenshots, contact sheets, route/axe JSON, logs,
isolated fixture runners and the additional interaction checks.

Representative visual comparisons are retained in this repository:
[dark dashboard](financial-ui/dashboard-dark-1440.jpg),
[invoice list](financial-ui/invoices-light-1440.jpg) and
[payment calendar](financial-ui/calendar-light-1440.jpg).
These use synthetic fixtures; document counts and sample totals differ between
the original baseline and expanded regression fixture.

## Known limitations and publication

Earlier broad sweeps detected sporadic React hydration error 418, also observed
in the pre-redesign baseline. Those runs remain recorded as failures. It did not
recur in 400 diagnostic navigations or the final 540-view matrix, and all final
interaction/motion suites reported zero browser errors. This is not a claim that
the baseline defect has a proven code-level fix; production telemetry should
continue to be monitored. No business/store/authentication rewrite was introduced
to mask a pre-existing intermittent issue during this visual change.

WebKit's initial open-dialog axe run sampled a partially transparent animation
frame. The follow-up waits for the real computed dialog opacity to reach 1 before
measuring, without disabling animation or any contrast rule. All 30 open-state
scans per engine then passed.

Hosted GitHub Actions were previously prevented from starting by the account's
billing/spending limit. Their fresh post-push status must be checked separately;
local tests are not represented as a successful hosted CI run. Production smoke
checks require an exact build revision, healthy database, public pages, protected
API boundaries and the new CSS tokens, with evidence retained in the audit folder.
