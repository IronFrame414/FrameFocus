#!/usr/bin/env bash
#
# Regenerate packages/shared/types/database.ts from the LINKED Supabase project.
#
# ===========================================================================
# TECH_DEBT #128 — WHY THIS IS A SCRIPT AND NOT AN npm ONE-LINER
# ===========================================================================
# The script this replaces was:
#
#   supabase gen types typescript --linked 2>/dev/null > packages/shared/types/database.ts
#
# Two independent faults compounded, and the result was SILENT:
#
#   1. The shell performs `>` redirection BEFORE running the command, so the
#      target was truncated to zero bytes the instant the pipeline started.
#      The previous good contents were gone before generation was attempted.
#   2. `2>/dev/null` discarded the generator's stderr, so an expired token, a
#      lost CLI link (a routine Codespace-rebuild casualty) or a network
#      failure produced no visible error. The exit status belonged to the
#      REDIRECT, not to the generator — #137's family exactly.
#
# Net effect: a failed run left an empty or partial `database.ts`, the chained
# `db:push` continued into `type-check`, and the failure surfaced as hundreds
# of unrelated type errors — or as a COMMITTED truncated file.
#
# The rule this file exists to enforce: **the real file is never touched until
# a complete, sane generation is already sitting on disk.**
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${REPO_ROOT}/packages/shared/types/database.ts"
TMP="$(mktemp -t database.ts.XXXXXX)"
trap 'rm -f "${TMP}"' EXIT

# A generated file this far below the real one is a truncation, not a schema
# that shrank. Current file is ~6.5k lines; 500 is a floor no real schema of
# this project crosses, chosen low enough not to false-positive on deletions.
MIN_LINES=500

# Symbols that must be present. `Database` is the type every consumer imports;
# the three tables are long-standing and span three different migrations, so
# their absence means a partial write rather than a legitimate drop.
REQUIRED_SYMBOLS=("export type Database" "company_members" "subcontractors" "change_orders")

echo "==> Linked project:"
npx supabase projects list 2>/dev/null | grep '●' || {
  echo "!! Could not read the project list. Is the CLI linked and logged in?" >&2
  exit 1
}

echo "==> Generating types to a temp file (stderr NOT suppressed)…"
# NOTE: no `2>/dev/null`. If the generator has something to say, we want it.
# Failure here trips `set -e` and the real file is never opened for writing.
if ! npx supabase gen types typescript --linked > "${TMP}"; then
  echo "!! supabase gen types FAILED — ${TARGET} left untouched." >&2
  exit 1
fi

LINES="$(wc -l < "${TMP}")"
if [ "${LINES}" -lt "${MIN_LINES}" ]; then
  echo "!! Generated file is ${LINES} lines, below the ${MIN_LINES}-line floor." >&2
  echo "!! This is the truncation #128 describes. ${TARGET} left untouched." >&2
  exit 1
fi

for sym in "${REQUIRED_SYMBOLS[@]}"; do
  if ! grep -q "${sym}" "${TMP}"; then
    echo "!! Generated file is missing '${sym}' — partial output." >&2
    echo "!! ${TARGET} left untouched." >&2
    exit 1
  fi
done

OLD_LINES=0
[ -f "${TARGET}" ] && OLD_LINES="$(wc -l < "${TARGET}")"

mv "${TMP}" "${TARGET}"
trap - EXIT

echo "==> OK — ${TARGET}"
echo "    lines: ${OLD_LINES} -> ${LINES}"
echo "    md5:   $(md5sum "${TARGET}" | cut -d' ' -f1)"
