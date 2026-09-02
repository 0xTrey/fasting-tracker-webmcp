# Architecture and trust boundaries

Fasting Tracker uses one domain model behind several deliberately different access surfaces. Those surfaces do not share credentials or authority by accident.

## Browser application

The React PWA is the normal product. A username and password create a revocable, secure, HttpOnly session. The browser keeps the CSRF token in the same session context and sends it only to same-origin mutation routes.

## Browser WebMCP

The page registers 17 tools only after the browser session is authenticated and `document.modelContext` is present. Read tools query the same Worker routes as the visible interface. View tools update React state in the open tab. Mutation tools display the proposed change and wait for the user before calling the Worker.

WebMCP never receives the remote MCP bearer token. Tools unregister when the React view unmounts.

## Worker boundary

Cloudflare Worker routes enforce the security contract even if a client is modified:

- browser authentication for private data
- exact same-origin validation for browser mutations
- JSON content type and matching CSRF token
- schema and business-rule validation
- idempotency keys for saved actions
- one atomic D1 batch for the domain write, receipt, and audit event
- append-only audit triggers

Historical correction and deletion are not present in the human interface, browser WebMCP, or remote MCP.

## Public demo

The demo Worker uses a dedicated D1 database and an automatic synthetic session. It does not expose the admin API or remote MCP route. `POST /api/demo/reset` exists only when `APP_MODE=demo`; it requires the same browser mutation checks, explicit confirmation, and an idempotency key before restoring the known synthetic baseline.

## Remote MCP and admin

Remote MCP is a separate pre-authorized channel for a trusted agent that needs to operate while the browser is closed. It receives a narrow bearer token and only seven timer-oriented tools. The admin API uses another bearer token and remains backend-only.

Keeping these boundaries separate means browser login, remote automation, and historical administration can be revoked or rotated independently.
