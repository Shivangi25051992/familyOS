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
} = require("../ai-helpers");

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
