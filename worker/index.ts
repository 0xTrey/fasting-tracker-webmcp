import type { Env } from "./env";
import { appMode } from "./env";
import { getBrowserAuth, handleAuth, requireBrowserMutation, verifyBearerToken } from "./auth";
import {
  adjustActiveFastStart,
  adminDeleteFast,
  adminEditFast,
  listAuditEvents,
  listTrackerActivity,
  getFastingSummary,
  getActiveExperiment,
  createExperiment,
  cancelExperiment,
  listFasts,
  startFast,
  stopFast,
  type Actor,
} from "./actions";
import {
  AppError,
  error,
  json,
  parseDuration,
  parseId,
  readJson,
  secureAssetResponse,
} from "./http";
import { handleMcp } from "./mcp";
import { resetDemo } from "./demo-reset";

function actionResponse<T>(result: { status: number; body: T }): Response {
  const requestId = (result.body as { receipt?: { requestId?: string } }).receipt?.requestId;
  return json(result.body, result.status, requestId ? { "X-Request-Id": requestId } : {});
}

function appErrorResponse(caught: unknown): Response {
  if (caught instanceof AppError) return error(caught.message, caught.status, caught.code);
  console.error("Request failed", caught);
  return error("The tracker hit an unexpected error", 500, "unexpected_error");
}

export function actorForBrowserMutation(request: Request, auth: { username: string; actor: Actor }): Actor {
  return request.headers.get("X-Fasting-Client") === "webmcp"
    ? { type: "mcp", id: `browser:${auth.username}`, origin: "mcp" }
    : auth.actor;
}

async function handleFasts(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === "/api/fasts" && request.method === "GET") {
    const auth = await getBrowserAuth(request, env);
    if (!auth) return error("Authentication required", 401, "authentication_required");
    return json(await listFasts(env));
  }

  let auth;
  try {
    auth = await requireBrowserMutation(request, env);
  } catch (caught) {
    return appErrorResponse(caught);
  }
  const actor = actorForBrowserMutation(request, auth);
  const idempotencyKey = request.headers.get("Idempotency-Key");

  try {
    if (pathname === "/api/fasts/start" && request.method === "POST") {
      const body = await readJson(request);
      const targetDuration = parseDuration(body?.targetDuration);
      if (!targetDuration) return error("Choose a target between 1 hour and 7 days", 400, "invalid_target_duration");
      return actionResponse(await startFast(env, actor, targetDuration, idempotencyKey));
    }

    if (pathname === "/api/fasts/stop" && request.method === "POST") {
      const body = await readJson(request);
      const fastId = parseId(body?.fastId);
      if (!fastId) return error("A valid fast id is required", 400, "invalid_fast_id");
      return actionResponse(await stopFast(env, actor, fastId, idempotencyKey));
    }

    const startMatch = pathname.match(/^\/api\/fasts\/(\d+)\/start-time$/u);
    if (startMatch && request.method === "PATCH") {
      const fastId = parseId(startMatch[1]);
      const body = await readJson(request);
      if (!fastId || typeof body?.startTime !== "string") {
        return error("A valid start time is required", 400, "invalid_start_time");
      }
      return actionResponse(await adjustActiveFastStart(env, actor, fastId, body.startTime, idempotencyKey));
    }
  } catch (caught) {
    return appErrorResponse(caught);
  }

  return error("Not found", 404, "not_found");
}

