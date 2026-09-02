#!/usr/bin/env node

import assert from "node:assert/strict";

const baseUrl = (process.env.FASTING_TRACKER_URL ?? "http://127.0.0.1:8791").replace(/\/$/u, "");

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") ?? "").split(/,(?=\s*__Host-)/u);
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

async function body(response) {
  return response.json().catch(() => null);
}

const healthResponse = await fetch(`${baseUrl}/api/health`);
assert.equal(healthResponse.status, 200, "demo health check must succeed");
await expectJson(healthResponse, { ok: true, mode: "demo" });

const sessionResponse = await fetch(`${baseUrl}/api/auth/session`);
assert.equal(sessionResponse.status, 200, "demo session must open without credentials");
const cookies = cookieHeader(sessionResponse);
assert.match(cookies, /__Host-ft_session=/u, "demo session must set a secure session cookie");
assert.match(cookies, /__Host-ft_csrf=/u, "demo session must set a CSRF cookie");
const session = await sessionResponse.json();
assert.equal(session.authenticated, true, "demo session must be authenticated");
assert.equal(session.mode, "demo", "demo session must identify demo mode");
assert(session.csrfToken, "demo session must return a CSRF token");

const browserHeaders = { Accept: "application/json", Cookie: cookies };
const baselineHistoryResponse = await fetch(`${baseUrl}/api/fasts`, { headers: browserHeaders });
assert.equal(baselineHistoryResponse.status, 200, "demo history must be available in the demo session");
const baselineHistory = await baselineHistoryResponse.json();
assert(Array.isArray(baselineHistory), "demo history must be an array");

const mutationHeaders = (key) => ({
  ...browserHeaders,
  Origin: baseUrl,
  "Content-Type": "application/json",
  "X-CSRF-Token": session.csrfToken,
  "Idempotency-Key": key,
});

const missingResetConfirmation = await fetch(`${baseUrl}/api/demo/reset`, {
  method: "POST",
  headers: mutationHeaders(`demo-reset-missing-${crypto.randomUUID()}`),
  body: JSON.stringify({}),
});
assert.equal(missingResetConfirmation.status, 400, "demo reset must require explicit confirmation");

const rejectedCrossOrigin = await fetch(`${baseUrl}/api/experiments`, {
  method: "POST",
  headers: { ...mutationHeaders("demo-cross-origin-experiment"), Origin: "https://example.invalid" },
  body: "{}",
});
assert.equal(rejectedCrossOrigin.status, 403, "cross-origin demo mutations must be rejected");

const start = new Date();
const end = new Date(start.getTime() + 27 * 86_400_000);
const experimentInput = {
  name: "Demo smoke verification",
  targetDurationMinutes: 960,
  weeklyGoal: 3,
  startDate: start.toISOString().slice(0, 10),
  endDate: end.toISOString().slice(0, 10),
  confirm: true,
};
const createKey = `demo-experiment-${crypto.randomUUID()}`;
const createResponse = await fetch(`${baseUrl}/api/experiments`, {
  method: "POST",
  headers: mutationHeaders(createKey),
  body: JSON.stringify(experimentInput),
});
assert.equal(createResponse.status, 201, `experiment creation failed: ${JSON.stringify(await body(createResponse.clone()))}`);
const createdReceipt = await createResponse.json();
assert.equal(createdReceipt.data.name, experimentInput.name, "created experiment must preserve its name");
assert.equal(createdReceipt.receipt.replayed, false, "first experiment creation must not be a replay");

const replayResponse = await fetch(`${baseUrl}/api/experiments`, {
  method: "POST",
  headers: mutationHeaders(createKey),
  body: JSON.stringify(experimentInput),
});
assert.equal(replayResponse.status, 201, "exact experiment replay must return its original response");
const replayedReceipt = await replayResponse.json();
assert.equal(replayedReceipt.data.id, createdReceipt.data.id, "experiment replay must return the original id");
assert.equal(replayedReceipt.receipt.replayed, true, "experiment replay must be identified in its receipt");

const conflictResponse = await fetch(`${baseUrl}/api/experiments`, {
  method: "POST",
  headers: mutationHeaders(`demo-experiment-conflict-${crypto.randomUUID()}`),
  body: JSON.stringify({ ...experimentInput, name: "Second active experiment" }),
});
assert.equal(conflictResponse.status, 409, "a second active experiment must be rejected");

const mismatchResponse = await fetch(`${baseUrl}/api/experiments/${createdReceipt.data.id}/cancel`, {
  method: "POST",
  headers: mutationHeaders(`demo-experiment-mismatch-${crypto.randomUUID()}`),
  body: JSON.stringify({ confirmExperimentId: createdReceipt.data.id + 1 }),
});
assert.equal(mismatchResponse.status, 400, "experiment cancellation must require the exact id");

const cancelResponse = await fetch(`${baseUrl}/api/experiments/${createdReceipt.data.id}/cancel`, {
  method: "POST",
  headers: mutationHeaders(`demo-experiment-cancel-${crypto.randomUUID()}`),
  body: JSON.stringify({ confirmExperimentId: createdReceipt.data.id }),
});
assert.equal(cancelResponse.status, 200, `experiment cancellation failed: ${JSON.stringify(await body(cancelResponse.clone()))}`);
const cancelledReceipt = await cancelResponse.json();
assert.equal(cancelledReceipt.data.status, "cancelled", "cancelled experiment must return its closed status");

const activeResponse = await fetch(`${baseUrl}/api/experiments/active`, { headers: browserHeaders });
assert.equal(activeResponse.status, 200, "active experiment route must remain available");
assert.equal(await activeResponse.json(), null, "demo smoke must leave no active experiment");

const adminResponse = await fetch(`${baseUrl}/api/admin/audit`, { headers: browserHeaders });
assert.equal(adminResponse.status, 404, "demo mode must not expose the admin API");
const mcpResponse = await fetch(`${baseUrl}/mcp`, { method: "POST" });
assert.equal(mcpResponse.status, 404, "demo mode must not expose remote MCP");

const finalHistoryResponse = await fetch(`${baseUrl}/api/fasts`, { headers: browserHeaders });
const finalHistory = await finalHistoryResponse.json();
assert.equal(finalHistory.length, baselineHistory.length, "experiment checks must not change fasting history");

const resetResponse = await fetch(`${baseUrl}/api/demo/reset`, {
  method: "POST",
  headers: mutationHeaders(`demo-reset-${crypto.randomUUID()}`),
  body: JSON.stringify({ confirm: true }),
});
assert.equal(resetResponse.status, 200, `demo reset failed: ${JSON.stringify(await body(resetResponse.clone()))}`);
const reset = await resetResponse.json();
assert.equal(reset.data.fastCount, 11, "demo reset must restore the 11-record baseline");
const resetHistoryResponse = await fetch(`${baseUrl}/api/fasts`, { headers: browserHeaders });
const resetHistory = await resetHistoryResponse.json();
assert.equal(resetHistory.length, 11, "demo reset must leave exactly 11 baseline records");

console.log(`Demo smoke passed: credential-free session, ${baselineHistory.length} synthetic records, CSRF, idempotency, experiment lifecycle, demo reset, and hidden admin/MCP routes.`);

async function expectJson(response, expected) {
  assert.deepEqual(await response.json(), expected);
}
