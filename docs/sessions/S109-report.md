# S109 — report — tech debt #159–#163

Branch `feature/s109-debt-159-163`, cut from `main` `b75f201a`. Spec:
`docs/specs/S109-SPEC-debt-159-163.md` (rulings at its top). **Merge not authorised.**
Appended after every step; committed and pushed each time.

---

## Step 0 — Phase 1 + rulings recorded

- Phase 1 measured every FILL (`66f2bf86`). The session prompt file was committed **empty**; Josh
  delivered the Phase 3 rules in chat on 2026-09-23 and they are recorded in the spec.
- ⚠️ **CC error, recorded:** FILL-159.2's back-fill queries filtered `email_logs.status = 'sent'`.
  The webhook advances that status (the one real log row reads `delivered`), so the queries read a
  delivered email as never sent. Josh caught it on production. No back-fill is being built
  (ruling 159.A), so nothing was built on the wrong instrument.
- Linked project verified: `supabase/.temp/linked-project.json` → `nmyphyhmfttxkdoposvf`
  (`framefocus-rebuild-test`).

## Step 1 — #159 bid request: `sent_at` means sent; Send in the creation dialog

- **Migration `20261700000000_bid_request_sent_at_no_default.sql`** — `ALTER COLUMN sent_at DROP
  DEFAULT`. **No back-fill**, by ruling 159.A. Pushed to **rebuild-test** only (link verified
  `nmyphyhmfttxkdoposvf`; dry-run listed this migration alone; `PUSH_EXIT=0`). After:
  `column_default` of `sent_at` = null; `status` still `'sent'::text` (ruling 159.B).
  `npm run db:types` → no change (10738 → 10738 lines) — the column was already nullable.
- **UI** (`bidding-tab.tsx`): the chip reads **"not yet emailed"** when `status = 'sent'` and
  `sent_at IS NULL`; a later status (viewed, submitted…) is shown as-is. The creation dialog now
  offers **"Send to sub" in both reply modes**, calling BiddingTab's `handleSendRequest` — the
  chip's own send path, not a second one. `createSubBidRequest` returns `id`;
  `SubcontractorOption` gains `email`, and Send is **disabled with the reason stated** when it is
  null (the route's 422 case).
  Interpretation recorded: ruling 159.B says "not yet emailed when sent_at IS NULL"; it replaces
  only the misleading word `sent`. A link-mode request the sub has already opened reads `viewed`.
- **Tests:**
  - `test/s109-bid-request-sent-at.live.ts` (rebuild-test) — 3/3. Fixture non-vacuous
    (estimates on the company > 0); a created request has `sent_at` NULL; CONTROL: an explicit stamp
    is kept. ⚠️ **Proven by sabotage:** `SET DEFAULT now()` put back on rebuild-test →
    `SABOTAGE_LIVE_EXIT=1`, _"sent_at was stamped at INSERT — the DEFAULT is back"_ →
    default dropped again (verified null) → `RESTORED_LIVE_EXIT=0`, 3/3.
  - `test/s109-bid-request-dialog.test.ts` (committed suite) — 5/5, source-level: id returned, one
    send path, Send in both panels, no-email disable + reason, label.
  - Sweep for older tests encoding the default: none (`s164-m9-financial-arms` hit is
    `estimates.sent_at`; e2e has no bid-request dialog test).
- `tsc --noEmit` → `TSC_EXIT=0`. `next build` → `BUILD_EXIT=0`, "✓ Compiled successfully",
  129/129 static pages.
- **Production:** Josh applies `20261700000000` before the merge.
