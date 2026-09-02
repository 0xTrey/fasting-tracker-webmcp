import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuditEventSummary, Fast, FastingExperiment, MutationReceipt } from "@shared/types";
import { useAuth } from "@/hooks/use-auth";
import { useAgentWorkspace } from "@/hooks/use-agent-workspace";
import {
  activeFastProgress,
  compareFastingPeriods,
  previewFastWindow,
} from "@/lib/fasting-stats";
import {
  HISTORY_CHART_TYPES,
  HISTORY_RANGE_DAYS,
  VISUAL_MODES,
  WORKSPACE_LAYOUTS,
  type HistoryChartType,
  type HistoryRangeDays,
  type VisualMode,
  type WorkspaceLayout,
} from "@/lib/agent-workspace";
import { BROWSER_WEBMCP_TOOL_NAMES } from "@/lib/webmcp-tools";
import { agentConfirmation } from "@/lib/agent-confirmation";

export type WebMcpStatus = "unsupported" | "registering" | "ready" | "failed";

interface WebMcpExecutionContext {
  signal: AbortSignal;
}

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute: (input: Record<string, unknown>, context: WebMcpExecutionContext) => Promise<unknown>;
}

interface WebMcpModelContext {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void>;
}

declare global {
  interface Document {
    modelContext?: WebMcpModelContext;
  }
}

