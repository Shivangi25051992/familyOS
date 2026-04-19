const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { onCall } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { google } = require("googleapis");
const Anthropic = require("@anthropic-ai/sdk").default;
const crypto = require("crypto");

// ── LLM MODEL CONFIG ──────────────────────────
// Change models here — affects entire app
const LLM_MODELS = {
  // Gmail email parsing — simple extraction
  // Cheap model fine here, no medical data
  gmailParsing: "claude-haiku-4-5-20251001",

  // Receipt OCR — simple amount extraction
  receiptOcr: "claude-haiku-4-5-20251001",

  // Fallback for OpenAI
  openaiFallback: "gpt-4o-mini",
};
// ─────────────────────────────────────────────

initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// AI FEATURE FLAGS (server-side)
// Check if an AI feature is enabled for a family.
// Reads families/{fid}.aiFeatures and families/{fid}.plan.
// Returns true (enabled) by default; fails open — never silently breaks prod.
// ─────────────────────────────────────────────────────────────────────────────
const _PREMIUM_FLAGS = ["medicalImageAnalysis", "doctorSummary", "audioBrief"];
async function isAIFeatureEnabled(fid, flag) {
  try {
    const snap = await db.collection("families").doc(fid).get();
    const fam = snap.data() || {};
    const overrides = fam.aiFeatures || {};
    if (fam.plan === "free" && _PREMIUM_FLAGS.includes(flag)) {
      return overrides[flag] ?? false;
    }
    return overrides[flag] ?? true;
  } catch {
    return true;
  }
}

// Secrets
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const GMAIL_ENCRYPTION_KEY = defineSecret("GMAIL_ENCRYPTION_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const REDIRECT_URI =
  "https://us-central1-familyos-e3d4b.cloudfunctions.net/gmailOAuthCallback";

const CORS_ORIGINS = [
  "https://familyos-e3d4b.web.app",
  "https://familyos-e3d4b.firebaseapp.com",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

const SENDER_MAP = {
  myntra: [
    "updates@myntra.com",
    "no-reply@myntra.com",
    "noreply@myntra.com",
    "order@myntra.com",
    "orders@myntra.com",
    "support@myntra.com",
    "mailer@myntra.com",
  ],
  swiggy: [
    "no-reply@swiggy.in",
    "order@swiggy.in",
    "noreply@swiggy.in",
  ],
  instamart: ["no-reply@swiggy.in"],
  zomato: [
    "noreply@zomato.com",
    "orders@zomato.com",
    "no-reply@zomato.com",
  ],
  amazon: [
    "order-update@amazon.in",
    "shipment-tracking@amazon.in",
    "auto-confirm@amazon.in",
    "returns@amazon.in",
  ],
  urbanclap: [
    "noreply@urbanclap.com",
    "noreply@urban.company",
    "bookings@urbanclap.com",
  ],
  flipkart: [
    "noreply@flipkart.com",
    "noreply-b2c@flipkart.com",
    "order@flipkart.com",
  ],
  hdfc: [
    "alerts@hdfcbank.net",
    "noreply@hdfcbank.com",
    "phishingmail@hdfcbank.com",
  ],
  icici: ["alerts@icicibank.com"],
  axis: ["alerts@axisbank.com"],
  zepto: ["noreply@zeptonow.com", "noreply@zepto.co", "support@zepto.co"],
  croma: ["noreply@croma.com"],
  blinkit: ["noreply@blinkit.com", "orders@blinkit.com"],
  bigbasket: ["noreply@bigbasket.com"],
  nykaa: ["noreply@nykaa.com", "orders@nykaa.com"],
};

// Deterministic vendor → category (overrides AI when we know source from email)
const SOURCE_TO_CATEGORY = {
  swiggy: "Food",
  zomato: "Food",
  instamart: "Groceries",
  zepto: "Groceries",
  blinkit: "Groceries",
  bigbasket: "Groceries",
  myntra: "Clothes",
  nykaa: "Clothes",
  amazon: "Shopping",
  flipkart: "Shopping",
  croma: "Shopping",
  urbanclap: "HomeServices",
  hdfc: "Utilities",
  icici: "Utilities",
  axis: "Utilities",
};

// ── RATE LIMITING ─────────────────────────────
// Per-family throttle stored in Firestore _rateLimits subcollection.
// Only Cloud Functions can write this subcollection (rules deny client access).
async function checkRateLimit(fid, key, minIntervalMs) {
  const ref = db.collection("families").doc(fid).collection("_rateLimits").doc(key);
  const snap = await ref.get();
  const now = Date.now();
  if (snap.exists) {
    const lastCallAt = snap.data().lastCallAt?.toMillis?.() || 0;
    if (now - lastCallAt < minIntervalMs) {
      const waitSec = Math.ceil((minIntervalMs - (now - lastCallAt)) / 1000);
      throw new Error(`Rate limited — try again in ${waitSec}s`);
    }
  }
  await ref.set({ lastCallAt: Timestamp.fromMillis(now) }, { merge: true });
}
// ─────────────────────────────────────────────

function getSourceFromSender(fromAddr) {
  const lower = (fromAddr || "").toLowerCase();
  for (const [source, addrs] of Object.entries(SENDER_MAP)) {
    if (addrs.some((a) => lower.includes(a.toLowerCase()))) return source;
  }
  return null;
}

function encryptToken(plaintext, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key.slice(0, 32).padEnd(32, "0"), "utf8"),
    iv
  );
  let enc = cipher.update(plaintext, "utf8", "hex");
  enc += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + enc;
}

