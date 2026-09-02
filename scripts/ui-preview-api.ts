import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { AuditEventSummary, Fast, FastingExperiment, MutationReceipt, SessionState } from "../shared/types.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const CSRF_TOKEN = "local-ui-preview-csrf";

interface PreviewState {
  fasts: Fast[];
  events: AuditEventSummary[];
  nextFastId: number;
  experiment: FastingExperiment | null;
  nextExperimentId: number;
}

function previewSession(): SessionState {
  return {
    authenticated: true,
    username: "preview-user",
    role: "user",
    csrfToken: CSRF_TOKEN,
    mode: "preview",
  };
}

function sampleFasts(referenceTime: number): Fast[] {
  const durations = [16.2, 17.8, 15.4, 18.3, 16.7, 14.9, 19.1, 16.1, 17.2, 15.8, 20.2, 16.5];
  const targets = [16, 18, 16, 18, 16, 16, 20, 16, 18, 16, 20, 16];
  return durations.map((duration, index) => {
    const endTime = new Date(referenceTime - (index + 1) * DAY + (index % 3) * HOUR);
    return {
      id: index + 1,
      startTime: new Date(endTime.getTime() - duration * HOUR).toISOString(),
      endTime: endTime.toISOString(),
      targetDuration: targets[index] * 60,
    };
  });
}

