# Browser WebMCP capability contract

The manifest is intentionally small enough to audit. Tests fail if the registered names drift from this list.

## Read tracker state

- `get_current_fast`
- `list_recent_fasts`
- `get_fasting_summary`
- `compare_fasting_periods`
- `preview_fast_end`
- `get_agent_activity`
- `get_active_experiment`

## Compose the visible workspace

- `set_workspace_layout`
- `set_visual_mode`
- `create_history_view`
- `highlight_history_records`
- `preview_fasting_decision`

These capabilities change the open tab or calculate a preview. They do not edit a completed fasting record.

## Request confirmed changes

- `start_fast`
- `stop_active_fast`
- `adjust_active_fast_start`
- `create_fasting_experiment`
- `cancel_active_experiment`

Each tool opens an app-owned confirmation step. A confirmed request still passes through session authentication, same-origin and CSRF checks, input validation, an idempotency key, and D1 audit recording.

## Deliberately absent

No browser tool can sign in, read credentials, delete history, rewrite a completed fast, reach admin routes, configure infrastructure, or provide medical advice.
