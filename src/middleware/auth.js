// src/middleware/auth.js
// Supports two auth modes:
//   1. API Key  — X-API-Key: hx_live_xxx  (for external clients / AI agents)
//   2. JWT Bearer — Authorization: Bearer <token>  (for internal / dev use)

import jwt from "jsonwebtoken";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { validateApiKey } from "../services/apiKeys.js";

const rateLimiter = new RateLimiterMemory({
  points:   parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_SECS  || "60"),
});

export async function requireAuth(req, res, next) {
  try {
    let context = null;

    // ── Mode 1: API Key ─────────────────────────────────────────────────
    const apiKey = req.headers["x-api-key"];
    if (apiKey) {
      const meta = validateApiKey(apiKey);
      if (!meta) return res.status(401).json({ error: "Invalid or revoked API key" });

      context = {
        agentId:  meta.id,
        clientId: meta.name,
        scopes:   meta.scopes,
        plan:     meta.plan,
        authMode: "api_key",
      };
    }

    // ── Mode 2: JWT Bearer ───────────────────────────────────────────────
    if (!context) {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({
          error: "Authentication required",
          hint:  "Use X-API-Key header or Authorization: Bearer <token>",
        });
      }
      const token   = auth.slice(7);
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      context = {
        agentId:  payload.sub,
        clientId: payload.client_id,
        scopes:   payload.scope?.split(" ") || [],
        plan:     payload.plan || "developer",
        authMode: "jwt",
      };
    }

    // ── Rate limit by clientId ───────────────────────────────────────────
    try {
      await rateLimiter.consume(context.clientId);
    } catch {
      return res.status(429).json({
        error: "Rate limit exceeded",
        retry_after_seconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECS || "60"),
      });
    }

    req.agentContext = context;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Auth failed", detail: e.message });
  }
}

export function requireScope(scope) {
  return (req, res, next) => {
    const { scopes } = req.agentContext || {};
    if (!scopes) return res.status(401).json({ error: "Not authenticated" });
    if (scopes.includes("*") || scopes.length === 0 || scopes.includes(scope)) return next();
    return res.status(403).json({ error: `Scope '${scope}' required` });
  };
}

export function issueToken(clientId, scopes = [], plan = "developer") {
  return jwt.sign(
    { sub: clientId, client_id: clientId, scope: scopes.join(" "), plan },
    process.env.JWT_SECRET,
    { expiresIn: parseInt(process.env.JWT_EXPIRY || "3600") }
  );
}
