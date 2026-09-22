#!/usr/bin/env python3
"""
S108 D3b — are rebuild-test's function bodies the ones the migration files say?

    python3 scripts/db-function-sync.py            # check only (read-only)
    python3 scripts/db-function-sync.py --apply    # re-apply out-of-sync bodies, rebuild-test ONLY

============================================================================
WHY THIS EXISTS
============================================================================
MCP `apply_migration` deployed some function bodies with their comments
stripped, and in at least two cases REFORMATTED — `( SELECT` collapsed to
`(SELECT`, and adjacent string literals (`'... a ' 'company ...'`, which
Postgres concatenates) merged into one literal. Those bodies behave
identically, but they are not the text in the tree, so:

  * a reader of `pg_proc` (the recommended source of truth — see
    scripts/live-sql.mjs) sees a body with its reasoning removed, and
  * the schema-drift fingerprint (S108 C2) collapses whitespace but does not
    re-join literals, so a REFORMATTED body on rebuild-test would make the
    committed baseline disagree with any database deployed from the files —
    i.e. production would report permanent drift for a body nobody changed.

============================================================================
⚠️ "LATEST" IS LOAD-BEARING
============================================================================
A function redefined in five migrations must be compared against the FIFTH.
The files are read in version order and the LAST `CREATE ... FUNCTION name(`
wins. The tree has no `ALTER FUNCTION` (measured S108), so that last CREATE
fully defines the body AND its config (SECURITY DEFINER, search_path).

============================================================================
CLASSES
============================================================================
  exact      prosrc byte-equal (after trim) to the latest file body
  comments   differs, but equal after stripping line/block comments and
             collapsing whitespace — the MCP comment-strip signature
  reformat   differs after that too, but equal once adjacent string literals
             are joined and whitespace inside parens is removed — the MCP
             reformat signature. Semantically identical.
  DRIFT      a real difference. NEVER auto-applied; exits 2.
  CONFIG     the body agrees but SECURITY DEFINER or a SET (search_path)
             differs between file and database. A CREATE OR REPLACE would
             reset it, so this is NEVER auto-applied either; exits 2.

--apply re-runs the latest file's exact CREATE statement for every
`comments` / `reformat` function, extracted from the file programmatically —
never through a clipboard (S104: the SQL Editor silently truncated two files).
It snapshots prosecdef / proconfig / provolatile / proacl before and refuses to
report success unless all four are unchanged and the body is now `exact`.

⚠️ REFUSES ANY PROJECT THAT IS NOT REBUILD-TEST, in both modes.
"""
import glob
import json
import os
import re
import sys
import urllib.error
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


load_env()
TOKEN = os.environ.get('SUPABASE_ACCESS_TOKEN')
m = re.search(r'https://([a-z0-9]+)\.supabase\.co', os.environ.get('NEXT_PUBLIC_SUPABASE_URL', ''))
REF = m.group(1) if m else None
if not TOKEN:
    sys.exit('!! SUPABASE_ACCESS_TOKEN is not set.')
if REF != REQUIRED_REF:
    sys.exit(f'!! REFUSING: project is {REF}, not {REQUIRED_REF} (rebuild-test).')


def sql(query):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=json.dumps({'query': query}).encode(),
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        # The body carries Postgres's own message; without it a 400 says nothing.
        sys.exit(f'!! {e.code} from the query endpoint: {e.read().decode()[:2000]}')


def strip_comments(src):
    out = []
    for ln in src.split('\n'):
        i = ln.find('--')
        # quote parity: an odd count before `--` means it sits inside a literal
        if i >= 0 and ln[: i + 1].count("'") % 2 == 0:
            ln = ln[:i]
        out.append(ln)
    return re.sub(r'/\*.*?\*/', ' ', '\n'.join(out), flags=re.S)


def norm(src):
    return re.sub(r'\s+', ' ', strip_comments(src)).strip()


def norm_reformat(src):
    s = norm(src)
    s = re.sub(r"'\s+'", '', s)  # adjacent literals: 'a ' 'b' -> 'a b'
    s = re.sub(r'\(\s+', '(', s)
    s = re.sub(r'\s+\)', ')', s)
    return s


HDR = re.compile(
    r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?\s*\(', re.I
)


def latest_definitions():
    """name -> [(file, body, full CREATE statement), ...] in version order; last = latest."""
    defs = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'supabase/migrations/*.sql'))):
        txt = open(f).read()
        for mm in HDR.finditer(txt):
            rest = txt[mm.end():]
            am = re.search(r'\bAS\s+(\$[A-Za-z0-9_]*\$)', rest)
            if not am:
                continue
            nxt = HDR.search(rest)
            if nxt and nxt.start() < am.start():
                continue
            tag = am.group(1)
            end = rest.find(tag, am.end())
            if end < 0:
                continue
            semi = rest.find(';', end + len(tag))
            if semi < 0:
                continue
            stmt = txt[mm.start(): mm.end() + semi + 1]
            defs.setdefault(mm.group(1).lower(), []).append(
                (os.path.basename(f), rest[am.end():end], stmt)
            )
    return defs


LIVE_Q = (
    "select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosrc, "
    "p.prosecdef, p.proconfig, p.provolatile, p.proacl::text as acl "
    "from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
    "where n.nspname = 'public' and p.prokind in ('f','p') order by 1, 2"
)


