// /api/subscribe.js
// Vercel Serverless Function (Node runtime)
// Adds/updates a contact in Brevo using: POST https://api.brevo.com/v3/contacts
// Docs: "Create a contact" (Brevo API v3)

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function pickListId(persona) {
  // Configure per-persona list IDs (recommended), or use a single default list.
  const p = String(persona || "").toLowerCase().trim();

  if (p === "seller" || p === "etsy_seller" || p === "smb") {
    return process.env.BREVO_LIST_ID_SELLER || process.env.BREVO_LIST_ID_DEFAULT;
  }
  if (p === "consumer" || p === "shopper") {
    return process.env.BREVO_LIST_ID_CONSUMER || process.env.BREVO_LIST_ID_DEFAULT;
  }

  // Fallback (unknown persona)
  return process.env.BREVO_LIST_ID_DEFAULT;
}

export default async function handler(req, res) {
  // CORS (safe defaults for same-origin). If you later post from another domain, whitelist it.
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "missing_brevo_api_key" });
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ ok: false, error: "invalid_json" });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const source = String(body.source || "").trim().slice(0, 32);
  const persona = String(body.persona || "").trim().slice(0, 32);

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: "invalid_email" });
  }

  const listIdRaw = pickListId(persona);
  const listId = listIdRaw ? parseInt(listIdRaw, 10) : null;

  // Brevo payload: create-or-update contact by setting updateEnabled = true.
  // Supports: email, listIds, attributes, updateEnabled. :contentReference[oaicite:1]{index=1}
  const payload = {
    email,
    updateEnabled: true,
    attributes: {
      SIGNUP_SOURCE: source || "unknown",
      SIGNUP_PERSONA: persona || "unknown",
      SIGNUP_TS: new Date().toISOString(),
      SIGNUP_PAGE: "findnext.co"
    },
    ...(Number.isFinite(listId) ? { listIds: [listId] } : {})
  };

  try {
    const resp = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify(payload)
    });

    // Brevo returns a JSON body on error; read safely.
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}

    if (!resp.ok) {
      return res.status(resp.status).json({
        ok: false,
        error: "brevo_error",
        status: resp.status,
        details: data || text || null
      });
    }

    return res.status(200).json({
  ok: true,
  email,
  persona: persona || "unknown",
  source: source || "unknown",
  ...(Number.isFinite(listId) ? { listId } : {})
});

  } catch (e) {
    return res.status(500).json({ ok: false, error: "network_error" });
  }
}
