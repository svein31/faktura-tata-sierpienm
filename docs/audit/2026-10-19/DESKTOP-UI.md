# Desktop controls and menus — 2026-10-19

The desktop app used smaller controls than the phone layout, inconsistent font
metrics, and an invoice action menu inside the scrolling table. The updated UI
uses shared control sizes and popup surfaces across forms, filters and the
company switcher.

## Changes

- Use the existing self-hosted Inter font in the application shell. Public
  landing-page font loading is unchanged.
- Default inputs, selects and buttons are 40 px high with 14 px text. Improve
  labels, table headings, focus rings, disabled/error states and spacing.
- Share rounded popup surfaces, subtle borders and layered shadows in both
  themes; animate opening for 160 ms and closing for 140 ms. Respect reduced
  motion and immediately disable interaction with closing panels.
- Render invoice actions above the scrolling table without expanding its rows.
  Use the same component for the company switcher. Clamp menus to the viewport
  and keep controls inside a dialog's focus boundary.
- Support arrows, Home/End, typeahead, Escape, Tab and focus restoration,
  including actions that open a confirmation dialog.
- Preserve Select's native required validation, FormData, external form binding
  and controlled/uncontrolled reset. Synchronize native option defaults so
  synchronous FormData after reset agrees with the visible value.
- Keep the analytics period selector mounted while results reload, preserving
  keyboard focus. Do not retain stale financial results during the reload.
- Refine the topbar spacing and company identity. Correct search-icon spacing
  in invoices, offers and orders.

## Validation

- Production build, TypeScript and ESLint: passed.
- Unit tests: 637 passed, none failed.
- Full isolated integration run: passed, including 442 feature checks across
  135 API routes / 193 methods and 42 security/product HTTP checks. Browser
  checks run separately against an isolated database.
- Performance measurement harness: 11 tests passed.
- Shared component browser harness: 15 checks each in Chromium 154 and WebKit
  26.6, including required fields, resets, synchronous FormData, cancelled
  reset, keyboard operation, viewport flipping and transformed dialogs.
- Real application visual checks: desktop widths 1280/1440/1920, both themes,
  and a touch-enabled 390 px mobile viewport. No page overflow or JavaScript
  errors. Opening invoice actions changes the tested row height by 0 px.
- Mobile controls retain 44 px touch targets; all ten checked native form
  inputs retain 16 px text. The three search fields have 40 px left padding
  and 11 px clearance between their icon and text.
- Persistent browser regressions cover invoice action geometry, keyboard
  navigation, cancelling deletion, and analytics selection/focus. The public
  anchor test now follows the current video CTA instead of a removed CTA.
  Synthetic onboarding state is recorded through the real guide UI before
  exporting browser storage, replacing an obsolete global preference flag.
  Company-switch tests use the menu's current accessible roles.

Local evidence is stored in `/workspace/artifacts/desktop-polish-20261019/`.
Synthetic application tests use disposable local databases and block external
providers. They do not send real invoices, KSeF requests or customer messages.

## CI availability

GitHub Actions currently refuses to start jobs because of the account billing
or spending limit. Existing failures on the previous main revision have no
runner or executed steps; they are not failing application assertions. Local
checks are recorded separately and do not imply that hosted CI passed.
