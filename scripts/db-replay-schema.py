"""Replay the migration tree's DDL to derive the schema it SHOULD produce.

    npm run db:verify        # writes the fingerprint and prints the summary

WHY THIS EXISTS. `#2-deliv` claimed rebuild-test had drifted from the migration
files. It had not — the claim rested on a grep piped through `head -20` that cut
off before the file contradicting it. This script is what settled the question,
kept so the next such claim is measured rather than argued.

⚠️ WHAT IT CANNOT CATCH, and the list is the point of the script rather than a
disclaimer:

  1. DYNAMIC DDL. Anything built with `format()` / `EXECUTE` inside a function
     body. `ADD CONSTRAINT` written literally inside a `DO` block IS parsed;
     the same statement assembled from variables is not.
  2. TWO `RENAME` STATEMENTS, not modelled. They are reported under `unparsed`.
  3. ANYTHING APPLIED OUTSIDE THE LEDGER — a hand-run `ALTER` in the dashboard
     SQL editor, or MCP `apply_migration`, which writes no ledger row.
  4. ⚠️ A CONSTRAINT THAT IS WRONG RATHER THAN MISSING. This compares the tree
     to the database. A constraint that is in BOTH and contradicts the
     behaviour reports perfectly clean — which is exactly what `#3-deliv` was:
     a CHECK requiring a company on a table whose FK is `ON DELETE SET NULL`,
     so the tree and the database agreed while tenant deletion was broken. Only
     a test that performs the delete catches that class; see
     `s138-trial-deletion-run.live.ts`.
  5. FUNCTION BODIES, RLS POLICIES, TRIGGERS, INDEXES, DEFAULTS, GRANTS. Out of
     scope: it fingerprints NOT NULL, CHECK, UNIQUE, FK, tables and columns.

⚠️ AND ITS OWN HISTORY IS A WARNING. The first five discrepancies it reported
were ALL bugs in this parser, not drift — `IS NOT NULL` matched inside a
GENERATED column's expression; an explicit `CONSTRAINT <name>` written inside a
column definition; `ADD CONSTRAINT` inside a `DO` block; and `DROP COLUMN`
failing to cascade to that column's CHECK. It reached exact agreement only after
each was chased to a cause. **A discrepancy from this script is a QUESTION, not
a finding.** Chase it to a migration line before believing it.

HOW TO COMPARE AGAINST A LIVE DATABASE: run this to produce the expected
fingerprint, then run `scripts/db-verify.sql` against the target and diff the
counts. Any mismatch names the table to drill into.
"""
import os, re, sys, json, glob

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG = sorted(glob.glob(os.path.join(REPO, 'supabase', 'migrations', '*.sql')))
OUT = os.environ.get('DB_VERIFY_OUT', os.path.join(REPO, 'scripts', '.db-expected.json'))
if not MIG:
    sys.exit('no migrations found under ' + os.path.join(REPO, 'supabase', 'migrations'))

def strip_sql_comments(s):
    # Remove -- line comments (not inside strings) and /* */ blocks.
    out, i, n = [], 0, len(s)
    in_s = in_d = False
    dollar = None
    while i < n:
        if dollar:
            j = s.find(dollar, i)
            if j == -1: out.append(s[i:]); break
            out.append(s[i:j+len(dollar)]); i = j+len(dollar); dollar=None; continue
        c = s[i]
        if in_s:
            out.append(c); 
            if c == "'": in_s = False
            i += 1; continue
        if in_d:
            out.append(c)
            if c == '"': in_d = False
            i += 1; continue
        m = re.match(r"\$[A-Za-z_]*\$", s[i:])
        if m:
            dollar = m.group(0); out.append(dollar); i += len(dollar); continue
        if c == "'": in_s = True; out.append(c); i += 1; continue
        if c == '"': in_d = True; out.append(c); i += 1; continue
        if s.startswith('--', i):
            j = s.find('\n', i); i = n if j == -1 else j; continue
        if s.startswith('/*', i):
            j = s.find('*/', i); i = n if j == -1 else j+2; continue
        out.append(c); i += 1
    return ''.join(out)

