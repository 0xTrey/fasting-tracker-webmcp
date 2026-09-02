import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import type { Env } from "./env";
import { verifyBearerToken } from "./auth";
import {
  adjustActiveFastStart,
  getCurrentFast,
  getFastingSummary,
  listFasts,
  listTrackerActivity,
  startFast,
  stopFast,
  type Actor,
} from "./actions";
import { AppError, error } from "./http";

const mcpActor: Actor = { type: "mcp", id: "grok", origin: "mcp" };

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

function toolError(caught: unknown) {
  const appError = caught instanceof AppError
    ? caught
    : new AppError("The tracker hit an unexpected error", 500, "unexpected_error");
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: appError.message, code: appError.code }) }],
    isError: true,
  };
}

function createFastingMcpServer(env: Env): McpServer {
  const server = new McpServer({ name: "fasting-tracker", version: "2.4.1" });

  server.registerTool(
    "get_current_fast",
    {
      description: "Return the active fast, or null when no fast is active.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => toolResult({ currentFast: await getCurrentFast(env) }),
  );

  server.registerTool(
    "list_recent_fasts",
    {
      description: "Return a bounded list of recent fasting records. Use summaries unless exact records are needed.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => toolResult({ fasts: await listFasts(env, limit) }),
  );

  server.registerTool(
    "get_fasting_summary",
    {
      description: "Summarize completed fasting activity over a bounded number of days.",
      inputSchema: { days: z.number().int().min(1).max(365).default(30) },
      annotations: { readOnlyHint: true },
    },
    async ({ days }) => toolResult(await getFastingSummary(env, days)),
  );

  server.registerTool(
    "get_agent_activity",
    {
      description: "Return a bounded, sanitized list of browser and MCP fast activity events.",
      inputSchema: { limit: z.number().int().min(1).max(25).default(25) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => toolResult({ events: await listTrackerActivity(env, limit) }),
  );

  server.registerTool(
    "start_fast",
    {
      description: "Start one fast with a target duration. Reuse the same idempotency key if retrying the same request.",
      inputSchema: {
        targetDurationMinutes: z.number().int().min(60).max(10_080),
        idempotencyKey: z.string().min(8).max(128),
      },
    },
    async ({ targetDurationMinutes, idempotencyKey }) => {
      try {
        return toolResult((await startFast(env, mcpActor, targetDurationMinutes, idempotencyKey)).body);
      } catch (caught) {
        return toolError(caught);
      }
    },
  );

  server.registerTool(
    "stop_fast",
    {
      description: "Stop the active fast by id. Reuse the same idempotency key if retrying the same request.",
      inputSchema: {
        fastId: z.number().int().positive(),
        idempotencyKey: z.string().min(8).max(128),
      },
    },
    async ({ fastId, idempotencyKey }) => {
      try {
        return toolResult((await stopFast(env, mcpActor, fastId, idempotencyKey)).body);
      } catch (caught) {
        return toolError(caught);
      }
    },
  );

  server.registerTool(
    "adjust_active_fast_start",
    {
      description: "Correct the start time of the currently active fast. Historical edits are intentionally unavailable.",
      inputSchema: {
        fastId: z.number().int().positive(),
        startTime: z.string().datetime(),
        idempotencyKey: z.string().min(8).max(128),
      },
    },
    async ({ fastId, startTime, idempotencyKey }) => {
      try {
        return toolResult((await adjustActiveFastStart(env, mcpActor, fastId, startTime, idempotencyKey)).body);
      } catch (caught) {
        return toolError(caught);
      }
    },
  );

  return server;
}

export async function handleMcp(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  if (!env.MCP_TOKEN_HASH) {
    return error("MCP authentication is not configured", 503, "mcp_not_configured");
  }
  if (!(await verifyBearerToken(request, [env.MCP_TOKEN_HASH, env.MCP_TOKEN_PREVIOUS_HASH]))) {
    return error(
      "MCP authentication required",
      401,
      "mcp_authentication_required",
      { "WWW-Authenticate": 'Bearer realm="fasting-tracker-mcp"' },
    );
  }
  return createMcpHandler(() => createFastingMcpServer(env), {
    route: "/mcp",
    corsOptions: false,
  })(request, env, context);
}
