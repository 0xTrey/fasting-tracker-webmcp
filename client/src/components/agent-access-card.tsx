import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, Check, ChevronDown, Clock3, Copy, RotateCcw, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { AuditEventSummary } from "@shared/types";
import type { WebMcpStatus } from "@/hooks/use-webmcp";
import { BROWSER_WEBMCP_TOOL_COUNT } from "@/lib/webmcp-tools";

const ACTIVITY_URL = "/api/agent-activity?limit=6";

function activityLabel(event: AuditEventSummary): string {
  const actor = event.origin === "mcp" ? "Your agent" : "You";
  const action = {
    "fast.start": "started a fast",
    "fast.stop": "completed a fast",
    "fast.adjust_active_start": "corrected the active start time",
    "experiment.create": "created a tracking experiment",
    "experiment.cancel": "ended a tracking experiment",
  }[event.action] ?? "updated the tracker";
  if (event.outcome === "succeeded") return `${actor} ${action}`;
  const attemptedAction = action.replace(/^(started|completed|corrected|updated)/u, (verb) => ({
    started: "tried to start",
    completed: "tried to complete",
    corrected: "tried to correct",
    updated: "tried to update",
  })[verb] ?? verb);
  return `${actor} ${attemptedAction}, but nothing changed`;
}

function statusCopy(status: WebMcpStatus, isDemo: boolean): { label: string; body: string; connected: boolean } {
  if (status === "ready") {
    return {
      label: "Agent access ready",
      body: `${BROWSER_WEBMCP_TOOL_COUNT} named WebMCP actions are available in this ${isDemo ? "demo" : "signed-in"} tab.`,
      connected: true,
    };
  }
  if (status === "registering") {
    return { label: "Connecting agent access", body: "The tracker is registering its safe actions.", connected: false };
  }
  if (status === "failed") {
    return { label: "Agent access needs a reload", body: "The human tracker is still fully available.", connected: false };
  }
  return {
    label: "Agent access is optional",
    body: "This browser does not support agent controls. The tracker still works normally.",
    connected: false,
  };
}

const DEMO_PROMPTS = [
  "Show my last 90 days as a duration trend.",
  "Highlight the records behind my longest fast.",
  "Compare 16, 18, and 20-hour options without starting a fast.",
];

export function AgentAccessCard({ status, isDemo = false, onDemoReset }: { status: WebMcpStatus; isDemo?: boolean; onDemoReset?: () => Promise<void> }) {
  const { data } = useQuery<{ events: AuditEventSummary[] }>({ queryKey: [ACTIVITY_URL] });
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);
  const activity = data?.events ?? [];
  const latest = activity[0];
  const copy = statusCopy(status, isDemo);

  return (
    <section className="agent-card" aria-labelledby="agent-access-title">
      <div className="flex items-start gap-3">
        <div className="agent-card__icon" aria-hidden="true"><Bot className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="agent-access-title" className="font-display text-2xl tracking-[-0.02em]">
              {isDemo ? "Control this tracker with WebMCP." : "Use your agent with this tracker."}
            </h2>
            <span className={copy.connected ? "agent-status agent-status--ready" : "agent-status"}>
              {copy.connected ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
              {copy.label}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {isDemo
              ? "A browser agent can switch views, build history charts, highlight records, compare timing options, create an experiment, or request a timer change. You approve every change to fasting or experiment data."
              : "Ask a connected browser agent to switch views, build history charts, highlight records, compare timing options, create an experiment, or update the active timer. You approve every change to fasting or experiment data, and it appears here."}
          </p>
          <p className="mt-2 text-xs text-teal-100/70">{copy.body}</p>
        </div>
      </div>

      {latest && (
        <div className="agent-card__activity" aria-live="polite">
          <ShieldCheck className="h-4 w-4 shrink-0 text-teal-300" />
          <span>{activityLabel(latest)}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {formatDistanceToNow(new Date(latest.occurredAt), { addSuffix: true })}
          </span>
        </div>
      )}

      {isDemo && (
        <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Try asking your agent</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Copy one of these into a WebMCP-enabled agent to see the tracker respond.</p>
            </div>
            <Bot className="h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
          </div>
          <div className="mt-3 grid gap-2">
            {DEMO_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-left text-xs text-foreground transition hover:border-amber-200/30 hover:bg-white/[0.06]"
                onClick={async () => {
                  setCopyError(false);
                  try {
                    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
                    await navigator.clipboard.writeText(prompt);
                    setCopiedPrompt(prompt);
                    window.setTimeout(() => setCopiedPrompt((current) => (current === prompt ? null : current)), 1800);
                  } catch {
                    setCopiedPrompt(null);
                    setCopyError(true);
                  }
                }}
              >
                <span>{prompt}</span>
                {copiedPrompt === prompt ? <Check className="h-4 w-4 shrink-0 text-teal-300" aria-label="Copied" /> : <Copy className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Copy prompt" />}
              </button>
            ))}
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {copiedPrompt ? "Prompt copied." : copyError ? "Copy failed. Select the visible prompt text instead." : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
            <p className="text-[11px] text-muted-foreground">Shared synthetic data, safe to explore.</p>
            <button
              type="button"
              disabled={resetting || !onDemoReset}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[11px] font-semibold text-muted-foreground transition hover:border-white/25 hover:text-foreground disabled:opacity-50"
              onClick={async () => {
                if (!onDemoReset) return;
                setResetting(true);
                setResetError(false);
                try {
                  await onDemoReset();
                } catch {
                  setResetError(true);
                } finally {
                  setResetting(false);
                }
              }}
            >
              <RotateCcw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
              {resetting ? "Resetting..." : "Reset demo data"}
            </button>
          </div>
          {resetError && <p className="mt-2 text-[11px] text-orange-200" role="alert">The demo could not reset. Reload the page and try again.</p>}
        </div>
      )}

      <details className="agent-card__details">
        <summary>
          What can my agent do?
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </summary>
        <div className="grid gap-3 pt-4 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
          <p><strong className="text-foreground">Allowed:</strong> named WebMCP tools can read tracker data, build supported charts, change reversible visual modes, preview choices, and request confirmed timer or experiment changes.</p>
          <p><strong className="text-foreground">Not allowed:</strong> sign in, delete history, rewrite completed records, access admin controls, or provide medical advice.</p>
        </div>
      </details>
    </section>
  );
}
