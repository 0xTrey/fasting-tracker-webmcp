import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_HISTORY_VIEW,
  VISUAL_MODES,
  type FastingDecisionPreview,
  type HistoryViewSpec,
  type VisualMode,
  type WorkspaceLayout,
} from "@/lib/agent-workspace";

interface AgentWorkspaceContextValue {
  layout: WorkspaceLayout;
  visualMode: VisualMode;
  historyView: HistoryViewSpec;
  decisionPreview: FastingDecisionPreview | null;
  setLayout: (layout: WorkspaceLayout) => void;
  setVisualMode: (mode: VisualMode) => void;
  setHistoryView: (view: HistoryViewSpec) => void;
  setDecisionPreview: (preview: FastingDecisionPreview | null) => void;
  resetWorkspace: () => void;
}

const AgentWorkspaceContext = createContext<AgentWorkspaceContextValue | null>(null);
const VISUAL_MODE_KEY = "fasting-tracker.visual-mode";

function savedVisualMode(): VisualMode {
  if (typeof window === "undefined") return "standard";
  const saved = window.localStorage.getItem(VISUAL_MODE_KEY);
  return VISUAL_MODES.includes(saved as VisualMode) ? saved as VisualMode : "standard";
}

export function AgentWorkspaceProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<WorkspaceLayout>("balanced");
  const [visualMode, setVisualMode] = useState<VisualMode>(savedVisualMode);
  const [historyView, setHistoryView] = useState<HistoryViewSpec>(DEFAULT_HISTORY_VIEW);
  const [decisionPreview, setDecisionPreview] = useState<FastingDecisionPreview | null>(null);

  useEffect(() => {
    document.documentElement.dataset.visualMode = visualMode;
    window.localStorage.setItem(VISUAL_MODE_KEY, visualMode);
  }, [visualMode]);

  useEffect(() => {
    document.documentElement.dataset.workspaceLayout = layout;
  }, [layout]);

  const resetWorkspace = () => {
    setLayout("balanced");
    setVisualMode("standard");
    setHistoryView(DEFAULT_HISTORY_VIEW);
    setDecisionPreview(null);
  };

  const value = useMemo<AgentWorkspaceContextValue>(() => ({
    layout,
    visualMode,
    historyView,
    decisionPreview,
    setLayout,
    setVisualMode,
    setHistoryView,
    setDecisionPreview,
    resetWorkspace,
  }), [decisionPreview, historyView, layout, visualMode]);

  return <AgentWorkspaceContext.Provider value={value}>{children}</AgentWorkspaceContext.Provider>;
}

export function useAgentWorkspace(): AgentWorkspaceContextValue {
  const value = useContext(AgentWorkspaceContext);
  if (!value) throw new Error("useAgentWorkspace must be used inside AgentWorkspaceProvider");
  return value;
}
