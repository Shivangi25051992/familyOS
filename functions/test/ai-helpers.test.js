// Unit tests for functions/ai-helpers.js
// Run with:  node functions/test/ai-helpers.test.js
// Uses only Node's built-in node:assert + node:test — no new npm deps.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LLM_MODELS,
  LLM_TOKEN_LIMITS,
  PREMIUM_FLAGS,
  resolveFeatureFlag,
  isInsightsCacheValid,
  INSIGHTS_CACHE_TTL_MS,
} = require("../ai-helpers");

// Helper: mimic Firestore Timestamp shape for cache tests.
const ts = (ms) => ({ toMillis: () => ms });

// ─────────────────────────────────────────────────────────────────────────────
// LLM_MODELS — pin the cost-sensitive model choices.
// If someone accidentally swaps Haiku for Sonnet (or vice versa) these tests
// should fail loudly.
// ─────────────────────────────────────────────────────────────────────────────
test("LLM_MODELS: email parsing routes to GPT-4o-mini (cheapest JSON model)", () => {
  assert.equal(LLM_MODELS.gmailParsing, "gpt-4o-mini");
  assert.equal(LLM_MODELS.expenseInsights, "gpt-4o-mini");
});

test("LLM_MODELS: medical scans still use Sonnet (accuracy critical)", () => {
  assert.equal(LLM_MODELS.medicalVision, "claude-sonnet-4-20250514");
});

test("LLM_MODELS: lab extraction + synthesis use Haiku (5x cheaper than Sonnet)", () => {
  assert.equal(LLM_MODELS.medicalLabExtraction, "claude-haiku-4-5-20251001");
  assert.equal(LLM_MODELS.medicalReportsSynthesis, "claude-haiku-4-5-20251001");
});

test("LLM_MODELS: Anthropic fallback is Haiku, OpenAI fallback is 4o-mini", () => {
  assert.equal(LLM_MODELS.anthropicFallback, "claude-haiku-4-5-20251001");
  assert.equal(LLM_MODELS.openaiFallback, "gpt-4o-mini");
});

// ─────────────────────────────────────────────────────────────────────────────
// LLM_TOKEN_LIMITS — regression-guard the per-call caps. If a PR bumps these
// up without a justification, these tests will fail and force a review.
// ─────────────────────────────────────────────────────────────────────────────
test("LLM_TOKEN_LIMITS: email parsing capped at 150", () => {
  assert.equal(LLM_TOKEN_LIMITS.emailParsing, 150);
});

test("LLM_TOKEN_LIMITS: expense insights capped at 160", () => {
  assert.equal(LLM_TOKEN_LIMITS.expenseInsights, 160);
});

test("LLM_TOKEN_LIMITS: client-requested hard caps are enforced", () => {
  assert.equal(LLM_TOKEN_LIMITS.healthQAHardCap, 1000);
  assert.equal(LLM_TOKEN_LIMITS.healthImageHardCap, 2000);
});