def split_statements(s):
    stmts, buf, i, n = [], [], 0, len(s)
    in_s = in_d = False; dollar = None
    while i < n:
        if dollar:
            j = s.find(dollar, i)
            if j == -1: buf.append(s[i:]); break
            buf.append(s[i:j+len(dollar)]); i = j+len(dollar); dollar=None; continue
        c = s[i]
        m = re.match(r"\$[A-Za-z_]*\$", s[i:]) if not (in_s or in_d) else None
        if m:
            dollar = m.group(0); buf.append(dollar); i += len(dollar); continue
        if in_s:
            buf.append(c)
            if c == "'": in_s = False
            i += 1; continue
        if in_d:
            buf.append(c)
            if c == '"': in_d = False
            i += 1; continue
        if c == "'": in_s = True; buf.append(c); i += 1; continue
        if c == '"': in_d = True; buf.append(c); i += 1; continue
        if c == ';':
            stmts.append(''.join(buf)); buf = []; i += 1; continue
        buf.append(c); i += 1
    if ''.join(buf).strip(): stmts.append(''.join(buf))
    return [x.strip() for x in stmts if x.strip()]

def norm(t):
    t = t.strip().strip('"')
    if t.lower().startswith('public.'): t = t[7:]
    return t.strip('"').lower()

def split_top(s):
    parts, depth, buf = [], 0, []
    in_s=False
    for c in s:
        if in_s:
            buf.append(c)
            if c=="'": in_s=False
            continue
        if c=="'": in_s=True; buf.append(c); continue
        if c=='(': depth+=1
        elif c==')': depth-=1
        if c==',' and depth==0:
            parts.append(''.join(buf)); buf=[]; continue
        buf.append(c)
    if ''.join(buf).strip(): parts.append(''.join(buf))
    return [p.strip() for p in parts]


def strip_generated(rest):
    # Remove GENERATED ALWAYS AS ( ... ) so "IS NOT NULL" inside the expression
    # is not mistaken for a NOT NULL column constraint. tasks.is_scheduled.
    m = re.search(r'generated\s+always\s+as\s*\(', rest, re.I)
    if not m: return rest
    i = m.end()-1; depth=0
    for j in range(i, len(rest)):
        if rest[j]=='(': depth+=1
        elif rest[j]==')':
            depth-=1
            if depth==0: return rest[:m.start()] + rest[j+1:]
    return rest[:m.start()]

columns = set()          # (table, column)
notnull = set()          # (table, column)
constraints = {}         # (table, conname) -> kind
check_expr = {}          # (table, conname) -> expression text
tables = set()
unique_idx = {}          # idxname -> table
do_block_files = set()
unparsed = []
anon_check = {}
anon_alter = []

COLKW = {'constraint','primary','unique','check','foreign','exclude','like','partition'}

