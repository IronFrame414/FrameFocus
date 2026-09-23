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
