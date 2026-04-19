#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  FamilyOS Health Module — Complete Test Runner
# ═══════════════════════════════════════════════════════════════
#
#  Usage:
#    chmod +x tests/run-health-tests.sh
#    ./tests/run-health-tests.sh
#
#  Options (env vars):
#    SKIP_SEED=true       — skip Firebase seed step
#    SKIP_E2E=true        — skip browser E2E tests (unit only)
#    FAMILY_ID=xxx        — override family ID
#    APP_URL=https://...  — override app URL for E2E
#
# ═══════════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS="$ROOT/tests"
BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  FamilyOS Health Module — Test Suite              ${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"

# ── Load .env ──
if [ -f "$TESTS/.env" ]; then
  export $(grep -v '^#' "$TESTS/.env" | xargs)
  echo -e "\n  ℹ️  Loaded $TESTS/.env"
else
  echo -e "\n  ${YELLOW}⚠️  No tests/.env found — using environment variables / defaults${RESET}"
  echo -e "  Copy tests/.env.example → tests/.env and fill in values.\n"
fi

# ── Check Node ──
if ! command -v node &> /dev/null; then
  echo -e "\n  ${RED}ERROR: node is required but not installed.${RESET}"
  exit 1
fi

# ── Install dependencies ──
echo -e "\n${BOLD}[0/4] Installing test dependencies…${RESET}"
cd "$ROOT"
if [ ! -d "node_modules/puppeteer" ] || [ ! -d "node_modules/firebase-admin" ] || [ ! -d "node_modules/dotenv" ]; then
  npm install --save-dev puppeteer firebase-admin dotenv 2>&1 | tail -5
  echo "  ✅ Dependencies ready"
else
  echo "  ✅ Dependencies already installed"
fi

# ── Unit Tests ──
echo -e "\n${BOLD}[1/4] Running unit tests (pure functions — no Firebase needed)…${RESET}"
if node "$TESTS/health-unit.test.js"; then
  UNIT_STATUS="${GREEN}✅ UNIT TESTS PASSED${RESET}"
else
  UNIT_STATUS="${RED}❌ UNIT TESTS FAILED${RESET}"
  UNIT_FAILED=1
fi

# ── Seed Data ──
if [ "${SKIP_SEED}" != "true" ]; then
  echo -e "\n${BOLD}[2/4] Seeding test data into Firebase…${RESET}"
  if [ -z "$FAMILY_ID" ]; then
    echo -e "  ${YELLOW}⚠️  FAMILY_ID not set — skipping seed step.${RESET}"
    echo -e "  Set FAMILY_ID in tests/.env or as env var, then re-run."
    SEED_STATUS="${YELLOW}⚠️  SEED SKIPPED (no FAMILY_ID)${RESET}"
  elif [ -z "$FIREBASE_PROJECT_ID" ]; then
    echo -e "  ${YELLOW}⚠️  FIREBASE_PROJECT_ID not set — skipping seed step.${RESET}"
    SEED_STATUS="${YELLOW}⚠️  SEED SKIPPED (no FIREBASE_PROJECT_ID)${RESET}"
  else
    if FAMILY_ID="$FAMILY_ID" node "$TESTS/health-seed.js"; then
      SEED_STATUS="${GREEN}✅ SEED DATA CREATED${RESET}"
    else
      SEED_STATUS="${YELLOW}⚠️  SEED STEP FAILED (check serviceAccount.json)${RESET}"
    fi
  fi
else
  SEED_STATUS="${YELLOW}⚠️  SEED SKIPPED (SKIP_SEED=true)${RESET}"
fi

# ── E2E Tests ──
if [ "${SKIP_E2E}" != "true" ]; then
  echo -e "\n${BOLD}[3/4] Running E2E browser tests…${RESET}"
  if [ -z "$APP_URL" ]; then
    APP_URL="https://familyos-e3d4b.web.app"
  fi
  echo -e "  Target: $APP_URL"
  if APP_URL="$APP_URL" node "$TESTS/health-e2e.test.js"; then
    E2E_STATUS="${GREEN}✅ E2E TESTS PASSED${RESET}"
  else
    E2E_STATUS="${RED}❌ E2E TESTS FAILED${RESET}"
    E2E_FAILED=1
  fi
else
  E2E_STATUS="${YELLOW}⚠️  E2E SKIPPED (SKIP_E2E=true)${RESET}"
fi

# ── Summary ──
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  RESULTS SUMMARY${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "  Unit Tests:  $(eval echo -e "$UNIT_STATUS")"
echo -e "  Seed Data:   $(eval echo -e "$SEED_STATUS")"
echo -e "  E2E Tests:   $(eval echo -e "$E2E_STATUS")"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"

if [ "${UNIT_FAILED}" = "1" ] || [ "${E2E_FAILED}" = "1" ]; then
  echo -e "\n  ${RED}${BOLD}⛔  Tests failed — do not deploy.${RESET}\n"
  exit 1
else
  echo -e "\n  ${GREEN}${BOLD}✅  All tests passed — ready to deploy.${RESET}\n"
  exit 0
fi
