# S173 — the estimate Send regression, and the selections client-choice rework

Branch: `feature/s173-send-and-selections` off `main` @ `f515f3c`. Unattended; no push; stage 5
untouched.

---

## Job 1 — the estimate Send button

### The bisect verdict: NOTHING WAS REMOVED. The affordance never existed on the detail page.

Checked, with evidence:

- `estimate-builder.tsx` — **byte-identical action logic since `dc3854e` (M4, 4D/4E)**. Its
  `statusActionButton()` has only ever offered "Mark as Sent" (draft, owner/admin), "Submit for
  Review" (draft, PM), "Approve & Send" (review, owner/admin) — **all three are status flips; none
  emails anything**. `934b501` (M5 wiring) added Convert to Project beside them and touched nothing
  else. `git log -S 'Send Proposal'`, `-S 'sendOpen'`, and `-S 'Send to Client'` across all
  branches: **no commit ever removed or gated a Send action.**
- The ONLY email-send affordance M4 shipped is **"Send Proposal" on the proposal PREVIEW page**
  (`[id]/proposal/proposal-preview-client.tsx:180`), reached via the Details tab's "Preview
  Proposal" link, gated `owner/admin && draft`. Also unchanged since `dc3854e`/`c7c0690`.
- So the answer to "which session removed it": **none**. What Josh remembers as sending was the
  preview page's button, two clicks deep and never surfaced on the estimate itself. "Approve &
  Send" (review) compounds it: the label says send, the code flips status — and once flipped to
  `sent`, `api/proposals/resend` is the only email path and the Resend modal wires its recipient
  from `sessions[0]` — no session was ever minted, so Send is permanently disabled. **A PM-authored
  estimate could never be emailed at all.**

### The route: intact

`api/proposals/send` gates: owner/admin (403), `draft|review` (409), contact email (422) — all
consistent with Josh's estimate (Draft, client attached). Review status is explicitly supported and
stamps `reviewed_by/reviewed_at` on send — **the route was built for an affordance the UI never
grew.** S150's try/catch fix (`0cb11b8`) is in place and structurally guarded by
`s156-m4-audit.live.ts` F1a. No route change needed or made.

### The fix

One mechanism, new entry points — the builder now opens the SAME `SendProposalModal` →
`api/proposals/send` the preview page uses:

- `estimate-builder.tsx`: **draft + owner/admin** → primary **"Send to Client"**
  (`est-send`) + secondary "Mark as Sent" (`est-mark-sent`, now labelled as the
  hand-delivery flow in its confirm). **review + owner/admin** → primary **"Approve & Send"**
  (`est-approve-send`) now actually sends (route stamps the review fields) + secondary
  "Approve & Mark as Sent" (`est-approve-mark-sent`, the old flip, kept for hand delivery).
  Recipient email + company defaults fetched on open.
- `contacts-client.ts`: `getContactEmail()` added (service-layer rule — no direct Supabase from
  the component).
- `proposal-preview-client.tsx`: `data-testid="preview-send"` on the existing button (no behaviour
  change).

### The affordance test

`e2e/desktop-estimate-send.spec.ts` — MARKER-named fixture (`E2ESEND`), swept before AND after
with refusal checks (the S168/S171 lesson). Asserts: draft builder has Send to Client and it opens
the modal addressed to the contact; the preview page still has its own Send; review builder has
Approve & Send opening the same modal. Deliberately does NOT complete a send — delivery is the
route's covered job; this file exists so **the affordance disappearing goes red**, which is the
gap that let this sit.

### Battery

- `tsc --noEmit` (apps/web): exit 0, empty output. (Foreground tsc runs are SIGTERM'd at ~33s in
  this sandbox — exit 143 with no error output, reproduced 4×; backgrounded run completes. Judged
  on the printed exit of the completed run, per the exit-status rule.)
- `next lint`: exit 0, "No ESLint warnings or errors".
- `npx playwright test desktop-estimate-send` from `apps/web`: **3 passed**, exit 0.

---

## Job 2 — "chosen" is the client's act (design inversion, RULED [Josh, S173])

