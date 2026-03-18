// src/services/abdm.js
// Handles ABDM OAuth token lifecycle and all gateway HTTP calls
import axios from "axios";

let _token = null;
let _tokenExpiry = 0;

// ── Token management ─────────────────────────────────────────────────────
export async function getAbdmToken() {
  if (_token && Date.now() < _tokenExpiry - 30_000) return _token;

  const res = await axios.post(
    `${process.env.ABDM_BASE_URL}/gateway/v0.5/sessions`,
    {
      clientId: process.env.ABDM_CLIENT_ID,
      clientSecret: process.env.ABDM_CLIENT_SECRET,
    },
    { headers: { "Content-Type": "application/json" } }
  );

  _token = res.data.accessToken;
  _tokenExpiry = Date.now() + res.data.expiresIn * 1000;
  return _token;
}

// ── Base axios instance ───────────────────────────────────────────────────
async function abdmHttp(method, path, data = null, extraHeaders = {}) {
  const token = await getAbdmToken();
  const config = {
    method,
    url: `${process.env.ABDM_BASE_URL}${path}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-CM-ID": process.env.ABDM_CM_ID || "sbx",
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extraHeaders,
    },
  };
  if (data) config.data = data;

  try {
    const res = await axios(config);
    return res.data;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(`ABDM API error [${err.response?.status}]: ${msg}`);
  }
}

export const abdm = {
  get:  (path, h) => abdmHttp("GET",  path, null, h),
  post: (path, d, h) => abdmHttp("POST", path, d, h),
};