for path in MIG:
    raw = open(path, encoding='utf-8').read()
    fname = os.path.basename(path)
    src = strip_sql_comments(raw)
    if re.search(r'\bDO\s*\$', src, re.I):
        # Only flag when the block plausibly touches constraints/nullability.
        blocks = re.findall(r'DO\s*\$[A-Za-z_]*\$(.*?)\$[A-Za-z_]*\$', src, re.S|re.I)
        if any(re.search(r'ADD\s+CONSTRAINT|DROP\s+CONSTRAINT|NOT\s+NULL|UNIQUE\s+INDEX', b, re.I) for b in blocks):
            do_block_files.add(fname)
        for b in blocks:
            for dm in re.finditer(
                r'alter\s+table\s+(?:only\s+)?([\w."]+)\s+add\s+constraint\s+([\w"]+)\s+(check|unique|foreign\s+key|primary\s+key)',
                re.sub(r'\s+', ' ', b), re.I):
                k = dm.group(3).lower()
                k = 'fk' if k.startswith('foreign') else 'pk' if k.startswith('primary') else k
                constraints[(norm(dm.group(1)), dm.group(2).strip('"').lower())] = k
            for dm in re.finditer(
                r'alter\s+table\s+(?:only\s+)?([\w."]+)\s+drop\s+constraint\s+(?:if exists\s+)?([\w"]+)',
                re.sub(r'\s+', ' ', b), re.I):
                constraints.pop((norm(dm.group(1)), dm.group(2).strip('"').lower()), None)
    for st in split_statements(src):
        flat = re.sub(r'\s+', ' ', st).strip()
        low = flat.lower()

        m = re.match(r'create table (if not exists )?([\w."]+)\s*\((.*)\)[^)]*$', flat, re.I|re.S)
        if m:
            tbl = norm(m.group(2)); tables.add(tbl)
            body = m.group(3)
            for part in split_top(body):
                p = part.strip()
                w = p.split()
                if not w: continue
                first = w[0].lower().strip('"')
                if first == 'constraint':
                    cname = w[1].strip('"').lower()
                    rest = ' '.join(w[2:]).lower()
                    if rest.startswith('check'):
                        check_expr[(tbl, cname)] = rest
                    kind = ('check' if rest.startswith('check') else
                            'unique' if rest.startswith('unique') else
                            'fk' if rest.startswith('foreign') else
                            'pk' if rest.startswith('primary') else None)
                    if kind: constraints[(tbl, cname)] = kind
                    continue
                if first == 'primary':
                    mm = re.search(r'primary key\s*\(([^)]*)\)', p, re.I)
                    if mm:
                        constraints[(tbl, f'{tbl}_pkey')] = 'pk'
                        for c in mm.group(1).split(','):
                            notnull.add((tbl, c.strip().strip('"').lower()))
                    continue
                if first == 'unique':
                    mm = re.search(r'unique\s*\(([^)]*)\)', p, re.I)
                    if mm:
                        cols = '_'.join(c.strip().strip('"').lower() for c in mm.group(1).split(','))
                        constraints[(tbl, f'{tbl}_{cols}_key')] = 'unique'
                    continue
                if first == 'check':
                    anon_check[tbl] = anon_check.get(tbl, 0) + 1
                    continue
                if first == 'foreign':
                    mm = re.search(r'foreign key\s*\(([^)]*)\)', p, re.I)
                    if mm:
                        cols = '_'.join(c.strip().strip('"').lower() for c in mm.group(1).split(','))
                        constraints[(tbl, f'{tbl}_{cols}_fkey')] = 'fk'
                    continue
                if first in COLKW: continue
                col = first.strip('"')
                columns.add((tbl, col))
                rest = strip_generated(p[len(w[0]):])
                if re.search(r'\bnot\s+null\b', rest, re.I): notnull.add((tbl, col))
                # A column definition may carry its own NAMED constraint:
                #   col numeric CONSTRAINT my_name CHECK (...)
                # Register those under the name written, and remove them so the
                # synthesiser below does not invent a second, wrong name.
                for cm in re.finditer(r'constraint\s+([\w"]+)\s+(check|unique|references|primary\s+key)', rest, re.I):
                    kind = cm.group(2).lower()
                    kind = 'fk' if kind.startswith('ref') else 'pk' if kind.startswith('primary') else kind
                    cn = cm.group(1).strip('"').lower()
                    constraints[(tbl, cn)] = kind
                    if kind == 'check': check_expr[(tbl, cn)] = rest[cm.start():]
                rest = re.sub(r'constraint\s+[\w"]+\s+(check\s*\(|unique|references|primary\s+key)', ' ', rest, flags=re.I)
                if re.search(r'\bprimary\s+key\b', rest, re.I):
                    constraints[(tbl, f'{tbl}_pkey')] = 'pk'; notnull.add((tbl, col))
                if re.search(r'\breferences\b', rest, re.I):
                    constraints[(tbl, f'{tbl}_{col}_fkey')] = 'fk'
                if re.search(r'\bcheck\s*\(', rest, re.I):
                    constraints[(tbl, f'{tbl}_{col}_check')] = 'check'
                    check_expr[(tbl, f'{tbl}_{col}_check')] = rest
                if re.search(r'(?<!primary )\bunique\b', rest, re.I) and not re.search(r'\bprimary\s+key\b', rest, re.I):
                    constraints[(tbl, f'{tbl}_{col}_key')] = 'unique'
            continue

        m = re.match(r'alter table (only )?(if exists )?([\w."]+) (.*)$', flat, re.I|re.S)
        if m:
            tbl = norm(m.group(3)); actions = m.group(4)
            for act in split_top(actions):
                a = act.strip(); al = a.lower()
                mm = re.match(r'add constraint ([\w"]+)\s+(check|unique|foreign key|primary key)', a, re.I)
                if mm:
                    kind = {'check':'check','unique':'unique','foreign key':'fk','primary key':'pk'}[mm.group(2).lower()]
                    cn = mm.group(1).strip('"').lower()
                    constraints[(tbl, cn)] = kind
                    if kind == 'check': check_expr[(tbl, cn)] = a
                    continue
                mm = re.match(r'add (check|unique|foreign key|primary key)\b', a, re.I)
                if mm:
                    anon_alter.append((fname, tbl, mm.group(1).lower())); continue
                mm = re.match(r'drop constraint (if exists )?([\w"]+)', a, re.I)
                if mm:
                    constraints.pop((tbl, mm.group(2).strip('"').lower()), None); continue
                mm = re.match(r'alter column ([\w"]+) set not null', a, re.I)
                if mm: notnull.add((tbl, mm.group(1).strip('"').lower())); continue
                mm = re.match(r'alter column ([\w"]+) drop not null', a, re.I)
                if mm: notnull.discard((tbl, mm.group(1).strip('"').lower())); continue
                mm = re.match(r'add column (if not exists )?([\w"]+)\s+(.*)$', a, re.I|re.S)
                if mm:
                    col = mm.group(2).strip('"').lower()
                    columns.add((tbl, col))
                    rest = strip_generated(mm.group(3))
                    if re.search(r'\bnot\s+null\b', rest, re.I): notnull.add((tbl, col))
                    if re.search(r'\breferences\b', rest, re.I):
                        constraints[(tbl, f'{tbl}_{col}_fkey')] = 'fk'
                    if re.search(r'\bcheck\s*\(', rest, re.I):
                        constraints[(tbl, f'{tbl}_{col}_check')] = 'check'
                    if re.search(r'\bunique\b', rest, re.I):
                        constraints[(tbl, f'{tbl}_{col}_key')] = 'unique'
                    continue
                mm = re.match(r'drop column (if exists )?([\w"]+)', a, re.I)
                if mm:
                    c = mm.group(2).strip('"').lower()
                    notnull.discard((tbl, c)); columns.discard((tbl, c))
                    for key in [k for k in list(constraints)
                                if k[0] == tbl and (
                                    k[1].startswith(f'{tbl}_{c}_') or
                                    re.search(r'\\b' + re.escape(c) + r'\\b', check_expr.get(k, ''), re.I))]:
                        constraints.pop(key, None); check_expr.pop(key, None)
                    continue
                if al.startswith('rename'):
                    unparsed.append((fname, flat[:120]))
            continue

        m = re.match(r'create unique index (concurrently )?(if not exists )?([\w"]+) on ([\w."]+)', flat, re.I)
        if m:
            unique_idx[m.group(3).strip('"').lower()] = norm(m.group(4)); continue
        m = re.match(r'drop index (concurrently )?(if exists )?([\w."]+)', flat, re.I)
        if m:
            unique_idx.pop(norm(m.group(3)), None); continue
        m = re.match(r'drop table (if exists )?([\w."]+)', flat, re.I)
        if m:
            t = norm(m.group(2)); tables.discard(t)
            for k in [k for k in constraints if k[0]==t]: constraints.pop(k)
            for k in [k for k in notnull if k[0]==t]: notnull.discard(k)
            for k in [k for k in columns if k[0]==t]: columns.discard(k)
            continue
        m = re.match(r'alter table (only )?([\w."]+) rename to ([\w."]+)', flat, re.I)
        if m: unparsed.append((fname, flat[:120]))

