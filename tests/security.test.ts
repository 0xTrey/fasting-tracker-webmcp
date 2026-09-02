import { describe, expect, it } from "vitest";
import { getBrowserAuth, handleAuth, requireBrowserMutation, verifyBearerToken, verifyPassword } from "../worker/auth";
import worker, { actorForBrowserMutation } from "../worker/index";
import { adjustActiveFastStart } from "../worker/actions";
import type { Env } from "../worker/env";
import {
  canonicalJson,
  parseDate,
  parseDuration,
  safeEqual,
  sha256Base64Url,
  toBase64Url,
  fromBase64Url,
  hmacBase64Url,
  readJson,
  secureAssetResponse,
  parseId,
} from "../worker/http";

const encoder = new TextEncoder();

async function passwordVerifier(password: string): Promise<string> {
  const salt = new Uint8Array(16).fill(7);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    key,
    256,
  );
  return `pbkdf2_sha256$100000$${toBase64Url(salt.buffer)}$${toBase64Url(derived)}`;
}

describe("security helpers", () => {
  function mockDb(firstValue: unknown) {
    return {
      prepare: () => ({ bind: () => ({ first: async () => firstValue, run: async () => ({}) }) }),
      batch: async () => [],
    } as never;
  }

  it("verifies the configured password without accepting another password", async () => {
    const verifier = await passwordVerifier("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", verifier)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", verifier)).resolves.toBe(false);
  });

  it("fails closed for malformed or intentionally weak password verifiers", async () => {
    await expect(verifyPassword("anything", "not-a-verifier")).resolves.toBe(false);
    await expect(verifyPassword("anything", "pbkdf2_sha256$99999$c2hvcnQ$c2hvcnQ")).resolves.toBe(false);
    const salt = toBase64Url(new Uint8Array(16).fill(1).buffer);
    const key = toBase64Url(new Uint8Array(32).fill(2).buffer);
    await expect(verifyPassword("anything", `pbkdf2_sha256$100001$${salt}$${key}`)).resolves.toBe(false);
  });

  it("canonicalizes object keys before hashing idempotent input", async () => {
    const left = canonicalJson({ target: 960, nested: { b: true, a: "value" } });
    const right = canonicalJson({ nested: { a: "value", b: true }, target: 960 });
    expect(left).toBe(right);
    await expect(sha256Base64Url(left)).resolves.toBe(await sha256Base64Url(right));
  });

  it("compares token values without exposing a direct string comparison path", async () => {
    await expect(safeEqual("same-token", "same-token")).resolves.toBe(true);
    await expect(safeEqual("same-token", "different-token")).resolves.toBe(false);
  });

  it("rejects out-of-range durations and invalid dates", () => {
    expect(parseDuration(60)).toBe(60);
    expect(parseDuration(10_080)).toBe(10_080);
    expect(parseDuration(59)).toBeNull();
    expect(parseDuration(10_081)).toBeNull();
    expect(parseDate("2026-08-31T12:00:00-05:00")).toBe("2026-08-31T17:00:00.000Z");
    expect(parseDate("not a date")).toBeNull();
  });

  it("rejects malformed base64url and invalid identifiers", () => {
    expect(fromBase64Url("not valid")).toBeNull();
    expect(fromBase64Url("@@@@")).toBeNull();
    expect(parseId(0)).toBeNull();
    expect(parseId(-1)).toBeNull();
    expect(parseId("not-a-number")).toBeNull();
    expect(parseId("42")).toBe(42);
  });

  it("fails closed when JSON is malformed, an array, or too large", async () => {
    await expect(readJson(new Request("https://example.test", { method: "POST", body: "{", headers: { "Content-Type": "application/json" } }))).resolves.toBeNull();
    await expect(readJson(new Request("https://example.test", { method: "POST", body: "[]", headers: { "Content-Type": "application/json" } }))).resolves.toBeNull();
    await expect(readJson(new Request("https://example.test", { method: "POST", body: "{}", headers: { "Content-Length": "10001", "Content-Type": "application/json" } }))).resolves.toBeNull();
  });

  it("accepts only a matching bearer token and rejects malformed headers", async () => {
    const hash = await sha256Base64Url("agent-secret");
    await expect(verifyBearerToken(new Request("https://example.test", { headers: { Authorization: "Bearer agent-secret" } }), [hash])).resolves.toBe(true);
    await expect(verifyBearerToken(new Request("https://example.test", { headers: { Authorization: "Basic agent-secret" } }), [hash])).resolves.toBe(false);
    await expect(verifyBearerToken(new Request("https://example.test", { headers: { Authorization: "Bearer " } }), [hash])).resolves.toBe(false);
    await expect(verifyBearerToken(new Request("https://example.test"), [undefined])).resolves.toBe(false);
  });

  it("returns a safe configuration error when authentication secrets are missing", async () => {
    const response = await handleAuth(
      new Request("https://example.test/api/auth/login", {
        method: "POST",
        headers: { Origin: "https://example.test", "Content-Type": "application/json" },
        body: JSON.stringify({ username: "trey", password: "password" }),
      }),
      { FASTING_DB: {}, APP_MODE: "production" } as unknown as Env,
      "/api/auth/login",
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "auth_not_configured" });
  });

  it("opens a credential-free demo session without weakening production authentication", async () => {
    const demoResponse = await handleAuth(
      new Request("https://demo.example.test/api/auth/session"),
      {
        FASTING_DB: mockDb(null),
        APP_MODE: "demo",
        SESSION_PEPPER: "demo-session-pepper-that-is-long-enough",
      } as unknown as Env,
      "/api/auth/session",
    );
    expect(demoResponse.status).toBe(200);
    const cookies = demoResponse.headers.get("Set-Cookie");
    expect(cookies).toContain("__Host-ft_session=");
    expect(cookies).toContain("Secure");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Strict");
    await expect(demoResponse.json()).resolves.toMatchObject({
      authenticated: true,
      username: "demo-visitor",
      role: "user",
      mode: "demo",
    });

    const productionResponse = await handleAuth(
      new Request("https://example.test/api/auth/session"),
      {
        FASTING_DB: mockDb(null),
        APP_MODE: "production",
        SESSION_PEPPER: "production-session-pepper-long-enough",
      } as unknown as Env,
      "/api/auth/session",
    );
    await expect(productionResponse.json()).resolves.toEqual({ authenticated: false, mode: "production" });
  });

  it("fails closed when the demo session secret is missing", async () => {
    const response = await handleAuth(
      new Request("https://demo.example.test/api/auth/session"),
      { FASTING_DB: mockDb(null), APP_MODE: "demo" } as unknown as Env,
      "/api/auth/session",
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "demo_session_not_configured" });
  });

  it("keeps login, admin, and remote MCP routes out of the public demo", async () => {
    const env = { FASTING_DB: mockDb(null), APP_MODE: "demo" } as unknown as Env;
    const login = await handleAuth(
      new Request("https://demo.example.test/api/auth/login", { method: "POST" }),
      env,
      "/api/auth/login",
    );
    expect(login.status).toBe(404);

    const context = {} as ExecutionContext;
    const admin = await worker.fetch(new Request("https://demo.example.test/api/admin/audit"), env, context);
    const mcp = await worker.fetch(new Request("https://demo.example.test/mcp", { method: "POST" }), env, context);
    expect(admin.status).toBe(404);
    expect(mcp.status).toBe(404);
  });

  it("adds security headers to asset responses", () => {
    const response = secureAssetResponse(new Response("ok"));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Origin-Agent-Cluster")).toBe("?1");
    expect(response.headers.get("Permissions-Policy")).toContain("tools=(self)");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("rejects browser mutations without both session and CSRF cookies", async () => {
    const env = { FASTING_DB: mockDb(null), SESSION_PEPPER: "pepper-that-is-long-enough-for-tests" } as unknown as Env;
    const response = await requireBrowserMutation(new Request("https://example.test/api/fasts", { method: "POST" }), env)
      .catch((caught) => caught as Error & { status?: number; code?: string });
    expect(response).toMatchObject({ status: 401, code: "authentication_required" });
  });

  it("rejects expired or revoked browser sessions", async () => {
    const expired = { token_hash: "session", username: "trey", role: "user", csrf_hash: "wrong", created_at: "2026-01-01", last_seen_at: "2026-08-31", expires_at: "2026-01-01T00:00:00.000Z", revoked_at: null };
    const revoked = { ...expired, expires_at: "2099-01-01T00:00:00.000Z", revoked_at: "2026-08-31T00:00:00.000Z" };
    const request = new Request("https://example.test", { headers: { Cookie: "__Host-ft_session=token; __Host-ft_csrf=csrf" } });
    await expect(getBrowserAuth(request, { FASTING_DB: mockDb(expired), SESSION_PEPPER: "pepper-that-is-long-enough-for-tests" } as unknown as Env)).resolves.toBeNull();
    await expect(getBrowserAuth(request, { FASTING_DB: mockDb(revoked), SESSION_PEPPER: "pepper-that-is-long-enough-for-tests" } as unknown as Env)).resolves.toBeNull();
  });

  it("accepts a valid browser session and enforces origin, content type, and CSRF", async () => {
    const pepper = "pepper-that-is-long-enough-for-tests";
    const sessionTokenHash = await hmacBase64Url(pepper, "token");
    const csrfHash = await hmacBase64Url(pepper, "csrf");
    const row = { token_hash: sessionTokenHash, username: "trey", role: "user", csrf_hash: csrfHash, created_at: "2026-08-31", last_seen_at: new Date().toISOString(), expires_at: "2099-01-01T00:00:00.000Z", revoked_at: null };
    const env = { FASTING_DB: mockDb(row), SESSION_PEPPER: pepper } as unknown as Env;
    await expect(getBrowserAuth(new Request("https://example.test", { headers: { Cookie: "__Host-ft_session=token; __Host-ft_csrf=csrf" } }), env)).resolves.toMatchObject({ username: "trey", csrfToken: "csrf" });
    await expect(requireBrowserMutation(new Request("https://example.test/api/fasts", { method: "POST", headers: { Cookie: "__Host-ft_session=token; __Host-ft_csrf=csrf", Origin: "https://evil.example", "Content-Type": "application/json", "X-CSRF-Token": "csrf" } }), env)).rejects.toMatchObject({ status: 403, code: "cross_origin_rejected" });
    await expect(requireBrowserMutation(new Request("https://example.test/api/fasts", { method: "POST", headers: { Cookie: "__Host-ft_session=token; __Host-ft_csrf=csrf", Origin: "https://example.test", "X-CSRF-Token": "csrf" } }), env)).rejects.toMatchObject({ status: 415, code: "json_required" });
    await expect(requireBrowserMutation(new Request("https://example.test/api/fasts", { method: "POST", headers: { Cookie: "__Host-ft_session=token; __Host-ft_csrf=csrf", Origin: "https://example.test", "Content-Type": "application/json", "X-CSRF-Token": "wrong" } }), env)).rejects.toMatchObject({ status: 403, code: "csrf_rejected" });
  });

  it("attributes authenticated WebMCP mutations to the browser MCP actor without granting access", () => {
    const auth = { username: "trey", actor: { type: "user" as const, id: "trey", origin: "web" as const } };
    expect(actorForBrowserMutation(new Request("https://example.test", { headers: { "X-Fasting-Client": "webmcp" } }), auth))
      .toEqual({ type: "mcp", id: "browser:trey", origin: "mcp" });
    expect(actorForBrowserMutation(new Request("https://example.test"), auth)).toEqual(auth.actor);
  });

  it("rejects a future start-time correction before touching storage", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(() => adjustActiveFastStart(
      {} as Env,
      { type: "mcp", id: "test-agent", origin: "mcp" },
      1,
      future,
      "future-time-test",
    )).toThrow("Start time cannot be in the future");
  });
});
