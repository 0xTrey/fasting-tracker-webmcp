import { describe, expect, it, vi } from "vitest";
import { listTrackerActivity } from "../worker/actions";
import type { Env } from "../worker/env";

// Regression: ISSUE-002, reset left old synthetic agent activity visible.
// Found by /qa on 2026-09-02.
// Report: .gstack/qa-reports/qa-report-fasting-tracker-webmcp-demo.harnden-trey.workers.dev-2026-09-02.md
describe("demo activity reset boundary", () => {
  it("returns only tracker activity created after the latest successful demo reset", async () => {
    let preparedSql = "";
    const all = vi.fn(async () => ({ results: [] }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn((sql: string) => {
      preparedSql = sql;
      return { bind };
    });

    await listTrackerActivity({ FASTING_DB: { prepare } } as unknown as Env, 6);

    expect(preparedSql).toContain("id > COALESCE");
    expect(preparedSql).toContain("action = 'demo.reset'");
    expect(preparedSql).toContain("outcome = 'succeeded'");
    expect(bind).toHaveBeenCalledWith(6);
    expect(all).toHaveBeenCalledOnce();
  });
});
