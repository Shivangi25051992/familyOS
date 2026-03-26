# Gmail Auto-Capture: Implementation & Troubleshooting

## What This Feature Does

Gmail Auto-Capture scans your Gmail inbox for purchase emails (Swiggy, Myntra, Amazon, etc.), uses AI to extract expense details (amount, merchant, category), and adds them to your **Email expense inbox** for you to Accept or Dismiss.

---

## End-to-End Flow

```
1. USER clicks "Sync now" in app
        ↓
2. syncGmailExpenses Cloud Function runs
        ↓
3. GMAIL QUERY: Finds up to 25 emails matching:
   - from: updates@myntra.com OR from: no-reply@swiggy.in OR ... (enabled services)
   - OR subject contains: Instamart, Swiggy, Zomato, Zepto, Amazon, UrbanClap, Myntra
   - First sync: last 60 days
   - Subsequent syncs: 2hr overlap before last sync
   - Max 50 emails per sync
        ↓
4. FOR EACH EMAIL:
   a. Fetch full message (headers + body)
   b. Extract body text (see "Body Extraction" below)
   c. SKIP if: from/subject not in enabled services
   d. SKIP if: already in autoExpenses (processed before)
   e. Send From + Subject + Body to AI (OpenAI gpt-4o-mini)
   f. If AI returns {"skip":true} → SKIP (not a purchase)
   g. If AI returns valid JSON with amount → WRITE to autoExpenses (status: pending)
        ↓
5. Update lastSyncAt, lastSyncCount, lastSyncScanned
        ↓
6. App shows: "X scanned, Y new"
```

---

## Why "25 scanned, 0 new" Happens

| Reason | What it means |
|--------|---------------|
| **already_exists** | All 25 emails were processed in a previous sync. Each email is stored in `autoExpenses` with `emailId = msg.id`. We never re-process the same email. |
| **ai_skip** | AI returned `{"skip":true}` for all 25. This happens when the **body text we send** has no amount/price. |
| **Body extraction failed** | We couldn't get usable text from the email (wrong part, nested structure, etc.). |

---

## Body Extraction (Critical)

Emails use **MIME multipart** structure. A typical order email looks like:

```
multipart/mixed
├── multipart/alternative    ← container, NO body
│   ├── text/plain          ← short summary, often NO prices
│   └── text/html           ← full invoice WITH price breakdown
└── image (logo/attachment)
```

**What we do:**
- Recursively walk the payload
- Prefer **text/html** over text/plain (HTML has full invoice)
- Handle **nested** multipart (multipart/alternative inside multipart/mixed)
- Strip HTML tags, take first 1200 chars
- Send that to the AI

**If we used text/plain only:** Myntra's plain text often has "Order confirmed" but no "Net Paid ₹8648". AI correctly returns skip.

---

## How to Debug

### 1. Use "Debug sync" in the app

- Settings → Integrations → **Debug sync** (next to Sync now)
- Open browser DevTools → Console
- Click Debug sync
- You'll see for each email: `skip` reason, `body` (first 400 chars), `aiResponse`, `parsed`

### 2. Check Firebase Console

- **Firestore** → `families/{fid}/autoExpenses`
- If you see docs with `emailId` = Gmail message IDs, those were processed
- We skip any email whose ID already exists here

### 3. Clear and re-sync (if needed)

If you want to **re-process** emails (e.g. after fixing body extraction):

- Disconnect Gmail (removes pending autoExpenses)
- Connect Gmail again
- Sync now

---

## What's Implemented

| Component | Location | Purpose |
|-----------|----------|---------|
| gmailAuthUrl | functions/index.js | Returns OAuth URL for Gmail connect |
| gmailOAuthCallback | functions/index.js | Handles OAuth callback, stores encrypted refresh token |
| syncGmailExpenses | functions/index.js | Main sync: fetch emails, parse with AI, write autoExpenses |
| syncGmailExpensesScheduled | functions/index.js | Runs every 6 hours for connected families |
| extractEmailBody | functions/index.js | Recursive body extraction (HTML preferred, nested multipart) |
| parseEmailWithAI | functions/index.js | Sends to OpenAI/Anthropic, returns JSON or skip |
| SENDER_MAP | functions/index.js | from: addresses per service |
| Email expense inbox | index.html | Shows pending autoExpenses, Accept/Dismiss |
| Debug sync | index.html | Calls sync with debug:true, logs to console |

---

## Fixes Applied (Latest)

1. **Prefer HTML over plain text** – HTML has full price breakdown
2. **Recursive body extraction** – Handle nested multipart (e.g. multipart/alternative inside multipart/mixed)
3. **Body length 1200 chars** – More context for AI
4. **Debug mode** – See exactly what body and AI response per email

---

## If It Still Shows 0 New

1. Run **Debug sync** and check console – what does `body` contain? Does it have "Net Paid" or "₹"?
2. If `skip: "already_exists"` – those emails were processed before. Disconnect + reconnect to clear.
3. If `skip: "ai_skip"` and body looks empty/short – body extraction may still be wrong for your email structure.
4. Share the debug output (body snippet, aiResponse) to diagnose further.
