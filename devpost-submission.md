# Devpost submission draft: Fasting Tracker

### ⏳ Not submitted yet
Nothing has been sent to Devpost.

This is the copy-ready package for the WebMCP Challenge. The final submission remains a separate review and approval step.

## Core fields

| Field | Answer |
| --- | --- |
| Project name | Fasting Tracker |
| Tagline | A real iPhone-first tracker with safe agent capabilities designed and controlled by the app. |
| Submitter type | Individual |
| Country | United States |
| App status | Existing |
| Live demo | https://fasting-tracker-webmcp-demo.harnden-trey.workers.dev/ |
| Public source | https://github.com/0xTrey/fasting-tracker-webmcp |
| Demo video | https://www.youtube.com/watch?v=YrP55Q2LqAE |
| License | MIT |

## Project description

Fasting Tracker is a real, iPhone-first timer and journal. A person can start a fast, check the countdown, correct an active start time, review history, compare periods, and track a goal without ever using a chatbot.

WebMCP adds a second control surface to that same app. A compatible browser agent gets 17 named capabilities that the tracker defines and limits. The agent can read the current timer, build one of six history views, compare periods, highlight the records behind an explanation, preview several timing options, switch the open tab to a different layout or visual mode, and request a small set of saved changes.

The important part is where control stays. The app validates every input, renders every result, and decides which actions exist. Reversible view changes can happen immediately in the open tab. Any action that changes fasting or experiment data stops at an app-owned approval dialog. The person sees the exact request and can approve or cancel it. A confirmed request still has to pass the Worker’s session, same-origin, CSRF, validation, idempotency, and audit checks.

That creates a better experience than screen scraping. The agent does not guess which button to click or receive broad access to an account. It calls a capability with domain meaning, such as `create_history_view`, `highlight_history_records`, `preview_fasting_decision`, or `start_fast`. The tracker then responds through its normal interface, where the person can understand and verify the result.

The public demo is credential-free and contains only synthetic data. It has an isolated Worker and D1 database, hides production admin and remote MCP routes, and includes a reset control that restores the same 11-record starting state for every judge.

### Why this is a strong WebMCP use case

People should not have to choose between a well-designed app and an agent. Fasting Tracker shows how both can use the same product safely:

- The person gets a focused mobile interface for the everyday job.
- The agent gets explicit capabilities for questions and multi-step work.
- The app owns the allowed actions, validation, presentation, and safety rules.
- Read results stay connected to visible source records.
- Saved changes stop for human approval and produce audit evidence.

This pattern applies far beyond fasting. Any established web app can keep its human interface while exposing a smaller, safer contract for agents.

### What people and agents can do together

A person can ask, “Show my last 90 days as a duration trend.” The agent calls `create_history_view`, and the tracker renders its own chart from its own records.

They can ask, “Highlight the records behind my longest fast.” The agent calls `highlight_history_records`, and the app points to the source entry instead of returning an unsupported answer.

They can ask, “Compare 16, 18, and 20-hour options without starting a fast.” The agent calls `preview_fasting_decision`, and the app shows end times and history context without changing data or giving medical advice.

They can ask to start an 18-hour fast. The app opens a clear approval dialog. Nothing is saved until the person chooses **Start fast**.

### How WebMCP was implemented

The React page detects `document.modelContext` and registers 17 tools with JSON input schemas, descriptions, read-only annotations, and bounded execute functions. Read tools use the same Cloudflare Worker routes as the visible app. View tools update React state so results appear inside the tracker. Mutation tools wait on an app-owned approval controller before sending a protected request to the Worker.

The Worker stores demo records in Cloudflare D1. It enforces origin and content-type checks, CSRF protection, strict validation, idempotency keys, and append-only audit events. Production and demo share source code but use separate Workers, databases, sessions, and secrets.

## Existing-app changes field

Fasting Tracker existed before August 25, 2026 as a conventional mobile timer and journal. During the Submission Period, I added the WebMCP experience: 17 browser capabilities, agent-created history views, record-level evidence highlighting, non-mutating timing previews, workspace and visual controls, user-defined experiments, app-owned confirmation for saved changes, audit receipts, an isolated credential-free demo, a repeatable synthetic reset, and automated security and behavior tests. The public repository and `docs/challenge-provenance.md` identify the post-start work and dated commits. Pre-existing tracker features are not presented as Challenge work.

## Testing instructions field

1. Open the live demo in the ChatGPT desktop in-app browser. No login is required.
2. Confirm the first panel says **Agent access ready** and reports 17 named actions.
3. Ask: **Show my last 90 days as a duration trend.** The app should switch to History and render an agent-created chart.
4. Ask: **Highlight the records behind my longest fast.** The source record should be visibly highlighted.
5. Ask: **Compare 16, 18, and 20-hour options without starting a fast.** The app should show three end-time options and no active timer.
6. Ask: **Start an 18-hour fast.** The app must stop at its own approval dialog. Choose **Cancel** to verify that nothing changes. Repeat and approve only if you want to test the saved path.
7. Choose **Reset demo data** before leaving. The demo returns to 11 completed synthetic records, no active fast, and the starting workspace.

Google Chrome 149 or later can also be used after enabling `chrome://flags/#enable-webmcp-testing` and restarting Chrome, as described in the official Challenge rules. Without that experimental flag, the demo still works as a normal human-operated tracker and clearly reports that agent controls are unavailable.

## Agents and clients tested field

- OpenAI desktop in-app browser with native WebMCP: 17 tools discovered and direct read, view, cancel, approve, and reset flows verified.
- Google Chrome with the WebMCP flag off: normal human interface and unsupported-browser fallback verified. Native Chrome WebMCP was not claimed from that profile.
- Automated Worker and API clients: demo session, CSRF, idempotency, validation, experiment lifecycle, hidden-route, reset, and adversarial request checks verified.

## AI tools used field

OpenAI Codex and Cursor were used for product planning, implementation, code review, and QA. MiniMax generated one text-free atmospheric plate for the demo video. Remotion was used to compose the deterministic product UI, captions, narration, and edit. The app itself does not require an OpenAI API key; compatible browser agents connect through WebMCP.

## Learning and career fields

| Field | Answer |
| --- | --- |
| Learning from this project | Significant |
| Will AI skills be valuable to your career? | Yes |

## Suggested gallery order

1. `docs/screenshots/duration-trend.png`, the app renders an agent-requested chart.
2. `docs/screenshots/approval-gate.png`, a saved change stops for app-owned human approval.
3. `docs/screenshots/end-card.png`, the live demo and MIT source close.

## Final review checklist

- Confirm the Devpost thumbnail and gallery crops are readable.
- Paste the copy above into the matching fields and preview the public project page.
- Confirm Devpost detects the MIT license on the repository.
- Reopen the live demo, source repository, and YouTube video from a signed-out window.
- Read the official rules and make the required entrant attestations yourself.
- Submit only after the final read-through.

