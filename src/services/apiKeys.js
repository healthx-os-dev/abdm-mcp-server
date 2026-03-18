// src/services/apiKeys.js
// API Key management — generate, validate, revoke keys for clients.
// ABDM secrets never leave the server. Clients only use hx_ API keys.

import { randomBytes, createHash } from "crypto";

// ── In-memory key store (swap with DB/Redis for production) ──────────────
// Structure: { keyHash → { id, name, plan, scopes, createdAt, lastUsedAt, usageCount, active } }
const keyStore = new Map();

// ── Seed a master admin key from env on startup ───────────────────────────
if (process.env.ADMIN_API_KEY) {
  const hash = hashKey(process.env.ADMIN_API_KEY);
  keyStore.set(hash, {
    id: "admin",
    name: "Admin (env)",
    plan: "enterprise",
    scopes: ["*"],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    usageCount: 0,
    active: true,
  });
}

// ── Hash key for storage (never store raw key) ────────────────────────────
function hashKey(rawKey) {
  return createHash("sha256").update(rawKey).digest("hex");
}

// ── Key format: hx_live_<32 random hex> or hx_test_<32 random hex> ───────
export function generateApiKey(name, plan = "developer", scopes = [], env = "live") {
  const raw   = `hx_${env}_${randomBytes(24).toString("hex")}`;
  const hash  = hashKey(raw);
  const id    = randomBytes(6).toString("hex");

  keyStore.set(hash, {
    id,
    name,
    plan,           // developer | professional | hospital | enterprise
    scopes,         // [] = all tools, or specific: ["verify_abha", "request_consent"]
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    usageCount: 0,
    active: true,
  });

  // Return raw key ONCE — we only store the hash
  return { id, key: raw, name, plan, scopes, env };
}

// ── Validate incoming key — returns metadata or null ─────────────────────
export function validateApiKey(rawKey) {
  if (!rawKey?.startsWith("hx_")) return null;
  const hash = hashKey(rawKey);
  const meta = keyStore.get(hash);
  if (!meta || !meta.active) return null;

  // Update usage stats
  meta.lastUsedAt = new Date().toISOString();
  meta.usageCount += 1;

  return meta;
}

// ── Revoke a key by id ────────────────────────────────────────────────────
export function revokeApiKey(id) {
  for (const [hash, meta] of keyStore.entries()) {
    if (meta.id === id) {
      meta.active = false;
      return true;
    }
  }
  return false;
}

// ── List all keys (without raw values) ───────────────────────────────────
export function listApiKeys() {
  return Array.from(keyStore.values()).map(meta => ({
    id:          meta.id,
    name:        meta.name,
    plan:        meta.plan,
    scopes:      meta.scopes,
    active:      meta.active,
    createdAt:   meta.createdAt,
    lastUsedAt:  meta.lastUsedAt,
    usageCount:  meta.usageCount,
  }));
}

// ── Check if key has scope access ────────────────────────────────────────
export function hasScope(meta, toolName) {
  if (!meta) return false;
  if (meta.scopes.includes("*") || meta.scopes.length === 0) return true;
  return meta.scopes.includes(toolName);
}
