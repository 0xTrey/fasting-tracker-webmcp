import type { WorkspaceLayout, VisualMode } from "@/lib/agent-workspace";

const layouts: Array<{ id: WorkspaceLayout; label: string; hint: string }> = [
  { id: "balanced", label: "Balanced", hint: "Timer and insights" },
  { id: "focus", label: "Focus", hint: "One clear next step" },
  { id: "history", label: "History", hint: "Patterns over time" },
  { id: "experiment", label: "Experiment", hint: "Track a goal" },
];
const modes: Array<{ id: VisualMode; label: string }> = [
  { id: "standard", label: "Standard" }, { id: "calm", label: "Calm night" },
  { id: "high-contrast", label: "High contrast" }, { id: "bright-light", label: "Bright light" },
];

export function WorkspaceControls({ layout, visualMode, onLayoutChange, onVisualModeChange, onReset }: {
  layout: WorkspaceLayout; visualMode: VisualMode;
  onLayoutChange: (value: WorkspaceLayout) => void; onVisualModeChange: (value: VisualMode) => void;
  onReset?: () => void;
}) {
  return <section className="surface space-y-5 p-5 sm:p-6" aria-labelledby="workspace-controls-title">
    <div><h2 id="workspace-controls-title" className="font-display text-2xl">Shape your workspace</h2><p className="mt-1 text-sm text-muted-foreground">Ask your agent to change these, or choose a view yourself.</p></div>
    <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Layout</legend><div className="grid grid-cols-2 gap-2">
      {layouts.map((item) => <button type="button" key={item.id} aria-pressed={layout === item.id} onClick={() => onLayoutChange(item.id)} className={`rounded-2xl border p-3 text-left transition ${layout === item.id ? "border-primary/70 bg-primary/10" : "border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.06]"}`}><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs text-muted-foreground">{item.hint}</span></button>)}
    </div></fieldset>
    <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Visual mode</legend><div className="flex flex-wrap gap-2">
      {modes.map((item) => <button type="button" key={item.id} aria-pressed={visualMode === item.id} onClick={() => onVisualModeChange(item.id)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition ${visualMode === item.id ? "border-primary/70 bg-primary/10 text-primary" : "border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}
    </div></fieldset>
    {onReset && <button type="button" onClick={onReset} className="min-h-11 text-xs font-semibold text-muted-foreground underline decoration-white/20 underline-offset-4 transition hover:text-foreground">Reset workspace</button>}
  </section>;
}
