import { describe, expect, it } from "vitest";
import type { Fast } from "@shared/types";
import {
  activeFastProgress,
  calculateFastingSummary,
  calculateStats,
  compareFastingPeriods,
  currentRange,
  formatDuration,
  longestFastHours,
  mostFastsInMonth,
  previousRange,
  previewFastWindow,
} from "@/lib/fasting-stats";

const fasts: Fast[] = [
  { id: 1, startTime: "2026-08-02T00:00:00.000Z", endTime: "2026-08-02T16:30:00.000Z", targetDuration: 960 },
  { id: 2, startTime: "2026-08-05T00:00:00.000Z", endTime: "2026-08-05T18:30:00.000Z", targetDuration: 1080 },
  { id: 3, startTime: "2026-07-06T00:00:00.000Z", endTime: "2026-07-06T20:00:00.000Z", targetDuration: 1200 },
  { id: 4, startTime: "2026-08-09T00:00:00.000Z", endTime: null, targetDuration: 960 },
];

describe("fasting statistics", () => {
  it("calculates completed fasts within the selected range", () => {
    const stats = calculateStats(fasts, {
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-08-31T23:59:59.999Z"),
    });
    expect(stats.count).toBe(2);
    expect(stats.averageHours).toBe(17.5);
    expect(stats.longestHours).toBe(18.5);
    expect(stats.shortestHours).toBe(16.5);
  });

  it("formats rounded durations without producing 60 minutes", () => {
    expect(formatDuration(17.999)).toBe("18h 0m");
    expect(formatDuration(0)).toBe("–");
  });

  it("finds personal records", () => {
    expect(longestFastHours(fasts)).toBe(20);
    expect(mostFastsInMonth(fasts)).toBe(2);
  });

  it("builds adjacent current and previous month ranges", () => {
    const now = new Date(2026, 7, 9, 12, 0, 0);
    const current = currentRange("month", now);
    const previous = previousRange("month", now);
    expect(current.start.getMonth()).toBe(7);
    expect(previous.start.getMonth()).toBe(6);
    expect(previous.end.getTime()).toBe(current.start.getTime() - 1);
  });

  it("summarizes a rolling window without counting an active fast", () => {
    const summary = calculateFastingSummary(fasts, 10, new Date("2026-08-09T23:00:00.000Z"));
    expect(summary).toMatchObject({
      days: 10,
      count: 2,
      averageHours: 17.5,
      totalHours: 35,
      targetMetCount: 2,
      targetMetRate: 100,
    });
  });

  it("compares adjacent periods using one deterministic reference time", () => {
    const comparison = compareFastingPeriods(fasts, "month", new Date("2026-08-09T23:00:00.000Z"));
    expect(comparison.current.count).toBe(2);
    expect(comparison.previous.count).toBe(1);
    expect(comparison.change.count).toBe(1);
    expect(comparison.change.averageHours).toBe(-2.5);
  });

  it("previews an end time and reports bounded active progress", () => {
    expect(previewFastWindow(960, new Date("2026-08-09T00:00:00.000Z"))).toEqual({
      startTime: "2026-08-09T00:00:00.000Z",
      targetDurationMinutes: 960,
      targetEndTime: "2026-08-09T16:00:00.000Z",
    });

    const progress = activeFastProgress(
      { id: 9, startTime: "2026-08-09T00:00:00.000Z", endTime: null, targetDuration: 120 },
      new Date("2026-08-09T01:30:00.000Z"),
    );
    expect(progress).toMatchObject({
      elapsedMinutes: 90,
      remainingMinutes: 30,
      overtimeMinutes: 0,
      progressPercent: 75,
      targetReached: false,
    });
  });
});
