import { describe, expect, it } from "vitest";
import { cancelExperiment, createExperiment, getActiveExperiment, type Actor } from "../worker/actions";
import type { Env } from "../worker/env";

const actor: Actor = { type: "user", id: "trey", origin: "web" };

function db(options: { active?: unknown } = {}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    queries,
    prepare(sql: string) {
      return {
        sql,
        bind(...values: unknown[]) {
          queries.push({ sql, values });
          return {
            sql,
            values,
            first: async <T>() => (sql.includes("FROM fasting_experiments") ? options.active as T : null),
            run: async () => ({ meta: { changes: 1 } }),
            all: async () => ({ results: [] }),
          };
        },
        first: async <T>() => (sql.includes("FROM fasting_experiments") ? options.active as T : null),
        run: async () => ({ meta: { changes: 1 } }),
      };
    },
    batch: async (statements: Array<{ sql?: string; values?: unknown[] }>) => statements.map((statement, index) => {
      const placeholders = [...(statement.sql ?? "").matchAll(/\?(\d+)/gu)].map((match) => Number(match[1]));
      const expectedBindings = placeholders.length ? Math.max(...placeholders) : 0;
      if (expectedBindings !== (statement.values?.length ?? 0)) {
        throw new Error(`SQL expected ${expectedBindings} bindings but received ${statement.values?.length ?? 0}`);
      }
      return { meta: { changes: index === 0 ? 1 : 0 }, sql: statement.sql };
    }),
  };
  return { FASTING_DB: database } as unknown as Env & { FASTING_DB: typeof database };
}

describe("fasting experiments", () => {
  it("rejects missing, oversized, and malformed names before mutation", async () => {
    for (const name of ["", "x".repeat(81)]) {
      await expect(Promise.resolve().then(() => createExperiment(db(), actor, {
        name, targetDurationMinutes: 960, weeklyGoal: 3, startDate: "2026-09-01", endDate: "2026-09-28", confirm: true,
      }, "experiment-name-test"))).rejects.toMatchObject({ code: "invalid_experiment_name", status: 400 });
    }
  });

  it("rejects invalid targets, goals, and date ranges", async () => {
    const base = { name: "Consistency", targetDurationMinutes: 960, weeklyGoal: 3, startDate: "2026-09-01", endDate: "2026-09-28", confirm: true };
    await expect(Promise.resolve().then(() => createExperiment(db(), actor, { ...base, targetDurationMinutes: 59 }, "experiment-bounds-1"))).rejects.toMatchObject({ code: "invalid_target_duration" });
    await expect(Promise.resolve().then(() => createExperiment(db(), actor, { ...base, weeklyGoal: 8 }, "experiment-bounds-2"))).rejects.toMatchObject({ code: "invalid_weekly_goal" });
    await expect(Promise.resolve().then(() => createExperiment(db(), actor, { ...base, startDate: "2026-10-01", endDate: "2026-09-01" }, "experiment-bounds-3"))).rejects.toMatchObject({ code: "invalid_experiment_range" });
    await expect(Promise.resolve().then(() => createExperiment(db(), actor, { ...base, startDate: "2026-09-01", endDate: "2027-10-02" }, "experiment-bounds-4"))).rejects.toMatchObject({ code: "experiment_range_too_large" });
  });

  it("rejects a second active experiment", async () => {
    await expect(createExperiment(db({ active: { id: 4, name: "Existing", target_duration: 960, weekly_goal: 3, start_date: "2026-09-01", end_date: "2026-09-28", status: "active", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" } }), actor, {
      name: "Another", targetDurationMinutes: 960, weeklyGoal: 3, startDate: "2026-09-01", endDate: "2026-09-28", confirm: true,
    }, "experiment-conflict-1")).rejects.toMatchObject({ code: "active_experiment_exists", status: 409 });
  });

  it("returns the active experiment directly and records experiment resource type", async () => {
    const active = { id: 4, name: "Consistency", target_duration: 960, weekly_goal: 3, start_date: "2026-09-01", end_date: "2026-09-28", status: "active", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" };
    const database = db({ active });
    await expect(getActiveExperiment(database)).resolves.toMatchObject({ id: 4, name: "Consistency" });
    const creationDatabase = db();
    const result = await createExperiment(creationDatabase, actor, { name: "Consistency", targetDurationMinutes: 960, weeklyGoal: 3, startDate: "2026-09-01", endDate: "2026-09-28", confirm: true }, "experiment-create-1");
    expect(result.body.data.name).toBe("Consistency");
    const auditInsert = creationDatabase.FASTING_DB.queries.find((query) => query.sql.includes("INSERT INTO audit_events"));
    expect(auditInsert?.values).toContain("experiment");
  });

  it("requires the exact id and cancels only an active experiment", async () => {
    const active = { id: 4, name: "Consistency", target_duration: 960, weekly_goal: 3, start_date: "2026-09-01", end_date: "2026-09-28", status: "active", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" };
    await expect(Promise.resolve().then(() => cancelExperiment(db({ active }), actor, 4, { confirmExperimentId: 5 }, "experiment-cancel-mismatch")))
      .rejects.toMatchObject({ code: "confirmation_mismatch", status: 400 });

    const database = db({ active });
    const result = await cancelExperiment(database, actor, 4, { confirmExperimentId: 4 }, "experiment-cancel-1");
    expect(result.body.data).toMatchObject({ id: 4, status: "cancelled" });
    expect(database.FASTING_DB.queries.some((query) => query.sql.includes("WHERE id = ?2 AND status = 'active'") && query.values.includes(4))).toBe(true);
    const auditInsert = database.FASTING_DB.queries.find((query) => query.sql.includes("INSERT INTO audit_events"));
    expect(auditInsert?.values).toContain("experiment");
  });

  it("does not cancel a completed experiment", async () => {
    const completed = { id: 4, name: "Consistency", target_duration: 960, weekly_goal: 3, start_date: "2026-09-01", end_date: "2026-09-28", status: "completed", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-29T00:00:00.000Z" };
    await expect(cancelExperiment(db({ active: completed }), actor, 4, { confirmExperimentId: 4 }, "experiment-cancel-completed"))
      .rejects.toMatchObject({ code: "experiment_not_active", status: 409 });
  });
});