function decryptToken(encrypted, key) {
  const [ivHex, authTagHex, enc] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key.slice(0, 32).padEnd(32, "0"), "utf8"),
    iv
  );
  decipher.setAuthTag(authTag);
  return decipher.update(enc, "hex", "utf8") + decipher.final("utf8");
}

function extractEmailBody(payload) {
  if (!payload) return "";

  // Collect ALL parts recursively
  const allParts = [];

  function walk(node) {
    if (!node) return;
    // Leaf node with data
    if (node.body?.data && node.mimeType) {
      allParts.push({
        mime: node.mimeType,
        size: node.body.size || node.body.data.length || 0,
        data: node.body.data,
      });
    }
    // Walk children
    if (node.parts?.length) {
      node.parts.forEach(walk);
    }
  }

  walk(payload);

  function decode(data) {
    // FIX: Gmail uses base64url — must use 'base64url' not 'base64'
    return Buffer.from(data, "base64url").toString("utf-8");
  }

  function stripHtml(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#8377;/g, "₹")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasPriceSignal(text) {
    return /₹|Rs\.|INR|Net Paid|Amount Paid|Order Total|Grand Total|Total Amount|You paid|Total payable|to be paid|Amount paid|Paid:|Total:|Order amount|Payment of|debited|charged/i.test(text);
  }

  // Get all HTML parts sorted by size (largest first = most complete invoice)
  const htmlParts = allParts
    .filter((p) => p.mime === "text/html")
    .sort((a, b) => b.size - a.size);

  // Get all plain parts sorted by size
  const plainParts = allParts
    .filter((p) => p.mime === "text/plain")
    .sort((a, b) => b.size - a.size);

  // Try HTML parts first — prefer one with price signal
  for (const part of htmlParts) {
    const text = stripHtml(decode(part.data));
    if (hasPriceSignal(text) && text.length > 50) {
      return text.substring(0, 1500);
    }
  }

  // Try plain parts with price signal
  for (const part of plainParts) {
    const text = decode(part.data);
    if (hasPriceSignal(text) && text.length > 50) {
      return text.substring(0, 1500);
    }
  }

  // Fallback: return largest HTML part regardless (maybe AI can still find amount)
  if (htmlParts.length > 0) {
    return stripHtml(decode(htmlParts[0].data)).substring(0, 1500);
  }
  if (plainParts.length > 0) {
    return decode(plainParts[0].data).substring(0, 1500);
  }

  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: gmailAuthUrl
// ─────────────────────────────────────────────────────────────────────────────
exports.gmailAuthUrl = onCall(
  { cors: CORS_ORIGINS, secrets: [GOOGLE_CLIENT_ID] },
  async (request) => {
    const { fid } = request.data || {};
    if (!fid) throw new Error("fid required");

    const famRef = db.collection("families").doc(fid);
    const famSnap = await famRef.get();
    if (!famSnap.exists) throw new Error("Family not found");

    const clientId = GOOGLE_CLIENT_ID.value();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      response_type: "code",
      state: fid,
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    return { url };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: gmailOAuthCallback
// ─────────────────────────────────────────────────────────────────────────────
exports.gmailOAuthCallback = onRequest(
  { secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_ENCRYPTION_KEY] },
  async (req, res) => {
    const { code, state: fid } = req.query;
    if (!code || !fid) {
      res.redirect("https://familyos-e3d4b.web.app?gmailError=missing_params");
      return;
    }

    const famRef = db.collection("families").doc(fid);
    const famSnap = await famRef.get();
    if (!famSnap.exists) {
      res.redirect("https://familyos-e3d4b.web.app?gmailError=family_not_found");
      return;
    }

    const clientId = GOOGLE_CLIENT_ID.value();
    const clientSecret = GOOGLE_CLIENT_SECRET.value();
    const encKey = GMAIL_ENCRYPTION_KEY.value();

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Token exchange failed:", err);
      res.redirect("https://familyos-e3d4b.web.app?gmailError=token_failed");
      return;
    }

    const tokens = await tokenRes.json();
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      res.redirect("https://familyos-e3d4b.web.app?gmailError=no_refresh");
      return;
    }

    const encrypted = encryptToken(refreshToken, encKey);

    const accessToken = tokens.access_token;
    let gmailAddress = "unknown";
    if (accessToken) {
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        gmailAddress = info.email || gmailAddress;
      }
    }

    await famRef.update({
      gmailSync: {
        connected: true,
        email: gmailAddress,
        connectedAt: new Date(),
        refreshToken: encrypted,
        lastSyncAt: null,
        lastSyncCount: 0,
        enabledServices: {
          myntra: true,
          swiggy: true,
          instamart: true,
          zepto: true,
          zomato: true,
          amazon: true,
          urbanclap: true,
          flipkart: false,
          croma: false,
          blinkit: false,
          bigbasket: false,
          nykaa: false,
          hdfc: true,
          icici: false,
          axis: false,
        },
      },
    });

    res.redirect("https://familyos-e3d4b.web.app?gmailConnected=true");
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: syncGmailExpenses
// ─────────────────────────────────────────────────────────────────────────────
async function parseEmailWithAI(from, subject, body, openaiKey, anthropicKey) {
  const systemPrompt = `You are a receipt parser for Indian family expense tracking.
Extract purchase details from order confirmation emails.
Respond ONLY with valid JSON — no markdown, no explanation, no code blocks.
Return {"skip":true} ONLY if there is genuinely no purchase amount anywhere.

Indian price formats to recognise:
- ₹8,648  or  Rs. 8648  or  INR 8648
- "Net Paid", "Amount Paid", "Order Total", "Grand Total"  
- "You paid", "Total payable", "to be paid"
The amount may appear deep in the email — search carefully.`;

  const userPrompt = `Parse this Indian order confirmation email.

Return JSON with these exact fields:
{
  "amount": number (rupees only, no symbol, no commas — e.g. 8648),
  "merchant": string (brand name only, max 20 chars — e.g. "Myntra", "Swiggy"),
  "category": one of exactly: Food, Groceries, Clothes, Shopping, HomeServices, Travel, Utilities, Other,
  "description": string (brief item/order summary, max 50 chars, no personal info),
  "date": "YYYY-MM-DD",
  "source": one of exactly: swiggy, instamart, zepto, zomato, amazon, myntra, urbanclap, flipkart, blinkit, bigbasket, nykaa, bank, other,
  "isEmi": false,
  "orderId": string (optional — from subject like "Order #123" or "Order ID XXXXX" if present)
}

VENDOR → CATEGORY mapping (use these for consistency):
- Swiggy, Zomato → Food
- Instamart, Zepto, Blinkit, BigBasket → Groceries
- Myntra, Nykaa → Clothes
- Amazon, Flipkart, Croma → Shopping
- UrbanClap, Urban Company → HomeServices
- Bank alerts → Utilities or Other

Look for amount in: body, subject, headers. Myntra/Flipkart sometimes put price in subject (e.g. "Order #123 - ₹8648") or in "Amount Paid", "Net Paid", "Order Total" in body.

From: ${from}
Subject: ${subject}
Email content:
${body}

If no purchase amount found anywhere, return {"skip":true}`;

  if (openaiKey && openaiKey.trim()) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey.trim()}`,
      },
      body: JSON.stringify({
        model: LLM_MODELS.openaiFallback,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 256,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content || "";
      return text;
    }
  }

  if (anthropicKey && anthropicKey.trim()) {
    const anthropic = new Anthropic({ apiKey: anthropicKey.trim() });
    const parseRes = await anthropic.messages.create({
      model: LLM_MODELS.gmailParsing,
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return parseRes.content?.[0]?.type === "text"
      ? parseRes.content[0].text
      : "";
  }

  throw new Error("No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
}

async function doSyncGmailExpenses(fid, opts = {}) {
  const debug = opts.debug === true;
  const encKey = GMAIL_ENCRYPTION_KEY.value();
  let openaiKey = "";
  let anthropicKey = "";
  try {
    openaiKey = OPENAI_API_KEY.value() || "";
  } catch {}
  try {
    anthropicKey = ANTHROPIC_API_KEY.value() || "";
  } catch {}

  const famRef = db.collection("families").doc(fid);
  const famSnap = await famRef.get();
  if (!famSnap.exists) return { newCount: 0 };

  const gmailSync = famSnap.data().gmailSync;
  if (!gmailSync?.connected || !gmailSync.refreshToken) return { newCount: 0 };

  const enabledServices = gmailSync.enabledServices || {};
  const activeSenders = [];
  for (const [svc, addrs] of Object.entries(SENDER_MAP)) {
    if (enabledServices[svc]) activeSenders.push(...addrs);
  }
  if (activeSenders.length === 0) return { newCount: 0 };

  const refreshToken = decryptToken(gmailSync.refreshToken, encKey);
  const clientId = GOOGLE_CLIENT_ID.value();
  const clientSecret = GOOGLE_CLIENT_SECRET.value();

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const accessToken = (await oauth2.getAccessToken()).token;

  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  // First sync: last 3 months only (Mar, Feb, Jan). Subsequent syncs: 2hr overlap before last sync.
  const FIRST_SYNC_DAYS = 90;
  const MAX_EMAILS_PER_SYNC = 75;
  let cutoffMs;
  if (gmailSync.lastSyncAt) {
    const lastSync = gmailSync.lastSyncAt.toDate().getTime();
    cutoffMs = lastSync - (2 * 60 * 60 * 1000);
  } else {
    cutoffMs = Date.now() - (FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000);
  }
  const afterEpoch = Math.floor(cutoffMs / 1000);
  const timeFilter = `after:${afterEpoch}`;
  const senderQuery = activeSenders.map((s) => `from:${s}`).join(" OR ");
  const q = `(${senderQuery}) ${timeFilter}`;

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: MAX_EMAILS_PER_SYNC,
  });
  let messages = listRes.data.messages || [];
  if (messages.length === 0) {
    console.log(`Sync fid=${fid} query="${q}" found 0 messages`);
  } else {
    console.log(`Sync fid=${fid} query="${q}" found ${messages.length} messages`);
  }

  let newCount = 0;
  let skippedAlreadyExists = 0;
  let skippedAiSkip = 0;
  let skippedNoBody = 0;
  let skippedWrongSender = 0;
  let errors = 0;
  const emailSamples = [];
  const autoExpensesRef = db.collection("families").doc(fid).collection("autoExpenses");
  const debugDetails = [];

  for (const msg of messages) {
    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = fullMsg.data.payload?.headers || [];
    const from =
      headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
    const fromMatch = from.match(/<([^>]+)>/);
    const fromAddr = fromMatch ? fromMatch[1] : from.trim().split(/\s+/).pop() || "";
    const subject =
      headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
    const dateHeader =
      headers.find((h) => h.name.toLowerCase() === "date")?.value || "";

    const body = extractEmailBody(fullMsg.data.payload);

    const fromLower = fromAddr.toLowerCase();
    // Only trust the FROM address — not subject keywords.
    // Subject keyword matching causes promotional emails to pass through
    // (e.g. "Myntra Sale!" from a random sender) and wastes AI calls.
    const inActive = activeSenders.some((s) => fromLower.includes(s.toLowerCase()));
    if (!inActive) {
      skippedWrongSender++;
      if (debug) debugDetails.push({ msgId: msg.id, from, subject, body: body.slice(0, 400), skip: "not_in_active_senders" });
      if (emailSamples.length < 3) {
        emailSamples.push({ from, subject, bodyPreview: body.slice(0, 100), aiResponse: null, result: "wrong_sender" });
      }
      continue;
    }

    const existing = await autoExpensesRef.doc(msg.id).get();
    if (existing.exists) {
      skippedAlreadyExists++;
      if (debug) debugDetails.push({ msgId: msg.id, from, subject, body: body.slice(0, 400), skip: "already_exists" });
      if (emailSamples.length < 3) {
        emailSamples.push({ from, subject, bodyPreview: body.slice(0, 100), aiResponse: null, result: "already_exists" });
      }
      continue;
    }

    // Extract order ID from subject for dedup (before AI parsing)
    const orderIdMatch = subject.match(/(?:order\s*#?\s*([a-z0-9\-]+)|#([a-z0-9\-]+)|order\s*id[:\s]+([a-z0-9\-]+))/i);
    const subjectOrderId = orderIdMatch ? (orderIdMatch[1] || orderIdMatch[2] || orderIdMatch[3] || "").trim() : null;

    if (!body || body.trim().length < 50) {
      skippedNoBody++;
      if (emailSamples.length < 3) {
        emailSamples.push({ from, subject, bodyPreview: body?.slice(0, 100) || "(empty)", aiResponse: null, result: "no_body" });
      }
      continue;
    }

    let text;
    try {
      text = await parseEmailWithAI(from, subject, body, openaiKey, anthropicKey);
    } catch (e) {
      errors++;
      if (emailSamples.length < 3) {
        emailSamples.push({ from, subject, bodyPreview: body.slice(0, 100), aiResponse: String(e.message), result: "error" });
      }
      continue;
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      skippedAiSkip++;
      if (debug) debugDetails.push({ msgId: msg.id, from, subject, body: body.slice(0, 400), aiResponse: text, skip: "no_json" });
      if (emailSamples.length < 3) {
        emailSamples.push({ from, subject, bodyPreview: body.slice(0, 100), aiResponse: text?.slice(0, 80) || "—", result: "ai_skip" });
      }
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      skippedAiSkip++;
      if (debug) debugDetails.push({ msgId: msg.id, from, subject, body: body.slice(0, 400), aiResponse: text, skip: "parse_error" });
      if (emailSamples.length < 3) {
        emailSamples.push({ from, subject, bodyPreview: body.slice(0, 100), aiResponse: text?.slice(0, 80) || "—", result: "ai_skip" });
      }
      continue;
    }
    if (parsed.skip) {
      skippedAiSkip++;
      if (debug) debugDetails.push({ msgId: msg.id, from, subject, body: body.slice(0, 400), aiResponse: text, parsed, skip: "ai_skip" });
      if (emailSamples.length < 3) {
        emailSamples.push({ from, subject, bodyPreview: body.slice(0, 100), aiResponse: text?.slice(0, 80) || "—", result: "ai_skip" });
      }
      continue;
    }

    const dateStr =
      parsed.date ||
      (dateHeader ? new Date(dateHeader).toISOString().split("T")[0] : "") ||
      new Date().toISOString().split("T")[0];

    // Deterministic category override: when we know vendor from email, use our mapping
    const detectedSource = getSourceFromSender(fromAddr);
    const category =
      detectedSource && SOURCE_TO_CATEGORY[detectedSource]
        ? SOURCE_TO_CATEGORY[detectedSource]
        : parsed.category || "Other";
    const source = detectedSource || parsed.source || "other";

    const orderId = parsed.orderId || subjectOrderId;
    const merchant = (parsed.merchant || "Unknown").slice(0, 20).toLowerCase().replace(/\s+/g, "");
    const dedupKey = orderId && merchant ? `${merchant.slice(0, 15)}_${orderId}` : `${merchant.slice(0, 15)}_${dateStr}_${Math.round((parsed.amount || 0) / 50) * 50}`;

    if (debug) {
      debugDetails.push({ msgId: msg.id, from, subject, body: body.slice(0, 400), aiResponse: text, parsed, created: true });
    } else {
      if (emailSamples.length < 3) {
        emailSamples.push({ from, subject, bodyPreview: body.slice(0, 100), aiResponse: text?.slice(0, 80) || "—", result: "new" });
      }
      await autoExpensesRef.doc(msg.id).set({
        amount: parsed.amount || 0,
        merchant: (parsed.merchant || "Unknown").slice(0, 20),
        category,
        description: (parsed.description || "").slice(0, 40),
        date: dateStr,
        source,
        isEmi: !!parsed.isEmi,
        status: "pending",
        emailId: msg.id,
        parsedAt: new Date(),
        autoCapture: true,
        orderId: orderId || null,
        orderDedupKey: dedupKey,
      }); // orderDedupKey used by frontend consolidation
      newCount++;
    }
  }

  if (!debug) {
    await famRef.update({
      "gmailSync.lastSyncAt": Timestamp.fromMillis(Date.now() - (3 * 60 * 60 * 1000)),
      "gmailSync.lastSyncCount": newCount,
      "gmailSync.lastSyncScanned": messages.length,
      "gmailSync.lastSyncLog": {
        scanned: messages.length,
        newCount,
        skippedAlreadyExists,
        skippedAiSkip,
        skippedNoBody,
        skippedWrongSender,
        errors,
        emailSamples,
      },
    });
  }

  if (debug) {
    return { debug: true, messageCount: messages.length, details: debugDetails };
  }
  return { newCount, messageCount: messages.length };
}

exports.syncGmailExpenses = onCall(
  {
    cors: CORS_ORIGINS,
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GMAIL_ENCRYPTION_KEY,
      OPENAI_API_KEY,
      ANTHROPIC_API_KEY,
    ],
  },
  async (request) => {
    const { fid, debug } = request.data || {};
    if (!fid) throw new Error("fid required");

    const uid = request.auth?.uid;
    if (!uid) throw new Error("Unauthenticated");

    const famSnap = await db.collection("families").doc(fid).get();
    if (!famSnap.exists) throw new Error("Family not found");
    const fam = famSnap.data();
    if (!fam.members?.includes(uid) && !fam.memberProfiles?.[uid]) throw new Error("Not a member");

    // Debug mode (returns raw email snippets) — primary owner only
    const isPrimary = fam.primaryOwner === uid || fam.memberProfiles?.[uid]?.role === "primary";
    const safeDebug = debug === true && isPrimary;

    const result = await doSyncGmailExpenses(fid, { debug: safeDebug });
    return result;
  }
);

exports.syncGmailExpensesScheduled = onSchedule(
  {
    schedule: "0 */6 * * *",
    secrets: [
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GMAIL_ENCRYPTION_KEY,
      OPENAI_API_KEY,
      ANTHROPIC_API_KEY,
    ],
  },
  async (event) => {
    const fams = await db
      .collection("families")
      .where("gmailSync.connected", "==", true)
      .get();
    for (const doc of fams.docs) {
      try {
        await doSyncGmailExpenses(doc.id);
      } catch (e) {
        console.error(`Sync failed for ${doc.id}:`, e);
      }
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3b: generateExpenseInsights — AI-powered actionable insights
// ─────────────────────────────────────────────────────────────────────────────
exports.generateExpenseInsights = onCall(
  { cors: CORS_ORIGINS, secrets: [OPENAI_API_KEY, ANTHROPIC_API_KEY] },
  async (request) => {
    const { fid } = request.data || {};
    if (!fid) throw new Error("fid required");

    const uid = request.auth?.uid;
    if (!uid) throw new Error("Unauthenticated");

    const famRef = db.collection("families").doc(fid);
    const famSnap = await famRef.get();
    if (!famSnap.exists) throw new Error("Family not found");

    const fam = famSnap.data();
    const members = fam.members || [];
    const isMember = members.includes(uid) || fam.memberProfiles?.[uid];
    if (!isMember) throw new Error("Not a member of this family");

    await checkRateLimit(fid, "generateInsights", 300_000); // 1 call per 5 min per family

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    const expSnap = await db.collection("families").doc(fid).collection("expenses").get();
    const expenses = expSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const monthExp = expenses.filter((e) => e.date?.startsWith(thisMonth));
    const lastExp = expenses.filter((e) => e.date?.startsWith(lastStr));
    const monthSpent = monthExp.reduce((s, e) => s + (e.amount || 0), 0);
    const lastSpent = lastExp.reduce((s, e) => s + (e.amount || 0), 0);

    const byCat = {};
    monthExp.forEach((e) => {
      const c = e.cat || "Other";
      byCat[c] = (byCat[c] || 0) + (e.amount || 0);
    });
    const bySource = {};
    monthExp.forEach((e) => {
      const s = e.source || (e.notes?.toLowerCase().includes("swiggy") ? "swiggy" : e.notes?.toLowerCase().includes("myntra") ? "myntra" : "other");
      bySource[s] = (bySource[s] || 0) + 1;
    });

    const summary = {
      thisMonthTotal: monthSpent,
      lastMonthTotal: lastSpent,
      thisMonthCount: monthExp.length,
      byCategory: byCat,
      byVendorCount: bySource,
    };

    let openaiKey = "";
    let anthropicKey = "";
    try {
      openaiKey = OPENAI_API_KEY.value() || "";
    } catch {}
    try {
      anthropicKey = ANTHROPIC_API_KEY.value() || "";
    } catch {}

    const prompt = `You are a helpful financial coach for Indian families. Given this spending data, suggest 2-3 specific, actionable insights. Be brief (one line each). Use ₹ and Indian context. Don't be preachy. Examples: "Food is 40% — 2 fewer Swiggy orders/week could save ~₹800", "Clothes up 60% vs last month — sale season?", "6 Swiggy orders this month — consider meal prep for weekdays?"

Data:
- This month total: ₹${Math.round(summary.thisMonthTotal)}
- Last month total: ₹${Math.round(summary.lastMonthTotal)}
- By category: ${JSON.stringify(summary.byCategory)}
- Vendor order counts: ${JSON.stringify(summary.byVendorCount)}

Reply with exactly 2-3 bullet points, one per line. No numbering, no intro.`;

    let insights = [];

    if (openaiKey?.trim()) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey.trim()}`,
          },
          body: JSON.stringify({
            model: LLM_MODELS.openaiFallback,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 256,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const text = json.choices?.[0]?.message?.content || "";
          insights = text
            .split("\n")
            .map((s) => s.replace(/^[-*•]\s*/, "").trim())
            .filter((s) => s.length > 10);
        }
      } catch (e) {
        console.error("OpenAI insights error:", e);
      }
    } else if (anthropicKey?.trim()) {
      try {
        const anthropic = new Anthropic({ apiKey: anthropicKey.trim() });
        const msg = await anthropic.messages.create({
          model: LLM_MODELS.gmailParsing,
          max_tokens: 256,
          messages: [{ role: "user", content: prompt }],
        });
        const text = msg.content?.[0]?.type === "text" ? msg.content[0].text : "";
        insights = text
          .split("\n")
          .map((s) => s.replace(/^[-*•]\s*/, "").trim())
          .filter((s) => s.length > 10);
      } catch (e) {
        console.error("Anthropic insights error:", e);
      }
    }

    if (insights.length === 0) {
      // Fallback: computed insights without AI
      const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
      const pct = monthSpent > 0 && topCat ? Math.round((topCat[1] / monthSpent) * 100) : 0;
      if (topCat) insights.push(`${topCat[0]} is ${pct}% of your spend this month`);
      if (lastSpent > 0) {
        const diff = Math.round(((monthSpent - lastSpent) / lastSpent) * 100);
        insights.push(`${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)}% vs last month`);
      }
    }

    return { insights, summary: { thisMonthTotal: monthSpent, lastMonthTotal: lastSpent } };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3c: createInvite — server-side invite creation (bypasses Firestore rules)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3d: joinWithInviteCode — server-side join (bypasses family update rule)
