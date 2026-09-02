#!/usr/bin/env node

import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.env.FASTING_AUTH_PASSWORD;
const username = process.env.FASTING_AUTH_USERNAME ?? "trey";

if (!password || password.length < 12) {
  console.error("Set FASTING_AUTH_PASSWORD to a password with at least 12 characters before running this command.");
  process.exit(1);
}

const iterations = 100_000;
const salt = randomBytes(16);
const derivedKey = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const sessionPepper = randomBytes(32).toString("base64url");
const mcpToken = `ft_mcp_${randomBytes(32).toString("base64url")}`;
const adminToken = `ft_admin_${randomBytes(32).toString("base64url")}`;
const hash = (value) => createHash("sha256").update(value).digest("base64url");

console.log("Worker secret values");
console.log(`AUTH_USERNAME=${username}`);
console.log(`AUTH_PASSWORD_VERIFIER=pbkdf2_sha256$${iterations}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`);
console.log(`SESSION_PEPPER=${sessionPepper}`);
console.log(`MCP_TOKEN_HASH=${hash(mcpToken)}`);
console.log(`ADMIN_API_TOKEN_HASH=${hash(adminToken)}`);
console.log("");
console.log("Save these two plaintext credentials in their intended clients. They cannot be recovered from the Worker secrets.");
console.log(`GROK_MCP_TOKEN=${mcpToken}`);
console.log(`ADMIN_API_TOKEN=${adminToken}`);
