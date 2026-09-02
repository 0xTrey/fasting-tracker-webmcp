#!/usr/bin/env node

import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const baseUrl = process.env.FASTING_TRACKER_URL ?? "http://127.0.0.1:8787";
const username = process.env.FASTING_SMOKE_USERNAME;
const password = process.env.FASTING_SMOKE_PASSWORD;
const mcpToken = process.env.FASTING_SMOKE_MCP_TOKEN;
const adminToken = process.env.FASTING_SMOKE_ADMIN_TOKEN;
const readOnly = process.env.FASTING_SMOKE_READ_ONLY === "1";
const expectedMode = process.env.FASTING_SMOKE_EXPECTED_MODE;
const expectedCount = process.env.FASTING_SMOKE_EXPECTED_COUNT
  ? Number(process.env.FASTING_SMOKE_EXPECTED_COUNT)
  : null;

assert(username, "FASTING_SMOKE_USERNAME is required");
assert(password, "FASTING_SMOKE_PASSWORD is required");
assert(mcpToken, "FASTING_SMOKE_MCP_TOKEN is required");
if (!readOnly) assert(adminToken, "FASTING_SMOKE_ADMIN_TOKEN is required for mutation cleanup");

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") ?? "").split(/,(?=\s*__Host-)/u);
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

async function responseBody(response) {
  return response.json().catch(() => null);
}

const anonymousHistory = await fetch(`${baseUrl}/api/fasts`);
assert.equal(anonymousHistory.status, 401, "fasting history must require a browser session");

const crossOriginLogin = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://example.invalid" },
  body: JSON.stringify({ username, password }),
});
assert.equal(crossOriginLogin.status, 403, "cross-origin login must be rejected");

const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseUrl },
  body: JSON.stringify({ username, password }),
});
assert.equal(loginResponse.status, 200, `login failed: ${JSON.stringify(await responseBody(loginResponse.clone()))}`);
const cookies = cookieHeader(loginResponse);
assert.match(cookies, /__Host-ft_session=/u, "login must return the secure session cookie");
assert.match(cookies, /__Host-ft_csrf=/u, "login must return the CSRF cookie");
const loginState = await loginResponse.json();
assert.equal(loginState.authenticated, true, "login must establish an authenticated session");
assert(loginState.csrfToken, "login must return the session CSRF token");
if (expectedMode) assert.equal(loginState.mode, expectedMode, "the Worker must report the expected workspace mode");

const browserHeaders = {
  Accept: "application/json",
  Cookie: cookies,
};
const historyResponse = await fetch(`${baseUrl}/api/fasts`, { headers: browserHeaders });
assert.equal(historyResponse.status, 200, "signed-in fasting history must be available");
const baselineHistory = await historyResponse.json();
assert(Array.isArray(baselineHistory), "fasting history must be an array");
if (expectedCount !== null) assert.equal(baselineHistory.length, expectedCount, "the workspace must contain the expected visible record count");
assert.equal(
  baselineHistory.some((fast) => !fast.endTime),
  false,
  "the smoke database must not contain an active fast before mutation testing",
);

const unauthorizedMcp = await fetch(`${baseUrl}/mcp`, { method: "POST" });
assert.equal(unauthorizedMcp.status, 401, "MCP must require its independent bearer token");

const mcpClient = new Client({ name: "fasting-smoke", version: "1.0.0" });
const mcpTransport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
  authProvider: { token: async () => mcpToken },
});
await mcpClient.connect(mcpTransport);
const mcpTools = await mcpClient.listTools();
const mcpToolNames = mcpTools.tools.map((tool) => tool.name);
for (const expectedTool of ["get_current_fast", "list_recent_fasts", "start_fast", "stop_fast", "adjust_active_fast_start"]) {
  assert(mcpToolNames.includes(expectedTool), `MCP must expose ${expectedTool}`);
}
assert.equal(mcpToolNames.some((name) => name.includes("delete") || name.includes("admin")), false, "MCP must not expose admin tools");
await mcpClient.close();

if (readOnly) {
  console.log(`Read-only smoke passed: authenticated browser access and ${mcpToolNames.length} bearer-authenticated MCP tools.`);
  process.exit(0);
}

const mutationHeaders = (idempotencyKey) => ({
  ...browserHeaders,
  Origin: baseUrl,
  "Content-Type": "application/json",
  "X-CSRF-Token": loginState.csrfToken,
  "Idempotency-Key": idempotencyKey,
});

const rejectedCrossOriginMutation = await fetch(`${baseUrl}/api/fasts/start`, {
  method: "POST",
  headers: {
    ...mutationHeaders("smoke-cross-origin-1"),
    Origin: "https://example.invalid",
  },
  body: JSON.stringify({ targetDuration: 960 }),
});
assert.equal(rejectedCrossOriginMutation.status, 403, "cross-origin browser mutations must be rejected");

