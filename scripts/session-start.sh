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
if [ -f "supabase/.temp/project-ref" ]; then
  echo "LINKED — project ref: $(cat supabase/.temp/project-ref)"
else
  echo "NOT LINKED — run:"
  echo "  npx supabase login --token <token>"
  echo "  npx supabase link --project-ref jwkcknyuyvcwcdeskrmz"
fi
echo ""

echo "=== End of snapshot ==="
