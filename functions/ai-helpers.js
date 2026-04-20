// Pure helpers extracted from index.js so they can be unit-tested without
// Firebase Admin initialization. Keep this file free of any side effects
// (no initializeApp, no defineSecret, no onCall) — that's the whole point.

// ── LLM MODEL + TOKEN CONFIG (server-side source of truth) ───────────────────
// Model strings must exactly match Anthropic / OpenAI identifiers.
// Client mirror lives in public/ai-config.js — keep keys referenced by both
// sides in sync.
const LLM_MODELS = {
  // Email + expense parsing — GPT-4o-mini is ~5x cheaper than Haiku for pure
  // JSON extraction. Anthropic Haiku is the live fallback if OpenAI is down.
  gmailParsing:            "gpt-4o-mini",
  expenseInsights:         "gpt-4o-mini",

  // Medical lab image structured-JSON extraction (Haiku vision).
  medicalLabExtraction:    "claude-haiku-4-5-20251001",

  // Medical multi-page text synthesis (post-extraction summary).
  medicalReportsSynthesis: "claude-haiku-4-5-20251001",

  // Medical scans, X-rays, radiology — accuracy critical, Sonnet only.
  medicalVision:           "claude-sonnet-4-20250514",

  // Anthropic fallback for email / insights when OpenAI unavailable.
  anthropicFallback:       "claude-haiku-4-5-20251001",

  // OpenAI fallback (kept for redundancy).
  openaiFallback:          "gpt-4o-mini",

  // Legacy key (kept so any lingering reference still resolves).
  receiptOcr:              "gpt-4o-mini",
};

// Token limits — must stay in sync with public/ai-config.js LLM_TOKEN_LIMITS.
// Set conservatively based on observed output distributions.
const LLM_TOKEN_LIMITS = {
  emailParsing:            150,  // JSON object ~80 tokens
  expenseInsights:         160,  // 2-3 bullets ~120 tokens
  medicalLabPage:          600,
  medicalReportsSynthesis: 400,
  medicalVision:           800,
  receiptOcr:              200,
  healthQAHardCap:        1000,
  healthImageHardCap:     2000,
};

// ── FEATURE FLAG RESOLUTION (pure) ───────────────────────────────────────────
// Premium flags are off by default for free plans, on by default otherwise.
// Any explicit override in fam.aiFeatures[flag] always wins.
const PREMIUM_FLAGS = ["medicalImageAnalysis", "doctorSummary", "audioBrief"];

function resolveFeatureFlag(famData, flag) {
  const fam = famData || {};
  const overrides = fam.aiFeatures || {};
  if (overrides[flag] !== undefined) return overrides[flag] === true;
  if (fam.plan === "free" && PREMIUM_FLAGS.includes(flag)) return false;
  return true;
}

// ── INSIGHTS CACHE VALIDITY (pure) ───────────────────────────────────────────
// Returns true iff the cached insights object is safe to return without
// regenerating. Caller must fail open — if this returns false, regenerate.
// `cached.generatedAt` is a Firestore Timestamp-shaped object with a
// `.toMillis()` method; we duck-type it so tests can pass plain objects.
//
// Validity rules (ALL must hold):
//   1. cached exists
//   2. cached.month matches the current month ("YYYY-MM")
//   3. cached.generatedAt.toMillis() is within ttlMs of now
//   4. cached.insights is a non-empty array
const INSIGHTS_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

function isInsightsCacheValid(cached, currentMonth, nowMs, ttlMs = INSIGHTS_CACHE_TTL_MS) {
  if (!cached) return false;
  if (cached.month !== currentMonth) return false;
  const generatedAt = cached.generatedAt;
  if (!generatedAt || typeof generatedAt.toMillis !== "function") return false;
  const age = nowMs - generatedAt.toMillis();
  if (age < 0 || age > ttlMs) return false;
  if (!Array.isArray(cached.insights) || cached.insights.length === 0) return false;
  return true;
}

module.exports = {
  LLM_MODELS,
  LLM_TOKEN_LIMITS,
  PREMIUM_FLAGS,
  resolveFeatureFlag,
  INSIGHTS_CACHE_TTL_MS,
  isInsightsCacheValid,
};
