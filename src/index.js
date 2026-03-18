// src/index.js
// ABDM MCP Server — main entry point.
// Supports two transport modes:
//   STDIO: for local/desktop use (Claude Desktop, LangChain local)
//   HTTP:  for remote/cloud deployments (any MCP client via HTTPS)

import "dotenv/config";
import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools/index.js";
import { requireAuth } from "./middleware/auth.js";
import { webhookRouter } from "./middleware/webhooks.js";
import { generateApiKey, listApiKeys, revokeApiKey, validateApiKey } from "./services/apiKeys.js";

// ── Admin auth: simple ADMIN_API_KEY guard for key management routes ──────
function requireAdmin(req, res, next) {
  const key = req.headers["x-api-key"] || req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: "Admin access required. Use X-Admin-Key header." });
  }
  next();
}

// ── Validate required env vars ────────────────────────────────────────────
const REQUIRED = ["ABDM_CLIENT_ID", "ABDM_CLIENT_SECRET", "ABDM_BASE_URL", "JWT_SECRET", "WEBHOOK_BASE_URL"];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[ABDM MCP] Missing required env vars: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill in your values.");
  process.exit(1);
}

// ── Build the MCP server ──────────────────────────────────────────────────
function createMcpServer() {
  const server = new McpServer({
    name: "abdm-mcp-server",
    version: "1.0.0",
    description: [
      "Production-ready ABDM MCP server.",
      "Exposes 8 ABDM health tools: verify_abha, create_abha,",
      "request_consent, consent_status, fetch_health_records,",
      "create_care_context, lookup_facility, lookup_doctor.",
      "Covers all 4 ABDM roles: HIP, HIU, PHR, HRP.",
    ].join(" "),
  });

  // Register all 8 tools
  registerTools(server);

  // Expose server capabilities
  server.resource("abdm_roles", "abdm://roles", async () => ({
    contents: [{ uri: "abdm://roles", mimeType: "application/json",
      text: JSON.stringify({ roles: ["HIP", "HIU", "PHR", "HRP"], tools: 8, version: "1.0.0" })
    }]
  }));

  return server;
}

// ── Transport mode ────────────────────────────────────────────────────────
const mode = process.env.TRANSPORT || (process.stdin.isTTY ? "http" : "stdio");

if (mode === "stdio") {
  // ── STDIO mode (Claude Desktop / local LangChain) ─────────────────────
  console.error("[ABDM MCP] Starting in STDIO mode...");
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ABDM MCP] STDIO transport connected. Ready for tool calls.");

} else {
  // ── HTTP/SSE mode (remote cloud deployment) ───────────────────────────
  const PORT = parseInt(process.env.PORT || "3000");
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // ABDM async webhook callbacks (no auth — ABDM posts here directly)
  app.use("/abdm/callbacks", webhookRouter);

  // Health + readiness probes
  app.get("/health", (_req, res) => res.json({ status: "ok", mode: "http", version: "1.0.0" }));
  app.get("/ready",  (_req, res) => res.json({ ready: true, timestamp: new Date().toISOString() }));

  // ── API Key Management (admin only) ────────────────────────────────────
  // POST /admin/keys — generate a new API key
  app.post("/admin/keys", requireAdmin, (req, res) => {
    const { name, plan = "developer", scopes = [], env = "live" } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const result = generateApiKey(name, plan, scopes, env);
    res.status(201).json({
      ...result,
      note: "Save this key now — it will not be shown again.",
    });
  });

  // GET /admin/keys — list all keys (no raw values)
  app.get("/admin/keys", requireAdmin, (_req, res) => {
    res.json({ keys: listApiKeys() });
  });

  // DELETE /admin/keys/:id — revoke a key
  app.delete("/admin/keys/:id", requireAdmin, (req, res) => {
    const revoked = revokeApiKey(req.params.id);
    if (!revoked) return res.status(404).json({ error: "Key not found" });
    res.json({ revoked: true, id: req.params.id });
  });

  // GET /admin/keys/validate — test a key (for debugging)
  app.get("/admin/keys/validate", requireAdmin, (req, res) => {
    const key  = req.headers["x-test-key"];
    const meta = validateApiKey(key);
    if (!meta) return res.status(401).json({ valid: false });
    res.json({ valid: true, ...meta });
  });

  // MCP endpoint — protected by OAuth 2.1
  app.post("/mcp", requireAuth, async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      // Inject agent context into every tool call
      contextBuilder: () => ({
        requestId:  randomUUID(),
        agentId:    req.agentContext.agentId,
        clientId:   req.agentContext.clientId,
        plan:       req.agentContext.plan,
      }),
    });
    res.on("close", () => server.close().catch(() => {}));
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // SSE endpoint for streaming (optional — for clients that prefer SSE)
  app.get("/mcp/sse", requireAuth, async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    // SSE transport setup here if needed
    res.write("data: {\"connected\":true}\n\n");
  });

  // Token issuance endpoint (developer onboarding)
  if (process.env.NODE_ENV !== "production") {
    const { issueToken } = await import("./middleware/auth.js");
    app.post("/auth/token", (req, res) => {
      const { client_id, scopes = [], plan = "developer" } = req.body;
      if (!client_id) return res.status(400).json({ error: "client_id required" });
      res.json({ access_token: issueToken(client_id, scopes, plan), token_type: "Bearer", expires_in: 3600 });
    });
  }

  app.listen(PORT, () => {
    console.log(`[ABDM MCP] HTTP server running on port ${PORT}`);
    console.log(`[ABDM MCP] MCP endpoint:      POST http://localhost:${PORT}/mcp`);
    console.log(`[ABDM MCP] ABDM webhooks:      POST http://localhost:${PORT}/abdm/callbacks/*`);
    console.log(`[ABDM MCP] Health check:            http://localhost:${PORT}/health`);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[ABDM MCP] Dev token endpoint: POST http://localhost:${PORT}/auth/token`);
    }
  });
}
