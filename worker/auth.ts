import type { SessionState } from "../shared/types";
import type { Env } from "./env";
import { appMode } from "./env";
import {
  AppError,
  error,
  fromBase64Url,
  hmacBase64Url,
  json,
  readJson,
  safeEqual,
  sha256Base64Url,
  toBase64Url,
} from "./http";

const SESSION_COOKIE = "__Host-ft_session";
const CSRF_COOKIE = "__Host-ft_csrf";
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;
const DEMO_USERNAME = "demo-visitor";
const encoder = new TextEncoder();

interface SessionRow {
  token_hash: string;
  username: string;
  role: "user";
  csrf_hash: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

interface LoginAttemptRow {
  window_started_at: string;
  failed_count: number;
  locked_until: string | null;
}

export interface BrowserAuth {
  actor: {
    type: "user";
    id: string;
    origin: "web";
  };
  csrfToken: string;
  sessionTokenHash: string;
  username: string;
  role: "user";
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes.buffer);
}

function parseCookies(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    result[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return result;
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function csrfCookie(token: string): string {
  return `${CSRF_COOKIE}=${token}; Path=/; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function expiredCookie(name: string, httpOnly: boolean): string {
  return `${name}=; Path=/; Secure; ${httpOnly ? "HttpOnly; " : ""}SameSite=Strict; Max-Age=0`;
}

function withCookies(response: Response, cookies: string[]): Response {
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isSameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function isJsonRequest(request: Request): boolean {
  return request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function authConfigured(env: Env): env is Env & Required<Pick<Env, "AUTH_USERNAME" | "AUTH_PASSWORD_VERIFIER" | "SESSION_PEPPER">> {
  return Boolean(
    env.AUTH_USERNAME &&
    env.AUTH_PASSWORD_VERIFIER &&
    env.SESSION_PEPPER &&
    env.SESSION_PEPPER.length >= 32,
  );
}

export async function verifyPassword(password: string, verifier: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText, extra] = verifier.split("$");
  const iterations = Number(iterationsText);
  const salt = fromBase64Url(saltText ?? "");
  const expected = fromBase64Url(expectedText ?? "");
  if (
    algorithm !== "pbkdf2_sha256" ||
    extra ||
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 100_000 ||
    !salt ||
    salt.length < 16 ||
    !expected ||
    expected.length !== 32
  ) {
    return false;
  }

  const passwordKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.slice().buffer, iterations },
    passwordKey,
    256,
  ));
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ derived[index];
  return difference === 0;
}

async function auditAuth(
  env: Env,
  action: string,
  outcome: "succeeded" | "rejected" | "failed",
  actorId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await env.FASTING_DB.prepare(
    `INSERT INTO audit_events
      (event_id, occurred_at, actor_type, actor_id, origin, action, resource_type, request_id, outcome)
     VALUES (?1, ?2, 'user', ?3, 'web', ?4, 'session', ?5, ?6)`,
  ).bind(crypto.randomUUID(), now, actorId, action, crypto.randomUUID(), outcome).run();
}

async function loginRateKey(request: Request, env: Env, username: string): Promise<string> {
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  return hmacBase64Url(env.SESSION_PEPPER!, `${clientIp}:${username.toLowerCase()}`);
}

async function checkLoginRateLimit(env: Env, keyHash: string): Promise<void> {
  const attempt = await env.FASTING_DB.prepare(
    "SELECT window_started_at, failed_count, locked_until FROM login_attempts WHERE key_hash = ?1",
  ).bind(keyHash).first<LoginAttemptRow>();
  if (attempt?.locked_until && attempt.locked_until > new Date().toISOString()) {
    throw new AppError("Unable to sign in right now. Try again later.", 429, "login_rate_limited");
  }
}

async function recordLoginFailure(env: Env, keyHash: string): Promise<void> {
  const now = new Date();
  const windowStartedAt = now.toISOString();
  const lockUntil = new Date(now.getTime() + LOGIN_WINDOW_SECONDS * 1000).toISOString();
  await env.FASTING_DB.prepare(
    `INSERT INTO login_attempts (key_hash, window_started_at, failed_count, locked_until)
     VALUES (?1, ?2, 1, NULL)
     ON CONFLICT(key_hash) DO UPDATE SET
       window_started_at = CASE
         WHEN julianday(login_attempts.window_started_at) < julianday('now', '-15 minutes') THEN excluded.window_started_at
         ELSE login_attempts.window_started_at
       END,
       failed_count = CASE
         WHEN julianday(login_attempts.window_started_at) < julianday('now', '-15 minutes') THEN 1
         ELSE login_attempts.failed_count + 1
       END,
       locked_until = CASE
         WHEN julianday(login_attempts.window_started_at) >= julianday('now', '-15 minutes')
              AND login_attempts.failed_count + 1 >= ?3 THEN ?4
         ELSE NULL
       END`,
  ).bind(keyHash, windowStartedAt, LOGIN_MAX_FAILURES, lockUntil).run();
}

async function clearLoginFailures(env: Env, keyHash: string): Promise<void> {
  await env.FASTING_DB.prepare("DELETE FROM login_attempts WHERE key_hash = ?1").bind(keyHash).run();
}

export async function getBrowserAuth(request: Request, env: Env): Promise<BrowserAuth | null> {
  if (!env.SESSION_PEPPER) return null;
  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE];
  const csrfToken = cookies[CSRF_COOKIE];
  if (!sessionToken || !csrfToken) return null;
  const [sessionTokenHash, csrfHash] = await Promise.all([
    hmacBase64Url(env.SESSION_PEPPER, sessionToken),
    hmacBase64Url(env.SESSION_PEPPER, csrfToken),
  ]);
  const session = await env.FASTING_DB.prepare(
    `SELECT token_hash, username, role, csrf_hash, created_at, last_seen_at, expires_at, revoked_at
     FROM sessions WHERE token_hash = ?1`,
  ).bind(sessionTokenHash).first<SessionRow>();
  const now = new Date().toISOString();
  if (!session || session.revoked_at || session.expires_at <= now || !(await safeEqual(session.csrf_hash, csrfHash))) {
    return null;
  }
  if (Date.now() - new Date(session.last_seen_at).getTime() > 24 * 60 * 60 * 1000) {
    await env.FASTING_DB.prepare("UPDATE sessions SET last_seen_at = ?1 WHERE token_hash = ?2")
      .bind(now, sessionTokenHash)
      .run();
  }
  return {
    actor: { type: "user", id: session.username, origin: "web" },
    csrfToken,
    sessionTokenHash,
    username: session.username,
    role: session.role,
  };
}

export async function requireBrowserMutation(request: Request, env: Env): Promise<BrowserAuth> {
  const auth = await getBrowserAuth(request, env);
  if (!auth) throw new AppError("Authentication required", 401, "authentication_required");
  if (!isSameOrigin(request)) throw new AppError("Cross-origin request rejected", 403, "cross_origin_rejected");
  if (!isJsonRequest(request)) throw new AppError("JSON content type required", 415, "json_required");
  const csrfHeader = request.headers.get("X-CSRF-Token");
  if (!csrfHeader || !(await safeEqual(csrfHeader, auth.csrfToken))) {
    throw new AppError("Session confirmation required", 403, "csrf_rejected");
  }
  return auth;
}

async function createSession(env: Env, username: string): Promise<{ sessionToken: string; csrfToken: string }> {
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  const [sessionTokenHash, csrfHash] = await Promise.all([
    hmacBase64Url(env.SESSION_PEPPER!, sessionToken),
    hmacBase64Url(env.SESSION_PEPPER!, csrfToken),
  ]);
  await env.FASTING_DB.batch([
    env.FASTING_DB.prepare(
      `INSERT INTO sessions
        (token_hash, username, role, csrf_hash, created_at, last_seen_at, expires_at)
       VALUES (?1, ?2, 'user', ?3, ?4, ?4, ?5)`,
    ).bind(sessionTokenHash, username, csrfHash, now.toISOString(), expiresAt.toISOString()),
    env.FASTING_DB.prepare("DELETE FROM sessions WHERE expires_at <= ?1 OR revoked_at IS NOT NULL")
      .bind(now.toISOString()),
  ]);
  return { sessionToken, csrfToken };
}

export async function handleAuth(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === "/api/auth/session" && request.method === "GET") {
    const auth = await getBrowserAuth(request, env);
    if (!auth && appMode(env) === "demo") {
      if (!env.SESSION_PEPPER || env.SESSION_PEPPER.length < 32) {
        return error("Demo session is not configured", 503, "demo_session_not_configured");
      }
      const tokens = await createSession(env, DEMO_USERNAME);
      const state: SessionState = {
        authenticated: true,
        username: DEMO_USERNAME,
        role: "user",
        csrfToken: tokens.csrfToken,
        mode: "demo",
      };
      return withCookies(
        json(state),
        [sessionCookie(tokens.sessionToken), csrfCookie(tokens.csrfToken)],
      );
    }
    const state: SessionState = auth
      ? {
        authenticated: true,
        username: auth.username,
        role: auth.role,
        csrfToken: auth.csrfToken,
        mode: appMode(env),
      }
      : { authenticated: false, mode: appMode(env) };
    return json(state);
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    if (appMode(env) === "demo") {
      return error("The public demo opens without login credentials", 404, "not_found");
    }
    if (!isSameOrigin(request)) return error("Cross-origin request rejected", 403, "cross_origin_rejected");
    if (!isJsonRequest(request)) return error("JSON content type required", 415, "json_required");
    if (!authConfigured(env)) return error("Authentication is not configured", 503, "auth_not_configured");
    const body = await readJson(request);
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || !password || username.length > 128 || password.length > 512) {
      return error("Username and password are required", 400, "credentials_required");
    }
    const rateKey = await loginRateKey(request, env, username);
    try {
      await checkLoginRateLimit(env, rateKey);
    } catch (caught) {
      if (caught instanceof AppError) return error(caught.message, caught.status, caught.code);
      throw caught;
    }
    const usernameMatches = await safeEqual(username.toLowerCase(), env.AUTH_USERNAME.toLowerCase());
    const passwordMatches = await verifyPassword(password, env.AUTH_PASSWORD_VERIFIER);
    if (!usernameMatches || !passwordMatches) {
      await recordLoginFailure(env, rateKey);
      await auditAuth(env, "auth.login", "rejected", "anonymous");
      return error("Username or password did not match", 401, "invalid_credentials");
    }
    await clearLoginFailures(env, rateKey);
    const tokens = await createSession(env, env.AUTH_USERNAME);
    await auditAuth(env, "auth.login", "succeeded", env.AUTH_USERNAME);
    return withCookies(
      json({ authenticated: true, username: env.AUTH_USERNAME, role: "user", csrfToken: tokens.csrfToken, mode: appMode(env) }),
      [sessionCookie(tokens.sessionToken), csrfCookie(tokens.csrfToken)],
    );
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    let auth: BrowserAuth;
    try {
      auth = await requireBrowserMutation(request, env);
    } catch (caught) {
      if (caught instanceof AppError) return error(caught.message, caught.status, caught.code);
      throw caught;
    }
    await env.FASTING_DB.prepare("UPDATE sessions SET revoked_at = ?1 WHERE token_hash = ?2")
      .bind(new Date().toISOString(), auth.sessionTokenHash)
      .run();
    await auditAuth(env, "auth.logout", "succeeded", auth.username);
    return withCookies(
      json({ authenticated: false, mode: appMode(env) }),
      [expiredCookie(SESSION_COOKIE, true), expiredCookie(CSRF_COOKIE, false)],
    );
  }

  return error("Not found", 404, "not_found");
}

export async function verifyBearerToken(request: Request, expectedHashes: Array<string | undefined>): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  if (!token || token.length > 512) return false;
  const suppliedHash = await sha256Base64Url(token);
  for (const expectedHash of expectedHashes) {
    if (expectedHash && await safeEqual(suppliedHash, expectedHash)) return true;
  }
  return false;
}
