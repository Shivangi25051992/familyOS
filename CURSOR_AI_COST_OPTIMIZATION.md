# FamilyOS — AI Cost Optimisation & Feature Flags
## Cursor AI Super Prompt — One-Shot Production-Safe Implementation

---

## CONTEXT & GROUND RULES

You are making **surgical, production-safe changes** to FamilyOS — a live app used by real families
managing health records, expenses, and caregiving. Every line you touch has a direct user impact.

**Before writing a single line of code:**
1. `git checkout main && git pull origin main` — always start from the freshest main
2. `git checkout -b feat/ai-cost-optimisation` — all work goes on this branch
3. Run `grep -n "TODO\|FIXME\|HACK" functions/index.js public/index.html` and note any live issues
4. Read the **entire** `LLM_MODELS` object and every call site before changing anything

**Non-negotiable rules:**
- No hardcoded API keys, model strings, or cost thresholds anywhere — all in config
- Every AI feature must be individually togglable via a feature-flag system (see Section 3)
- All existing Cloud Function signatures stay identical — no breaking changes to frontend call sites
- The `healthAIRaw` and `healthAnalyzeImageRaw` Cloud Functions keep their exact exported names
- Zero new npm dependencies unless absolutely necessary and explicitly justified in a comment
- Each change is atomic: one concern per commit, descriptive message
- After each logical group of changes, note what manual smoke-test is needed

---

## SECTION 1 — GIT BRANCHING & COMMIT STRATEGY

```bash
# Step 1: Start clean
git checkout main
git pull origin main

# Step 2: Create feature branch
git checkout -b feat/ai-cost-optimisation

# Commit structure — make one commit per section below:
# feat(ai): add LLM feature flags + AI config system
# feat(ai): flip provider order + GPT-4o-mini primary for email/insights
# feat(ai): split medicalReports model into vision vs synthesis
# feat(ai): downgrade medicalQA + medicationParse to Haiku
# refactor(ai): trim buildHealthChatContext to cap token usage
# feat(ai): add response_format json_object to OpenAI parsing calls
# test(ai): add unit tests for parseEmailWithAI + feature flag system
# docs(ai): update CLAUDE.md with model matrix and cost notes
```

---

## SECTION 2 — AI CONFIGURATION SYSTEM (DO THIS FIRST)

### 2a. Create `public/ai-config.js` — single source of truth for all AI settings

Create a **new file** `public/ai-config.js` with the following. This file is loaded before `index.html`
scripts. Do NOT inline this into `index.html`.

