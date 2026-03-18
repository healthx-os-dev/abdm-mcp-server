#!/bin/bash
# ABDM MCP Server — Integration Guide
# HealthX OS Dev
# ─────────────────────────────────────────────────────────────────────────────

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ABDM MCP Server — Integration Guide"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_KEY="${ADMIN_API_KEY:-your-secret-admin-key-here}"

# ── Step 1: Health check ──────────────────────────────────────────────────
echo ""
echo "▶ Step 1: Health check"
curl -s "$BASE_URL/health" | python3 -m json.tool

# ── Step 2: Generate a client API key ─────────────────────────────────────
echo ""
echo "▶ Step 2: Generate a client API key"
echo "  (ABDM credentials stay server-side — client only gets hx_ key)"
curl -s -X POST "$BASE_URL/admin/keys" \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Claude Agent",
    "plan": "hospital",
    "scopes": [],
    "env": "live"
  }' | python3 -m json.tool

# ── Step 3: List all keys ─────────────────────────────────────────────────
echo ""
echo "▶ Step 3: List all API keys"
curl -s "$BASE_URL/admin/keys" \
  -H "X-API-Key: $ADMIN_KEY" | python3 -m json.tool

# ── Step 4: Use the key as a client ──────────────────────────────────────
echo ""
echo "▶ Step 4: Call verify_abha with client hx_ key"
echo "  Replace HX_CLIENT_KEY with the key from Step 2"
# curl -s -X POST "$BASE_URL/mcp" \
#   -H "X-API-Key: hx_live_YOUR_KEY_HERE" \
#   -H "Content-Type: application/json" \
#   -d '{
#     "tool": "verify_abha",
#     "arguments": { "abha_number": "12-3456-7890-1234" }
#   }' | python3 -m json.tool

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Endpoints Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  POST   /mcp                   → Run MCP tool (X-API-Key or Bearer)"
echo "  GET    /health                → Health check (no auth)"
echo "  GET    /ready                 → Readiness probe (no auth)"
echo "  POST   /admin/keys            → Generate client API key (admin)"
echo "  GET    /admin/keys            → List all keys (admin)"
echo "  DELETE /admin/keys/:id        → Revoke key (admin)"
echo "  GET    /admin/keys/validate   → Validate a key (admin)"
echo "  POST   /abdm/callbacks/*      → ABDM webhook callbacks (no auth)"
echo ""
echo "  Plans: developer | professional | hospital | enterprise"
echo "  Key format: hx_live_<48hex> or hx_test_<48hex>"
echo ""
