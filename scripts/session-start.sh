#!/bin/bash
# FrameFocus session-start snapshot
# Run at the start of every session before touching any code.
# Output gives a ground-truth picture of repo state so you never
# have to trust context files over git.

echo "=== FrameFocus Session Start Snapshot ==="
echo ""

echo "--- git log (last 15 commits) ---"
git log --oneline -15
echo ""

echo "--- git status ---"
git status
echo ""

echo "--- docs/sessions/ ---"
ls docs/sessions/
echo ""

echo "--- apps/web/.env.local ---"
ENV_FILE="apps/web/.env.local"
if [ -f "$ENV_FILE" ]; then
  SIZE=$(wc -c < "$ENV_FILE")
  echo "EXISTS — ${SIZE} bytes"
else
  echo "MISSING — recreate from Vercel env vars before running the dev server"
fi
echo ""

echo "--- Supabase CLI ---"
# ⚠️ THE DEFAULT LINK TARGET IS rebuild-test, NEVER PRODUCTION.
#
# This block used to print `--project-ref jwkcknyuyvcwcdeskrmz`, which is
# PRODUCTION. Every other rule in this repo exists to keep the CLI off it, and
# the script that starts every session was the one thing saying otherwise — so
# an operator following the snapshot's own instructions linked to prod and
# `db push` would then run there. Corrected [S122]; do not put the production
# ref back in a copy-pasteable command.
#
# Production (jwkcknyuyvcwcdeskrmz) is linked DELIBERATELY, by a human, for a
# supervised release — never by following a startup script.
REBUILD_TEST_REF="nmyphyhmfttxkdoposvf"
PROD_REF="jwkcknyuyvcwcdeskrmz"

if [ -f "supabase/.temp/project-ref" ]; then
  LINKED_REF="$(cat supabase/.temp/project-ref)"
  if [ "$LINKED_REF" = "$PROD_REF" ]; then
    echo "🚨 LINKED TO PRODUCTION — project ref: ${LINKED_REF}"
    echo "   STOP. Do not run 'supabase db push' from this session."
    echo "   Re-link to rebuild-test before any migration work:"
    echo "     npx supabase link --project-ref ${REBUILD_TEST_REF}"
  elif [ "$LINKED_REF" = "$REBUILD_TEST_REF" ]; then
    echo "LINKED — rebuild-test (${LINKED_REF}) ✅"
  else
    echo "LINKED — project ref: ${LINKED_REF}"
    echo "   ⚠️ This is neither rebuild-test nor production. Confirm before pushing."
  fi
else
  echo "NOT LINKED — run:"
  echo "  npx supabase login --token <token>"
  echo "  npx supabase link --project-ref ${REBUILD_TEST_REF}   # rebuild-test"
fi
echo "  Verify before EVERY push:  npx supabase projects list   (● must be ${REBUILD_TEST_REF})"
echo ""

echo "=== End of snapshot ==="
