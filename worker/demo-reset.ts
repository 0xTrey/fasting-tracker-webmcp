import type { Env } from "./env";
import { AppError, json } from "./http";
import type { Actor } from "./actions";

const BASELINE_FASTS = [
  ["2026-08-02T23:30:00.000Z", "2026-08-03T15:42:00.000Z", 960, "2026-08-03T15:42:00.000Z"],
  ["2026-08-05T22:10:00.000Z", "2026-08-06T16:31:00.000Z", 1080, "2026-08-06T16:31:00.000Z"],
  ["2026-08-09T00:15:00.000Z", "2026-08-09T17:02:00.000Z", 960, "2026-08-09T17:02:00.000Z"],
  ["2026-08-12T23:05:00.000Z", "2026-08-13T17:18:00.000Z", 1080, "2026-08-13T17:18:00.000Z"],
  ["2026-08-16T00:40:00.000Z", "2026-08-16T20:53:00.000Z", 1200, "2026-08-16T20:53:00.000Z"],
  ["2026-08-19T22:25:00.000Z", "2026-08-20T14:51:00.000Z", 960, "2026-08-20T14:51:00.000Z"],
  ["2026-08-23T23:55:00.000Z", "2026-08-24T18:10:00.000Z", 1080, "2026-08-24T18:10:00.000Z"],
  ["2026-08-27T00:05:00.000Z", "2026-08-27T16:40:00.000Z", 960, "2026-08-27T16:40:00.000Z"],
  ["2026-08-29T22:45:00.000Z", "2026-08-30T17:20:00.000Z", 1080, "2026-08-30T17:20:00.000Z"],
  ["2026-08-31T23:30:00.000Z", "2026-09-01T15:42:00.000Z", 960, "2026-09-01T15:42:00.000Z"],
  ["2026-09-01T22:55:00.000Z", "2026-09-02T15:31:00.000Z", 960, "2026-09-02T15:31:00.000Z"],
] as const;

function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(key)) {
    throw new AppError("A valid Idempotency-Key is required", 400, "idempotency_key_required");
  }
  return key;
}

export async function resetDemo(request: Request, env: Env, actor: Actor): Promise<Response> {
  if (env.APP_MODE !== "demo") return json({ error: "Not found", code: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "Method not allowed", code: "method_not_allowed" }, 405);
  const body = await request.json().catch(() => null) as { confirm?: unknown } | null;
  if (body?.confirm !== true) throw new AppError("Demo reset requires confirmation", 400, "confirmation_required");
  const idempotencyKey = requireIdempotencyKey(request);

  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  const statements = [
    env.FASTING_DB.prepare("DELETE FROM fasts"),
    env.FASTING_DB.prepare("DELETE FROM fasting_experiments"),
    env.FASTING_DB.prepare("DELETE FROM idempotency_keys"),
    env.FASTING_DB.prepare("DELETE FROM audit_events"),
    ...BASELINE_FASTS.map(([start, end, target, updated]) => env.FASTING_DB.prepare(
      "INSERT INTO fasts (start_time, end_time, target_duration, updated_at) VALUES (?1, ?2, ?3, ?4)",
    ).bind(start, end, target, updated)),
    env.FASTING_DB.prepare(
      `INSERT INTO audit_events
       (event_id, occurred_at, actor_type, actor_id, origin, action, resource_type, resource_id, request_id, idempotency_key, outcome, metadata_json)
       VALUES (?1, ?2, ?3, ?4, ?5, 'demo.reset', 'demo', NULL, ?6, ?7, 'succeeded', ?8)`,
    ).bind(
      auditEventId,
      now,
      actor.type,
      actor.id,
      actor.origin,
      requestId,
      idempotencyKey,
      JSON.stringify({ baselineFastCount: BASELINE_FASTS.length }),
    ),
  ];
  await env.FASTING_DB.batch(statements);
  return json({
    data: { fastCount: BASELINE_FASTS.length, experiment: null, resetAt: now },
    receipt: { requestId, auditEventId, replayed: false },
  });
}