async function readApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed with status ${response.status}`;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

async function requireAgentConfirmation(message: string, approveLabel: string, signal: AbortSignal): Promise<void> {
  if (!await agentConfirmation.request(message, approveLabel, signal)) {
    throw new Error("The user canceled this tracker change. Nothing changed.");
  }
}

export function useWebMcp(): WebMcpStatus {
  const queryClient = useQueryClient();
  const { session, markExpired } = useAuth();
  const {
    historyView,
    setDecisionPreview,
    setHistoryView,
    setLayout,
    setVisualMode,
  } = useAgentWorkspace();
  const [status, setStatus] = useState<WebMcpStatus>(
    typeof document !== "undefined" && document.modelContext ? "registering" : "unsupported",
  );

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!session?.authenticated || !session.csrfToken || !modelContext) {
      setStatus(modelContext ? "registering" : "unsupported");
      return;
    }

    const registrationController = new AbortController();
    let active = true;

    const request = async <T,>(url: string, init: RequestInit, signal: AbortSignal): Promise<T> => {
      const response = await fetch(url, { ...init, credentials: "include", signal });
      if (response.status === 401) {
        markExpired();
        throw new Error("The browser session expired. Sign in again to continue.");
      }
      if (!response.ok) throw new Error(await readApiError(response));
      return response.json() as Promise<T>;
    };

    const readFasts = (signal: AbortSignal) => request<Fast[]>(
      "/api/fasts",
      { headers: { Accept: "application/json" } },
      signal,
    );

    const invalidateVisibleState = async () => {
      await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/fasts"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/experiments/active"] }),
        queryClient.invalidateQueries({
          predicate: (query) => String(query.queryKey[0]).startsWith("/api/agent-activity"),
        }),
      ]);
    };

    const mutationHeaders = () => ({
      "Content-Type": "application/json",
      "X-CSRF-Token": session.csrfToken ?? "",
      "X-Fasting-Client": "webmcp",
      "Idempotency-Key": crypto.randomUUID(),
    });

    const tools: WebMcpTool[] = [
      {
        name: "get_current_fast",
        description: "Show the active fast, its start time, target length, target end time, and current progress. This reads tracker data only and does not provide health advice.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (_input, { signal }) => {
          const fasts = await readFasts(signal);
          const currentFast = fasts.find((fast) => !fast.endTime) ?? null;
          return { currentFast, progress: currentFast ? activeFastProgress(currentFast) : null };
        },
      },
      {
        name: "list_recent_fasts",
        description: "Show up to 10 recent completed or active fasting records from this signed-in tracker.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 10, description: "Number of records to return." },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async ({ limit }, { signal }) => {
          const count = boundedInteger(limit, 5, 1, 10);
          const fasts = await readFasts(signal);
          return {
            fasts: [...fasts]
              .sort((left, right) => Date.parse(right.startTime) - Date.parse(left.startTime))
              .slice(0, count),
          };
        },
      },
      {
        name: "get_fasting_summary",
        description: "Summarize recorded fasting activity over 1 to 365 days. This reports the user's tracker data and does not give medical advice.",
        inputSchema: {
          type: "object",
          properties: {
            days: { type: "integer", minimum: 1, maximum: 365, description: "Rolling number of days to summarize." },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async ({ days }, { signal }) => request(
          `/api/fasts/summary?days=${boundedInteger(days, 30, 1, 365)}`,
          { headers: { Accept: "application/json" } },
          signal,
        ),
      },
      {
        name: "compare_fasting_periods",
        description: "Compare the current week, month, quarter, or year with the previous period using this tracker's recorded sessions. This is descriptive, not medical advice.",
        inputSchema: {
          type: "object",
          properties: {
            period: { type: "string", enum: ["week", "month", "quarter", "year"] },
            referenceDate: { type: "string", format: "date-time", description: "Optional ISO 8601 date used as the comparison point." },
          },
          required: ["period"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async ({ period, referenceDate }, { signal }) => {
          const allowedPeriods = ["week", "month", "quarter", "year"] as const;
          if (typeof period !== "string" || !allowedPeriods.includes(period as (typeof allowedPeriods)[number])) {
            throw new Error("period must be week, month, quarter, or year.");
          }
          const reference = typeof referenceDate === "string" ? new Date(referenceDate) : new Date();
          if (Number.isNaN(reference.getTime())) throw new Error("referenceDate must be a valid ISO 8601 date and time.");
          const fasts = await readFasts(signal);
          return compareFastingPeriods(fasts, period as (typeof allowedPeriods)[number], reference);
        },
      },
      {
        name: "preview_fast_end",
        description: "Calculate when a proposed fasting timer would end. This is a clock calculation only. It does not start a fast or recommend a target.",
        inputSchema: {
          type: "object",
          properties: {
            targetDurationMinutes: { type: "integer", minimum: 60, maximum: 10_080 },
            startTime: { type: "string", format: "date-time", description: "Optional ISO 8601 start time. Defaults to now." },
          },
          required: ["targetDurationMinutes"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async ({ targetDurationMinutes, startTime }) => {
          if (typeof targetDurationMinutes !== "number" || !Number.isInteger(targetDurationMinutes) || targetDurationMinutes < 60 || targetDurationMinutes > 10_080) {
            throw new Error("targetDurationMinutes must be a whole number from 60 to 10080.");
          }
          const start = typeof startTime === "string" ? new Date(startTime) : new Date();
          if (Number.isNaN(start.getTime())) throw new Error("startTime must be a valid ISO 8601 date and time.");
          return previewFastWindow(targetDurationMinutes, start);
        },
      },
      {
        name: "get_agent_activity",
        description: "Show a sanitized list of recent tracker changes made through the visible app or an agent. It never returns credentials, request bodies, or admin details.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 25 },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async ({ limit }, { signal }) => request<{ events: AuditEventSummary[] }>(
          `/api/agent-activity?limit=${boundedInteger(limit, 10, 1, 25)}`,
          { headers: { Accept: "application/json" } },
          signal,
        ),
      },
      {
        name: "set_workspace_layout",
        description: "Switch this tab between balanced, timer-first focus, history, or experiment layouts. This only changes the visible workspace and can be reset by the user.",
        inputSchema: {
          type: "object",
          properties: {
            layout: { type: "string", enum: WORKSPACE_LAYOUTS },
          },
          required: ["layout"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async ({ layout }) => {
          if (typeof layout !== "string" || !WORKSPACE_LAYOUTS.includes(layout as WorkspaceLayout)) {
            throw new Error("layout must be balanced, focus, history, or experiment.");
          }
          setLayout(layout as WorkspaceLayout);
          return { layout, scope: "this tab", reversible: true };
        },
      },
      {
        name: "set_visual_mode",
        description: "Apply one of the tracker-owned visual modes: standard, calm night, high contrast, or bright light. The user can reset this preference at any time.",
        inputSchema: {
          type: "object",
          properties: {
            mode: { type: "string", enum: VISUAL_MODES },
          },
          required: ["mode"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async ({ mode }) => {
          if (typeof mode !== "string" || !VISUAL_MODES.includes(mode as VisualMode)) {
            throw new Error("mode must be standard, calm, high-contrast, or bright-light.");
          }
          setVisualMode(mode as VisualMode);
          return { mode, reversible: true };
        },
      },
      {
        name: "create_history_view",
        description: "Compose a native history chart from supported tracker metrics. This changes the visible view only and never edits fasting records.",
        inputSchema: {
          type: "object",
          properties: {
            chartType: { type: "string", enum: HISTORY_CHART_TYPES },
            rangeDays: { oneOf: [
              { type: "integer", enum: HISTORY_RANGE_DAYS },
              { type: "string", enum: ["all"] },
            ] },
            compareWithPrevious: { type: "boolean" },
          },
          required: ["chartType", "rangeDays"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async ({ chartType, rangeDays, compareWithPrevious }) => {
          if (typeof chartType !== "string" || !HISTORY_CHART_TYPES.includes(chartType as HistoryChartType)) {
            throw new Error("chartType is not supported by this tracker.");
          }
          const validRange = rangeDays === "all"
            || (typeof rangeDays === "number" && HISTORY_RANGE_DAYS.includes(rangeDays as (typeof HISTORY_RANGE_DAYS)[number]));
          if (!validRange) throw new Error("rangeDays must be 30, 90, 180, 365, or all.");
          const nextView = {
            chartType: chartType as HistoryChartType,
            rangeDays: rangeDays as HistoryRangeDays,
            compareWithPrevious: rangeDays === "all" ? false : compareWithPrevious === true,
            highlightedFastIds: [],
          };
          setHistoryView(nextView);
          setLayout("history");
          return { view: nextView, scope: "this tab", recordsChanged: false };
        },
      },
      {
        name: "highlight_history_records",
        description: "Highlight up to 25 existing fasting records inside the current history chart so the user can inspect the evidence behind an explanation.",
        inputSchema: {
          type: "object",
          properties: {
            fastIds: {
              type: "array",
              minItems: 1,
              maxItems: 25,
              uniqueItems: true,
              items: { type: "integer", minimum: 1 },
            },
          },
          required: ["fastIds"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async ({ fastIds }, { signal }) => {
          if (!Array.isArray(fastIds) || fastIds.length < 1 || fastIds.length > 25 || fastIds.some((id) => !Number.isInteger(id) || id <= 0)) {
            throw new Error("fastIds must contain 1 to 25 positive record IDs.");
          }
          const uniqueIds = [...new Set(fastIds as number[])];
          if (uniqueIds.length !== fastIds.length) throw new Error("fastIds must be unique.");
          const fasts = await readFasts(signal);
          const existing = new Set(fasts.map((fast) => fast.id));
          const missing = uniqueIds.filter((id) => !existing.has(id));
          if (missing.length) throw new Error(`Fasting record ${missing[0]} is not available in this tracker.`);
          const nextView = { ...historyView, highlightedFastIds: uniqueIds };
          setHistoryView(nextView);
          setLayout("history");
          return { highlightedFastIds: uniqueIds, recordsChanged: false };
        },
      },
      {
        name: "preview_fasting_decision",
        description: "Build a visible, read-only comparison of up to three user-chosen fasting targets. It calculates clock outcomes and historical context but does not recommend medical care or start a fast.",
        inputSchema: {
          type: "object",
          properties: {
            targetDurationMinutes: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              uniqueItems: true,
              items: { type: "integer", minimum: 60, maximum: 10_080 },
            },
            startTime: { type: "string", format: "date-time" },
          },
          required: ["targetDurationMinutes"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async ({ targetDurationMinutes, startTime }, { signal }) => {
          if (!Array.isArray(targetDurationMinutes) || targetDurationMinutes.length < 1 || targetDurationMinutes.length > 3) {
            throw new Error("targetDurationMinutes must contain 1 to 3 choices.");
          }
          const durations = [...new Set(targetDurationMinutes as number[])];
          if (durations.length !== targetDurationMinutes.length || durations.some((duration) => !Number.isInteger(duration) || duration < 60 || duration > 10_080)) {
            throw new Error("Each target must be a unique whole number from 60 to 10080 minutes.");
          }
          const start = typeof startTime === "string" ? new Date(startTime) : new Date();
          if (Number.isNaN(start.getTime())) throw new Error("startTime must be a valid ISO 8601 date and time.");
          const fasts = await readFasts(signal);
          const completedDurations = fasts
            .filter((fast) => fast.endTime)
            .map((fast) => (Date.parse(fast.endTime!) - Date.parse(fast.startTime)) / 60_000)
            .filter((duration) => Number.isFinite(duration) && duration >= 0);
          const recentAverage = completedDurations.length
            ? completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length
            : null;
          const options = durations.sort((left, right) => left - right).map((duration) => {
            const window = previewFastWindow(duration, start);
            const hours = duration / 60;
            const difference = recentAverage === null ? null : Math.round((duration - recentAverage) / 30) / 2;
            return {
              id: `target-${duration}`,
              label: `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour target`,
              targetDurationMinutes: duration,
              targetEndTime: window.targetEndTime,
              context: difference === null
                ? "No completed history is available for comparison."
                : difference === 0
                  ? "Close to your recorded average."
                  : `${Math.abs(difference)} hours ${difference > 0 ? "longer" : "shorter"} than your recorded average.`,
            };
          });
          const preview = {
            title: "Choose the timing that fits",
            summary: "These are clock comparisons based on your tracker history, not health recommendations.",
            options,
            createdAt: new Date().toISOString(),
          };
          setDecisionPreview(preview);
          setLayout("focus");
          return preview;
        },
      },
      {
        name: "get_active_experiment",
        description: "Return the current user-defined fasting experiment and its tracker settings, or null when none is active.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (_input, { signal }) => request<FastingExperiment | null>(
          "/api/experiments/active",
          { headers: { Accept: "application/json" } },
          signal,
        ),
      },
      {
        name: "create_fasting_experiment",
        description: "Ask the user to confirm, then create one bounded, user-defined tracking experiment. This records a goal for the tracker and does not provide health advice.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            targetDurationMinutes: { type: "integer", minimum: 60, maximum: 10_080 },
            weeklyGoal: { type: "integer", minimum: 1, maximum: 7 },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
          },
          required: ["name", "targetDurationMinutes", "weeklyGoal", "startDate", "endDate"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async ({ name, targetDurationMinutes, weeklyGoal, startDate, endDate }, { signal }) => {
          if (typeof name !== "string" || !name.trim() || name.trim().length > 80) throw new Error("name must contain 1 to 80 characters.");
          if (!Number.isInteger(targetDurationMinutes) || (targetDurationMinutes as number) < 60 || (targetDurationMinutes as number) > 10_080) {
            throw new Error("targetDurationMinutes must be a whole number from 60 to 10080.");
          }
          if (!Number.isInteger(weeklyGoal) || (weeklyGoal as number) < 1 || (weeklyGoal as number) > 7) throw new Error("weeklyGoal must be 1 to 7.");
          if (typeof startDate !== "string" || typeof endDate !== "string") throw new Error("startDate and endDate are required.");
          await requireAgentConfirmation(
            `Create “${name.trim()}” from ${startDate} through ${endDate}, with ${(targetDurationMinutes as number) / 60} hours as the user-chosen target and ${weeklyGoal} fasts per week?`,
            "Create experiment",
            signal,
          );
          const result = await request<MutationReceipt<FastingExperiment>>(
            "/api/experiments",
            {
              method: "POST",
              headers: mutationHeaders(),
              body: JSON.stringify({ name: name.trim(), targetDurationMinutes, weeklyGoal, startDate, endDate, confirm: true }),
            },
            signal,
          );
          await invalidateVisibleState();
          setLayout("experiment");
          return result;
        },
      },
      {
        name: "cancel_active_experiment",
        description: "Ask the user to confirm, then cancel the active tracking experiment. Fasting history is not changed or deleted.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (_input, { signal }) => {
          const experiment = await request<FastingExperiment | null>(
            "/api/experiments/active",
            { headers: { Accept: "application/json" } },
            signal,
          );
          if (!experiment) throw new Error("No experiment is active.");
          await requireAgentConfirmation(
            `Cancel “${experiment.name}”? Its settings will be closed, but fasting history will stay unchanged.`,
            "End experiment",
            signal,
          );
          const result = await request<MutationReceipt<FastingExperiment>>(
            `/api/experiments/${experiment.id}/cancel`,
            {
              method: "POST",
              headers: mutationHeaders(),
              body: JSON.stringify({ confirmExperimentId: experiment.id }),
            },
            signal,
          );
          await invalidateVisibleState();
          setLayout("balanced");
          return result;
        },
      },
      {
        name: "start_fast",
        description: "Ask the user to confirm, then start tracking one fast now for the requested number of minutes and update the visible timer. This records a tracker action, not a health recommendation.",
        inputSchema: {
          type: "object",
          properties: {
            targetDurationMinutes: {
              type: "integer",
              minimum: 60,
              maximum: 10_080,
              description: "User-chosen target duration from 60 minutes to 7 days.",
            },
          },
          required: ["targetDurationMinutes"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async ({ targetDurationMinutes }, { signal }) => {
          if (typeof targetDurationMinutes !== "number" || !Number.isInteger(targetDurationMinutes)) {
            throw new Error("targetDurationMinutes must be a whole number.");
          }
          await requireAgentConfirmation(
            `Your agent wants to start a ${targetDurationMinutes}-minute fast now.`,
            "Start fast",
            signal,
          );
          const result = await request<MutationReceipt<Fast>>(
            "/api/fasts/start",
            {
              method: "POST",
              headers: mutationHeaders(),
              body: JSON.stringify({ targetDuration: targetDurationMinutes }),
            },
            signal,
          );
          await invalidateVisibleState();
          return result;
        },
      },
      {
        name: "stop_active_fast",
        description: "Ask the user to confirm, then finish the active fast at the current time and update the visible tracker. It cannot modify a completed record.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (_input, { signal }) => {
          const fasts = await readFasts(signal);
          const current = fasts.find((fast) => !fast.endTime);
          if (!current) throw new Error("No fast is active.");
          await requireAgentConfirmation(
            "Your agent wants to complete the active fast now.",
            "Complete fast",
            signal,
          );
          const result = await request<MutationReceipt<Fast>>(
            "/api/fasts/stop",
            {
              method: "POST",
              headers: mutationHeaders(),
              body: JSON.stringify({ fastId: current.id }),
            },
            signal,
          );
          await invalidateVisibleState();
          return result;
        },
      },
      {
        name: "adjust_active_fast_start",
        description: "Ask the user to confirm, then correct the ISO 8601 start time of the active fast and update the visible timer. Completed history remains unavailable to this tool.",
        inputSchema: {
          type: "object",
          properties: {
            startTime: { type: "string", format: "date-time", description: "Corrected ISO 8601 start time." },
          },
          required: ["startTime"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async ({ startTime }, { signal }) => {
          const correctedStart = typeof startTime === "string" ? new Date(startTime) : null;
          if (!correctedStart || Number.isNaN(correctedStart.getTime())) {
            throw new Error("startTime must be a valid ISO 8601 date and time.");
          }
          if (correctedStart.getTime() > Date.now()) {
            throw new Error("startTime cannot be in the future.");
          }
          const fasts = await readFasts(signal);
          const current = fasts.find((fast) => !fast.endTime);
          if (!current) throw new Error("No fast is active.");
          await requireAgentConfirmation(
            `Your agent wants to change the active start time to ${correctedStart.toLocaleString()}.`,
            "Change start time",
            signal,
          );
          const result = await request<MutationReceipt<Fast>>(
            `/api/fasts/${current.id}/start-time`,
            {
              method: "PATCH",
              headers: mutationHeaders(),
              body: JSON.stringify({ startTime }),
            },
            signal,
          );
          await invalidateVisibleState();
          return result;
        },
      },
    ];

    if (tools.map((tool) => tool.name).join("|") !== BROWSER_WEBMCP_TOOL_NAMES.join("|")) {
      throw new Error("Browser WebMCP tool registry drifted from its declared manifest.");
    }

    setStatus("registering");
    void Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: registrationController.signal })))
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch((caught: unknown) => {
        if (!registrationController.signal.aborted) {
          console.warn("WebMCP tool registration failed", caught);
          if (active) setStatus("failed");
        }
      });

    return () => {
      active = false;
      registrationController.abort();
    };
  }, [
    historyView,
    markExpired,
    queryClient,
    session?.authenticated,
    session?.csrfToken,
    setDecisionPreview,
    setHistoryView,
    setLayout,
    setVisualMode,
  ]);

  return status;
}