test("LLM_TOKEN_LIMITS: all limits are positive integers", () => {
  for (const [key, val] of Object.entries(LLM_TOKEN_LIMITS)) {
    assert.equal(Number.isInteger(val), true, `${key} must be an integer`);
    assert.ok(val > 0, `${key} must be > 0`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveFeatureFlag — pure function, so we can exhaustively cover it.
// ─────────────────────────────────────────────────────────────────────────────
test("resolveFeatureFlag: defaults non-premium flags to TRUE (fail open)", () => {
  assert.equal(resolveFeatureFlag({}, "healthQA"), true);
  assert.equal(resolveFeatureFlag({}, "emailParsing"), true);
  assert.equal(resolveFeatureFlag({}, "expenseInsights"), true);
  assert.equal(resolveFeatureFlag(null, "healthQA"), true);
  assert.equal(resolveFeatureFlag(undefined, "medicationParse"), true);
});

test("resolveFeatureFlag: defaults premium flags to FALSE for free plan", () => {
  for (const flag of PREMIUM_FLAGS) {
    assert.equal(
      resolveFeatureFlag({ plan: "free" }, flag),
      false,
      `${flag} should be off by default on free plan`
    );
  }
});

test("resolveFeatureFlag: defaults premium flags to TRUE for pro/paid plans", () => {
  for (const flag of PREMIUM_FLAGS) {
    assert.equal(resolveFeatureFlag({ plan: "pro" }, flag), true);
    assert.equal(resolveFeatureFlag({ plan: "premium" }, flag), true);
    assert.equal(resolveFeatureFlag({}, flag), true); // no plan field → assume paid
  }
});

test("resolveFeatureFlag: explicit true override beats the free-plan default", () => {
  const fam = { plan: "free", aiFeatures: { medicalImageAnalysis: true } };
  assert.equal(resolveFeatureFlag(fam, "medicalImageAnalysis"), true);
});

test("resolveFeatureFlag: explicit false override disables any flag", () => {
  assert.equal(
    resolveFeatureFlag({ aiFeatures: { healthQA: false } }, "healthQA"),
    false
  );
  assert.equal(
    resolveFeatureFlag({ plan: "pro", aiFeatures: { doctorSummary: false } }, "doctorSummary"),
    false
  );
});

test("resolveFeatureFlag: truthy-but-not-true overrides count as false", () => {
  // Guards against accidental string/number overrides (e.g. aiFeatures.healthQA === "true").
  // We require a strict boolean true to enable — anything else means disabled.
  assert.equal(resolveFeatureFlag({ aiFeatures: { healthQA: "true" } }, "healthQA"), false);
  assert.equal(resolveFeatureFlag({ aiFeatures: { healthQA: 1 } }, "healthQA"), false);
});

test("resolveFeatureFlag: PREMIUM_FLAGS list matches documented premium features", () => {
  assert.deepEqual(
    PREMIUM_FLAGS.slice().sort(),
    ["audioBrief", "doctorSummary", "medicalImageAnalysis"].sort()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// isInsightsCacheValid — pure predicate used by generateExpenseInsights.
// Returning a false-positive "valid" here means serving stale data;
// returning a false-negative means an unnecessary ($$) AI call.
// Both cost money or UX — cover the edges.
// ─────────────────────────────────────────────────────────────────────────────
const NOW = 1_700_000_000_000; // arbitrary fixed epoch ms for determinism

test("insights cache: valid when month matches, TTL fresh, insights non-empty", () => {
  const cached = {
    month: "2026-04",
    generatedAt: ts(NOW - 60 * 60 * 1000), // 1h old, well under 4h TTL
    insights: ["Food is 40% of spend", "Swiggy 6x this month"],
    summary: { thisMonthTotal: 50000 },
  };
  assert.equal(isInsightsCacheValid(cached, "2026-04", NOW), true);
});

test("insights cache: invalid when month differs (month rollover)", () => {
  const cached = {
    month: "2026-03",
    generatedAt: ts(NOW - 10 * 1000), // fresh
    insights: ["old month insight"],
  };
  assert.equal(isInsightsCacheValid(cached, "2026-04", NOW), false);
});

test("insights cache: invalid when generatedAt is missing or malformed", () => {
  assert.equal(
    isInsightsCacheValid({ month: "2026-04", insights: ["x"] }, "2026-04", NOW),
    false
  );
  assert.equal(
    isInsightsCacheValid(
      { month: "2026-04", generatedAt: null, insights: ["x"] },
      "2026-04",
      NOW
    ),
    false
  );
  // toMillis exists but is not a function — reject.
  assert.equal(
    isInsightsCacheValid(
      { month: "2026-04", generatedAt: { toMillis: 123 }, insights: ["x"] },
      "2026-04",
      NOW
    ),
    false
  );
});

test("insights cache: invalid when age exceeds TTL", () => {
  const cached = {
    month: "2026-04",
    generatedAt: ts(NOW - (INSIGHTS_CACHE_TTL_MS + 1)), // 1ms over TTL
    insights: ["stale"],
  };
  assert.equal(isInsightsCacheValid(cached, "2026-04", NOW), false);
});

test("insights cache: valid at the exact TTL boundary", () => {
  // Age === TTL is the inclusive upper bound. Anything older must reject.
  const cached = {
    month: "2026-04",
    generatedAt: ts(NOW - INSIGHTS_CACHE_TTL_MS),
    insights: ["boundary"],
  };
  assert.equal(isInsightsCacheValid(cached, "2026-04", NOW), true);
});

test("insights cache: invalid when clock appears to move backwards", () => {
  // Defensive: if generatedAt is in the future relative to now, the cache
  // was written by a machine with a wrong clock — don't trust it.
  const cached = {
    month: "2026-04",
    generatedAt: ts(NOW + 60 * 1000), // 1 minute in the future
    insights: ["future"],
  };
  assert.equal(isInsightsCacheValid(cached, "2026-04", NOW), false);
});

test("insights cache: invalid when insights is empty / missing / non-array", () => {
  const base = { month: "2026-04", generatedAt: ts(NOW - 1000) };
  assert.equal(isInsightsCacheValid({ ...base, insights: [] }, "2026-04", NOW), false);
  assert.equal(isInsightsCacheValid({ ...base }, "2026-04", NOW), false);
  assert.equal(isInsightsCacheValid({ ...base, insights: "bullet" }, "2026-04", NOW), false);
  assert.equal(isInsightsCacheValid({ ...base, insights: null }, "2026-04", NOW), false);
});

test("insights cache: invalid when cached itself is null/undefined", () => {
  assert.equal(isInsightsCacheValid(null, "2026-04", NOW), false);
  assert.equal(isInsightsCacheValid(undefined, "2026-04", NOW), false);
});

test("INSIGHTS_CACHE_TTL_MS: 4 hours — regression guard against accidental bump", () => {
  assert.equal(INSIGHTS_CACHE_TTL_MS, 4 * 60 * 60 * 1000);
});
