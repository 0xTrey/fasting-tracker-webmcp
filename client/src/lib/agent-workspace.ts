export const WORKSPACE_LAYOUTS = ["balanced", "focus", "history", "experiment"] as const;
export type WorkspaceLayout = (typeof WORKSPACE_LAYOUTS)[number];

export const VISUAL_MODES = ["standard", "calm", "high-contrast", "bright-light"] as const;
export type VisualMode = (typeof VISUAL_MODES)[number];

export const HISTORY_CHART_TYPES = [
  "duration-trend",
  "consistency-calendar",
  "target-attainment",
  "period-comparison",
  "start-time-rhythm",
  "duration-distribution",
] as const;
export type HistoryChartType = (typeof HISTORY_CHART_TYPES)[number];

export const HISTORY_RANGE_DAYS = [30, 90, 180, 365] as const;
export type HistoryRangeDays = (typeof HISTORY_RANGE_DAYS)[number] | "all";

export interface HistoryViewSpec {
  chartType: HistoryChartType;
  rangeDays: HistoryRangeDays;
  compareWithPrevious: boolean;
  highlightedFastIds: number[];
}

export interface DecisionOption {
  id: string;
  label: string;
  targetDurationMinutes: number;
  targetEndTime: string;
  context: string;
}

export interface FastingDecisionPreview {
  title: string;
  summary: string;
  options: DecisionOption[];
  createdAt: string;
}

export const DEFAULT_HISTORY_VIEW: HistoryViewSpec = {
  chartType: "consistency-calendar",
  rangeDays: 90,
  compareWithPrevious: true,
  highlightedFastIds: [],
};