const startKey = `smoke-start-${crypto.randomUUID()}`;
const startBody = JSON.stringify({ targetDuration: 960 });
const startResponse = await fetch(`${baseUrl}/api/fasts/start`, {
  method: "POST",
  headers: mutationHeaders(startKey),
  body: startBody,
});
assert.equal(startResponse.status, 201, `start failed: ${JSON.stringify(await responseBody(startResponse.clone()))}`);
const startedReceipt = await startResponse.json();
const started = startedReceipt.data;
assert.equal(startedReceipt.receipt.replayed, false, "the first mutation must not be marked as a replay");

const replayResponse = await fetch(`${baseUrl}/api/fasts/start`, {
  method: "POST",
  headers: mutationHeaders(startKey),
  body: startBody,
});
assert.equal(replayResponse.status, 201, "an exact idempotent replay must return the original status");
const replayReceipt = await replayResponse.json();
assert.equal(replayReceipt.data.id, started.id, "an idempotent replay must return the original fast");
assert.equal(replayReceipt.receipt.replayed, true, "an idempotent replay must be identified in its receipt");

const reusedKeyResponse = await fetch(`${baseUrl}/api/fasts/start`, {
  method: "POST",
  headers: mutationHeaders(startKey),
  body: JSON.stringify({ targetDuration: 900 }),
});
assert.equal(reusedKeyResponse.status, 409, "reusing an idempotency key with different input must fail");

const adjustedStartTime = new Date(new Date(started.startTime).getTime() - 60 * 60 * 1000).toISOString();
const adjustStartResponse = await fetch(`${baseUrl}/api/fasts/${started.id}/start-time`, {
  method: "PATCH",
  headers: mutationHeaders(`smoke-adjust-${crypto.randomUUID()}`),
  body: JSON.stringify({ startTime: adjustedStartTime }),
});
assert.equal(adjustStartResponse.status, 200, "the active fast start time must be editable");
const adjustedReceipt = await adjustStartResponse.json();
assert.equal(adjustedReceipt.data.startTime, adjustedStartTime, "the adjusted start time must be returned unchanged");

const stopResponse = await fetch(`${baseUrl}/api/fasts/stop`, {
  method: "POST",
  headers: mutationHeaders(`smoke-stop-${crypto.randomUUID()}`),
  body: JSON.stringify({ fastId: started.id }),
});
assert.equal(stopResponse.status, 200, "the active fast must be completable");
const stoppedReceipt = await stopResponse.json();

const hiddenDeleteResponse = await fetch(`${baseUrl}/api/fasts/${started.id}`, {
  method: "DELETE",
  headers: mutationHeaders(`smoke-user-delete-${crypto.randomUUID()}`),
  body: "{}",
});
assert.equal(hiddenDeleteResponse.status, 404, "the user API must not expose deletion");

const adminHeaders = (idempotencyKey) => ({
  Accept: "application/json",
  Authorization: `Bearer ${adminToken}`,
  "Content-Type": "application/json",
  "Idempotency-Key": idempotencyKey,
});
const adminStartTime = new Date(new Date(stoppedReceipt.data.startTime).getTime() - 10 * 60 * 1000).toISOString();
const adminEditResponse = await fetch(`${baseUrl}/api/admin/fasts/${started.id}`, {
  method: "PATCH",
  headers: adminHeaders(`smoke-admin-edit-${crypto.randomUUID()}`),
  body: JSON.stringify({
    startTime: adminStartTime,
    reason: "Local smoke verification",
    confirmFastId: started.id,
  }),
});
assert.equal(adminEditResponse.status, 200, "the authenticated admin API must allow a confirmed history correction");

const adminDeleteResponse = await fetch(`${baseUrl}/api/admin/fasts/${started.id}`, {
  method: "DELETE",
  headers: adminHeaders(`smoke-admin-delete-${crypto.randomUUID()}`),
  body: JSON.stringify({ reason: "Remove local smoke record", confirmFastId: started.id }),
});
assert.equal(adminDeleteResponse.status, 200, "the authenticated admin API must allow a confirmed soft deletion");

const auditResponse = await fetch(`${baseUrl}/api/admin/audit?limit=50`, {
  headers: { Accept: "application/json", Authorization: `Bearer ${adminToken}` },
});
assert.equal(auditResponse.status, 200, "the authenticated admin API must expose the audit log");
const audit = await auditResponse.json();
const auditActions = new Set(audit.events.map((event) => event.action));
for (const expectedAction of ["fast.start", "fast.adjust_active_start", "fast.stop", "admin.fast.edit", "admin.fast.delete"]) {
  assert(auditActions.has(expectedAction), `the audit log must contain ${expectedAction}`);
}
assert(
  audit.events.some((event) => event.action === "fast.start" && event.outcome === "rejected"),
  "the audit log must record an idempotency-key reuse rejection",
);

const finalHistoryResponse = await fetch(`${baseUrl}/api/fasts`, { headers: browserHeaders });
const finalHistory = await finalHistoryResponse.json();
assert.equal(finalHistory.length, baselineHistory.length, "the smoke test must leave visible fasting history unchanged");

console.log(
  `Local smoke passed: browser auth, CSRF, idempotency replay, ${mcpToolNames.length} MCP tools, admin correction, soft deletion, and audit evidence.`,
);
