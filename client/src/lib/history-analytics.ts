import type { Fast } from "@shared/types";
import type { HistoryRangeDays } from "./agent-workspace";

export interface DurationTrendPoint { fastId: number; endedAt: string; durationHours: number; targetHours: number; rollingAverageHours: number }
export interface CalendarDay { date: string; count: number; totalHours: number; targetHitCount: number; fastIds: number[] }
export interface TargetBucket { period: string; met: number; missed: number; total: number }
export interface PeriodSummary { start: string; end: string; count: number; totalHours: number; averageHours: number; targetHitCount: number; targetHitRate: number | null }
export interface PeriodComparison { current: PeriodSummary; previous: PeriodSummary }
export interface RhythmBucket { hour: number; startCount: number; endCount: number }
export interface DistributionBucket { label: string; minHours: number; maxHours: number | null; count: number; fastIds: number[] }
export interface HistoryInsight { text: string; fastIds: number[] }
export interface HistoryDataset {
  rangeDays: HistoryRangeDays; start: string; end: string;
  durationTrend: DurationTrendPoint[]; calendarDays: CalendarDay[]; targetBuckets: TargetBucket[];
  periodComparison: PeriodComparison; rhythmBuckets: RhythmBucket[]; distributionBuckets: DistributionBucket[];
  insights: HistoryInsight[];
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (d: Date) => d.toISOString();
const shifted = (date: Date, timezoneOffsetMinutes: number) => new Date(date.getTime() - timezoneOffsetMinutes * 60_000);
const dayKey = (date: Date, timezoneOffsetMinutes: number) => shifted(date, timezoneOffsetMinutes).toISOString().slice(0, 10);
const round = (n: number, digits = 2) => Number(n.toFixed(digits));

function validCompleted(f: Fast): { start: Date; end: Date; hours: number } | null {
  if (!f.endTime) return null;
  const start = new Date(f.startTime), end = new Date(f.endTime);
  const hours = (end.getTime() - start.getTime()) / HOUR;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || !Number.isFinite(hours) || hours < 0) return null;
  return { start, end, hours };
}

function summary(items: { fast: Fast; hours: number }[], start: Date, end: Date): PeriodSummary {
  const total = items.reduce((n, x) => n + x.hours, 0);
  const hits = items.filter(x => Number.isFinite(x.fast.targetDuration) && x.fast.targetDuration >= 0 && x.hours * 60 >= x.fast.targetDuration).length;
  return { start: iso(start), end: iso(end), count: items.length, totalHours: round(total), averageHours: items.length ? round(total / items.length) : 0, targetHitCount: hits, targetHitRate: items.length ? round(hits / items.length * 100, 1) : null };
}

