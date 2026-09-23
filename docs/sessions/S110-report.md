# S110 — report — site-visit access, desktop path, carried debt

Branch `feature/s110-site-visit-access`, cut from `main` @ `8bce4311` (tree clean; S109 merge
`d0e282e1` and photo fix `fd5a1a5a` both ancestors). CLI link: `nmyphyhmfttxkdoposvf`
(rebuild-test). **Nothing touches production.**

## Phase 1 — analyze (read-only)

### Step 1 — FILL-0 and Section A measured, written into the spec

- **`estimates.sent_at` cannot be the freeze cutoff.** It is never rewritten (the immutability
  trigger keeps it out of the allowlist), but a sent-or-later estimate can have none: on
  rebuild-test **14 of 21** estimates past review have `sent_at IS NULL`, because the trigger
  lets `draft → accepted` through and `signing-service.ts:258` writes it. Proposal:
  `site_visits.frozen_at`, stamped by a trigger on the estimates status transition.
- **Floor finding:** the estimate-files route's office arm lists every file on an estimate,
  PDFs included. Widening "photos" to foreman/crew through that arm would ship vendor quotes.
  Proposal: `files.site_visit_capture` marker and a staff arm scoped to it (Q-A.D).
- `s108-site-visit.live.ts`: 29 cases; 7 encode overturned behaviour. Four other test files do too.
- Rebuild-test holds **0** rows in every `site_visit_*` table.

### Step 2 — Sections B, F, G measured, written into the spec

- **F:** the estimate-files list has 6 consumer files (3 app), the per-file route 5 (2 app).
  ⚠️ A consumer-set allowlist alone would NOT have caught S109 — the consumer already existed and
  a FIELD was removed — so the proposed guard registers fields per consumer as well. Of 99 routes,
  19 have ≥2 consumers and a change since 2026-08-23; none but `estimates/[id]/files` removed a
  response field.
- **B:** the sidebar is flat with no children; every desktop road to a visit redirects foreman and
  crew away, which collides with Section A's widening → ASK-B.B added.
- **G:** queries and the one-line seed fix prepared; nothing executed.

### Step 3 — Sections C, D, E measured, written into the spec

- **C:** the S109 claim holds — the `/m/settings` → `/m/account` link exists on `main`. What fails
  is the road: Settings is the last ☰ tile, framed as read-only, and ☰ is absent on detail screens.
  No test ever clicked the link.
- **D2:** T2 ran only in Chromium, which focuses a button on click; Safari/Firefox on macOS do not,
  and the handle never calls `.focus()`. Failure class: "the thing inspected must be the thing
  judged" — the wrong-scope form.
- **D1:** a second RPC is owed; rows have a duplicate `sort_order` on rebuild-test. New: the
  `estimate_line_rows` UPDATE policy lacks the WITH CHECK that FILL-B5 gave lines.
- **E1:** `redirectType === 'PASSWORD_RECOVERY'` from the code exchange is a measured signal; `amr`
  after recovery is not measured. ⚠️ New, from code reading: the team-page admin reset likely
  produces a link that cannot work (PKCE verifier in the admin's cookies).
- **E3:** the portal can take the sheet with no new bytes if it reuses the already-signed URL;
  a re-sign route would be new client surface.
- **E4:** closable, provided the Stripe fidelity check is re-filed in the same commit.
