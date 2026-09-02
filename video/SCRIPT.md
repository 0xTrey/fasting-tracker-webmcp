# Fasting Tracker WebMCP demo video

The master cut is 1 minute 40 seconds. It opens on the working product, keeps every readable interface deterministic in Remotion, and uses MiniMax only for a text-free atmospheric plate.

## Narration

This is Fasting Tracker, a real iPhone-first web app I use to start a fast, check the timer, and understand my history. The human interface is the product. WebMCP adds a second control surface, built and bounded by the application itself.

In a chatbot, I can ask, “Show my last 90 days as a duration trend.” The agent calls `create_history_view`. It does not guess where to click. The tracker renders its own chart from the same synthetic data.

Next, “Highlight the records behind my longest fast.” The agent calls `highlight_history_records`, and the app points back to the source entry. The explanation stays tied to evidence.

I can ask, “Compare 16, 18, and 20-hour options without starting a fast.” The agent calls `preview_fasting_decision`. It calculates end times and context, but it does not change any data.

The agent can also switch this tab to Bright light. That is a reversible view change owned by the app.

Now ask to start an 18-hour fast. This one changes data, so the flow stops. The user sees the exact action and approves it. Only then does the tracker save the fast and produce an audit receipt.

There are 17 named capabilities. The agent can read, compare, visualize, preview, and request a small set of confirmed changes. It cannot sign in, delete history, rewrite completed records, reach admin controls, or provide medical advice.

One real app for people. Safe, explicit capabilities for agents. Try the live demo, and inspect the MIT-licensed source.

## Scene map

| Time | Product proof | WebMCP proof |
| --- | --- | --- |
| 0:00-0:09 | Working iPhone timer and history metrics | Human-first thesis |
| 0:09-0:17 | Normal timer and recent-record workflow | Agent access is additive |
| 0:17-0:30 | Native 90-day duration chart | `create_history_view` |
| 0:30-0:40 | Longest fast and source record highlighted | `highlight_history_records` |
| 0:40-0:54 | 16, 18, and 20-hour end-time comparison | `preview_fasting_decision` with no mutation |
| 0:54-1:00 | Bright light UI | `set_visual_mode`, reversible in the tab |
| 1:00-1:12 | Exact approval sheet, then active timer and receipt | `start_fast`, user confirmation, audit evidence |
| 1:12-1:30 | Allowed and blocked capability matrix | 17 named tools and explicit boundaries |
| 1:30-1:40 | Live demo and public source | MIT license |

## Review gates

- Review the 1920 by 1080 video draft before any YouTube upload.
- Keep generated audio disabled except for the approved neutral narration.
- Uploading to YouTube and changing the Devpost submission remain separate approval gates.
