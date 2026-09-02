import type { Fast } from "@shared/types";

export type TimePeriod = "week" | "month" | "quarter" | "year" | "all-time";

export interface PeriodStats {
  count: number;
  averageHours: number;
  longestHours: number;
  shortestHours: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface FastingSummary extends PeriodStats {
  days: number;
  targetMetCount: number;
  targetMetRate: number | null;
  totalHours: number;
}

export interface PeriodComparison {
  period: Exclude<TimePeriod, "all-time">;
  referenceDate: string;
  current: PeriodStats & { start: string; end: string };
  previous: PeriodStats & { start: string; end: string };
  change: {
    count: number;
    averageHours: number;
    longestHours: number;
    shortestHours: number;
  };
}

export interface FastWindowPreview {
  startTime: string;
  targetDurationMinutes: number;
  targetEndTime: string;
}

export interface ActiveFastProgress extends FastWindowPreview {
  elapsedMinutes: number;
  remainingMinutes: number;
  overtimeMinutes: number;
  progressPercent: number;
  targetReached: boolean;
}

function startOfPeriod(period: Exclude<TimePeriod, "all-time">, value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  if (period === "week") {
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
  } else if (period === "month") {
    date.setDate(1);
  } else if (period === "quarter") {
    date.setMonth(Math.floor(date.getMonth() / 3) * 3, 1);
  } else {
    date.setMonth(0, 1);
  }
  return date;
}

export function currentRange(period: TimePeriod, now = new Date()): DateRange {
  if (period === "all-time") return { start: new Date(0), end: now };
  return { start: startOfPeriod(period, now), end: now };
}

export function previousRange(period: Exclude<TimePeriod, "all-time">, now = new Date()): DateRange {
  const currentStart = startOfPeriod(period, now);
  const previousEnd = new Date(currentStart.getTime() - 1);
  return { start: startOfPeriod(period, previousEnd), end: previousEnd };
}

export function calculateStats(fasts: Fast[], range: DateRange): PeriodStats {
  const durations = fasts
    .filter((fast) => fast.endTime)
    .filter((fast) => {
      const endedAt = new Date(fast.endTime!).getTime();
      return endedAt >= range.start.getTime() && endedAt <= range.end.getTime();
    })
    .map((fast) => (new Date(fast.endTime!).getTime() - new Date(fast.startTime).getTime()) / 3_600_000)
    .filter((duration) => duration >= 0);

  if (durations.length === 0) {
    return { count: 0, averageHours: 0, longestHours: 0, shortestHours: 0 };
  }

  return {
    count: durations.length,
    averageHours: durations.reduce((total, duration) => total + duration, 0) / durations.length,
    longestHours: Math.max(...durations),
    shortestHours: Math.min(...durations),
  };
}

export function rollingRange(days: number, now = new Date()): DateRange {
  const boundedDays = Math.max(1, Math.min(365, Math.floor(days)));
  return {
    start: new Date(now.getTime() - boundedDays * 24 * 60 * 60 * 1000),
    end: now,
  };
}

export function calculateFastingSummary(fasts: Fast[], days: number, now = new Date()): FastingSummary {
  const boundedDays = Math.max(1, Math.min(365, Math.floor(days)));
  const range = rollingRange(boundedDays, now);
  const completed = fasts.filter((fast) => {
    if (!fast.endTime) return false;
    const endedAt = new Date(fast.endTime).getTime();
    return endedAt >= range.start.getTime() && endedAt <= range.end.getTime();
  });
  const stats = calculateStats(completed, range);
  const totalHours = completed.reduce((total, fast) => (
    total + (new Date(fast.endTime!).getTime() - new Date(fast.startTime).getTime()) / 3_600_000
  ), 0);
  const targetMetCount = completed.filter((fast) => (
    new Date(fast.endTime!).getTime() - new Date(fast.startTime).getTime() >= fast.targetDuration * 60_000
  )).length;

  return {
    ...stats,
    days: boundedDays,
    targetMetCount,
    targetMetRate: completed.length ? Math.round((targetMetCount / completed.length) * 1000) / 10 : null,
    totalHours: Math.round(totalHours * 100) / 100,
  };
}

export function compareFastingPeriods(
  fasts: Fast[],
  period: Exclude<TimePeriod, "all-time">,
  referenceDate = new Date(),
): PeriodComparison {
  const current = currentRange(period, referenceDate);
  const previous = previousRange(period, referenceDate);
  const currentStats = calculateStats(fasts, current);
  const previousStats = calculateStats(fasts, previous);
  return {
    period,
    referenceDate: referenceDate.toISOString(),
    current: { ...currentStats, start: current.start.toISOString(), end: current.end.toISOString() },
    previous: { ...previousStats, start: previous.start.toISOString(), end: previous.end.toISOString() },
    change: {
      count: currentStats.count - previousStats.count,
      averageHours: currentStats.averageHours - previousStats.averageHours,
      longestHours: currentStats.longestHours - previousStats.longestHours,
      shortestHours: currentStats.shortestHours - previousStats.shortestHours,
    },
  };
}

export function previewFastWindow(targetDurationMinutes: number, startTime = new Date()): FastWindowPreview {
  const boundedTarget = Math.max(60, Math.min(10_080, Math.floor(targetDurationMinutes)));
  return {
    startTime: startTime.toISOString(),
    targetDurationMinutes: boundedTarget,
    targetEndTime: new Date(startTime.getTime() + boundedTarget * 60_000).toISOString(),
  };
}

export function activeFastProgress(fast: Fast, now = new Date()): ActiveFastProgress {
  const preview = previewFastWindow(fast.targetDuration, new Date(fast.startTime));
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - new Date(fast.startTime).getTime()) / 60_000));
  const remaining = fast.targetDuration - elapsedMinutes;
  return {
    ...preview,
    elapsedMinutes,
    remainingMinutes: Math.max(0, remaining),
    overtimeMinutes: Math.max(0, -remaining),
    progressPercent: Math.round(Math.min(100, Math.max(0, (elapsedMinutes / fast.targetDuration) * 100)) * 10) / 10,
    targetReached: remaining <= 0,
  };
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "–";
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

export function longestFastHours(fasts: Fast[]): number {
  return fasts.reduce((longest, fast) => {
    if (!fast.endTime) return longest;
    const duration = (new Date(fast.endTime).getTime() - new Date(fast.startTime).getTime()) / 3_600_000;
    return duration > longest ? duration : longest;
  }, 0);
}

export function mostFastsInMonth(fasts: Fast[]): number {
  const counts = new Map<string, number>();
  for (const fast of fasts) {
    if (!fast.endTime) continue;
    const date = new Date(fast.endTime);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}
