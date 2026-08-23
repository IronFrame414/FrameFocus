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
