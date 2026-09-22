#!/usr/bin/env python3
"""
S108 D1c — does the migration LEDGER agree with the migration FILES?

    npm run db:ledger                                  # live rebuild-test
    python3 scripts/db-ledger-check.py --ledger-json ledger.json   # an exported ledger

`npm run db:verify` runs this after the schema replay.

============================================================================
WHY THIS EXISTS
============================================================================
The ledger lied twice in S104: two migrations pasted through the SQL Editor
were silently truncated by the clipboard, and each still left a ledger row —
so `supabase_migrations.schema_migrations` said the work had run when it had
not. `db-replay-schema.py` could not see it: its docstring lists the ledger as
a BLIND SPOT and it never reads `schema_migrations` at all.

This check cannot see truncation either — a row is a row. What it catches is
the ledger's OWN inconsistencies, each of which has happened here:

  1. DUPLICATE versions.
  2. A version that is not 14 digits (the CLI's timestamp format).
  3. MCP-SIGNATURE rows. MCP `apply_migration` stamps the row with the time it
     ran, so a row whose name starts with a 14-digit prefix that differs from
     its own version was not written by `supabase db push`. (Same definition as
     the S104b production query.)
  4. Ledger rows with NO matching file — work the tree does not describe.
  5. Files with NO ledger row — work the database never recorded. On a target
     that is BEHIND the tree (production before an attended push) these are
     expected; they are printed as PENDING, and they fail the check only when
     they are not a contiguous tail — a gap in the middle means a file was
     skipped, which is the dangerous case.
  6. A row whose NAME does not match its file's name.
  7. The ORDERED-VERSION md5 — `md5(string_agg(version, ',' ORDER BY version))`,
     the fingerprint used against production in S104 — printed for both sides
     over the versions they share, so a mismatch is visible even when every
     count agrees.

⚠️ WHAT IT CANNOT CATCH: a ledger row for work that was truncated or failed
part-way. Only reading the OBJECT catches that — `db:verify`'s schema replay
and the S108 C2 fingerprint (`/api/cron/schema-drift`). The ledger check is a
third, cheaper net, not a replacement for either.

Exit 0 clean · 1 findings (offending versions printed, not just a count) ·
9 could not run.
"""
import glob
import hashlib
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REQUIRED_REF = 'nmyphyhmfttxkdoposvf'  # framefocus-rebuild-test


def load_env():
    try:
        with open(os.path.join(ROOT, 'apps/web/.env.local')) as fh:
            for line in fh:
                m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
                if m and m.group(1) not in os.environ:
                    os.environ[m.group(1)] = re.sub(r'^([\'"])(.*)\1$', r'\2', m.group(2).strip())
    except FileNotFoundError:
        pass


def live_ledger():
    load_env()
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    m = re.search(r'https://([a-z0-9]+)\.supabase\.co', os.environ.get('NEXT_PUBLIC_SUPABASE_URL', ''))
    ref = m.group(1) if m else None
    if not token:
        print('!! SUPABASE_ACCESS_TOKEN is not set — cannot read the live ledger.')
        sys.exit(9)
    # ⚠️ Same guard as scripts/live-sql.mjs. Production's ledger is checked by
    # exporting it (the SQL is in docs/specs/S108-SPEC-E) and passing
    # --ledger-json, never by pointing this at production credentials.
    if ref != REQUIRED_REF:
        print(f'!! REFUSING: project is {ref}, not {REQUIRED_REF} (rebuild-test).')
        sys.exit(9)
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{ref}/database/query',
        data=json.dumps(
            {'query': 'select version, name from supabase_migrations.schema_migrations order by version'}
        ).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def files():
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'supabase/migrations/*.sql'))):
        base = os.path.basename(f)[:-4]
        m = re.match(r'^(\d{14})_(.+)$', base)
        if m:
            out[m.group(1)] = m.group(2)
        else:
            out[base] = None  # a file the CLI would not accept; reported below
    return out


def ordered_md5(versions):
    return hashlib.md5(','.join(sorted(versions)).encode()).hexdigest()


def check(ledger, fs):
    findings = []
    versions = [r['version'] for r in ledger]
    seen, dups = set(), set()
    for v in versions:
        (dups if v in seen else seen).add(v)
    if dups:
        findings.append(('DUPLICATE versions', sorted(dups)))

    bad_fmt = [v for v in versions if not re.fullmatch(r'\d{14}', v or '')]
    if bad_fmt:
        findings.append(('version NOT 14 digits', bad_fmt))

    mcp = [
        f"{r['version']} -> {r['name']}"
        for r in ledger
        if re.match(r'^\d{14}_', r['name'] or '') and r['name'][:14] != r['version']
    ]
    if mcp:
        findings.append(('MCP-signature rows (name prefix <> version)', mcp))

    bad_files = [k for k, v in fs.items() if v is None]
    if bad_files:
        findings.append(('migration FILES not named <14 digits>_<name>.sql', bad_files))

    led = {r['version']: r['name'] for r in ledger}
    no_file = sorted(v for v in led if v not in fs)
    if no_file:
        findings.append(('ledger rows with NO matching file', no_file))

    names = sorted(
        f'{v}: ledger {led[v]!r} vs file {fs[v]!r}'
        for v in led
        if v in fs and fs[v] is not None and led[v] not in (fs[v], f'{v}_{fs[v]}')
    )
    if names:
        findings.append(('ledger NAME does not match its file', names))

    missing = sorted(v for v in fs if v not in led and fs[v] is not None)
    pending, gap = [], []
    if missing:
        top = max(led) if led else ''
        for v in missing:
            (pending if v > top else gap).append(v)
    if gap:
        findings.append(('files with NO ledger row, BELOW the ledger tip (skipped, not pending)', gap))

    shared = sorted(set(led) & set(fs))
    return findings, pending, shared


def main():
    args = sys.argv[1:]
    if '--ledger-json' in args:
        path = args[args.index('--ledger-json') + 1]
        ledger = json.load(open(path))
        source = path
    else:
        ledger = live_ledger()
        source = 'live rebuild-test'
    fs = files()
    findings, pending, shared = check(ledger, fs)

    print(f'MIGRATION LEDGER CHECK — {source}')
    print(f'  ledger rows            : {len(ledger)}')
    print(f'  migration files        : {len(fs)}')
    print(f'  ledger tip             : {max((r["version"] for r in ledger), default="(empty)")}')
    print(f'  ordered md5, ledger    : {ordered_md5([r["version"] for r in ledger])}')
    print(f'  ordered md5, files     : {ordered_md5(list(fs))}')
    print(f'  ordered md5, shared {len(shared):>3}: {ordered_md5(shared)}')
    if pending:
        print(f'  PENDING (files above the tip, not yet pushed): {len(pending)}')
        for v in pending:
            print(f'      {v}_{fs[v]}')
    if not findings:
        print('\nLEDGER CLEAN.')
        sys.exit(0)
    print('\n!! LEDGER FINDINGS:')
    for title, items in findings:
        print(f'  {title}: {len(items)}')
        for i in items:
            print(f'      {i}')
    sys.exit(1)


if __name__ == '__main__':
    main()