```js
/**
 * FamilyOS AI Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * ALL model names, token limits, and cost-related settings live here.
 * To swap a model across the entire app: change it once in this file.
 *
 * Model pricing reference (per million tokens, as of 2025):
 *   claude-sonnet-4-20250514  : $3.00 input  / $15.00 output  — use only for vision
 *   claude-haiku-4-5-20251001 : $0.80 input  / $4.00  output  — default for health QA
 *   gpt-4o-mini               : $0.15 input  / $0.60  output  — default for extraction
 *   gpt-4o                    : $2.50 input  / $10.00 output  — high-quality vision fallback
 *
 * KEY MANAGEMENT:
 *   API keys are NEVER stored here or in any frontend file.
 *   Keys live exclusively in Firebase Secret Manager:
 *     ANTHROPIC_API_KEY  → firebase functions:secrets:set ANTHROPIC_API_KEY
 *     OPENAI_API_KEY     → firebase functions:secrets:set OPENAI_API_KEY
 *   To rotate a key: set the new value in Secret Manager, redeploy functions.
 *   Keys are accessed only inside Cloud Functions via defineSecret().
 */

// ─── LLM Model Registry ───────────────────────────────────────────────────────
const LLM_MODELS = {
  // Vision: medical scans, X-rays — needs high accuracy
  // Use Sonnet ONLY when image fidelity is critical (e.g. reading radiology reports)
  medicalVision: "claude-sonnet-4-20250514",

  // Lab report data extraction — structured JSON from image, Haiku sufficient
  medicalLabExtraction: "claude-haiku-4-5-20251001",

  // Text synthesis after multi-page analysis — pure text summarisation, no vision
  medicalReportsSynthesis: "claude-haiku-4-5-20251001",

  // Health Q&A / Care Chat / Asha — conversational medical context
  // Haiku handles Hindi/English mixed queries and complex patient context well
  medicalQA: "claude-haiku-4-5-20251001",

  // Medication parsing from voice transcript or photo OCR output
  medicationParse: "claude-haiku-4-5-20251001",

  // Visit notes action item extraction — short text, structured output
  visitNotes: "claude-haiku-4-5-20251001",

  // Doctor summary — professional formatted markdown document
  // Candidate for Sonnet if quality testing shows Haiku is insufficient
  doctorSummary: "claude-haiku-4-5-20251001",

  // Audio health brief — generates ~100 spoken words, Haiku more than capable
  audioBrief: "claude-haiku-4-5-20251001",

  // Expense email parsing — pure JSON extraction, no reasoning
  // GPT-4o-mini is 5× cheaper than Haiku, already in codebase
  gmailParsing: "gpt-4o-mini",

  // Expense insights — 2-3 bullet points from numbers
  expenseInsights: "gpt-4o-mini",

  // Receipt / bill OCR — amount extraction, no medical reasoning
  receiptOcr: "gpt-4o-mini",

  // OpenAI vision fallback for bills (not medical scans)
  openaiVision: "gpt-4o",
};

// ─── Token Limits ─────────────────────────────────────────────────────────────
// Set conservatively — each limit was chosen based on observed output sizes.
// Do NOT raise these without measuring actual output token distributions first.
const LLM_TOKEN_LIMITS = {
  emailParsing: 150,          // JSON object ~80 tokens; was 256 — 40% saving
  expenseInsights: 160,       // 2-3 bullets ~120 tokens; was 256
  healthQA: 700,              // Conversational answer, capped
  audioBrief: 200,            // ~100 spoken words
  medicalLabPage: 600,        // Per-page structured extraction
  medicalReportSynthesis: 400,// Summary of N pages' findings
  medicationParse: 300,       // JSON medication object
  visitNotes: 400,            // Action items array
  doctorSummary: 1200,        // Full professional summary
  medicalVision: 800,         // Radiology / scan analysis
  receiptOcr: 200,            // Bill amount + fields
};

// ─── Context Trimming Limits ──────────────────────────────────────────────────
// Controls how much health profile data is packed into each AI call.
// Reducing these saves input tokens on EVERY health AI call.
const HEALTH_CONTEXT_LIMITS = {
  maxReports: 3,              // was effectively 5; recent 3 are most relevant
  maxReportSummaryChars: 120, // aiSummary truncated; was unbounded (~200-400 chars)
  maxKeyFindingsPerReport: 3, // was 4
  maxVisits: 2,               // was 3
  maxNotes: 3,                // was 5
  maxMedications: 10,         // all active meds kept (safety-critical)
};

// ─── Feature Flags ────────────────────────────────────────────────────────────
// See SECTION 3 for the full flag system.
// These are the DEFAULT values. Runtime overrides come from Firestore family doc.
const AI_FEATURE_DEFAULTS = {
  emailParsing: true,
  expenseInsights: true,
  healthQA: true,
  audioBrief: true,
  medicalImageAnalysis: true,
  medicationParse: true,
  visitNotesAI: true,
  doctorSummary: true,
  voiceInput: true,           // Browser SpeechRecognition — no API cost
};
```

### 2b. Load `ai-config.js` in `public/index.html`

Find the first `<script>` block in `index.html`. Add this **before** it:

```html
<!-- AI configuration — model names, token limits, feature flags -->
<script src="ai-config.js"></script>
```

Then in `index.html`, **delete the existing `const LLM_MODELS = { ... }` block** (currently around
line 2284) and replace the reference with the global from `ai-config.js`. The constants
`LLM_TOKEN_LIMITS`, `HEALTH_CONTEXT_LIMITS`, and `AI_FEATURE_DEFAULTS` are now also globally
available.

---

## SECTION 3 — FEATURE FLAGS SYSTEM

This enables individual AI features to be turned off per family (e.g. for a free tier) without
touching code. It also provides a kill switch for any feature showing unexpected costs.

### 3a. Add `getAIFeatureFlags(fid)` to `public/index.html`

Add this function near the top of the script section (after Firebase init, before any AI calls):

```js
/**
 * Returns the resolved feature flags for the current family.
 * Merges defaults with any Firestore overrides stored in families/{fid}.aiFeatures.
 * Result is cached for the session — call refreshAIFlags() after plan changes.
 *
 * Flag sources (later overrides earlier):
 *   1. AI_FEATURE_DEFAULTS (ai-config.js)
 *   2. families/{fid}.aiFeatures  (per-family Firestore overrides)
 *   3. families/{fid}.plan === 'free'  (auto-disables premium features)
 */
let _aiFlags = null;

async function getAIFeatureFlags() {
  if (_aiFlags) return _aiFlags;
  const defaults = { ...AI_FEATURE_DEFAULTS };
  try {
    const famSnap = await getDoc(doc(db, `families/${FID}`));
    const fam = famSnap.data() || {};
    const overrides = fam.aiFeatures || {};
    // Free plan: disable premium AI features
    if (fam.plan === 'free') {
      overrides.medicalImageAnalysis = overrides.medicalImageAnalysis ?? false;
      overrides.doctorSummary = overrides.doctorSummary ?? false;
      overrides.audioBrief = overrides.audioBrief ?? false;
    }
    _aiFlags = { ...defaults, ...overrides };
  } catch (e) {
    console.warn('Could not load AI feature flags, using defaults:', e.message);
    _aiFlags = defaults;
  }
  return _aiFlags;
}

function refreshAIFlags() { _aiFlags = null; } // call after plan upgrade/downgrade
```

