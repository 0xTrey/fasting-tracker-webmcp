import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Timer } from "@/components/timer";
import { FastingLogs } from "@/components/fasting-logs";
import { Stats } from "@/components/stats";
import { DataExportPanel } from "@/components/data-export-panel";
import { AgentAccessCard } from "@/components/agent-access-card";
import { DecisionPanel } from "@/components/decision-panel";
import { ExperimentCard } from "@/components/experiment-card";
import { HistoryStudio } from "@/components/history-studio";
import { WorkspaceControls } from "@/components/workspace-controls";
import { Button } from "@/components/ui/button";
import { Database, LogOut, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useAgentWorkspace } from "@/hooks/use-agent-workspace";
import { useExperiment } from "@/hooks/use-experiment";
import { useFasting } from "@/hooks/use-fasting";
import { useWebMcp } from "@/hooks/use-webmcp";

export default function Home() {
  const [showDataTools, setShowDataTools] = useState(false);
  const { session, logout } = useAuth();
  const queryClient = useQueryClient();
  const { fasts = [] } = useFasting();
  const { experiment, createExperiment, cancelExperiment, isCreating, isCancelling } = useExperiment();
  const {
    layout,
    visualMode,
    historyView,
    decisionPreview,
    setLayout,
    setVisualMode,
    setHistoryView,
    setDecisionPreview,
    resetWorkspace,
  } = useAgentWorkspace();
  const webMcpStatus = useWebMcp();
  const isDemo = session?.mode === "demo";

  const resetDemo = async () => {
    const response = await fetch("/api/demo/reset", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session?.csrfToken ?? "",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ confirm: true }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? "The demo could not be reset.");
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/fasts"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/experiments/active"] }),
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/agent-activity") }),
    ]);
    resetWorkspace();
    setShowDataTools(false);
    toast({ title: "Demo reset", description: "Synthetic history and workspace settings are back to the starting view." });
  };

  return (
    <div className="app-shell min-h-screen">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="flex items-center gap-3">
            <div className="brand-mark" aria-hidden="true"><span /></div>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">Fasting Tracker</h1>
              <p className="text-[11px] text-muted-foreground">
                {isDemo
                  ? "Public demo with synthetic data"
                  : session?.mode === "preview"
                    ? "Local preview with sample data"
                    : "Your private fasting log"}
              </p>
            </div>
          </div>
          {isDemo ? (
            <span className="demo-mode-badge">
              <Sparkles className="h-4 w-4" />
              Demo mode
            </span>
          ) : (
            <button className="lock-button" onClick={() => void logout()} aria-label="Sign out of fasting tracker">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          )}
        </div>
      </header>

      <main className={`app-content workspace-grid workspace-grid--${layout} mx-auto grid w-full max-w-6xl gap-5 px-4 pt-6 sm:px-6 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-7 lg:pt-8`}>
        <section className="workspace-sidebar space-y-5 lg:sticky lg:top-28 lg:self-start">
          {isDemo && (
            <div className="demo-notice" role="note">
              <Sparkles className="h-4 w-4 shrink-0" />
              <p><strong>Competition demo.</strong> No login required. All records are synthetic.</p>
            </div>
          )}

          {isDemo && <AgentAccessCard status={webMcpStatus} isDemo onDemoReset={resetDemo} />}

          <Timer />

          <WorkspaceControls
            layout={layout}
            visualMode={visualMode}
            onLayoutChange={setLayout}
            onVisualModeChange={setVisualMode}
            onReset={resetWorkspace}
          />

          {(layout === "experiment" || experiment) && <ExperimentCard experiment={experiment} fasts={fasts} onCreate={createExperiment} onCancel={cancelExperiment} isBusy={isCreating || isCancelling} />}

          {!isDemo && <AgentAccessCard status={webMcpStatus} />}

          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl border-white/10 bg-white/[0.03] text-sm hover:bg-white/[0.07]"
            onClick={() => setShowDataTools(!showDataTools)}
            aria-expanded={showDataTools}
          >
            <Database className="mr-2 h-4 w-4" />
            {showDataTools ? "Hide settings and data" : "Settings and data"}
          </Button>
          {showDataTools && <DataExportPanel />}
        </section>

        <section className="workspace-main space-y-6 min-w-0">
          {layout === "focus" && <DecisionPanel preview={decisionPreview} onClear={() => setDecisionPreview(null)} />}
          {(layout === "history" || layout === "experiment")
            ? <HistoryStudio fasts={fasts} spec={historyView} onSpecChange={setHistoryView} />
            : <Stats />}
          {layout !== "focus" && <FastingLogs />}
          <p className="wellness-note">
            Fasting Tracker is a timer and journal, not medical advice. Choose targets that are appropriate for you, stop if you feel unwell, and ask a qualified healthcare professional if fasting is right for you.
          </p>
        </section>
      </main>
    </div>
  );
}