export function buildHistoryDataset(fasts: Fast[], rangeDays: HistoryRangeDays, now = new Date(), timezoneOffsetMinutes = 0): HistoryDataset {
  const end = new Date(now);
  const windowMs = rangeDays === "all" ? end.getTime() : rangeDays * DAY;
  const start = new Date(rangeDays === "all" ? 0 : end.getTime() - windowMs);
  const completed = fasts.map(fast => ({ fast, data: validCompleted(fast) })).filter((x): x is { fast: Fast; data: { start: Date; end: Date; hours: number } } => Boolean(x.data));
  const inRange = completed.filter(x => x.data.end >= start && x.data.end <= end).sort((a, b) => a.data.end.getTime() - b.data.end.getTime() || a.fast.id - b.fast.id);
  const durationTrend = inRange.map((x, i) => ({ fastId: x.fast.id, endedAt: iso(x.data.end), durationHours: round(x.data.hours), targetHours: round(Math.max(0, x.fast.targetDuration) / 60), rollingAverageHours: round(inRange.slice(Math.max(0, i - 2), i + 1).reduce((n, y) => n + y.data.hours, 0) / Math.min(3, i + 1)) }));
  const days = new Map<string, CalendarDay>();
  for (const x of inRange) { const key = dayKey(x.data.end, timezoneOffsetMinutes); const d = days.get(key) ?? { date: key, count: 0, totalHours: 0, targetHitCount: 0, fastIds: [] }; d.count++; d.totalHours = round(d.totalHours + x.data.hours); if (x.fast.targetDuration >= 0 && x.data.hours * 60 >= x.fast.targetDuration) d.targetHitCount++; d.fastIds.push(x.fast.id); days.set(key, d); }
  const firstCalendarDate = rangeDays === "all" && inRange.length ? inRange[0].data.end : start;
  const firstKey = dayKey(firstCalendarDate, timezoneOffsetMinutes);
  const lastKey = dayKey(end, timezoneOffsetMinutes);
  const calendarDays: CalendarDay[] = [];
  for (let cursor = Date.parse(`${firstKey}T00:00:00.000Z`); cursor <= Date.parse(`${lastKey}T00:00:00.000Z`); cursor += DAY) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    calendarDays.push(days.get(key) ?? { date: key, count: 0, totalHours: 0, targetHitCount: 0, fastIds: [] });
  }
  const bucketPeriod = rangeDays !== "all" && rangeDays <= 90 ? "week" : "month";
  const bucketMap = new Map<string, TargetBucket>();
  for (const x of inRange) { const localEnd = shifted(x.data.end, timezoneOffsetMinutes); const day = Date.UTC(localEnd.getUTCFullYear(), localEnd.getUTCMonth(), localEnd.getUTCDate()); const weekStart = new Date(day - ((localEnd.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); const key = bucketPeriod === "week" ? weekStart : localEnd.toISOString().slice(0, 7); const b = bucketMap.get(key) ?? { period: key, met: 0, missed: 0, total: 0 }; b.total++; if (x.data.hours * 60 >= x.fast.targetDuration) b.met++; else b.missed++; bucketMap.set(key, b); }
  const targetBuckets = [...bucketMap.values()].sort((a, b) => a.period.localeCompare(b.period));
  const previousEnd = new Date(start.getTime() - 1), previousStart = new Date(start.getTime() - windowMs);
  const previous = completed.filter(x => x.data.end >= previousStart && x.data.end <= previousEnd);
  const periodComparison = { current: summary(inRange.map(x => ({ fast: x.fast, hours: x.data.hours })), start, end), previous: summary(previous.map(x => ({ fast: x.fast, hours: x.data.hours })), previousStart, previousEnd) };
  const rhythmBuckets = Array.from({ length: 24 }, (_, hour) => ({ hour, startCount: 0, endCount: 0 }));
  for (const x of inRange) { rhythmBuckets[shifted(x.data.start, timezoneOffsetMinutes).getUTCHours()].startCount++; rhythmBuckets[shifted(x.data.end, timezoneOffsetMinutes).getUTCHours()].endCount++; }
  const definitions = [["< 12h", 0, 12], ["12–16h", 12, 16], ["16–20h", 16, 20], ["20–24h", 20, 24], ["24h+", 24, null]] as const;
  const distributionBuckets = definitions.map(([label, minHours, maxHours]) => { const xs = inRange.filter(x => x.data.hours >= minHours && (maxHours === null || x.data.hours < maxHours)); return { label, minHours, maxHours, count: xs.length, fastIds: xs.map(x => x.fast.id) }; });
  const insights: HistoryInsight[] = [];
  if (inRange.length) { const longest = inRange.reduce((a, b) => a.data.hours >= b.data.hours ? a : b); insights.push({ text: `Your longest fast was ${round(longest.data.hours, 1)} hours.`, fastIds: [longest.fast.id] }); const hitIds = inRange.filter(x => x.data.hours * 60 >= x.fast.targetDuration).map(x => x.fast.id); insights.push({ text: `${hitIds.length} of ${inRange.length} completed fasts met their target.`, fastIds: hitIds }); }
  if (insights.length < 2 && !inRange.length) insights.push({ text: "No completed fasts are in this range yet.", fastIds: [] });
  return { rangeDays, start: iso(start), end: iso(end), durationTrend, calendarDays, targetBuckets, periodComparison, rhythmBuckets, distributionBuckets, insights: insights.slice(0, 4) };
}
