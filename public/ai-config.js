/**
 * FamilyOS AI Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * ALL model names, token limits, and cost-related settings live here.
 * To swap a model across the entire app: change it once in this file.
 *
 * Model pricing reference (per million tokens, as of 2025):
 *   claude-sonnet-4-20250514  : $3.00 input  / $15.00 output  — use only for scans
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
 *
 * This file is loaded as a classic script before the main module script in
 * index.html, and exposes its constants on `window` so the module can import
 * them via `const X = window.X`.
 */

// ─── LLM Model Registry ───────────────────────────────────────────────────────
window.LLM_MODELS = {
  medicalVision:            "claude-sonnet-4-20250514",   // scans, X-rays, radiology
  medicalLabExtraction:     "claude-haiku-4-5-20251001",  // lab reports (structured JSON)
  medicalReportsSynthesis:  "claude-haiku-4-5-20251001",  // multi-page text synthesis
  medicalQA:                "claude-haiku-4-5-20251001",  // Care Chat, Asha, Q&A
  medicationParse:          "claude-haiku-4-5-20251001",  // voice / photo medication parse
  visitNotes:               "claude-haiku-4-5-20251001",  // visit note action items
  doctorSummary:            "claude-haiku-4-5-20251001",  // doctor summary markdown
  audioBrief:               "claude-haiku-4-5-20251001",  // ~100-word audio script
  gmailParsing:             "gpt-4o-mini",                // server-side only (email parse)
  expenseInsights:          "gpt-4o-mini",                // server-side only (insights)
  // Client-side bill upload hits healthAnalyzeImageRaw which only accepts
  // Anthropic models (see server allow-list). Keep receiptOcr on Haiku for the
  // client. The server does NOT use this value — see functions/index.js for
  // server-side bill handling.
  receiptOcr:               "claude-haiku-4-5-20251001",
  openaiVision:             "gpt-4o",                     // non-medical vision fallback
  openaiFallback:           "gpt-4o-mini",                // legacy alias

  // ── DEPRECATED KEYS (kept as aliases during migration) ──────────────────────
  // These map old names to new models so older call sites keep working until
  // all references are migrated in a single follow-up commit.
  medicalReports:           "claude-sonnet-4-20250514",   // alias for medicalVision
  openaiOcr:                "gpt-4o",                     // alias for openaiVision
};

// ─── Token Limits ─────────────────────────────────────────────────────────────
// Set conservatively — each limit was chosen based on observed output sizes.
// Do NOT raise these without measuring actual output token distributions first.
window.LLM_TOKEN_LIMITS = {
  emailParsing:              150,  // JSON object ~80 tokens; was 256 — 40% saving
  expenseInsights:           160,  // 2-3 bullets ~120 tokens; was 256
  healthQA:                  700,  // conversational answer, capped
  audioBrief:                200,  // ~100 spoken words
  medicalLabPage:            600,  // per-page structured extraction
  medicalReportSynthesis:    400,  // summary of N pages' findings
  medicationParse:           300,  // JSON medication object
  visitNotes:                400,  // action items array
  doctorSummary:            1200,  // full professional summary
  medicalVision:             800,  // radiology / scan analysis
  receiptOcr:                200,  // bill amount + fields
  generateAISummary:         550,  // health overview summary (compat existing default)
  careChatExtended:          800,  // Care Chat persona answer — richer than healthQA
};

// ─── Context Trimming Limits ──────────────────────────────────────────────────
// Controls how much health profile data is packed into each AI call.
// Reducing these saves input tokens on EVERY health AI call.
window.HEALTH_CONTEXT_LIMITS = {
  maxReports:              3,     // was effectively 5; recent 3 are most relevant
  maxReportSummaryChars:   120,   // aiSummary truncated; was unbounded
  maxKeyFindingsPerReport: 3,     // was 4
  maxVisits:               2,     // was 3
  maxNotes:                3,     // was 5
  maxMedications:         10,     // all active meds kept (safety-critical)
};

// ─── Feature Flags ────────────────────────────────────────────────────────────
// DEFAULT values. Runtime overrides come from Firestore family doc (families/{fid}.aiFeatures)
// and plan-based overrides (families/{fid}.plan === 'free' auto-disables premium).
// See getAIFeatureFlags() in index.html for resolution logic.
window.AI_FEATURE_DEFAULTS = {
  emailParsing:         true,
  expenseInsights:      true,
  healthQA:             true,
  audioBrief:           true,
  medicalImageAnalysis: true,
  medicationParse:      true,
  visitNotesAI:         true,
  doctorSummary:        true,
  voiceInput:           true,   // browser SpeechRecognition — no API cost
};
