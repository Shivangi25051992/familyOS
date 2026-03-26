#!/usr/bin/env node
/**
 * Test Gmail sync flow locally - see exactly what AI receives and returns.
 *
 * Usage:
 *   FID=<your-family-id> node test-sync-flow.js [--dry-run] [--limit N]
 *
 * Required env vars:
 *   FID                      - Family document ID
 *   GOOGLE_CLIENT_ID         - From Firebase secrets
 *   GOOGLE_CLIENT_SECRET     - From Firebase secrets
 *   GMAIL_ENCRYPTION_KEY     - From Firebase secrets
 *   OPENAI_API_KEY           - For AI parsing
 *   GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON (for Firestore)
 *
 * Get secrets: firebase functions:secrets:access SECRET_NAME
 *
 * Options:
 *   --dry-run   Don't write to autoExpenses (default)
 *   --write     Actually create pending autoExpenses
 *   --limit N   Process only first N emails (default: 25)
 */

const crypto = require("crypto");
const admin = require("./functions/node_modules/firebase-admin");
const { google } = require("./functions/node_modules/googleapis");

// Load .env if present
try {
  const fs = require("fs");
  const envPath = require("path").join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    });
  }
} catch (_) {}

const FID = process.env.FID;
const DRY_RUN = !process.argv.includes("--write");
const LIMIT = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "25", 10);

const SENDER_MAP = {
  swiggy: ["no-reply@swiggy.in", "swiggy"],
  instamart: ["no-reply@swiggy.in", "swiggy"],
  zepto: ["noreply@zeptonow.com"],
  zomato: ["noreply@zomato.com", "orders@zomato.com"],
  amazon: ["order-update@amazon.in"],
  urbanclap: ["noreply@urbanclap.com", "noreply@urban.company"],
  flipkart: ["noreply@flipkart.com"],
  myntra: ["updates@myntra.com", "noreply@myntra.com"],
  croma: ["noreply@croma.com"],
  hdfc: ["alerts@hdfcbank.net"],
  icici: ["alerts@icicibank.com"],
  axis: ["alerts@axisbank.com"],
};

const REDIRECT_URI =
  "https://us-central1-familyos-e3d4b.cloudfunctions.net/gmailOAuthCallback";

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

