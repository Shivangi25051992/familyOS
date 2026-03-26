#!/bin/bash
# FamilyOS Deploy Script
# Usage: ./deploy.sh
# Run this instead of 'firebase deploy' every time

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$PROJECT_DIR/public"

# ── 1. Auto-bump SW version using timestamp ──
TIMESTAMP=$(date +%Y%m%d%H%M%S)
SW_SRC="$PROJECT_DIR/sw.js"
SW_DEST="$PUBLIC_DIR/sw.js"

echo "🔧 Bumping SW version to $TIMESTAMP..."
# Replace the VERSION line with a new timestamp-based version
sed "s/const VERSION = .*/const VERSION = 'v3-$TIMESTAMP';/" "$SW_SRC" > "$SW_DEST"

echo "📄 Copying index.html..."
cp "$PROJECT_DIR/index.html" "$PUBLIC_DIR/index.html"

# ── 2. Generate config.js from env (OCR + Gmail OAuth) ──
OPENAI_KEY="${OPENAI_API_KEY:-}"
ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
GMAIL_CLIENT_ID="${GOOGLE_GMAIL_CLIENT_ID:-}"
PROVIDER="openai"
if [ -n "$OPENAI_KEY" ]; then PROVIDER="openai"; fi
if [ -n "$ANTHROPIC_KEY" ] && [ -z "$OPENAI_KEY" ]; then PROVIDER="anthropic"; fi
echo "🔑 Writing config.js (provider: $PROVIDER, gmail: ${GMAIL_CLIENT_ID:+set})..."
OAK="${OPENAI_KEY//\"/\\\"}"
AAK="${ANTHROPIC_KEY//\"/\\\"}"
GID="${GMAIL_CLIENT_ID//\"/\\\"}"
printf 'window.FAMILYOS_OCR_CONFIG={provider:"%s",openaiKey:"%s",anthropicKey:"%s"};\nwindow.FAMILYOS_GMAIL_CLIENT_ID="%s";\n' "$PROVIDER" "$OAK" "$AAK" "$GID" > "$PUBLIC_DIR/config.js"

echo "🚀 Deploying to Firebase..."
cd "$PROJECT_DIR"
firebase deploy --only hosting

echo ""
echo "✅ Deployed! Version: v3-$TIMESTAMP"
echo "   All connected clients will auto-update within ~30 seconds."
if [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "   💡 Receipt OCR disabled. Set OPENAI_API_KEY or ANTHROPIC_API_KEY before deploy to enable."
fi
