# Application motion polish — 2026-10-19

The application now provides consistent feedback while data loads, documents save
and users navigate. These effects use CSS and small React components, with no new
animation dependency or intentional delay before data or navigation becomes available.

## Behavior

- Shared loading reveal: data mounts immediately, the decorative skeleton fades
  out over 160 ms and data fades in over 180 ms. The exiting skeleton is immediately
  inert and hidden from assistive technology. Reserved height prevents collapse;
  reloads also reserve the previously rendered content height. Background invoice
  revalidation keeps its current same-query results and does not replay the reveal.
- Dashboard and invoice search have structured, responsive placeholders. Changing
  an invoice query still removes the previous query's rows immediately. An error
  never exposes an older company/query's data through a retained animation snapshot.
- Invoice and draft save buttons reserve both labels in one grid cell, showing one
  spinner while a write is pending. Failed writes restore the button and show the
  existing error message. A successful response shows the animated check in the
  global confirmation, which survives navigation; there is no artificial pause to
  keep an already-saved form on screen.
- Confirmed new invoices, including drafts and corrections created by the editor,
  receive a 900 ms background highlight in the desktop row or mobile card. The
  feedback is scoped by company, consumed once, and never inferred from an optimistic
  temporary ID, list refresh or edit. It starts when at least 25% of the actual row
  enters the viewport, so a mobile user does not miss it below the fold. Pending
  feedback expires after 60 seconds and never forces scrolling or keyboard focus.
- A Next.js application template fades new page content in over 160 ms. It does not
  intercept navigation, add request delays, animate layout height or transform a
  containing block used by fixed/sticky controls.
- App cards gently brighten their border and accent edge on desktop hover and
  keyboard focus. Hover changes no card dimensions or text position.
- Reduced-motion preferences disable the new reveals, check drawing, spinning and
  shimmer. A newly created row receives a short static tint instead. Print rendering
  keeps content fully visible and removes the decorative outgoing placeholder.

Invoice validation, persistence, KSeF transport and PDF generation contracts are
unchanged. The feedback provider contains ephemeral IDs only, lives in the signed-in
user shell and does not persist state to browser storage.

## Validation

- Production build, TypeScript and ESLint: passed.
- Unit suite: 637 passed, zero failed, using the configured local MongoDB binary.
- Real application browser regression: Chromium and WebKit, 11 groups each.
  Covers both themes, delayed reads/writes, a controlled failed save and retry,
  an actual successful write, no duplicate writes, mobile draft save, viewport-aware
  highlighting, background refresh, empty filtered results, reduced motion,
  client navigation and widths 390/1280/1920 px. Zero page JavaScript errors or
  external provider calls.
- Both button labels retain the same width/height while pending. Card hover and
  row highlighting retain geometry. The layout does not collapse when placeholders
  leave. Data is displayed as soon as its authenticated response is available.

Reproduce after `npm run build`:

```sh
node scripts/audit/ui-motion-isolated.mjs
MOTION_ENGINE=webkit node scripts/audit/ui-motion-isolated.mjs
```

Use `CHROMIUM_EXECUTABLE`, `WEBKIT_EXECUTABLE`, `MONGOMS_SYSTEM_BINARY` and
`MONGOMS_DOWNLOAD_DIR` when the runtime provides explicit browser/database paths.
Tests create their own loopback-only app/database and never use `DATABASE_URL`
from the shell or a production target. Evidence:
`/workspace/artifacts/ui-motion-20261019/`.

GitHub hosted CI currently cannot start jobs because of account billing/spending
limits. Local passing checks do not imply that hosted CI passed.