async function parseEmailWithAI(from, subject, body, openaiKey) {
  const systemPrompt =
    "You are a receipt parser for an Indian family expense tracker. Extract expense data from email. Respond ONLY with valid JSON, no markdown, no explanation. If this is not a purchase email respond with {\"skip\":true}";
  const userPrompt = `Parse this email into JSON:
{
  "amount": number (rupees only, no symbol),
  "merchant": string (short name only, max 20 chars),
  "category": one of [Food, Groceries, Shopping, HomeServices, Travel, Utilities, Other],
  "description": string (max 40 chars, no personal info),
  "date": string YYYY-MM-DD,
  "source": string (swiggy|instamart|zepto|zomato|amazon|myntra|urbanclap|bank|other),
  "isEmi": boolean
}
From: ${from}
Subject: ${subject}
Body: ${body}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey.trim()}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 256,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

function extractBody(payload) {
  let body = "";
  const parts = payload?.parts || [];
  if (parts.length) {
    const htmlPart = parts.find((p) => p.mimeType === "text/html");
    const plainPart = parts.find((p) => p.mimeType === "text/plain");
    const textPart = htmlPart || plainPart;
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64").toString("utf8");
      if (textPart.mimeType === "text/html") {
        body = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  } else if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  return body.slice(0, 800);
}

async function main() {
  if (!FID) {
    console.error("Set FID env var (your family document ID)");
    process.exit(1);
  }

  const encKey = process.env.GMAIL_ENCRYPTION_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!encKey || !openaiKey || !clientId || !clientSecret) {
    console.error(
      "Missing: GMAIL_ENCRYPTION_KEY, OPENAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
    );
    console.error("Get from Firebase: firebase functions:secrets:access SECRET_NAME");
    process.exit(1);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path"
    );
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "familyos-e3d4b" });
  }
  const db = admin.firestore();

  const famSnap = await db.collection("families").doc(FID).get();
  if (!famSnap.exists) {
    console.error("Family not found:", FID);
    process.exit(1);
  }

  const gmailSync = famSnap.data().gmailSync;
  if (!gmailSync?.connected || !gmailSync.refreshToken) {
    console.error("Gmail not connected for this family. Connect via the app first.");
    process.exit(1);
  }

  const enabledServices = gmailSync.enabledServices || {};
  const activeSenders = [];
  for (const [svc, addrs] of Object.entries(SENDER_MAP)) {
    if (enabledServices[svc]) activeSenders.push(...addrs);
  }
  if (activeSenders.length === 0) {
    console.error("No services enabled");
    process.exit(1);
  }

  const refreshToken = decryptToken(gmailSync.refreshToken, encKey);
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const timeFilter = "newer_than:30d";
  const senderQuery = activeSenders.map((s) => `from:${s}`).join(" OR ");
  const subjectQuery =
    "subject:Instamart OR subject:Swiggy OR subject:Zomato OR subject:Zepto OR subject:Amazon OR subject:UrbanClap OR subject:Myntra";
  const q = `(${senderQuery} OR ${subjectQuery}) ${timeFilter}`;

  console.log("\n=== Gmail Sync Flow Test ===\n");
  console.log("Family:", FID);
  console.log("Mode:", DRY_RUN ? "DRY RUN (no writes)" : "WRITE");
  console.log("Query:", q);
  console.log("Limit:", LIMIT, "emails\n");

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: LIMIT,
  });
  const messages = listRes.data.messages || [];
  console.log(`Found ${messages.length} messages\n`);
  console.log("─".repeat(80));

  const autoExpensesRef = db
    .collection("families")
    .doc(FID)
    .collection("autoExpenses");

  let newCount = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = fullMsg.data.payload?.headers || [];
    const from =
      headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
    const fromMatch = from.match(/<([^>]+)>/);
    const fromAddr = fromMatch
      ? fromMatch[1]
      : from.trim().split(/\s+/).pop() || "";
    const subject =
      headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
    const dateHeader =
      headers.find((h) => h.name.toLowerCase() === "date")?.value || "";

    const body = extractBody(fullMsg.data.payload);

    const fromLower = fromAddr.toLowerCase();
    const subjectLower = subject.toLowerCase();
    const inActive =
      activeSenders.some((s) => fromLower.includes(s.toLowerCase())) ||
      subjectLower.includes("instamart") ||
      subjectLower.includes("swiggy") ||
      subjectLower.includes("zomato") ||
      subjectLower.includes("zepto") ||
      subjectLower.includes("myntra");

    if (!inActive) {
      console.log(`\n[${i + 1}/${messages.length}] SKIP (not in active senders)`);
      console.log("  From:", from);
      console.log("  Subject:", subject.slice(0, 60) + "...");
      continue;
    }

    const existing = await autoExpensesRef.doc(msg.id).get();
    if (existing.exists) {
      console.log(`\n[${i + 1}/${messages.length}] SKIP (already in autoExpenses)`);
      console.log("  From:", from);
      console.log("  Subject:", subject.slice(0, 60) + "...");
      continue;
    }

    // ─── What we send to AI ───
    console.log(`\n[${i + 1}/${messages.length}] Processing`);
    console.log("  From:", from);
    console.log("  Subject:", subject);
    console.log("  Body sent to AI (first 500 chars):");
    console.log("  " + "-".repeat(60));
    console.log(
      "  " +
        body
          .slice(0, 500)
          .split("\n")
          .join("\n  ")
    );
    if (body.length > 500) console.log("  ... (truncated)");
    console.log("  " + "-".repeat(60));

    const aiResponse = await parseEmailWithAI(from, subject, body, openaiKey);
    console.log("  AI raw response:", aiResponse);

    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("  → No JSON in response, skipping");
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.log("  → Invalid JSON, skipping");
      continue;
    }

    if (parsed.skip) {
      console.log("  → AI returned skip:true (not a purchase)");
      continue;
    }

    const dateStr =
      parsed.date ||
      (dateHeader ? new Date(dateHeader).toISOString().split("T")[0] : "") ||
      new Date().toISOString().split("T")[0];

    console.log("  → PARSED:", parsed.merchant, "₹" + parsed.amount, parsed.category);

    if (!DRY_RUN) {
      await autoExpensesRef.doc(msg.id).set({
        amount: parsed.amount || 0,
        merchant: (parsed.merchant || "Unknown").slice(0, 20),
        category: parsed.category || "Other",
        description: (parsed.description || "").slice(0, 40),
        date: dateStr,
        source: parsed.source || "other",
        isEmi: !!parsed.isEmi,
        status: "pending",
        emailId: msg.id,
        parsedAt: new Date(),
        autoCapture: true,
      });
      newCount++;
    } else {
      newCount++;
    }
  }

  console.log("\n" + "─".repeat(80));
  console.log(
    `Done. ${newCount} new expense(s) would be created${DRY_RUN ? " (dry run)" : ""}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