// ─────────────────────────────────────────────────────────────────────────────
exports.joinWithInviteCode = onCall({ cors: CORS_ORIGINS }, async (request) => {
  const { code } = request.data || {};
  if (!code || typeof code !== "string") throw new Error("Invite code required");

  const uid = request.auth?.uid;
  if (!uid) throw new Error("Sign in first");

  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length < 6) throw new Error("Invalid code");

  const invRef = db.collection("invitations").doc(cleanCode);
  const invSnap = await invRef.get();
  if (!invSnap.exists) throw new Error("Invalid code");

  const inv = invSnap.data();
  if (inv.used) throw new Error("Code already used");
  if (inv.expires < Date.now()) throw new Error("Code expired");

  const fid = inv.familyId;
  const famRef = db.collection("families").doc(fid);
  const famSnap = await famRef.get();
  if (!famSnap.exists) throw new Error("Family not found");

  const fam = famSnap.data();
  const profileCount = Object.keys(fam.memberProfiles || {}).length;
  if (profileCount >= 5) throw new Error("Family is full");

  const displayName = request.auth?.token?.name || "Member";
  const email = request.auth?.token?.email || "";

  const phoneNumber = request.auth?.token?.phone_number || null;

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), {
    uid: uid, // SECURITY: Always include uid
    familyId: fid,
    role: "secondary",
    name: displayName,
    email,
    phoneNumber: phoneNumber,
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp()
  });
  batch.update(famRef, {
    members: FieldValue.arrayUnion(uid),
    memberUids: FieldValue.arrayUnion(uid), // SECURITY: Flat array for Firestore rules
    [`memberProfiles.${uid}`]: {
      name: displayName,
      email,
      phoneNumber: phoneNumber,
      role: "secondary",
      emoji: "👩",
      uid,
      permissions: {
        viewExpenses: true,
        viewLoan: false,
        viewBudget: false,
        viewTasks: true,
        viewReminders: true,
        editExpenses: false,
        editTasks: false,
        editKids: false,
        editReminders: false,
        deleteExpenses: false,
        deleteTasks: false,
        deleteKids: false,
        deleteReminders: false,
      },
    },
  });
  batch.update(invRef, { 
    used: true, 
    usedBy: uid,
    usedAt: FieldValue.serverTimestamp()
  });
  await batch.commit();

  return { fid };
});