Spec: `allowances-selections-spec.md` — new **§1.3** (both S173 rulings, with Josh's words), §5.3,
§6.1, §6.2, §6.3, §9.1, §9.2, §9.3, the "client's one rule" note in §4's policy table area, and
acceptance criteria 9/10/12 — superseded text quoted at every site. (Criterion 12 still said
"selection `draft`" from before S172 — stale, flagged and corrected in the same pass.)

**The model as built:**

- **Company assembles, nothing chosen.** The sheet's per-option `chosen` checkbox is REMOVED
  (`opt-chosen` gone; `setChosenOptions` deleted from `selections-client.ts` with a tombstone
  comment). `is_chosen` renders read-only: green card border + a "Client's choice" badge
  (`opt-client-choice`).
- **Offer gate inverted.** `offerSelection` requires *a priced option to exist* (service-role
  check), computes nothing, stamps nothing — `offered_*` stays NULL, which the
  `offered_stamps_together` CHECK makes legal. The lifecycle panel's gate and hint match ("Add at
  least one priced option to send to the client."). The `mode === 'discussion'` arm of the old UI
  gate is dropped: the service had always refused it (no chosen options), so the button it enabled
  was a lie.
- **The signature is the pricing moment.** `computeOfferedFigures` → `computeChosenFigures`, run
  by `completeSelectionSignature` over the client's picks; `allow_multiple` enforced there (one-of
  vs several-of); refuses with nothing picked. `signed_*`, the consent text and the snapshot's
  figures (key renamed `offered` → `agreed`) all come from that ONE computation, so the stated and
  stamped figures cannot diverge. `offered_*` no longer receives writes anywhere; the price block
  renders `signed_*` (with an `offered_*` fallback for pre-S173 rows).
- **Denied carries no figures now** — the record of a refusal is the declined session and its
  note. The S172 "stamps KEPT" wording is superseded in the spec, quoted.
- **What did NOT change:** `signed_variance` semantics, the stamps' constraint shape, the definer
  image read, denied-as-a-resting-state, Q7-within-a-selection. No migration.

## Job 3 — batch release, one signature per selection

- `releaseSelections()` + `POST /api/selections/release` (zod body, ≤50 ids): loops the single
  release, deliberately NOT transactional — a refusal on one selection must not un-release the
  others; per-id results return.
- Tab UI: checkbox per draft/in-discussion row (managers), one "Release N selections to the
  client" button; refusals listed by name (`selections-release-errors`) and those rows stay ticked.
- The one-signature-per-selection ruling and the cross-allowance rationale are recorded in spec
  §1.3 R-S173-2 (it RESOLVES the cross-allowance question: no instrument spans allowance lines).
- The portal page stays the S168 dead route — §9.3 now fully specifies stage 7 (green-box picking,
  totals above the signature, per-selection signatures, partial batches) without building it.

### Test sweep (the S157 rule — Job 2 overturns the `chosen` gate)

Grepped `is_chosen`, `offered_*`, `setChosenOptions`, `opt-chosen` across `test/`, `e2e/`, `app/`:
the only encoders were `s171-selections-lifecycle.live.ts` and `desktop-selections.spec.ts`.
Both INVERTED, superseded assertions quoted in place:

- `s171-selections-lifecycle.live.ts`: fixture assembles UNCHOSEN; A0 (new) offer-gate refusal
  without a priced option; A1 figures-not-computable before the client picks; A3 release stamps
  NOTHING (was: `offered_* STAMPED … 6300`); A4 cost-edit-after-release writes no stamp; A5 (new)
  client picks (admin stand-in for stage 7) → Q7 figures 6300; B1b (new) sign refused with nothing
  picked; B2 `signed_*` computed at signature, `offered_*` still NULL (was: `signed_* = offered_*`),
  snapshot `agreed`; D1 denial keeps NO stamps (was: "stamps KEPT … 6300"); E3 + single-choice
  refusal; E4 (new) partial batch via `releaseSelections`. **34/34 passed** against live.
- `desktop-selections.spec.ts`: new probe — `opt-chosen` has count 0 and the badge renders (the
  affordance-removal guard); stage-4 offer asserts "Released to the client" and NO price block
  (was: price block $5,040 after offer); S172 denial test rewritten stampless; new Job 3 test —
  two selections released together from the tab, both awaiting, checkboxes gone. **13/13 passed**
  (two post-action assertions got explicit 15s timeouts — dev-server first-hit compilation
  outlasted the 5s default; each test passes in isolation without load).
- `s171-selections-tables.live.ts` E2 (stamps-travel-together constraint) untouched — the
  constraint is unchanged and all-null is the shape the new model writes.

### Battery (Jobs 2+3, targeted)

- `tsc --noEmit`: exit 0. `next lint`: exit 0, clean.
- `vitest --config test/live.vitest.config.ts s171-selections-lifecycle`: **34 passed**, exit 0.
- `playwright test desktop-selections`: **13 passed**, exit 0.
