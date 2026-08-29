# Proposal View Tracking — `proposal_views` (prerequisite P3)

> **Status:** approved by Josh (blocking-items session, 2026-08-29) — build straight through,
> after item 1 (the Floor exposure) lands.
> **Branch:** `feature/blocking-items`. Migration `20261052000000_proposal_views.sql`.
> **Origin:** `docs/prompts/cc-blocking-items-prompt.md` item 2; ruled in
> `desktop-redesign-spec.md` §8.2 ("a prerequisite build, not a restyle") and the outstanding-work
> register. `14b`'s Client Activity renders "sent <date>" / "not sent" until this lands.

---

## 1. The ruling — the shape was already decided

**Row per view: estimate id, timestamp, user agent. Total-opened and last-opened are DERIVED** —
they are the *display*, not the storage.

**Why not a counter on the estimate.** Email security scanners hit these links and will inflate
any count. Filtering at write time freezes today's scanner rule into data that cannot be
corrected; with rows, the rule improves and every historical count improves with it. Rows also
answer what a counter cannot — three opens in an afternoon reads differently from three across
three weeks, and the alert copy (*"no client activity since it was opened Aug 14"*) is a
**timeline claim**, not a tally.

**Do not count the contractor's own views.** Josh will open his own proposal to check it; that
must not render as client activity.

**No IP stored. User agent only, and only to filter non-humans.** Deliberate asymmetry, recorded:
`signing_sessions` stores `signer_ip` for *signatures* — a legal artifact of an act. A view is
not an act; it gets no IP.

### Rulings added this session (Josh, 2026-08-29)

1. **`estimates.viewed_at` is kept in step; status `'viewed'` is retired unused.** `viewed_at` is
   stamped by the same service-role write on the **first counted** client view. Adopting the
   status would force widening every `status = 'sent'` check on the signing surface
   (`page.tsx:56` refuses to render, and the accept/decline flows key on it) for nothing the rows
   do not already answer. The `'viewed'` CHECK value stays in the enum as a dead value — removing
   it is schema churn with no payoff.
2. **Retention joins the event log's G1 #4 rule** (`outstanding-work-register.md:289`): prune at
   six months, **except where the estimate is still open**; a converted estimate's history is
   kept as the project's history. Six months is the event log's rule, not a platform default.
3. **Read visibility mirrors the estimate's own SELECT** — Owner/Admin plus the authoring PM. A
   PM who can reach their own estimate sees its activity, or the column renders empty for the
   person who sent it.
4. **Own-view detection is the session check, and its imprecision is ACCEPTED — a known
   limitation, not a defect.** See §4.

---

## 2. The write path — the whole security question, answered by precedent

The proposal link is `/sign/[token]` — public, logged-out, the token
(`signing_sessions.token`) is the sole credential. Everything on that surface already runs
through `getSupabaseAdmin()` (service role), and `signing_sessions` itself has **no write
policies at all** — only `signing_sessions_select_manager`. The CO signing flow
(`/sign-co/[token]`) is built the same way.

**`proposal_views` follows that precedent exactly:**

- The row is written **server-side in `app/sign/[token]/page.tsx`**, via the admin client,
  after the token resolves and the estimate passes the `status = 'sent'` gate. The browser never
  writes; there is **no anon arm, no client arm, no INSERT/UPDATE/DELETE policy of any kind.**
- The GET data route (`/api/sign/[token]`) does **not** log — the page is the only render path
  a human traverses (`signing-client.tsx` calls only `/complete`, `/decline`, unsubscribe).
- Logging is wrapped so a failed insert **never breaks the signing page** — a proposal that
  cannot be viewed because analytics hiccuped would be the tail wagging the dog.

## 3. Schema and migration shape — `20261052000000_proposal_views.sql`

A textbook **append-only log** (CLAUDE.md pattern): no `updated_*`, no `created_by`, no
soft-delete columns.

```sql
CREATE TABLE proposal_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),   -- the view moment
  user_agent  TEXT
);
CREATE INDEX idx_proposal_views_estimate_id ON proposal_views (estimate_id, created_at);
```

- `ON DELETE CASCADE`, not `SET NULL`: the audit-log FK convention says `SET NULL` preserves
  *financial* trails; a view row with no estimate answers nothing — this is the "log row
  genuinely makes no sense without the parent" carve-out.
- **RLS:** enable; **one** policy —

```sql
CREATE POLICY proposal_views_select_estimate_visible ON proposal_views
  FOR SELECT TO authenticated USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = proposal_views.estimate_id)
  );
```

  The `EXISTS` runs as the invoker, so `estimates`' own SELECT policy applies inside it —
  Owner/Admin or the authoring PM, **which is exactly ruling 3, and it stays correct if the
  estimate floor ever moves.** Clients and subs have no `estimates` arm and are excluded for
  free. (Deliberate containment, in the `invoice_lines` sense — the difference from item 1's
  trap is that here the parent's visibility IS the ruled visibility, whereas there it was not.)
- **Prune function**, per G1 #4 — terminal means `converted`/`voided`, and converted history is
  kept as the project's history, so the prune reaches **voided** estimates only; everything else
  is "still open" in the register's terms:

```sql
CREATE FUNCTION prune_proposal_views() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM proposal_views pv
    USING estimates e
    WHERE e.id = pv.estimate_id
      AND e.status = 'voided'
      AND pv.created_at < now() - interval '6 months'
    RETURNING 1
  ) SELECT count(*)::integer FROM gone;
$$;
```

  ⚠️ **No scheduler exists** — the project has neither `pg_cron` nor `pg_net` (verified live).
  The function ships callable; scheduling is filed as tech debt (§6), not silently omitted.

## 4. Own-view detection — the mechanism and the accepted hole

`/sign/[token]` is a server component; it can read the Supabase auth cookie. **If an
authenticated session exists and that user's profile `company_id` equals the signing session's
`company_id`, the view is the contractor's own and is not logged** (and `viewed_at` is not
stamped). The dashboard preview (`/dashboard/estimates/[id]/proposal`) never logs — it never
touches this surface.