exports.createInvite = onCall({ cors: CORS_ORIGINS }, async (request) => {
  const { fid } = request.data || {};
  if (!fid) throw new Error("fid required");

  const uid = request.auth?.uid;
  if (!uid) throw new Error("Unauthenticated");

  const famRef = db.collection("families").doc(fid);
  const famSnap = await famRef.get();
  if (!famSnap.exists) throw new Error("Family not found");

  const fam = famSnap.data();
  const members = fam.members || [];
  const memberUids = fam.memberUids || members;
  const isMember = memberUids.includes(uid) || fam.memberProfiles?.[uid];
  if (!isMember) throw new Error("Not a member of this family");

  // SECURITY: Only family owner can create invites
  if (fam.primaryOwner !== uid) {
    throw new Error("Only the family owner can create invites");
  }

  const profileCount = Object.keys(fam.memberProfiles || {}).length;
  if (profileCount >= 5) throw new Error("Max 5 members reached");

  // RATE LIMITING: Check for existing active invites
  const now = Date.now();
  const existingInvitesSnapshot = await db.collection("invitations")
    .where("familyId", "==", fid)
    .where("used", "==", false)
    .where("expires", ">", now)
    .get();

  // If 3 or more active invites exist, return the most recent one instead of creating new
  if (existingInvitesSnapshot.size >= 3) {
    const mostRecent = existingInvitesSnapshot.docs
      .sort((a, b) => (b.data().createdAt || 0) - (a.data().createdAt || 0))[0];
    const existingCode = mostRecent.data().code;
    console.log('Rate limit: Returning existing invite', existingCode, 'instead of creating new');
    return { 
      code: existingCode,
      isExisting: true,
      message: "Using existing invite (max 3 active at once)"
    };
  }

  // Generate unique code
  let code;
  let attempts = 0;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const existing = await db.collection("invitations").doc(code).get();
    if (!existing.exists) break;
    attempts++;
  } while (attempts < 5);

  if (attempts >= 5) throw new Error("Could not generate unique code");

  // Create new invitation
  await db.collection("invitations").doc(code).set({
    familyId: fid,
    code,
    createdBy: uid,
    createdByName: request.auth?.token?.name || "Owner",
    createdAt: FieldValue.serverTimestamp(),
    expires: now + 86400000, // 24 hours
    used: false,
    usedBy: null,
    usedAt: null,
    familyName: fam.name || "Family",
  });

  return { code, isExisting: false };
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 4: updateGmailServices
// ─────────────────────────────────────────────────────────────────────────────
exports.updateGmailServices = onCall({ cors: CORS_ORIGINS }, async (request) => {
  const { fid, enabledServices } = request.data || {};
  if (!fid || !enabledServices) throw new Error("fid and enabledServices required");

  const uid = request.auth?.uid;
  if (!uid) throw new Error("Unauthenticated");

  const famRef = db.collection("families").doc(fid);
  const famSnap = await famRef.get();
  if (!famSnap.exists) throw new Error("Family not found");

  const fam = famSnap.data();
  const members = fam.members || [];
  const isMember = members.includes(uid) || fam.memberProfiles?.[uid];
  if (!isMember) throw new Error("Not a member of this family");

  await famRef.update({
    "gmailSync.enabledServices": enabledServices,
  });
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 4b: getGmailSyncStatus — returns DB counts and last sync info (for debugging)
// ─────────────────────────────────────────────────────────────────────────────
exports.getGmailSyncStatus = onCall(
  { cors: CORS_ORIGINS },
  async (request) => {
    const { fid } = request.data || {};
    if (!fid) throw new Error("fid required");

    const uid = request.auth?.uid;
    if (!uid) throw new Error("Unauthenticated");

    const famRef = db.collection("families").doc(fid);
    const famSnap = await famRef.get();
    if (!famSnap.exists) throw new Error("Family not found");

    const fam = famSnap.data();
    const members = fam.members || [];
    const isMember = members.includes(uid) || fam.memberProfiles?.[uid];
    if (!isMember) throw new Error("Not a member of this family");

    const gmailSync = fam.gmailSync || {};
    const autoExpensesRef = famRef.collection("autoExpenses");

    const [allSnap, pendingSnap, confirmedSnap] = await Promise.all([
      autoExpensesRef.get(),
      autoExpensesRef.where("status", "==", "pending").get(),
      autoExpensesRef.where("status", "==", "confirmed").get(),
    ]);

    const lastSyncAt = gmailSync.lastSyncAt;
    let lastSyncAtStr = null;
    if (lastSyncAt?.toDate) lastSyncAtStr = lastSyncAt.toDate().toISOString();
    else if (lastSyncAt?.seconds) lastSyncAtStr = new Date(lastSyncAt.seconds * 1000).toISOString();

    return {
      autoExpensesTotal: allSnap.size,
      autoExpensesPending: pendingSnap.size,
      autoExpensesConfirmed: confirmedSnap.size,
      gmailSync: {
        connected: !!gmailSync.connected,
        enabledServices: gmailSync.enabledServices || {},
        lastSyncAt: lastSyncAtStr,
        lastSyncCount: gmailSync.lastSyncCount,
        lastSyncScanned: gmailSync.lastSyncScanned,
        lastSyncLog: gmailSync.lastSyncLog || null,
      },
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 5: disconnectGmail
// ─────────────────────────────────────────────────────────────────────────────
exports.disconnectGmail = onCall(
  { cors: CORS_ORIGINS, secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_ENCRYPTION_KEY] },
  async (request) => {
    const { fid } = request.data || {};
    if (!fid) throw new Error("fid required");

    const uid = request.auth?.uid;
    if (!uid) throw new Error("Unauthenticated");

    const famRef = db.collection("families").doc(fid);
    const famSnap = await famRef.get();
    if (!famSnap.exists) throw new Error("Family not found");

    const fam = famSnap.data();
    const members = fam.members || [];
    if (!members.includes(uid) && !fam.memberProfiles?.[uid] )
      throw new Error("Not a member");

    const gmailSync = fam.gmailSync;
    if (gmailSync?.refreshToken) {
      const encKey = GMAIL_ENCRYPTION_KEY.value();
      const refreshToken = decryptToken(gmailSync.refreshToken, encKey);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${refreshToken}`, {
        method: "POST",
      });
    }

    const pendingSnap = await db
      .collection("families")
      .doc(fid)
      .collection("autoExpenses")
      .where("status", "==", "pending")
      .get();

    const batch = db.batch();
    pendingSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    await famRef.update({ gmailSync: FieldValue.delete() });
    return { success: true };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 6: healthAIRaw — server-side proxy for health text AI calls
// Moves Anthropic API key off the client; validates family membership first.
// ─────────────────────────────────────────────────────────────────────────────
exports.healthAIRaw = onCall(
  { cors: CORS_ORIGINS, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    const { fid, prompt, context, isCompassionatePersona, model } = request.data || {};
    if (!fid || !prompt) throw new Error("fid and prompt required");

    const uid = request.auth?.uid;
    if (!uid) throw new Error("Unauthenticated");

    const famSnap = await db.collection("families").doc(fid).get();
    if (!famSnap.exists) throw new Error("Family not found");
    const fam = famSnap.data();
    if (!fam.members?.includes(uid) && !fam.memberProfiles?.[uid]) throw new Error("Not a member");

    const anthropicKey = ANTHROPIC_API_KEY.value();
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    // Allowlist models — never let the client specify an arbitrary model string
    const ALLOWED_HEALTH_MODELS = [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-5-20251001",
    ];
    const safeModel = ALLOWED_HEALTH_MODELS.includes(model)
      ? model
      : "claude-sonnet-4-20250514";

    const systemPrompt = isCompassionatePersona
      ? `You are a compassionate medical information assistant helping an Indian family caregiver understand their family member's medical condition. Answer questions clearly and compassionately in simple language. ALWAYS recommend consulting the treating doctor for any treatment decisions. Be honest about uncertainty. Use simple language, avoid jargon. Answer in the same language the question is asked (Hindi or English).`
      : `You are a medical data summarizer. Be concise, clear, and compassionate.`;

    const response = await anthropic.messages.create({
      model: safeModel,
      max_tokens: 1000,
      system: systemPrompt + (context ? `\n\nContext:\n${context}` : ""),
      messages: [{ role: "user", content: prompt }],
    });

    return { text: response.content[0].text };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 7: healthAnalyzeImageRaw — server-side proxy for health vision calls
// Moves Anthropic API key off the client; validates family membership first.
// ─────────────────────────────────────────────────────────────────────────────
exports.healthAnalyzeImageRaw = onCall(
  { cors: CORS_ORIGINS, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: "512MiB" },
  async (request) => {
    const { fid, system, prompt, base64NoPrefix, model } = request.data || {};
    if (!fid || !base64NoPrefix) throw new Error("fid and base64NoPrefix required");

    const uid = request.auth?.uid;
    if (!uid) throw new Error("Unauthenticated");

    const famSnap = await db.collection("families").doc(fid).get();
    if (!famSnap.exists) throw new Error("Family not found");
    const fam = famSnap.data();
    if (!fam.members?.includes(uid) && !fam.memberProfiles?.[uid]) throw new Error("Not a member");

    const anthropicKey = ANTHROPIC_API_KEY.value();
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const ALLOWED_HEALTH_MODELS = [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-5-20251001",
    ];
    const safeModel = ALLOWED_HEALTH_MODELS.includes(model)
      ? model
      : "claude-sonnet-4-20250514";

    const response = await anthropic.messages.create({
      model: safeModel,
      max_tokens: 2000,
      system: system || "You are a helpful medical data assistant.",
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: base64NoPrefix },
          },
          { type: "text", text: prompt || "Analyze this image." },
        ],
      }],
    });

    return { text: response.content[0].text };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 8: lookupUserByEmail — Find user UID by email for health record sharing
// Server-side function with admin access to query users collection
// ─────────────────────────────────────────────────────────────────────────────
exports.lookupUserByEmail = onCall(
  { cors: CORS_ORIGINS },
  async (request) => {
    const { email } = request.data || {};
    
    // Validate input
    if (!email || typeof email !== 'string') {
      throw new Error('Email is required');
    }
    
    // Validate requester is authenticated
    const uid = request.auth?.uid;
    if (!uid) {
      throw new Error('Unauthenticated');
    }
    
    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new Error('Invalid email format');
    }
    
    try {
      // Query users collection by email
      const usersSnapshot = await db.collection('users')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();
      
      if (usersSnapshot.empty) {
        return {
          found: false,
          message: 'No user found with this email'
        };
      }
      
      const userDoc = usersSnapshot.docs[0];
      const userData = userDoc.data();
      
      return {
        found: true,
        uid: userDoc.id,
        name: userData.name || userData.displayName || userData.email,
        email: userData.email
      };
      
    } catch (error) {
      console.error('Error looking up user:', error);
      throw new Error('Failed to lookup user: ' + error.message);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 9: lookupUserByPhone — Find user UID by phone number for health record sharing
// Server-side function with admin access to query users collection
// ─────────────────────────────────────────────────────────────────────────────
exports.lookupUserByPhone = onCall(
  { cors: CORS_ORIGINS },
  async (request) => {
    const { phoneNumber } = request.data || {};
    
    // Validate input
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new Error('Phone number is required');
    }
    
    // Validate requester is authenticated
    const uid = request.auth?.uid;
    if (!uid) {
      throw new Error('Unauthenticated');
    }
    
    // Normalize phone number (remove spaces, dashes)
    const normalizedPhone = phoneNumber.trim().replace(/[\s\-\(\)]/g, '');
    
    // Validate phone format (should start with +)
    if (!normalizedPhone.startsWith('+')) {
      throw new Error('Phone number must include country code (e.g., +91 9876543210)');
    }
    
    try {
      // Query users collection by phoneNumber
      const usersSnapshot = await db.collection('users')
        .where('phoneNumber', '==', normalizedPhone)
        .limit(1)
        .get();
      
      if (usersSnapshot.empty) {
        return {
          found: false,
          message: 'No user found with this phone number'
        };
      }
      
      const userDoc = usersSnapshot.docs[0];
      const userData = userDoc.data();
      
      return {
        found: true,
        uid: userDoc.id,
        name: userData.name || userData.displayName || userData.phoneNumber,
        phoneNumber: userData.phoneNumber,
        email: userData.email || null
      };
      
    } catch (error) {
      console.error('Error looking up user by phone:', error);
      throw new Error('Failed to lookup user: ' + error.message);
    }
  }
);
