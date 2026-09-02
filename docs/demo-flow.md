# Two-minute demo flow

1. Open the public synthetic workspace and point out the 17-tool readiness state.
2. Ask: “Show my last 90 days as a duration trend.” The agent calls `create_history_view`; the app renders the chart.
3. Ask: “Highlight the records behind my longest fast.” The agent calls `highlight_history_records`; the app exposes the record behind the result.
4. Ask: “Compare 16, 18, and 20-hour options without starting a fast.” The agent calls `preview_fasting_decision`; the app shows end times and confirms that nothing started.
5. Ask the agent to switch the tab to Bright light. The app changes a reversible visual preference.
6. Ask to start an 18-hour fast. The app stops at a human confirmation sheet. Approve it only when demonstrating a saved action, then show the audit receipt.
7. Reset the synthetic demo before handing it to the next person.

The point is not that an agent can click a fasting app. The point is that the app exposes a safe, legible contract that works for both the person and the agent.
