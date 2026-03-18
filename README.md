# ABDM MCP Server

Production-ready **Model Context Protocol (MCP)** server for [ABDM (Ayushman Bharat Digital Mission)](https://abdm.gov.in) APIs.

> **Security model:** ABDM credentials live **only in `.env` on the server**. Clients (AI agents, chats, apps) authenticate using `hx_` API keys and never see your ABDM secrets.

---

## How It Works

```
Client / AI Agent
    │
    │  X-API-Key: hx_live_xxxxxxxxxxxxxx
    ▼
┌─────────────────────────────────────┐
│         ABDM MCP Server             │
│                                     │
│  ✅ Validates hx_ key               │
│  🔒 Loads ABDM secrets from .env    │
│  🔄 Calls ABDM Gateway internally   │
└─────────────────────────────────────┘
    │
    │  Bearer token (ABDM_CLIENT_ID + ABDM_CLIENT_SECRET)
    ▼
ABDM Gateway → FHIR Health Records
```

Clients **never** see `ABDM_CLIENT_ID`, `ABDM_CLIENT_SECRET`, or any gateway credentials.

---

## Tools (8)

| Tool | ABDM Role | Description |
|------|-----------|-------------|
| `verify_abha` | HIU | Verify a patient's ABHA number and identity |
| `create_abha` | PHR | Create ABHA via Aadhaar OTP (2-step) |
| `request_consent` | HIU | Request patient consent for health records |
| `consent_status` | HIU | Poll consent approval / denial status |
| `fetch_health_records` | HIU | Fetch + Fidelius-decrypt FHIR R4 records |
| `create_care_context` | HIP | Link a clinical encounter to patient's ABHA |
| `lookup_facility` | HRP | Search Health Facility Registry (HFR) |
| `lookup_doctor` | HRP | Verify doctor credentials in HPR |

---

## Quick Start

### 1. Clone & install
```bash
git clone https://github.com/healthx-os-dev/abdm-mcp-server.git
cd abdm-mcp-server
npm install
```

### 2. Configure server secrets
```bash
cp .env.example .env
# Edit .env — fill in ABDM credentials, JWT_SECRET, ADMIN_API_KEY
```

### 3. Start the server
```bash
npm start          # STDIO mode (Claude Desktop)
npm run http       # HTTP mode (remote agents)
```

---

## Server Configuration (`.env`)

All secrets stay here. **Never share this file or commit it.**

```env
# ABDM Gateway — server-side only
ABDM_CLIENT_ID=your-abdm-client-id
ABDM_CLIENT_SECRET=your-abdm-client-secret
ABDM_BASE_URL=https://dev.abdm.gov.in/gateway
ABDM_CM_ID=sbx

# Security
JWT_SECRET=your-long-random-secret
ADMIN_API_KEY=your-admin-key   # used to manage client hx_ keys

# Webhooks (ABDM posts callbacks here)
WEBHOOK_BASE_URL=https://your-ngrok-or-domain.com

# Server
PORT=3000
TRANSPORT=stdio   # stdio | http
```

Generate a strong admin key:
```bash
npm run gen-admin-key
```

---

## API Key Management (Admin)

You control who gets access. Clients only ever see `hx_` keys.

### Generate a client key
```bash
curl -X POST http://localhost:3000/admin/keys \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Claude Agent", "plan": "hospital", "scopes": [], "env": "live"}'
```
```json
{
  "id": "a1b2c3",
  "key": "hx_live_f3a9c2d1e4b5...",
  "name": "Claude Agent",
  "plan": "hospital",
  "note": "Save this key now — it will not be shown again."
}
```

### List all keys
```bash
curl http://localhost:3000/admin/keys -H "X-API-Key: YOUR_ADMIN_KEY"
```

### Revoke a key
```bash
curl -X DELETE http://localhost:3000/admin/keys/a1b2c3 -H "X-API-Key: YOUR_ADMIN_KEY"
```

---

## Client Usage (any AI agent / chat)

Clients use only the `hx_` key — no ABDM credentials required:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "X-API-Key: hx_live_f3a9c2d1e4b5..." \
  -H "Content-Type: application/json" \
  -d '{"tool": "verify_abha", "arguments": {"abha_number": "12-3456-7890-1234"}}'
```

---

## Plans & Scopes

| Plan | Intended For |
|------|-------------|
| `developer` | Sandbox / testing |
| `professional` | Individual clinic or doctor |
| `hospital` | Multi-department hospital |
| `enterprise` | Full access, all tools |

Set `"scopes": []` for full tool access, or restrict e.g. `["verify_abha", "request_consent"]`.

---

## Claude Desktop Config

Credentials are **not** stored in Claude Desktop config — they load from `.env` on the server automatically.

```json
{
  "mcpServers": {
    "abdm-mcp": {
      "command": "node",
      "args": ["/path/to/abdm-mcp-server/src/index.js"],
      "env": {
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

---

## Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /mcp` | `X-API-Key` or `Bearer` | Run MCP tool |
| `GET /health` | None | Health check |
| `GET /ready` | None | Readiness probe |
| `POST /admin/keys` | Admin key | Generate client API key |
| `GET /admin/keys` | Admin key | List all keys |
| `DELETE /admin/keys/:id` | Admin key | Revoke a key |
| `GET /admin/keys/validate` | Admin key | Validate a key |
| `POST /abdm/callbacks/*` | None (ABDM posts here) | ABDM webhook callbacks |

---

## Security Notes

- `.env` file must **never** be committed — it's in `.gitignore`
- `ADMIN_API_KEY` should be a 32+ char random string
- `hx_` keys are hashed (SHA-256) before storage — raw key is shown only once
- Rate limiting: 100 requests/minute per client (configurable)
- All tool calls are audit-logged in memory (use Redis/DB for production)

---

## License

BSL-1.0 — [HealthX OS Dev](https://github.com/healthx-os-dev)