json.dump({
 'columns': sorted('%s.%s' % k for k in columns),
 'not_null': sorted('%s.%s' % k for k in notnull),
 'constraints': {f'{t}.{c}': k for (t,c),k in sorted(constraints.items())},
 'unique_indexes': {k: v for k, v in sorted(unique_idx.items())},
 'tables': sorted(tables),
 'do_block_files': sorted(do_block_files),
 'unparsed': unparsed,
 'anon_check_tables': anon_check,
 'anon_alter': anon_alter,
}, open(OUT, 'w'), indent=1)

print('EXPECTED SCHEMA, replayed from', len(MIG), 'migration files')
print('  written to      :', OUT)
print('  tables          :', len(tables))
print('  columns         :', len(columns))
print('  NOT NULL columns:', len(notnull))
ks = {}
for k in constraints.values(): ks[k]=ks.get(k,0)+1
print('  constraints     :', ks)
print('  unique indexes  :', len(unique_idx))
print('\nBLIND SPOTS THIS RUN (see the module docstring):')
print('  DO-block files touching constraints:', len(do_block_files), '- parsed, but only LITERAL statements')
print('  unparsed RENAME statements         :', len(unparsed), '- NOT modelled')
print('  anonymous table-level CHECKs       :', sum(anon_check.values()), '- unnamed, not comparable')
print('  anonymous ALTER ADD constraints    :', len(anon_alter), '- unnamed, not comparable')
print('\nCompare with: scripts/db-verify.sql against the target database.')
print('⚠️ A discrepancy is a QUESTION, not a finding. Chase it to a migration line.')
