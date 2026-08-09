#!/usr/bin/env bash
#
# Preflight for any Playwright run. Guarantees exactly one dev server, on the
# port Playwright is actually going to drive.
#
# ===========================================================================
# TECH_DEBT #138 — WHAT THIS PREVENTS, AND WHY HABITS DID NOT
# ===========================================================================
# `npm run dev` treats a port collision as a WARNING:
#
#     ⚠ Port 3000 is in use, trying 3001 instead
#
# …and carries on happily. `playwright.config.ts` pins
# `baseURL: 'http://localhost:3000'`, so the runner keeps driving whatever
# holds 3000 — which, on the occasion this was found, was a CRIPPLED server
# left from a previous suite whose `.next` had been deleted out from under it.
# `auth.setup` failed and 277 tests never ran. Twice.
#
# ⚠️ A `curl` WARM-UP IS NOT A CHECK. It returned 200 and reassured falsely:
# the stale server could still serve a cached page, and only the sign-in POST
# path was broken. So this script does not ask "does something answer?" — it
# asks "did the server I just started bind the port I am about to drive?",
# which is a different question and the only one that catches this.
#
# ⚠️ NEVER `pkill -f "next dev"` — #137's fifth instance. `pkill -f` matches
# any process whose command line CONTAINS the string, including the shell
# running the pkill itself, which is why those commands returned exit 144 and
# why servers appeared to die for no reason. This script lists PIDs and kills
# them individually, excluding its own process group.
#
# It earns its keep beyond port collisions: it has caught `npm run dev` failing
# outright with `Missing script: "dev"` because the working directory had
# drifted to the repo root — invisible to "did the command appear to succeed",
# obvious to "does the log say it bound the port".
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${REPO_ROOT}/apps/web"
PORT="${E2E_PORT:-3000}"
LOG="${E2E_DEV_LOG:-/tmp/ff-dev-${PORT}.log}"
SELF_PID=$$

say() { echo "[e2e-preflight] $*"; }

# --- 1. Kill existing dev servers BY PID -----------------------------------
# `pgrep -f` is fine for LISTING; it is `pkill -f` that is the footgun. We
# still exclude our own pid defensively, since this script's command line
# contains the very strings being matched.
kill_dev_servers() {
  local pids
  pids="$(pgrep -f 'next-server|next dev|next/dist/bin/next' 2>/dev/null | grep -v "^${SELF_PID}$" || true)"
  if [ -z "${pids}" ]; then
    say "no existing dev server processes"
    return 0
  fi
  say "killing dev server pids: $(echo "${pids}" | tr '\n' ' ')"
  for pid in ${pids}; do kill "${pid}" 2>/dev/null || true; done
  sleep 2
  pids="$(pgrep -f 'next-server|next dev|next/dist/bin/next' 2>/dev/null | grep -v "^${SELF_PID}$" || true)"
  for pid in ${pids}; do say "pid ${pid} survived TERM — sending KILL"; kill -9 "${pid}" 2>/dev/null || true; done
  sleep 1
}

# --- 2. Confirm the port is genuinely free ---------------------------------
# Expect FAILURE here. A success means something is still listening, and
# starting a second server would silently move it to 3001.
port_is_free() {
  ! (curl -sf -o /dev/null --max-time 2 "http://localhost:${PORT}/" 2>/dev/null)
}

kill_dev_servers

if ! port_is_free; then
  say "!! port ${PORT} still answers after the kill sweep."
  say "!! Something outside this script holds it. Refusing to start a second"
  say "!! server, which would bind ${PORT}+1 and be driven by nothing."
  exit 1
fi
say "port ${PORT} is free (curl failed, as required)"

# --- 3. Start exactly one server -------------------------------------------
if [ "${E2E_PREFLIGHT_START:-1}" = "0" ]; then
  say "start suppressed (E2E_PREFLIGHT_START=0) — port is clean, Playwright's"
  say "webServer will start its own."
  exit 0
fi

say "starting one dev server (cwd: ${WEB_DIR}, log: ${LOG})"
rm -f "${LOG}"
( cd "${WEB_DIR}" && npm run dev > "${LOG}" 2>&1 & echo $! > "${LOG}.pid" )
sleep 1
DEV_PID="$(cat "${LOG}.pid" 2>/dev/null || echo '')"

# --- 4. Grep the log for BOTH signals --------------------------------------
# Both halves are required. `Local: …:3000` alone is not enough, because Next
# prints its banner before deciding it must move; the absence of `in use` is
# what makes the binding claim trustworthy.
DEADLINE=$((SECONDS + 180))
BOUND=0
while [ $SECONDS -lt $DEADLINE ]; do
  if grep -qE "Port ${PORT} is in use" "${LOG}" 2>/dev/null; then
    say "!! log says: $(grep -m1 -E "Port ${PORT} is in use" "${LOG}")"
    say "!! the server MOVED. Playwright would drive the wrong thing. Aborting."
    [ -n "${DEV_PID}" ] && kill "${DEV_PID}" 2>/dev/null || true
    exit 1
  fi
  if grep -qE "Missing script|ENOENT|command not found" "${LOG}" 2>/dev/null; then
    say "!! dev server failed to start:"
    sed -n '1,15p' "${LOG}" >&2
    exit 1
  fi
  if grep -qE "Local:.*localhost:${PORT}|- Local:.*:${PORT}|Ready in" "${LOG}" 2>/dev/null; then
    BOUND=1
    break
  fi
  sleep 2
done

if [ "${BOUND}" != "1" ]; then
  say "!! dev server did not report binding ${PORT} within 180s. Log tail:"
  tail -20 "${LOG}" >&2
  [ -n "${DEV_PID}" ] && kill "${DEV_PID}" 2>/dev/null || true
  exit 1
fi

# Belt and braces: the banner said 3000, now make it answer on 3000.
for _ in $(seq 1 30); do
  curl -sf -o /dev/null --max-time 2 "http://localhost:${PORT}/" 2>/dev/null && break
  sleep 2
done

say "one server up on ${PORT} (pid ${DEV_PID:-unknown}); log: ${LOG}"
say "Playwright's reuseExistingServer will attach to it."
exit 0
