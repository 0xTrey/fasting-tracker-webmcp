export const BROWSER_WEBMCP_TOOL_NAMES = [
  "get_current_fast",
  "list_recent_fasts",
  "get_fasting_summary",
  "compare_fasting_periods",
  "preview_fast_end",
  "get_agent_activity",
  "set_workspace_layout",
  "set_visual_mode",
  "create_history_view",
  "highlight_history_records",
  "preview_fasting_decision",
  "get_active_experiment",
  "create_fasting_experiment",
  "cancel_active_experiment",
  "start_fast",
  "stop_active_fast",
  "adjust_active_fast_start",
] as const;

export const BROWSER_WEBMCP_TOOL_COUNT = BROWSER_WEBMCP_TOOL_NAMES.length;
