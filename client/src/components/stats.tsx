import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Award, BarChart3, CalendarDays, Sparkles } from "lucide-react";
import { useFasting } from "@/hooks/use-fasting";
import {
  calculateStats,
  currentRange,
  formatDuration,
  longestFastHours,
  mostFastsInMonth,
  previousRange,
  type PeriodStats,
  type TimePeriod,
} from "@/lib/fasting-stats";

const PERIODS: Array<{ value: TimePeriod; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "all-time", label: "All time" },
];

const PERIOD_LABELS: Record<TimePeriod, string> = {
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
  "all-time": "Since your first fast",
};

function Metric({ label, value, previous }: { label: string; value: string | number; previous?: string | number }) {
  return (
    <div className="stat-card min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 break-words font-display text-2xl leading-tight tracking-[-0.03em] text-foreground sm:text-3xl">{value}</p>
      {previous !== undefined && <p className="mt-1 text-[11px] text-muted-foreground">Previous period: {previous}</p>}
    </div>
  );
}

function Change({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  const difference = current - previous;
  if (Math.abs(difference) < 0.01) return <span className="text-muted-foreground">No change</span>;
  const improved = difference > 0;
  return (
    <span className={improved ? "text-teal-300" : "text-orange-300"}>
      {improved ? <ArrowUpRight className="mr-1 inline h-3 w-3" /> : <ArrowDownRight className="mr-1 inline h-3 w-3" />}
      {Math.abs(difference).toFixed(suffix ? 1 : 0)}{suffix}
    </span>
  );
}

function Comparison({ current, previous }: { current: PeriodStats; previous: PeriodStats }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-teal-300/10 bg-teal-300/[0.035] p-4 text-xs sm:grid-cols-4">
      <p><span className="block text-muted-foreground">Frequency</span><Change current={current.count} previous={previous.count} /></p>
      <p><span className="block text-muted-foreground">Average</span><Change current={current.averageHours} previous={previous.averageHours} suffix="h" /></p>
      <p><span className="block text-muted-foreground">Longest</span><Change current={current.longestHours} previous={previous.longestHours} suffix="h" /></p>
      <p><span className="block text-muted-foreground">Shortest</span><Change current={current.shortestHours} previous={previous.shortestHours} suffix="h" /></p>
    </div>
  );
}

export function Stats() {
  const { fasts } = useFasting();
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("month");
  const [showComparison, setShowComparison] = useState(false);

  if (!fasts?.length) return null;

  const current = calculateStats(fasts, currentRange(selectedPeriod));
  const previous = selectedPeriod === "all-time" ? null : calculateStats(fasts, previousRange(selectedPeriod));
  const completedCount = fasts.filter((fast) => fast.endTime).length;

  return (
    <section className="surface p-5 sm:p-7" aria-labelledby="pattern-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="pattern-title" className="font-display text-3xl tracking-[-0.02em]">Your pattern</h2>
          <p className="mt-1 text-sm text-muted-foreground">See how often and how long you fasted.</p>
        </div>
        <BarChart3 className="mt-1 h-6 w-6 text-teal-300" />
      </div>

      <div className="period-strip -mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Statistics period">
        {PERIODS.map((period) => (
          <button
            key={period.value}
            type="button"
            role="tab"
            id={`stats-tab-${period.value}`}
            aria-controls={`stats-panel-${period.value}`}
            aria-selected={selectedPeriod === period.value}
            className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold transition ${
              selectedPeriod === period.value
                ? "bg-amber-300 text-stone-950"
                : "border border-white/[0.07] bg-white/[0.025] text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setSelectedPeriod(period.value);
              if (period.value === "all-time") setShowComparison(false);
            }}
          >
            {period.label}
          </button>
        ))}
      </div>

      <div
        id={`stats-panel-${selectedPeriod}`}
        role="tabpanel"
        aria-labelledby={`stats-tab-${selectedPeriod}`}
      >
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            {PERIOD_LABELS[selectedPeriod]}
          </div>
          {previous && (
            <button
              type="button"
              className="min-h-11 rounded-lg px-2 text-xs font-semibold text-teal-300 hover:text-teal-200"
              onClick={() => setShowComparison((value) => !value)}
              aria-expanded={showComparison}
              aria-controls="period-comparison"
            >
              {showComparison ? "Hide comparison" : "Compare periods"}
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Fasts" value={current.count} />
          <Metric label="Average" value={formatDuration(current.averageHours)} />
          <Metric label="Longest" value={formatDuration(current.longestHours)} />
          <Metric label="Shortest" value={formatDuration(current.shortestHours)} />
        </div>

        {showComparison && previous && (
          <div id="period-comparison"><Comparison current={current} previous={previous} /></div>
        )}
      </div>

      <div className="mt-6 border-t border-white/[0.07] pt-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-amber-300" />
          Your records
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Longest ever" value={formatDuration(longestFastHours(fasts))} />
          <Metric label="Most in a month" value={mostFastsInMonth(fasts)} />
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Award className="h-3.5 w-3.5" />
          {completedCount} completed fasts in your history
        </p>
      </div>
    </section>
  );
}