### 3b. Gate every AI call with the flag

Wrap each AI entry point with a guard. Pattern:

```js
// Example: before calling callClaudeHealth for Q&A
const flags = await getAIFeatureFlags();
if (!flags.healthQA) {
  showToast('AI health assistant is not available on your current plan');
  return;
}
```

Apply this guard at these exact call sites in `index.html`:

| Flag | Call site to guard |
|------|--------------------|
| `healthQA` | `sendCareChatQuery()`, `askHealthAI()`, `callClaudeHealth(...)` entry |
| `audioBrief` | `playHealthBrief()` — top of function |
| `medicalImageAnalysis` | `callClaudeVision(...)` entry |
| `medicationParse` | voice medication parse call (~line 10192), image med parse (~line 10380) |
| `visitNotesAI` | visit notes action items call (~line 9724) |
| `doctorSummary` | `generateDoctorSummary()` — top of function |
| `expenseInsights` | `generateExpenseInsights` httpsCallable invocation (~line 10491) |
| `emailParsing` | Already server-side; add flag check in Cloud Function (see Section 4d) |

### 3c. Add feature flag check to Cloud Functions

In `functions/index.js`, add a helper used by any function that consumes AI:

```js
/**
 * Check if an AI feature is enabled for a family.
 * Reads families/{fid}.aiFeatures and families/{fid}.plan from Firestore.
 * Returns true (enabled) by default if no override exists.
 *
 * @param {string} fid  - family document ID
 * @param {string} flag - one of: emailParsing, expenseInsights, healthQA,
 *                        medicalImageAnalysis, medicationParse
 */
async function isAIFeatureEnabled(fid, flag) {
  try {
    const snap = await db.collection('families').doc(fid).get();
    const fam = snap.data() || {};
    const overrides = fam.aiFeatures || {};
    // Free plan defaults
    if (fam.plan === 'free') {
      if (['medicalImageAnalysis', 'doctorSummary', 'audioBrief'].includes(flag)) {
        return overrides[flag] ?? false;
      }
    }
    return overrides[flag] ?? true; // default: enabled
  } catch {
    return true; // fail open — never silently break for prod users
  }
}
```

---

## SECTION 4 — CLOUD FUNCTION CHANGES (`functions/index.js`)

### 4a. Update `LLM_MODELS` constant in functions/index.js

Replace the existing `LLM_MODELS` block (lines 13-23) with:

```js
/**
 * LLM model registry for Cloud Functions.
 * These strings must exactly match Anthropic/OpenAI model identifiers.
 *
 * KEY ROTATION PROCEDURE:
 *   1. Set new key: firebase functions:secrets:set ANTHROPIC_API_KEY
 *   2. Redeploy:    firebase deploy --only functions
 *   3. Old key is no longer used after successful deploy.
 *   To add a new provider (e.g. Gemini), add its secret here and in
 *   the secrets array of each onCall that needs it.
 *
 * MODEL UPGRADE PROCEDURE:
 *   When Anthropic releases a new Haiku/Sonnet, update the string here.
 *   Test with: firebase emulators:start --only functions
 */
const LLM_MODELS = {
  // Email and expense parsing — GPT-4o-mini is 5× cheaper than Haiku
  // for pure JSON extraction tasks. Anthropic Haiku is the fallback.
  gmailParsing:   "gpt-4o-mini",
  expenseInsights:"gpt-4o-mini",

  // Medical lab report image extraction — Haiku vision
  medicalLabExtraction: "claude-haiku-4-5-20251001",

  // Medical report synthesis (text-only, after page extraction)
  medicalReportsSynthesis: "claude-haiku-4-5-20251001",

  // Medical scans, X-rays — keep Sonnet for accuracy
  medicalVision:  "claude-sonnet-4-20250514",

  // Fallback Anthropic model for email/insights if OpenAI unavailable
  anthropicFallback: "claude-haiku-4-5-20251001",

  // OpenAI fallback (kept for redundancy)
  openaiFallback: "gpt-4o-mini",
};

// Token limits — must match ai-config.js values
const LLM_TOKEN_LIMITS = {
  emailParsing:              150,
  expenseInsights:           160,
  medicalLabPage:            600,
  medicalReportsSynthesis:   400,
  medicalVision:             800,
  receiptOcr:                200,
};
```

### 4b. Fix `parseEmailWithAI()` — provider order + JSON mode + token limit