async function handleAdmin(request: Request, env: Env, pathname: string): Promise<Response> {
  if (appMode(env) === "demo") return error("Not found", 404, "not_found");
  if (!env.ADMIN_API_TOKEN_HASH) return error("Admin API is not configured", 503, "admin_not_configured");
  if (!(await verifyBearerToken(request, [env.ADMIN_API_TOKEN_HASH]))) {
    return error(
      "Admin authentication required",
      401,
      "admin_authentication_required",
      { "WWW-Authenticate": 'Bearer realm="fasting-tracker-admin"' },
    );
  }
  const actor: Actor = { type: "admin", id: "backend-admin", origin: "admin" };

  if (pathname === "/api/admin/audit" && request.method === "GET") {
    const limit = parseId(new URL(request.url).searchParams.get("limit")) ?? 100;
    return json({ events: await listAuditEvents(env, limit) });
  }

  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return error("JSON content type required", 415, "json_required");
  }
  const body = await readJson(request);
  const idempotencyKey = request.headers.get("Idempotency-Key");
  const match = pathname.match(/^\/api\/admin\/fasts\/(\d+)$/u);
  const fastId = match ? parseId(match[1]) : null;
  if (!fastId || !body) return error("Not found", 404, "not_found");

  try {
    if (request.method === "PATCH") {
      const input = {
        startTime: typeof body.startTime === "string" ? body.startTime : undefined,
        endTime: body.endTime === null || typeof body.endTime === "string" ? body.endTime : undefined,
        reason: typeof body.reason === "string" ? body.reason : "",
        confirmFastId: parseId(body.confirmFastId) ?? 0,
      };
      return actionResponse(await adminEditFast(env, actor, fastId, input, idempotencyKey));
    }
    if (request.method === "DELETE") {
      const input = {
        reason: typeof body.reason === "string" ? body.reason : "",
        confirmFastId: parseId(body.confirmFastId) ?? 0,
      };
      return actionResponse(await adminDeleteFast(env, actor, fastId, input, idempotencyKey));
    }
  } catch (caught) {
    return appErrorResponse(caught);
  }

  return error("Method not allowed", 405, "method_not_allowed");
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        await env.FASTING_DB.prepare("SELECT 1").first();
        return json({ ok: true, mode: appMode(env) });
      }
      if (url.pathname.startsWith("/api/auth/")) return handleAuth(request, env, url.pathname);
      if (url.pathname === "/api/demo/reset") {
        if (appMode(env) !== "demo") return error("Not found", 404, "not_found");
        let auth;
        try { auth = await requireBrowserMutation(request, env); } catch (caught) { return appErrorResponse(caught); }
        if (!auth) return error("Authentication required", 401, "authentication_required");
        try { return await resetDemo(request, env, auth.actor); } catch (caught) { return appErrorResponse(caught); }
      }
      if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, env, url.pathname);
      if (url.pathname === "/api/fasts/summary" && request.method === "GET") {
        const auth = await getBrowserAuth(request, env);
        if (!auth) return error("Authentication required", 401, "authentication_required");
        const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
        return json(await getFastingSummary(env, Number.isFinite(days) ? days : 30));
      }
      if (url.pathname === "/api/experiments/active" && request.method === "GET") {
        const auth = await getBrowserAuth(request, env);
        if (!auth) return error("Authentication required", 401, "authentication_required");
        return json(await getActiveExperiment(env));
      }
      if (url.pathname === "/api/experiments" && request.method === "POST") {
        let auth;
        try { auth = await requireBrowserMutation(request, env); } catch (caught) { return appErrorResponse(caught); }
        const body = await readJson(request);
        if (!body) return error("A JSON object is required", 400, "invalid_json");
        try {
          return actionResponse(await createExperiment(env, actorForBrowserMutation(request, auth), {
            name: typeof body.name === "string" ? body.name : "",
            targetDurationMinutes: Number(body.targetDurationMinutes),
            weeklyGoal: Number(body.weeklyGoal),
            startDate: typeof body.startDate === "string" ? body.startDate : "",
            endDate: typeof body.endDate === "string" ? body.endDate : "",
            confirm: body.confirm === true,
          }, request.headers.get("Idempotency-Key")));
        } catch (caught) { return appErrorResponse(caught); }
      }
      const cancelExperimentMatch = url.pathname.match(/^\/api\/experiments\/(\d+)\/cancel$/u);
      if (cancelExperimentMatch && request.method === "POST") {
        let auth;
        try { auth = await requireBrowserMutation(request, env); } catch (caught) { return appErrorResponse(caught); }
        const experimentId = parseId(cancelExperimentMatch[1]);
        const body = await readJson(request);
        if (!experimentId || !body) return error("A valid experiment is required", 400, "invalid_experiment_id");
        try {
          return actionResponse(await cancelExperiment(
            env,
            actorForBrowserMutation(request, auth),
            experimentId,
            { confirmExperimentId: parseId(body.confirmExperimentId) ?? 0 },
            request.headers.get("Idempotency-Key"),
          ));
        } catch (caught) { return appErrorResponse(caught); }
      }
      if (url.pathname === "/api/agent-activity" && request.method === "GET") {
        const auth = await getBrowserAuth(request, env);
        if (!auth) return error("Authentication required", 401, "authentication_required");
        const limit = Number(new URL(request.url).searchParams.get("limit") ?? 25);
        return json({ events: await listTrackerActivity(env, Number.isFinite(limit) ? limit : 25) });
      }
      if (url.pathname.startsWith("/api/fasts")) return handleFasts(request, env, url.pathname);
      if (url.pathname === "/mcp") {
        if (appMode(env) === "demo") return error("Not found", 404, "not_found");
        return handleMcp(request, env, context);
      }
      if (url.pathname.startsWith("/api/")) return error("Not found", 404, "not_found");
      return secureAssetResponse(await env.ASSETS.fetch(request));
    } catch (caught) {
      return appErrorResponse(caught);
    }
  },
} satisfies ExportedHandler<Env>;
