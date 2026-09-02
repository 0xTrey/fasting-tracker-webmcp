import { useMemo } from "react";
import type { Fast } from "@shared/types";
import type { HistoryChartType, HistoryViewSpec } from "@/lib/agent-workspace";
import { buildHistoryDataset, type HistoryDataset } from "@/lib/history-analytics";

const charts: Array<{ id: HistoryChartType; label: string; description: string }> = [
  { id: "consistency-calendar", label: "Consistency calendar", description: "Your rhythm day by day." },
  { id: "duration-trend", label: "Duration trend", description: "Length, target, and rolling average." },
  { id: "target-attainment", label: "Target attainment", description: "Targets met versus missed." },
  { id: "period-comparison", label: "Period comparison", description: "This period beside the previous one." },
  { id: "start-time-rhythm", label: "Daily rhythm", description: "When your fasts usually begin and end." },
  { id: "duration-distribution", label: "Duration distribution", description: "Where your durations cluster." },
];

function formatHours(value: number): string {
  return `${Math.round(value * 10) / 10}h`;
}

function EmptyChart() {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-muted-foreground">
      Complete a fast to start building this view.
    </div>
  );
}

function ConsistencyCalendar({ data, highlighted }: { data: HistoryDataset; highlighted: Set<number> }) {
  return (
    <div>
      <div
        role="img"
        aria-label={`${data.durationTrend.length} completed fasts across ${data.calendarDays.length} calendar days`}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
      >
        {data.calendarDays.map((day) => {
          const selected = day.fastIds.some((id) => highlighted.has(id));
          const tone = day.count === 0
            ? "bg-white/[0.055]"
            : day.targetHitCount > 0
              ? "bg-amber-300"
              : "bg-teal-300/55";
          return (
            <span
              key={day.date}
              title={`${day.date}: ${day.count ? `${day.count} fast${day.count === 1 ? "" : "s"}, ${formatHours(day.totalHours)}` : "no recorded fast"}`}
              className={`aspect-square min-h-2 rounded-[0.22rem] transition ${tone} ${selected ? "ring-2 ring-white ring-offset-2 ring-offset-stone-950" : ""}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-white/[0.08]" />No record</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-teal-300/55" />Recorded</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-amber-300" />Target met</span>
      </div>
    </div>
  );
}

function DurationTrend({ data, highlighted }: { data: HistoryDataset; highlighted: Set<number> }) {
  const points = data.durationTrend.slice(-60);
  const width = 720;
  const height = 250;
  const pad = 24;
  const max = Math.max(1, ...points.flatMap((point) => [point.durationHours, point.targetHours, point.rollingAverageHours]));
  const x = (index: number) => points.length === 1 ? width / 2 : pad + index * ((width - pad * 2) / (points.length - 1));
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const path = (selector: (point: (typeof points)[number]) => number) => points.map((point, index) => `${x(index)},${y(selector(point))}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-h-56 w-full overflow-visible rounded-2xl border border-white/[0.06] bg-black/10 p-2" role="img" aria-label="Fasting duration, selected target, and three-fast rolling average over time">
        {[0.25, 0.5, 0.75].map((ratio) => <line className="chart-gridline" key={ratio} x1={pad} x2={width - pad} y1={height * ratio} y2={height * ratio} />)}
        <polyline points={path((point) => point.targetHours)} fill="none" stroke="rgba(246,197,93,.35)" strokeWidth="2" strokeDasharray="8 8" />
        <polyline points={path((point) => point.rollingAverageHours)} fill="none" stroke="rgba(74,194,181,.9)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={path((point) => point.durationHours)} fill="none" stroke="rgba(246,197,93,.95)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={point.fastId} cx={x(index)} cy={y(point.durationHours)} r={highlighted.has(point.fastId) ? 8 : 4} fill={highlighted.has(point.fastId) ? "#fff" : "#f6c55d"} stroke="#1a1209" strokeWidth="2">
            <title>{`Fast ${point.fastId}: ${formatHours(point.durationHours)}, target ${formatHours(point.targetHours)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span><i className="mr-1.5 inline-block h-0.5 w-5 bg-amber-300 align-middle" />Duration</span>
        <span><i className="mr-1.5 inline-block h-0.5 w-5 bg-teal-300 align-middle" />Rolling average</span>
        <span><i className="mr-1.5 inline-block w-5 border-t border-dashed border-amber-200/50 align-middle" />Chosen target</span>
      </div>
    </div>
  );
}

function TargetAttainment({ data }: { data: HistoryDataset }) {
  return (
    <div className="space-y-3" role="img" aria-label="Targets met and missed by period">
      {data.targetBuckets.map((bucket) => (
        <div key={bucket.period} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3 text-xs">
          <span className="truncate text-muted-foreground">{bucket.period}</span>
          <div className="flex h-8 overflow-hidden rounded-lg bg-white/[0.06]">
            <span className="bg-amber-300" style={{ width: `${bucket.total ? (bucket.met / bucket.total) * 100 : 0}%` }} title={`${bucket.met} met`} />
            <span className="bg-rose-300/45" style={{ width: `${bucket.total ? (bucket.missed / bucket.total) * 100 : 0}%` }} title={`${bucket.missed} missed`} />
          </div>
          <span className="text-right text-foreground">{bucket.met}/{bucket.total}</span>
        </div>
      ))}
      <div className="flex gap-4 pt-1 text-[11px] text-muted-foreground">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-amber-300" />Met</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-rose-300/45" />Missed</span>
      </div>
    </div>
  );
}

function PeriodComparison({ data, compare }: { data: HistoryDataset; compare: boolean }) {
  const entries = [
    { label: "Fast count", current: data.periodComparison.current.count, previous: data.periodComparison.previous.count, suffix: "" },
    { label: "Average", current: data.periodComparison.current.averageHours, previous: data.periodComparison.previous.averageHours, suffix: "h" },
    { label: "Total", current: data.periodComparison.current.totalHours, previous: data.periodComparison.previous.totalHours, suffix: "h" },
    { label: "Targets met", current: data.periodComparison.current.targetHitRate ?? 0, previous: data.periodComparison.previous.targetHitRate ?? 0, suffix: "%" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="img" aria-label={compare ? "Current and previous period comparison" : "Current period summary"}>
      {entries.map((entry) => {
        const delta = entry.current - entry.previous;
        return (
          <div key={entry.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-xs text-muted-foreground">{entry.label}</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="font-display text-3xl">{Math.round(entry.current * 10) / 10}{entry.suffix}</p>
              {compare && <p className={`text-xs ${delta >= 0 ? "text-teal-300" : "text-rose-300"}`}>{delta >= 0 ? "+" : ""}{Math.round(delta * 10) / 10}{entry.suffix}</p>}
            </div>
            {compare && <p className="mt-1 text-[11px] text-muted-foreground">Previous: {Math.round(entry.previous * 10) / 10}{entry.suffix}</p>}
          </div>
        );
      })}
    </div>
  );
}

function RhythmChart({ data }: { data: HistoryDataset }) {
  const max = Math.max(1, ...data.rhythmBuckets.flatMap((bucket) => [bucket.startCount, bucket.endCount]));
  return (
    <div>
      <div role="img" aria-label="Start and end counts across the 24-hour day" className="flex h-56 items-end gap-1 rounded-2xl border border-white/[0.06] bg-black/10 p-4">
        {data.rhythmBuckets.map((bucket) => (
          <div key={bucket.hour} className="flex h-full flex-1 items-end gap-px" title={`${String(bucket.hour).padStart(2, "0")}:00, ${bucket.startCount} starts and ${bucket.endCount} ends`}>
            <span className="block min-w-[2px] flex-1 rounded-t bg-amber-300" style={{ height: `${bucket.startCount ? Math.max(4, (bucket.startCount / max) * 100) : 0}%` }} />
            <span className="block min-w-[2px] flex-1 rounded-t bg-teal-300/65" style={{ height: `${bucket.endCount ? Math.max(4, (bucket.endCount / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between px-1 text-[10px] text-muted-foreground"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
      <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground"><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-amber-300" />Starts</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-teal-300/65" />Ends</span></div>
    </div>
  );
}

function DistributionChart({ data, highlighted }: { data: HistoryDataset; highlighted: Set<number> }) {
  const max = Math.max(1, ...data.distributionBuckets.map((bucket) => bucket.count));
  return (
    <div className="flex h-64 items-end gap-2 rounded-2xl border border-white/[0.06] bg-black/10 p-4" role="img" aria-label="Distribution of completed fasting durations">
      {data.distributionBuckets.map((bucket) => {
        const selected = bucket.fastIds.some((id) => highlighted.has(id));
        return (
          <div key={bucket.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs text-foreground">{bucket.count}</span>
            <span className={`block w-full rounded-t bg-teal-300/70 ${selected ? "ring-2 ring-white ring-offset-2 ring-offset-stone-950" : ""}`} style={{ height: `${bucket.count ? Math.max(8, (bucket.count / max) * 75) : 0}%` }} title={`${bucket.label}: ${bucket.count} fasts`} />
            <span className="text-center text-[10px] leading-tight text-muted-foreground">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Chart({ type, data, highlightedFastIds, compare }: { type: HistoryChartType; data: HistoryDataset; highlightedFastIds: number[]; compare: boolean }) {
  if (!data.durationTrend.length) return <EmptyChart />;
  const highlighted = new Set(highlightedFastIds);
  if (type === "consistency-calendar") return <ConsistencyCalendar data={data} highlighted={highlighted} />;
  if (type === "duration-trend") return <DurationTrend data={data} highlighted={highlighted} />;
  if (type === "target-attainment") return <TargetAttainment data={data} />;
  if (type === "period-comparison") return <PeriodComparison data={data} compare={compare} />;
  if (type === "start-time-rhythm") return <RhythmChart data={data} />;
  return <DistributionChart data={data} highlighted={highlighted} />;
}

export function HistoryStudio({ fasts, spec, onSpecChange }: { fasts: Fast[]; spec: HistoryViewSpec; onSpecChange: (next: HistoryViewSpec) => void }) {
  const timezoneOffset = new Date().getTimezoneOffset();
  const data = useMemo(() => buildHistoryDataset(fasts, spec.rangeDays, new Date(), timezoneOffset), [fasts, spec.rangeDays, timezoneOffset]);
  const selected = charts.find((chart) => chart.id === spec.chartType) ?? charts[0];
  const update = (partial: Partial<HistoryViewSpec>) => onSpecChange({ ...spec, ...partial });

  return (
    <section className="surface space-y-6 p-5 sm:p-7" aria-labelledby="history-studio-title">
      <div>
        <h2 id="history-studio-title" className="font-display text-3xl tracking-[-0.02em]">History Studio</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">Ask the agent to build a view, or choose one below. Every conclusion stays connected to the fasts behind it.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {charts.map((chart) => (
          <button
            type="button"
            key={chart.id}
            aria-pressed={spec.chartType === chart.id}
            onClick={() => update({ chartType: chart.id, highlightedFastIds: [] })}
            className={`rounded-2xl border p-4 text-left transition ${spec.chartType === chart.id ? "border-primary/70 bg-primary/10" : "border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.06]"}`}
          >
            <span className="block text-sm font-semibold">{chart.label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{chart.description}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-y border-white/[0.07] py-4">
        <label className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground" htmlFor="history-range">Range</label>
        <select
          id="history-range"
          value={spec.rangeDays}
          onChange={(event) => {
            const rangeDays = event.target.value === "all" ? "all" : Number(event.target.value) as HistoryViewSpec["rangeDays"];
            update({ rangeDays, compareWithPrevious: rangeDays === "all" ? false : spec.compareWithPrevious, highlightedFastIds: [] });
          }}
          className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-sm"
        >
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
          <option value={365}>365 days</option>
          <option value="all">All time</option>
        </select>
        <label className={`flex items-center gap-2 text-sm ${spec.rangeDays === "all" ? "text-muted-foreground/50" : ""}`}>
          <input type="checkbox" disabled={spec.rangeDays === "all"} checked={spec.compareWithPrevious && spec.rangeDays !== "all"} onChange={(event) => update({ compareWithPrevious: event.target.checked })} />
          Compare previous period
        </label>
      </div>

      <div>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl">{selected.label}</h3>
            <p className="text-xs text-muted-foreground">{data.durationTrend.length} completed fasts in this range</p>
          </div>
          <span className="shrink-0 rounded-full border border-teal-200/15 bg-teal-200/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-200">Agent-created view</span>
        </div>
        <Chart type={spec.chartType} data={data} highlightedFastIds={spec.highlightedFastIds} compare={spec.compareWithPrevious} />
      </div>

      {data.insights.length > 0 && (
        <aside aria-label="Insights from your records" className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
          <p className="text-sm font-semibold text-primary">What the data shows</p>
          <ul className="mt-2 space-y-2 text-sm">
            {data.insights.map((insight, index) => (
              <li key={`${insight.text}-${index}`}>
                <button type="button" className="text-left text-foreground/85 transition hover:text-primary" onClick={() => update({ highlightedFastIds: insight.fastIds })}>{insight.text}</button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}