function sampleEvents(referenceTime: number): AuditEventSummary[] {
  return [
    {
      eventId: "preview-agent-adjust",
      occurredAt: new Date(referenceTime - 2 * HOUR).toISOString(),
      actorType: "mcp",
      origin: "mcp",
      action: "fast.adjust_active_start",
      resourceType: "fast",
      resourceId: "preview-complete",
      outcome: "succeeded",
      requestId: "preview-request-agent-adjust",
    },
    {
      eventId: "preview-user-stop",
      occurredAt: new Date(referenceTime - DAY).toISOString(),
      actorType: "user",
      origin: "web",
      action: "fast.stop",
      resourceType: "fast",
      resourceId: "1",
      outcome: "succeeded",
      requestId: "preview-request-user-stop",
    },
  ];
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > 10_000) return null;
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function mutationAllowed(request: IncomingMessage): boolean {
  return request.headers["x-csrf-token"] === CSRF_TOKEN
    && request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function addActivity(
  state: PreviewState,
  request: IncomingMessage,
  action: string,
  resourceId: string,
  resourceType = "fast",
): { requestId: string; auditEventId: string } {
  const isAgent = request.headers["x-fasting-client"] === "webmcp";
  const requestId = crypto.randomUUID();
  const auditEventId = `preview-${crypto.randomUUID()}`;
  state.events.unshift({
    eventId: auditEventId,
    occurredAt: new Date().toISOString(),
    actorType: isAgent ? "mcp" : "user",
    origin: isAgent ? "mcp" : "web",
    action,
    resourceType,
    resourceId,
    outcome: "succeeded",
    requestId,
  });
  return { requestId, auditEventId };
}

function withReceipt<T>(
  state: PreviewState,
  request: IncomingMessage,
  action: string,
  data: T,
  resourceId: string,
  resourceType = "fast",
): MutationReceipt<T> {
  const ids = addActivity(state, request, action, resourceId, resourceType);
  return { data, receipt: { ...ids, replayed: false } };
}

function fastingSummary(fasts: Fast[], requestedDays: string | null): Record<string, number | null> {
  const parsedDays = Number(requestedDays ?? 30);
  const days = Number.isFinite(parsedDays) ? Math.max(1, Math.min(365, Math.floor(parsedDays))) : 30;
  const since = Date.now() - days * DAY;
  const completed = fasts.filter((fast) => fast.endTime && Date.parse(fast.endTime) >= since);
  const durations = completed.map((fast) => (
    (Date.parse(fast.endTime!) - Date.parse(fast.startTime)) / HOUR
  ));
  return {
    days,
    completedCount: durations.length,
    averageHours: durations.length
      ? Math.round((durations.reduce((total, duration) => total + duration, 0) / durations.length) * 100) / 100
      : null,
    longestHours: durations.length ? Math.round(Math.max(...durations) * 100) / 100 : null,
  };
}

function createPreviewHandler(state: PreviewState) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (!request.url?.startsWith("/api/")) {
      next();
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      sendJson(response, 200, previewSession());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      sendJson(response, 200, previewSession());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/fasts") {
      sendJson(response, 200, state.fasts);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/fasts/summary") {
      sendJson(response, 200, fastingSummary(state.fasts, url.searchParams.get("days")));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/agent-activity") {
      const parsedLimit = Number(url.searchParams.get("limit") ?? 10);
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(25, Math.floor(parsedLimit))) : 10;
      sendJson(response, 200, { events: state.events.slice(0, limit) });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/experiments/active") {
      sendJson(response, 200, state.experiment);
      return;
    }

    if (!mutationAllowed(request)) {
      sendJson(response, 403, { error: "Preview mutation requires the local session confirmation." });
      return;
    }
    const body = await readBody(request);
    if (!body) {
      sendJson(response, 400, { error: "A valid JSON object is required." });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/experiments") {
      if (state.experiment) {
        sendJson(response, 409, { error: "An experiment is already active." });
        return;
      }
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const targetDurationMinutes = Number(body.targetDurationMinutes);
      const weeklyGoal = Number(body.weeklyGoal);
      const startDate = typeof body.startDate === "string" ? body.startDate : "";
      const endDate = typeof body.endDate === "string" ? body.endDate : "";
      if (!name || name.length > 80 || !Number.isInteger(targetDurationMinutes) || targetDurationMinutes < 60 || targetDurationMinutes > 10_080 || !Number.isInteger(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 7 || !/^\d{4}-\d{2}-\d{2}$/u.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(endDate) || startDate > endDate || body.confirm !== true) {
        sendJson(response, 400, { error: "Choose a valid, confirmed experiment." });
        return;
      }
      const now = new Date().toISOString();
      state.experiment = {
        id: state.nextExperimentId,
        name,
        targetDurationMinutes,
        weeklyGoal,
        startDate,
        endDate,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      state.nextExperimentId += 1;
      sendJson(response, 201, withReceipt(state, request, "experiment.create", state.experiment, String(state.experiment.id), "experiment"));
      return;
    }

    const cancelExperimentMatch = url.pathname.match(/^\/api\/experiments\/(\d+)\/cancel$/u);
    if (request.method === "POST" && cancelExperimentMatch) {
      const experimentId = Number(cancelExperimentMatch[1]);
      if (!state.experiment || state.experiment.id !== experimentId || body.confirmExperimentId !== experimentId) {
        sendJson(response, 409, { error: "No matching active experiment was found." });
        return;
      }
      const cancelled = { ...state.experiment, status: "cancelled" as const, updatedAt: new Date().toISOString() };
      state.experiment = null;
      sendJson(response, 200, withReceipt(state, request, "experiment.cancel", cancelled, String(experimentId), "experiment"));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/fasts/start") {
      const targetDuration = Number(body.targetDuration);
      if (!Number.isInteger(targetDuration) || targetDuration < 60 || targetDuration > 10_080) {
        sendJson(response, 400, { error: "Choose a target between 1 hour and 7 days." });
        return;
      }
      if (state.fasts.some((fast) => !fast.endTime)) {
        sendJson(response, 409, { error: "A fast is already active." });
        return;
      }
      const fast: Fast = {
        id: state.nextFastId,
        startTime: new Date().toISOString(),
        endTime: null,
        targetDuration,
      };
      state.nextFastId += 1;
      state.fasts.unshift(fast);
      sendJson(response, 201, withReceipt(state, request, "fast.start", fast, String(fast.id)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/fasts/stop") {
      const fastId = Number(body.fastId);
      const fast = state.fasts.find((candidate) => candidate.id === fastId && !candidate.endTime);
      if (!fast) {
        sendJson(response, 409, { error: "No matching active fast was found." });
        return;
      }
      fast.endTime = new Date().toISOString();
      sendJson(response, 200, withReceipt(state, request, "fast.stop", fast, String(fast.id)));
      return;
    }

    const startMatch = url.pathname.match(/^\/api\/fasts\/(\d+)\/start-time$/u);
    if (request.method === "PATCH" && startMatch) {
      const fast = state.fasts.find((candidate) => candidate.id === Number(startMatch[1]) && !candidate.endTime);
      const startTime = typeof body.startTime === "string" ? new Date(body.startTime) : null;
      if (!fast) {
        sendJson(response, 409, { error: "No matching active fast was found." });
        return;
      }
      if (!startTime || Number.isNaN(startTime.getTime()) || startTime.getTime() > Date.now()) {
        sendJson(response, 400, { error: "Choose a valid start time that is not in the future." });
        return;
      }
      fast.startTime = startTime.toISOString();
      sendJson(response, 200, withReceipt(state, request, "fast.adjust_active_start", fast, String(fast.id)));
      return;
    }

    sendJson(response, 404, { error: "Preview API route not found." });
  };
}

export function uiPreviewApi(): Plugin {
  const referenceTime = Date.now();
  const state: PreviewState = {
    fasts: sampleFasts(referenceTime),
    events: sampleEvents(referenceTime),
    nextFastId: 100,
    experiment: null,
    nextExperimentId: 1000,
  };
  return {
    name: "fasting-tracker-ui-preview-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createPreviewHandler(state));
    },
  };
}
