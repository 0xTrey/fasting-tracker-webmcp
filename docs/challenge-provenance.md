# WebMCP Challenge work provenance

Fasting Tracker was not created for this Challenge. I first built the original version on Replit around January 2025 and used it personally for the better part of a year. I kept building it up over time, then moved it to a newer Cloudflare Workers and D1 version in early August 2026, roughly a month before this submission.

Only during the final week, after the official Submission Period opened on August 25, 2026, did I add the agent-facing API and action layer, the MCP and browser WebMCP integration, 17 agent capabilities, and the new history, visualization, workspace, experiment, confirmation, audit, and demo features. This document separates that Challenge-period work from the earlier tracker.

## What existed before August 25

The prior app was a conventional fasting timer and journal with a human-operated interface, basic history, and statistics. The approximately January 2025 date for the original Replit version is based on the creator's recollection; that early repository is not part of the public Challenge snapshot. The later Cloudflare migration is recorded in the private development history.

Private development history records that baseline:

| Date | Commit | Prior work |
| --- | --- | --- |
| August 9, 2026 | `6ee27be` | Migrate the existing tracker to Cloudflare Workers and D1 |
| August 9, 2026 | `ef88f83` | Remove the earlier password flow |
| August 9, 2026 | `93ed039` | Fix active-fast start-time editing |

Those features establish the pre-Challenge product. They are not claimed as WebMCP Challenge work.

## What was added after the Submission Period opened

| Date | Private development commit | Challenge-period extension |
| --- | --- | --- |
| August 31, 2026 | `4f8d23f` | Add the secured agent action boundary, receipts, and control-plane foundation |
| September 2, 2026 | `8d78dbc` | Add the browser WebMCP surface and make the agent path legible on mobile |
| September 2, 2026 | `da631f5` | Add an isolated, credential-free synthetic demo |
| September 2, 2026 | `196d926` | Add six history views, evidence highlighting, timing previews, and experiments |
| September 2, 2026 | `ceb5f49` | Add the Bright light visual mode |
| September 2, 2026 | `434e66a` | Make the demo resettable and repeatable for judges |
| September 2, 2026 | `de94478` | Replace browser confirmation with an app-owned agent approval boundary |
| September 2, 2026 | `5a3c10b` | Keep append-only audit evidence while hiding pre-reset activity from the fresh demo view |
| September 2, 2026 | `0ad128b` | Clarify agent-facing duration wording |

The original development repository is private because it contains the real tracker’s deployment history. The commit identifiers and timestamps above come from that repository. The history can be provided privately to organizers if they request it.

## Public, sanitized evidence

The public MIT-licensed repository was created as a sanitized Challenge snapshot on September 2, 2026. Its history is public and contains only demo-safe code, documentation, synthetic data, and placeholder deployment identifiers.

- `0cb3775`, initial public WebMCP release on September 2
- `4e1f7b2`, app-owned agent approval fix found during native WebMCP QA
- `37c344b`, clean post-reset activity view without deleting audit history
- `d939df0`, plain-language duration wording

The implementation can be inspected directly in:

- `client/src/hooks/use-webmcp.ts`, registration and execution of the 17 browser tools
- `client/src/lib/webmcp-tools.ts`, the tested capability-name contract
- `client/src/components/agent-confirmation-dialog.tsx`, the visible approval gate
- `client/src/lib/agent-confirmation.ts`, the fail-closed approval controller
- `worker/actions.ts`, protected mutations, idempotency, and audit receipts
- `worker/demo-reset.ts`, the demo-only synthetic reset
- `tests/`, behavior, security, reset, and confirmation regression tests

## Scope statement

The judged extension is the app-owned agent interface and its safety, data, visualization, demo, and testing work. The pre-existing timer and journal are the real product context that makes the WebMCP extension useful.
