// src/services/store.js
// In-memory store for consent artefacts and pending callbacks.
// Replace with Redis or PostgreSQL for production multi-instance deployments.

const consentRequests = new Map();  // requestId → { status, artefact, createdAt }
const callbackResolvers = new Map(); // requestId → resolve fn (for async→sync bridge)

export const store = {
  // Consent request lifecycle
  setConsentRequest(requestId, data) {
    consentRequests.set(requestId, { ...data, createdAt: Date.now() });
  },
  getConsentRequest(requestId) {
    return consentRequests.get(requestId) ?? null;
  },
  updateConsentStatus(requestId, status, artefact = null) {
    const existing = consentRequests.get(requestId) ?? {};
    consentRequests.set(requestId, { ...existing, status, artefact, updatedAt: Date.now() });
    // Resolve any waiting async→sync bridge
    const resolve = callbackResolvers.get(requestId);
    if (resolve) { resolve({ status, artefact }); callbackResolvers.delete(requestId); }
  },

  // Async→sync bridge: wait up to `timeoutMs` for ABDM callback
  waitForCallback(requestId, timeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
      const existing = consentRequests.get(requestId);
      if (existing?.status && existing.status !== "REQUESTED") {
        return resolve({ status: existing.status, artefact: existing.artefact });
      }
      callbackResolvers.set(requestId, resolve);
      setTimeout(() => {
        callbackResolvers.delete(requestId);
        reject(new Error(`Timeout waiting for ABDM callback for ${requestId}`));
      }, timeoutMs);
    });
  },

  // Audit log (append-only in memory; write to DB in production)
  _auditLog: [],
  audit(entry) {
    this._auditLog.push({ ...entry, ts: new Date().toISOString() });
    if (this._auditLog.length > 10_000) this._auditLog.shift();
  },
  getAuditLog(limit = 100) {
    return this._auditLog.slice(-limit);
  },
};
