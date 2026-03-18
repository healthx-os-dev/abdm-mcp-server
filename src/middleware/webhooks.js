// src/middleware/webhooks.js
// Receives all ABDM gateway async callbacks and resolves the in-memory store
// so the async→sync bridge in tools/index.js can return results to agents.

import express from "express";
import { store } from "../services/store.js";

export const webhookRouter = express.Router();

// ── Middleware: log every callback ────────────────────────────────────────
webhookRouter.use((req, _res, next) => {
  console.log(`[ABDM Callback] ${req.method} ${req.path}`, JSON.stringify(req.body).slice(0, 200));
  next();
});

// ════════════════════════════════════════════════════════════════════════
// Consent callbacks
// ════════════════════════════════════════════════════════════════════════

// Gateway sends this when patient approves or denies consent
webhookRouter.post("/consents/hiu/notify", (req, res) => {
  const { notification } = req.body;
  const { consentRequestId, status, consentArtefacts } = notification;

  if (consentRequestId) {
    store.updateConsentStatus(consentRequestId, status, consentArtefacts?.[0] ?? null);
    store.audit({ event: "consent_notify", consentRequestId, status });
  }

  res.status(202).json({ acknowledgement: { status: "OK" } });
});

// Gateway sends this when consent artefact is available for fetching
webhookRouter.post("/consents/hiu/on-fetch", (req, res) => {
  const { consent } = req.body;
  if (consent?.consentId) {
    store.updateConsentStatus(consent.consentRequestId, "GRANTED", consent);
    store.audit({ event: "consent_artefact_received", consentId: consent.consentId });
  }
  res.status(202).json({ acknowledgement: { status: "OK" } });
});

// ════════════════════════════════════════════════════════════════════════
// Health Information callbacks
// ════════════════════════════════════════════════════════════════════════

// HIPs push encrypted health records to this endpoint
webhookRouter.post("/health-info", (req, res) => {
  const { transactionId, entries, keyMaterial } = req.body;

  if (transactionId && entries) {
    // Resolve the waiting fetch_health_records tool call
    store.updateConsentStatus(`hi-${transactionId}`, "RECEIVED", { entries, keyMaterial });
    store.audit({ event: "health_records_received", transactionId, entryCount: entries.length });
  }

  res.status(202).json({ acknowledgement: { status: "OK" } });
});

// Notification: health info transfer is complete
webhookRouter.post("/health-info/notify", (req, res) => {
  const { notification } = req.body;
  store.audit({ event: "health_info_notify", ...notification });
  res.status(202).json({ acknowledgement: { status: "OK" } });
});

// ════════════════════════════════════════════════════════════════════════
// HIP linking callbacks
// ════════════════════════════════════════════════════════════════════════

// Patient's PHR app discovered our care contexts
webhookRouter.post("/care-contexts/on-discover", (req, res) => {
  const { requestId, patient } = req.body;
  store.audit({ event: "care_context_discovered", requestId, patientId: patient?.id });
  res.status(202).json({ acknowledgement: { status: "OK" } });
});

// Care context link confirmed
webhookRouter.post("/links/link/on-confirm", (req, res) => {
  const { requestId, patient } = req.body;
  store.audit({ event: "care_context_linked", requestId, patientId: patient?.id });
  res.status(202).json({ acknowledgement: { status: "OK" } });
});

// ════════════════════════════════════════════════════════════════════════
// Subscription callbacks (PHR app)
// ════════════════════════════════════════════════════════════════════════

webhookRouter.post("/subscriptions/hiu/notify", (req, res) => {
  const { notification } = req.body;
  store.audit({ event: "subscription_notify", ...notification });
  res.status(202).json({ acknowledgement: { status: "OK" } });
});

// ── Health check ──────────────────────────────────────────────────────────
webhookRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
