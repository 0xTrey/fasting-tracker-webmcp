import { describe, expect, it, vi } from "vitest";
import worker from "../worker/index";
import { resetDemo } from "../worker/demo-reset";
import type { Env } from "../worker/env";

function env(mode: "demo" | "production") {
  return { APP_MODE: mode, FASTING_DB: {}, ASSETS: { fetch: vi.fn() } } as unknown as Env;
}

const actor = { type: "user", id: "demo-visitor", origin: "web" } as const;

describe("demo reset", () => {
  it("is not exposed in production", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/demo/reset", { method: "POST" }), env("production"), {} as ExecutionContext);
    expect(response.status).toBe(404);
  });

  it("requires explicit confirmation before touching the database", async () => {
    const batch = vi.fn();
    await expect(resetDemo(
      new Request("https://example.test/api/demo/reset", { method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" } }),
      { ...env("demo"), FASTING_DB: { batch } } as unknown as Env,
      actor,
    )).rejects.toMatchObject({ status: 400, code: "confirmation_required" });
    expect(batch).not.toHaveBeenCalled();
  });

  it("requires an idempotency key for a confirmed reset", async () => {
    const batch = vi.fn();
    await expect(resetDemo(
      new Request("https://example.test/api/demo/reset", { method: "POST", body: JSON.stringify({ confirm: true }), headers: { "Content-Type": "application/json" } }),
      { ...env("demo"), FASTING_DB: { batch } } as unknown as Env,
      actor,
    )).rejects.toMatchObject({ status: 400, code: "idempotency_key_required" });
    expect(batch).not.toHaveBeenCalled();
  });

  it("restores the eleven-record baseline and appends an audit receipt", async () => {
    const statements: unknown[] = [];
    const batch = vi.fn(async (items: unknown[]) => { statements.push(...items); return []; });
    const response = await resetDemo(
      new Request("https://example.test/api/demo/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": "demo-reset-test" },
      }),
      { ...env("demo"), FASTING_DB: { batch, prepare: vi.fn((sql: string) => ({ bind: vi.fn(() => ({ sql })), sql })) } } as unknown as Env,
      actor,
    );
    expect(response.status).toBe(200);
    const result = await response.json() as { data: { fastCount: number } };
    expect(result.data.fastCount).toBe(11);
    expect(batch).toHaveBeenCalledOnce();
    expect(statements).toHaveLength(15);
  });
});
