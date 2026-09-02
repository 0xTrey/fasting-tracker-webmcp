export type AppMode = "production" | "demo";

export interface Env {
  FASTING_DB: D1Database;
  ASSETS: Fetcher;
  APP_MODE?: AppMode;
  AUTH_USERNAME?: string;
  AUTH_PASSWORD_VERIFIER?: string;
  SESSION_PEPPER?: string;
  MCP_TOKEN_HASH?: string;
  MCP_TOKEN_PREVIOUS_HASH?: string;
  ADMIN_API_TOKEN_HASH?: string;
}

export function appMode(env: Env): AppMode {
  return env.APP_MODE === "demo" ? "demo" : "production";
}