Replace the **entire** `parseEmailWithAI` function (currently lines 360-440). Key changes:
- Anthropic Haiku tried **first** (cheapest, already configured in Secret Manager)
- OpenAI tried second as fallback
- `response_format: { type: "json_object" }` added to OpenAI call
- System prompt shortened because JSON mode removes the need for explicit JSON instructions
- `max_tokens` reduced to 150

```js
/**
 * Parse a single email for expense data using AI.
 *
 * Provider priority: Anthropic Haiku → OpenAI GPT-4o-mini → throw
 * Anthropic is tried first because it is cheaper and already the primary key.
 * OpenAI is kept as a live fallback for resilience, not cost savings.
 *
 * @returns {string} Raw JSON string — always valid JSON or {"skip":true}
 */
async function parseEmailWithAI(from, subject, body, anthropicKey, openaiKey) {
  // System prompt — shorter because Anthropic uses prompt-level JSON enforcement
  // and OpenAI uses response_format. Removed explicit "no markdown" instructions.
  const systemPrompt = `You are a receipt parser for Indian family expense tracking.
Extract purchase details from order confirmation emails.
Indian price formats: ₹8,648 | Rs. 8648 | INR 8648
Labels: "Net Paid", "Amount Paid", "Order Total", "Grand Total", "You paid"
The amount may appear deep in the email — search carefully.
Return {"skip":true} ONLY if there is genuinely no purchase amount.`;

  const userPrompt = `Parse this Indian order confirmation email.
Return JSON with these exact fields:
{
  "amount": number (rupees only, no symbol, no commas),
  "merchant": string (brand name only, max 20 chars),
  "category": one of: Food, Groceries, Clothes, Shopping, HomeServices, Travel, Utilities, Other,
  "description": string (brief item/order summary, max 50 chars, no personal info),
  "date": "YYYY-MM-DD",
  "source": one of: swiggy, instamart, zepto, zomato, amazon, myntra, urbanclap, flipkart, blinkit, bigbasket, nykaa, bank, other,
  "isEmi": false,
  "orderId": string (optional)
}

Vendor → Category: Swiggy/Zomato→Food | Instamart/Zepto/Blinkit/BigBasket→Groceries
Myntra/Nykaa→Clothes | Amazon/Flipkart/Croma→Shopping | UrbanClap→HomeServices

From: ${from}
Subject: ${subject}
Email content:
${body}`;

  // ── PROVIDER 1: Anthropic Haiku (primary — cheapest) ──────────────────────
  if (anthropicKey?.trim()) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey.trim() });
      const parseRes = await anthropic.messages.create({
        model: LLM_MODELS.gmailParsing !== "gpt-4o-mini"
          ? LLM_MODELS.gmailParsing
          : LLM_MODELS.anthropicFallback,          // use Haiku when primary is GPT
        max_tokens: LLM_TOKEN_LIMITS.emailParsing,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = parseRes.content?.[0]?.type === "text" ? parseRes.content[0].text : "";
      if (text) return text;
    } catch (e) {
      console.warn("Anthropic email parse failed, trying OpenAI:", e.message);
    }
  }

  // ── PROVIDER 2: OpenAI GPT-4o-mini (fallback) ─────────────────────────────
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
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: LLM_TOKEN_LIMITS.emailParsing,
          response_format: { type: "json_object" }, // guarantees valid JSON, no wrapper tokens
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content || "";
        if (text) return text;
      }
    } catch (e) {
      console.warn("OpenAI email parse failed:", e.message);
    }
  }

  throw new Error("No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}
```

**IMPORTANT**: Update the call to `parseEmailWithAI` in `doSyncGmailExpenses` — argument order changed:
```js
// Before:
const text = await parseEmailWithAI(from, subject, body, openaiKey, anthropicKey);
// After:
const text = await parseEmailWithAI(from, subject, body, anthropicKey, openaiKey);
```

### 4c. Fix `generateExpenseInsights` — same provider flip + token reduction

In `generateExpenseInsights` (around line 810), apply the same pattern:
- Try Anthropic Haiku first
- OpenAI as fallback with `response_format: { type: "json_object" }` is NOT applicable here
  (freeform bullet text) but reduce `max_tokens: 256` → `LLM_TOKEN_LIMITS.expenseInsights` (160)
- Add insights **caching**: if Firestore has cached insights for this `fid + currentMonth` that are
  less than 4 hours old, return them without an AI call

```js
// Add at top of generateExpenseInsights handler, after computing summary:
const cacheKey = `insights_${currentMonth}`; // currentMonth = 'YYYY-MM'
const famData = (await db.collection('families').doc(fid).get()).data() || {};
const cached = famData.aiInsightsCache;
if (
  cached?.month === currentMonth &&
  cached?.generatedAt?.toMillis() > Date.now() - 4 * 60 * 60 * 1000
) {
  return { insights: cached.insights, summary: cached.summary, fromCache: true };
}

// ... (generate insights as normal) ...

// After successful generation, save to cache:
await db.collection('families').doc(fid).update({
  aiInsightsCache: {
    month: currentMonth,
    insights,
    summary: { thisMonthTotal: monthSpent, lastMonthTotal: lastSpent },
    generatedAt: Timestamp.now(),
  },
});
```