def header_config(stmt, body):
    """(security_definer, sorted SET keys) as the CREATE statement declares them,
    read from the text OUTSIDE the body so a string inside the body cannot count."""
    outside = stmt.replace(body, ' ', 1)
    outside = strip_comments(outside)
    secdef = bool(re.search(r'\bSECURITY\s+DEFINER\b', outside, re.I))
    keys = sorted(k.lower() for k in re.findall(r'\bSET\s+([a-z_]+)\s*(?:TO|=)', outside, re.I))
    return secdef, keys


def live_config(r):
    keys = sorted(c.split('=', 1)[0].lower() for c in (r['proconfig'] or []))
    return bool(r['prosecdef']), keys


def apply_stmt(stmt):
    # The baseline schema (a pg_dump) says plain `CREATE FUNCTION`, which fails
    # on a function that exists. The body and config are untouched.
    return re.sub(r'^CREATE\s+FUNCTION\b', 'CREATE OR REPLACE FUNCTION', stmt, count=1, flags=re.I)


def grade(defn, prosrc):
    body = defn[1]
    if body.strip() == prosrc.strip():
        return 'exact'
    if norm(body) == norm(prosrc):
        return 'comments'
    if norm_reformat(body) == norm_reformat(prosrc):
        return 'reformat'
    return None


def classify(live, defs):
    """Returns {class: [(name, args, defn-or-None)]}.

    A name with ONE live function is judged against its LATEST definition only.
    A name with several live overloads (e.g. create_safety_incident, defined
    with two signatures in two files and never dropped) is judged per overload
    against every definition of that name, taking the best grade — the
    signature, not the version order, is what pairs them.
    """
    out = {'exact': [], 'comments': [], 'reformat': [], 'DRIFT': [], 'CONFIG': [], 'nofile': []}
    counts = {}
    for r in live:
        counts[r['proname']] = counts.get(r['proname'], 0) + 1
    rank = ['exact', 'comments', 'reformat']
    for r in live:
        name = r['proname']
        if name not in defs:
            out['nofile'].append((name, r['args'], None))
            continue
        cands = defs[name] if counts[name] > 1 else [defs[name][-1]]
        best = None
        for d in cands:
            g = grade(d, r['prosrc'])
            if g and (best is None or rank.index(g) <= rank.index(best[0])):
                best = (g, d)
        if best and header_config(best[1][2], best[1][1]) != live_config(r):
            # ⚠️ Body agrees, CONFIG does not: SECURITY DEFINER or a SET
            # (search_path) differs between the file and the live function.
            # A CREATE OR REPLACE resets config to what the statement says, so
            # re-applying would silently change behaviour. Never auto-applied.
            out['CONFIG'].append((name, r['args'], best[1]))
        elif best:
            out[best[0]].append((name, r['args'], best[1]))
        else:
            out['DRIFT'].append((name, r['args'], cands[-1]))
    return out


def report(res, total):
    print(f'live public functions: {total}')
    for k in ('exact', 'comments', 'reformat', 'DRIFT', 'CONFIG', 'nofile'):
        print(f'  {k:9s} {len(res[k])}')
    for k in ('comments', 'reformat', 'DRIFT', 'CONFIG', 'nofile'):
        for name, args, d in res[k]:
            print(f'    [{k}] {name}({args})  <- {d[0] if d else "no file"}')


def main():
    apply = '--apply' in sys.argv
    defs = latest_definitions()
    live = sql(LIVE_Q)
    res = classify(live, defs)
    report(res, len(live))

    if res['DRIFT'] or res['CONFIG'] or res['nofile']:
        print('\n!! DRIFT or an unmatched function: a real difference. Nothing is applied.')
        sys.exit(2)
    todo = res['comments'] + res['reformat']
    if not apply:
        sys.exit(1 if todo else 0)
    if not todo:
        print('\nnothing to re-sync.')
        sys.exit(0)

    key = lambda r: (r['proname'], r['args'])
    before = {key(r): r for r in live}
    for name, args, d in todo:
        sql(apply_stmt(d[2]))
        print(f'  re-applied {name}({args}) from {d[0]}')

    after_live = sql(LIVE_Q)
    after = {key(r): r for r in after_live}
    bad = []
    for name, args, d in todo:
        k = (name, args)
        if k not in after:
            bad.append(f'{name}({args}): signature vanished after re-apply')
            continue
        a, b = after[k], before[k]
        for col in ('prosecdef', 'proconfig', 'provolatile', 'acl'):
            if a[col] != b[col]:
                bad.append(f'{name}: {col} changed {b[col]!r} -> {a[col]!r}')
        if a['prosrc'].strip() != d[1].strip():
            bad.append(f'{name}: body still not exact after re-apply')
    if len(after_live) != len(live):
        bad.append(f'function count changed {len(live)} -> {len(after_live)}')
    print()
    report(classify(after_live, defs), len(after_live))
    if bad:
        print('\n!! POST-CONDITION FAILED:')
        for b in bad:
            print('   ', b)
        sys.exit(3)
    print(f'\nre-synced {len(todo)}; config and grants unchanged on every one.')


if __name__ == '__main__':
    main()
