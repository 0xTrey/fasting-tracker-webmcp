import { describe, expect, it } from "vitest";
import type { Fast } from "@shared/types";
import { buildHistoryDataset } from "@/lib/history-analytics";

const now = new Date("2026-09-10T12:00:00.000Z");
const fasts: Fast[] = [
  { id: 1, startTime: "2026-09-01T08:00:00Z", endTime: "2026-09-02T00:00:00Z", targetDuration: 960 },
  { id: 2, startTime: "2026-09-03T18:00:00Z", endTime: "2026-09-04T10:00:00Z", targetDuration: 960 },
  { id: 3, startTime: "2026-08-01T00:00:00Z", endTime: "2026-08-01T12:00:00Z", targetDuration: 960 },
  { id: 4, startTime: "2026-09-05T00:00:00Z", endTime: null, targetDuration: 960 },
  { id: 5, startTime: "bad", endTime: "2026-09-06T00:00:00Z", targetDuration: 960 },
  { id: 6, startTime: "2026-09-07T00:00:00Z", endTime: "2026-09-06T00:00:00Z", targetDuration: 960 },
];

describe("buildHistoryDataset", () => {
  it("builds every view from completed records in a bounded range", () => {
    const d = buildHistoryDataset(fasts, 30, now);
    expect(d.durationTrend.map(x => x.fastId)).toEqual([1, 2]);
    expect(d.calendarDays.find(x => x.date === "2026-09-02")).toMatchObject({ date: "2026-09-02", count: 1, targetHitCount: 1, fastIds: [1] });
    expect(d.calendarDays.find(x => x.date === "2026-09-05")).toMatchObject({ date: "2026-09-05", count: 0, fastIds: [] });
    expect(d.durationTrend[1].rollingAverageHours).toBe(16);
    expect(d.targetBuckets.reduce((n, x) => n + x.total, 0)).toBe(2);
    expect(d.rhythmBuckets[8].startCount).toBe(1);
    expect(d.rhythmBuckets[10].endCount).toBe(1);
    expect(d.distributionBuckets.find(x => x.label === "16–20h")?.count).toBe(2);
    expect(d.periodComparison.current.count).toBe(2);
    expect(d.insights.length).toBeGreaterThanOrEqual(2);
  });

  it("handles empty, active, invalid, and all-time records", () => {
    const empty = buildHistoryDataset([], 90, now);
    expect(empty.durationTrend).toEqual([]);
    expect(empty.periodComparison.current.count).toBe(0);
    expect(empty.insights[0].fastIds).toEqual([]);
    const all = buildHistoryDataset(fasts, "all", now);
    expect(all.durationTrend.map(x => x.fastId)).toEqual([3, 1, 2]);
    expect(all.durationTrend).not.toContainEqual(expect.objectContaining({ fastId: 4 }));
    expect(all.durationTrend).not.toContainEqual(expect.objectContaining({ fastId: 5 }));
    expect(all.durationTrend).not.toContainEqual(expect.objectContaining({ fastId: 6 }));
  });

  it("is deterministic for an explicit now and excludes boundary-outside records", () => {
    const one = buildHistoryDataset(fasts, 30, now);
    const two = buildHistoryDataset([...fasts].reverse(), 30, now);
    expect(two).toEqual(one);
    expect(one.durationTrend.map(x => x.fastId)).toEqual([1, 2]);
    expect(one.start).toBe("2026-08-11T12:00:00.000Z");
  });
});
