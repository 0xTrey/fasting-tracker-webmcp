import { describe, expect, it } from "vitest";
import { VISUAL_MODES } from "@/lib/agent-workspace";
import { BROWSER_WEBMCP_TOOL_NAMES } from "@/lib/webmcp-tools";

describe("browser WebMCP capability boundary", () => {
  it("keeps the submission tool manifest exact and intentionally bounded", () => {
    expect(BROWSER_WEBMCP_TOOL_NAMES).toEqual([
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
    ]);
    expect(new Set(BROWSER_WEBMCP_TOOL_NAMES).size).toBe(BROWSER_WEBMCP_TOOL_NAMES.length);
  });

  it("does not expose deletion, completed-history editing, authentication, or admin controls", () => {
    const manifest = BROWSER_WEBMCP_TOOL_NAMES.join(" ");
    expect(manifest).not.toMatch(/delete|remove|admin|login|password|completed.*edit|edit.*history/iu);
  });

  it("offers the bright-light theme instead of the retired data-dense mode", () => {
    expect(VISUAL_MODES).toEqual(["standard", "calm", "high-contrast", "bright-light"]);
    expect(VISUAL_MODES).not.toContain("data-dense");
  });
});