**Known limitation, accepted by ruling — not a defect:** the contractor in a logged-out or
incognito browser is indistinguishable from a client and will count. Nothing better exists on a
token-only surface; the token authenticates the *link*, not the *person*.

## 5. Reads, derivation, and the bot filter

- `lib/proposal/view-filter.ts` — `isLikelyNonHuman(userAgent)`: the scanner/bot heuristic,
  applied **at read time only** (that is the point of storing rows). Shared, in `lib/`, so no
  surface owns the rule.
- `lib/services/proposal-views-client.ts` — `getProposalViewStats(estimateIds)`: one query,
  grouped in code to `{ total, lastViewedAt }` per estimate, human rows only. RLS does the role
  work (§3).
- **`estimates.viewed_at`** stays the denormalised "first counted view" stamp — set once,
  by the same write, `WHERE viewed_at IS NULL`. Display derives from rows, never from it; it
  exists so SQL and future alerts can cheaply ask "opened at all?".

### `input → store → output` trace, with real numbers

Estimate `EST-1885`, sent Aug 12. The client opens it Aug 14 at 9:12 and 9:14 (Gmail's scanner
hit it Aug 12 at 16:03). Josh, logged in, opens his own link Aug 13.

| Event | Stored | Why |
| --- | --- | --- |
| Aug 12 16:03 scanner GET | row `{est-1885, 2026-08-12T16:03Z, "Mozilla/5.0 (compatible; GoogleImageProxy)"}` · `viewed_at` stamped `2026-08-12T16:03Z` | rows store everything non-own; filtering is read-time |
| Aug 13 Josh, logged in | **nothing** | same-company session → own view, ruled out at write |
| Aug 14 09:12 client | row `{est-1885, 2026-08-14T09:12Z, "…Safari/605.1.15"}` | `viewed_at` already set, untouched |
| Aug 14 09:14 client | row `{…09:14Z…}` | every open is a row |

Reads (Owner or the authoring PM): `getProposalViewStats` filters the scanner row out →
`{ total: 2, lastViewedAt: Aug 14 09:14 }`. List column renders **"opened 2× · last Aug 14"**;
the health panel's Client activity card renders an **Opened** row and drops *"Opens aren't
tracked yet."* A foreman, crew member, sub or client gets zero rows from RLS and no column at
all. If the scanner heuristic improves next quarter, the Aug 12 row is reclassified by the new
rule and history corrects itself — the counter-on-estimate design could never do this.

## 6. UI section (spec completeness rule, S86)

- **`14b` estimates list** (`estimates-list.tsx:55-61` `clientActivity()`): upgrades in place —
  `not sent` → `sent Aug 21` → `opened 2× · last Aug 14` when rows exist. No layout change
  (that was §8.2's design constraint for the interim renderer).
- **Estimate detail, Details rail** (`estimate-health-panel.tsx` `ClientActivityCard`): an
  **Opened** row (`2× · last Aug 14, 2026` / `not yet`) replacing the *"Opens aren't tracked
  yet"* footnote.
- **Roles:** Owner/Admin everywhere; PM on their own estimates (both surfaces already floor the
  estimate itself the same way). No foreman/crew/sub/client entry point exists to these screens.
- **Mobile:** the estimates screens are desktop; no `/m` surface renders estimate activity today.
  Parity is not engaged; if `/m` gains estimates, it reads the same service (`lib/`), per S122.

## 7. Tests

- `p3-proposal-views.live.ts` (new): service-role seed on a QA estimate, then — Owner reads N>0
  (non-vacuity anchor); PM-author reads; PM non-author 0 rows; foreman/crew/sub/client 0 rows;
  an authenticated INSERT is refused (no policy). Every zero-row assertion is paired with the
  Owner count so nothing passes on an empty table.
- Unit: the derivation + `isLikelyNonHuman` (structure: scanner UA excluded, count/last correct,
  empty input → `not sent` shape preserved).

## 8. §S / tech debt

- **§S1 — prune has no scheduler** (no pg_cron on the project). Filed as TECH_DEBT `#1-blk`.
- **§S2 — `proposal_views` joins `COMPANY_CHILDREN` + trial `COMPANY_TABLES`** (the standing
  new-table trap).
- **§S3 — the alert strip** (*"expires in 3 days with no client activity since…"*) is `14a`
  redesign work; this table makes the sentence writable but does not build the strip.

## 9. Out of scope

- The `14b` restyle itself — this is its prerequisite, not its delivery.
- Any write from the browser or any anon RLS arm — ruled out by design.
- Status `'viewed'` transitions, reminder logic changes, and the CO/selection signing surfaces.
- IP storage, geo, or per-recipient identification of views.
