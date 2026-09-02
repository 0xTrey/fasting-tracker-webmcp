# Changelog

## 2.5.0 - 2026-09-02

### Added

- Put three copyable agent prompts inside the public demo so a judge can reach the strongest history, evidence, and decision-preview flows immediately.
- Add a demo-only reset that restores the 11 synthetic fasting records and clears synthetic experiments without exposing a production route.

### Changed

- Keep reset requests behind the existing session, same-origin, JSON, CSRF, explicit-confirmation, and idempotency-key checks.
- Show complete duration values in metric cards instead of truncating them on narrower desktop layouts.

## 2.4.1 - 2026-09-02

### Added

- Add a Bright light visual mode with an ivory canvas, amber accents, teal signals, and high-legibility chart surfaces.

## 2.4.0 - 2026-09-02

### Added

- Expand browser WebMCP from nine to 17 named capabilities across history views, evidence highlighting, workspace controls, decision previews, and fasting experiments.
- Add six history visualizations and trace every highlighted insight back to the fasting records behind it.
- Add bounded experiment creation and cancellation with the same confirmation, validation, idempotency, and audit controls as timer changes.

## 2.3.0 - 2026-09-02

### Added

- Open the isolated competition Worker with an automatic demo session, so judges never need login credentials.
- Label the competition workspace as public and synthetic in the first viewport.
- Explain the initial nine named WebMCP actions directly in the demo interface.

### Changed

- Keep the demo admin API and remote MCP endpoint unavailable while preserving browser CSRF, idempotency, validation, and audit controls.
- Seed two September sample fasts so the default monthly view is useful during judging.

## 2.2.0 - 2026-09-02

### Added

- Give signed-in browser agents nine explicit capabilities, including summary, period comparison, end-time preview, and sanitized activity review.
- Show Agent Access as a visible product feature with a clear allowed and not-allowed boundary.
- Run a local, credential-free interface preview with synthetic in-memory data for mobile design review.
- Test the exact browser capability manifest so destructive or administrative tools cannot drift into it unnoticed.

### Changed

- Explain the timer, history, privacy model, and agent thesis in direct product language.
- Improve active and idle timer hierarchy, touch targets, focus states, period tabs, safe-area spacing, and correction labels for mobile use.
- Attribute signed-in WebMCP mutations as agent activity only after normal session, same-origin, content-type, and CSRF checks succeed.
- Keep storage and infrastructure details in settings instead of the primary experience.

### Fixed

- Keep the example password verifier at the exact PBKDF2 iteration count accepted by the Worker runtime.
- Make the local preview API an actual Vite development plugin instead of an ignored configuration field.
- Reject future active-fast start times in the interface, browser tools, remote MCP, and Worker action boundary.

## 2.1.0 - 2026-08-31

### Added

- Sign in once and keep the tracker available in the browser with a revocable 90-day secure session.
- Manage active fasts through browser WebMCP tools or an independently authenticated remote MCP endpoint for Grok.
- Use a separate backend admin API for confirmed historical corrections, soft deletion, and audit review.
- Run the same product against an isolated synthetic database for demos and the WebMCP competition.

### Changed

- Keep fasting history read-only in the normal interface while preserving active-fast corrections.
- Record mutations with retry-safe idempotency receipts and append-only audit evidence.
- Commit each domain mutation, success audit, and idempotency receipt in one atomic D1 batch.

### Fixed

- Reject anonymous data access, cross-origin mutations, invalid CSRF confirmation, and unscoped destructive actions.
- Return a controlled conflict when an admin correction would create a second active fast.
- Keep generated password verifiers within the PBKDF2 iteration limit supported by the Cloudflare Workers runtime.