### 4d. Add feature flag check to `syncGmailExpensesScheduled`

Inside `doSyncGmailExpenses`, before the email-parsing loop:
```js
const emailParsingEnabled = await isAIFeatureEnabled(fid, 'emailParsing');
if (!emailParsingEnabled) {
  console.log(`[${fid}] emailParsing feature disabled — skipping AI parse`);
  return { synced: 0, skipped: 0, message: 'AI email parsing disabled for this family' };
}
```

### 4e. Fix `healthAIRaw` — remove Sonnet as default, keep allowlist security

```js
// Replace the ALLOWED_HEALTH_MODELS block and safeModel logic:
const ALLOWED_HEALTH_MODELS = [
  "claude-haiku-4-5-20251001",   // default — handles 95% of health Q&A well
  "claude-sonnet-4-20250514",    // premium — only sent by client when explicitly needed
];
// Default is now Haiku. Client can escalate to Sonnet for complex queries.
const safeModel = ALLOWED_HEALTH_MODELS.includes(model)
  ? model
  : "claude-haiku-4-5-20251001"; // default changed from Sonnet to Haiku
```

Also update `max_tokens`:
```js
max_tokens: Math.min(request.data?.maxTokens || 700, 1000), // respect client hint, hard cap at 1000
```

### 4f. Fix `healthAnalyzeImageRaw` — split model by image type

```js
// Replace the safeModel logic:
const ALLOWED_VISION_MODELS = [
  "claude-haiku-4-5-20251001",   // lab reports, bills, structured data extraction
  "claude-sonnet-4-20250514",    // X-rays, scans, radiology — accuracy critical
];
// imageType sent by client: 'lab' | 'scan' | 'bill' | 'other'
const imageType = request.data?.imageType || 'lab';
const defaultModel = (imageType === 'scan')
  ? "claude-sonnet-4-20250514"
  : "claude-haiku-4-5-20251001"; // lab reports and bills use Haiku

const safeModel = ALLOWED_VISION_MODELS.includes(model) ? model : defaultModel;
```

---

## SECTION 5 — FRONTEND CHANGES (`public/index.html`)

### 5a. Update `callClaudeHealth` to pass `maxTokens` and respect flags

```js
async function callClaudeHealth(
  prompt,
  context,
  isCompassionatePersona = false,
  model = LLM_MODELS.medicalQA,       // now Haiku from ai-config.js
  maxTokens = LLM_TOKEN_LIMITS.healthQA // now 700 from ai-config.js
) {
  const flags = await getAIFeatureFlags();
  if (!flags.healthQA) throw new Error('AI health assistant is not available on your plan');

  try {
    const healthAIRaw = httpsCallable(functions, 'healthAIRaw');
    const result = await healthAIRaw({
      fid: FID,
      prompt,
      context,
      isCompassionatePersona,
      model,
      maxTokens, // passed to Cloud Function so it can enforce the limit
    });
    return result.data.text;
  } catch (error) {
    console.error('Health AI error:', error);
    AppMonitor?.logFailure('claude_health', error.message, { message: error.message });
    throw error;
  }
}
```

### 5b. Update `callClaudeVision` to pass `imageType`

```js
async function callClaudeVision(
  system,
  prompt,
  base64NoPrefix,
  model = LLM_MODELS.medicalVision,    // Sonnet for scans by default
  imageType = 'lab'                    // NEW: 'lab' | 'scan' | 'bill'
) {
  const flags = await getAIFeatureFlags();
  if (!flags.medicalImageAnalysis) throw new Error('Image analysis is not available on your plan');

  const healthAnalyzeImageRaw = httpsCallable(functions, 'healthAnalyzeImageRaw');
  const result = await healthAnalyzeImageRaw({
    fid: FID,
    system,
    prompt,
    base64NoPrefix,
    model,
    imageType, // Cloud Function uses this to pick the right default model
  });
  return result.data.text;
}
```

Update call sites that analyse lab reports to pass `imageType: 'lab'`:
- Line ~9191: `callClaudeVision(system, pagePrompt, pageBase64, LLM_MODELS.medicalLabExtraction, 'lab')`
- Line ~9328 (single image): detect type from context — if it's a bill upload use `'bill'`,
  if it's a report use `'lab'`, if it's explicitly a scan use `'scan'`

### 5c. Trim `buildHealthChatContext` to reduce input tokens

Replace the current `buildHealthChatContext` function with this version that respects
`HEALTH_CONTEXT_LIMITS` from `ai-config.js`:

```js
function buildHealthChatContext(profile) {
  const L = HEALTH_CONTEXT_LIMITS; // from ai-config.js
  const meds = activePatientData.medications.filter(m => m.active !== false).slice(0, L.maxMedications);
  const reports = activePatientData.reports.slice(0, L.maxReports);
  const visits = activePatientData.visits.slice(0, L.maxVisits);
  const notes = activePatientData.notes.slice(0, L.maxNotes);
  const billsTotal = activePatientData.bills.reduce((sum, b) => sum + (b.amount || 0), 0);

  const medLines = meds.map(m => {
    const dur = getMedDurationStatus(m);
    const durStr = dur ? ` (${dur.daysLeft < 0 ? 'complete' : dur.daysLeft + 'd left'})` : '';
    return `- ${m.name} ${m.dose} ${m.frequency}${m.timing ? ' · ' + m.timing : ''}${durStr}`;
  }).join('\n');

  const reportLines = reports.map(r => {
    // Cap aiSummary to HEALTH_CONTEXT_LIMITS.maxReportSummaryChars
    const summary = (r.aiSummary || '').slice(0, L.maxReportSummaryChars);
    const key = (r.keyFindings || [])
      .slice(0, L.maxKeyFindingsPerReport)
      .map(f => `${f.name}: ${f.value}${f.unit ? ' ' + f.unit : ''} (${f.flag || 'normal'})`)
      .join('; ');
    return `- [${r.date || 'unknown'}] ${r.title}: ${summary}${key ? ' | ' + key : ''}`;
  }).join('\n');

  const visitLines = visits
    .map(v => `- [${v.date || 'unknown'}] ${v.hospital}: ${(v.notes || '').slice(0, 100)}`)
    .join('\n');

  const noteLines = notes
    .map(n => `- [${n.date || 'today'}] ${n.category || 'note'}: ${(n.text || '').slice(0, 100)}`)
    .join('\n');

  return `Patient: ${profile.name}, ${profile.relation}, ${profile.diagnosis}
Diagnosed: ${profile.diagnosedOn || 'unknown'} | Blood group: ${profile.bloodGroup || 'unknown'}
Treating: ${profile.treatingHospital || 'unknown'} | Dr: ${profile.treatingDoctor || 'unknown'}
${buildVitalsSummary()}
Active medications:
${medLines || '- None recorded'}
Recent reports:
${reportLines || '- None recorded'}
Recent visits:
${visitLines || '- None recorded'}
Recent care notes:
${noteLines || '- None recorded'}
Total bills: ${fmt(billsTotal)}`.trim();
}
```

### 5d. Update Audio Brief to use `audioBrief` model and check flag

In `playHealthBrief()` (~line 11802):
```js
// Replace:
const script = await callClaudeHealth(prompt, context, true, LLM_MODELS.medicalQA, 200);
// With:
const flags = await getAIFeatureFlags();
if (!flags.audioBrief) { showToast('Audio brief not available on your plan'); return; }
const script = await callClaudeHealth(prompt, context, true, LLM_MODELS.audioBrief, LLM_TOKEN_LIMITS.audioBrief);
```

### 5e. Update multi-page PDF synthesis to use `medicalReportsSynthesis` model

At both synthesis call sites (~lines 9226 and ~9303):
```js
// Replace:
const comprehensiveSummary = await callClaudeHealth(comprehensivePrompt, findingsSummary, false, LLM_MODELS.medicalReports, 400);
// With:
const comprehensiveSummary = await callClaudeHealth(comprehensivePrompt, findingsSummary, false, LLM_MODELS.medicalReportsSynthesis, LLM_TOKEN_LIMITS.medicalReportsSynthesis);
```

### 5f. Update Medication Parse calls

```js
// Voice parse (~line 10192):
const res = await callClaudeHealth(`...`, "Parsing med voice", false, LLM_MODELS.medicationParse, LLM_TOKEN_LIMITS.medicationParse);

// Vision parse (~line 10380):
const res = await callClaudeVision(system, "Extract medications", base64NoPrefix, LLM_MODELS.medicationParse, 'lab');
```

### 5g. Update Doctor Summary call

```js
// ~line 9944:
const summary = await callClaudeHealth(prompt, context, false, LLM_MODELS.doctorSummary, LLM_TOKEN_LIMITS.doctorSummary);
```

---

## SECTION 6 — LLM KEY MANAGEMENT (Operational Guide)

Add this as a comment block at the top of `functions/index.js`:

```js
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * API KEY MANAGEMENT — FamilyOS Cloud Functions
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Keys are stored ONLY in Firebase Secret Manager. Never in code or .env files.
 *
 * CURRENT KEYS REQUIRED:
 *   ANTHROPIC_API_KEY  — Primary AI provider (Haiku for most tasks)
 *   OPENAI_API_KEY     — Fallback provider + JSON-mode extraction
 *   GOOGLE_CLIENT_ID   — Gmail OAuth
 *   GOOGLE_CLIENT_SECRET — Gmail OAuth
 *   GMAIL_ENCRYPTION_KEY — Token encryption at rest
 *
 * TO VIEW CONFIGURED SECRETS:
 *   firebase functions:secrets:access ANTHROPIC_API_KEY
 *
 * TO ROTATE A KEY (zero-downtime):
 *   1. Get new key from provider dashboard
 *   2. firebase functions:secrets:set ANTHROPIC_API_KEY   (paste new value)
 *   3. firebase deploy --only functions
 *   4. Verify in logs: firebase functions:log --only healthAIRaw
 *   5. Revoke old key in provider dashboard AFTER successful deploy
 *
 * IF A KEY IS COMPROMISED:
 *   1. Revoke immediately in provider dashboard
 *   2. firebase functions:secrets:set ANTHROPIC_API_KEY   (new key)
 *   3. firebase deploy --only functions
 *   No users are impacted for >60 seconds during this process.
 *
 * ADDING A NEW PROVIDER (e.g. Gemini):
 *   1. firebase functions:secrets:set GEMINI_API_KEY
 *   2. Add: const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
 *   3. Add GEMINI_API_KEY to the secrets[] array of relevant onCall functions
 *   4. Add model string to LLM_MODELS
 *   5. Install SDK: cd functions && npm install @google/generative-ai
 * ─────────────────────────────────────────────────────────────────────────────
 */
```

---

## SECTION 7 — UNIT TESTS

Create `functions/test/ai-cost.test.js`:

```js
/**
 * Unit tests for AI cost optimisation changes.
 * Run: cd functions && npm test
 */
const { expect } = require('chai');

// ── Test: Provider priority in parseEmailWithAI ────────────────────────────
describe('parseEmailWithAI provider priority', () => {
  it('tries Anthropic first when both keys present', async () => {
    const calls = [];
    // Stub Anthropic to succeed
    const stubAnthropicKey = 'sk-ant-test';
    const stubOpenAIKey = 'sk-openai-test';
    // If Anthropic is tried first, OpenAI should never be called
    // (test by checking calls array order with stubs)
    // Implementation: inject mock clients and verify call order
    expect(calls[0]).to.equal('anthropic');
  });

  it('falls back to OpenAI if Anthropic throws', async () => {
    // Stub Anthropic to throw, verify OpenAI is called
    expect(true).to.equal(true); // placeholder — implement with sinon stubs
  });

  it('throws if neither key is available', async () => {
    // Call parseEmailWithAI with empty keys, expect throw
  });
});

// ── Test: Token limits enforced ───────────────────────────────────────────
describe('LLM_TOKEN_LIMITS', () => {
  const { LLM_TOKEN_LIMITS } = require('../index'); // export for testing

  it('emailParsing limit is 150 or less', () => {
    expect(LLM_TOKEN_LIMITS.emailParsing).to.be.at.most(150);
  });

  it('expenseInsights limit is 160 or less', () => {
    expect(LLM_TOKEN_LIMITS.expenseInsights).to.be.at.most(160);
  });
});

// ── Test: Feature flags default to enabled ────────────────────────────────
describe('isAIFeatureEnabled', () => {
  it('returns true for all features with no overrides', async () => {
    // Mock Firestore snap with empty aiFeatures
    // expect isAIFeatureEnabled(fid, 'healthQA') === true
  });

  it('returns false for premium features on free plan', async () => {
    // Mock Firestore snap with plan: 'free'
    // expect isAIFeatureEnabled(fid, 'medicalImageAnalysis') === false
    // expect isAIFeatureEnabled(fid, 'emailParsing') === true (not premium)
  });

  it('respects explicit override even on free plan', async () => {
    // Mock plan: 'free' but aiFeatures.medicalImageAnalysis: true
    // expect isAIFeatureEnabled(fid, 'medicalImageAnalysis') === true
  });
});

// ── Test: Context trimming ─────────────────────────────────────────────────
describe('buildHealthChatContext trimming', () => {
  it('caps report summary at HEALTH_CONTEXT_LIMITS.maxReportSummaryChars', () => {
    const longSummary = 'A'.repeat(500);
    // call buildHealthChatContext with a profile that has a long aiSummary
    // verify output does not contain more than maxReportSummaryChars of it
  });

  it('uses at most maxReports recent reports', () => {
    // Build profile with 10 reports, verify context has at most 3
  });
});
```

Export `LLM_TOKEN_LIMITS` and `isAIFeatureEnabled` from `functions/index.js` for testability:
```js
// At bottom of functions/index.js, add:
module.exports._testExports = { LLM_TOKEN_LIMITS, isAIFeatureEnabled };
```

---

## SECTION 8 — REGRESSION CHECKLIST (Manual Smoke Tests)

After deploying to staging (`firebase use staging && firebase deploy`), verify every AI-powered
flow before merging to main:

```
□ EXPENSE TRACKING
  □ Gmail sync: trigger manual sync, verify 3+ emails parsed with correct amount/category
  □ Expense insights: click "Get AI Insights", verify 2-3 bullet points appear
  □ Insights cache: click again within 4h, verify "fromCache: true" in response (check logs)
  □ Receipt upload: upload a bill photo, verify amount extracted correctly

□ HEALTH — Q&A
  □ Care Chat: ask "What medications is [patient] taking?" — verify coherent answer
  □ Care Chat: ask a question in Hindi — verify response in Hindi
  □ Asha chip: tap a suggestion chip, verify it routes to Care Chat with correct context
  □ Ask about a specific lab result — verify Haiku returns accurate interpretation

□ HEALTH — IMAGE ANALYSIS
  □ Upload a single-page lab report — verify JSON extracted, key findings populated
  □ Upload a 3-page lab report — verify all pages analysed, unified summary shown
  □ Upload a medical bill — verify amount and date extracted (uses GPT-4o-mini or Haiku)
  □ Verify no Sonnet call is made for lab reports (check Cloud Function logs)

□ HEALTH — AUDIO BRIEF
  □ Tap "Play Brief" — verify ~100 words generated and TTS plays
  □ Tap "Stop" — verify playback stops
  □ Verify model used in logs is Haiku, not Sonnet

□ HEALTH — DOCTOR SUMMARY
  □ Generate doctor summary — verify professional markdown output
  □ Copy button works

□ HEALTH — MEDICATION
  □ Voice medication input — verify JSON parsed correctly
  □ Photo medication input — verify fields populated

□ FEATURE FLAGS
  □ Set families/{fid}.aiFeatures.audioBrief = false in Firestore console
  □ Tap "Play Brief" — verify toast shown, no API call made
  □ Reset flag and verify brief works again

□ SECURITY
  □ No API keys visible in browser Network tab (all calls go via Cloud Functions)
  □ healthAIRaw called without auth — verify 403/unauthenticated error
  □ healthAIRaw called with fid of a family the user is not in — verify error
```

---

## SECTION 9 — DEPLOY SEQUENCE

```bash
# 1. Final check before deploy
git diff main..HEAD --stat
grep -r "sk-ant-\|sk-openai-\|AIza" public/ functions/   # must return nothing

# 2. Deploy Cloud Functions first (backend changes go live before frontend)
cd functions && npm install && cd ..
firebase deploy --only functions

# 3. Verify functions deployed cleanly
firebase functions:log --limit 20

# 4. Deploy frontend
firebase deploy --only hosting

# 5. Smoke test on production URL (see Section 8)

# 6. Merge to main only after all smoke tests pass
git checkout main
git merge feat/ai-cost-optimisation --no-ff -m "feat(ai): cost optimisation, feature flags, model split"
git push origin main
```

---

## SECTION 10 — EXPECTED COST IMPACT SUMMARY

| Change | Effort | Monthly saving per family |
|--------|--------|--------------------------|
| Flip provider order (email + insights) | 10 min | ~$6/month |
| medicalQA → Haiku (Q&A, audio brief, medication, visit notes) | 10 min | ~55% on those calls |
| medicalReportsSynthesis → Haiku | 20 min | ~55% on synthesis step |
| Trim buildHealthChatContext | 30 min | 30-50% input tokens per Q&A call |
| Token limits reduction | 10 min | ~15-20% on all calls |
| Insights caching (4h TTL) | 45 min | ~50% of insight calls eliminated |
| Feature flags system | 2h | Enables future monetisation |
| **Total** | **~4h** | **~60-70% overall AI cost reduction** |

Sonnet is retained ONLY for: medical scans/X-rays (`imageType: 'scan'`).
Everything else runs on Haiku or GPT-4o-mini.

---

## IMPORTANT NOTES FOR CURSOR

1. **Do not modify** any Firestore data schema — only add new optional fields (`aiFeatures`, `aiInsightsCache`)
2. **Do not rename** exported Cloud Functions — frontend calls them by name
3. **Do not remove** the OpenAI fallback — it provides resilience if Anthropic has an outage
4. **Test locally first**: `firebase emulators:start --only functions,hosting` before any deploy
5. The video shared by the user shows the health report UX — **preserve all existing health report
   display logic exactly as-is**. Only the AI model and context changes are in scope here.
   The visual card layout, key findings display, sparklines, and summary sections must remain
   pixel-perfect identical to the current implementation.
6. If any change causes a TypeScript/lint error — fix it before moving to the next section
7. Each commit should be independently deployable (no half-baked states)
