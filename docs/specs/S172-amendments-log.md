# S172 — Two amendments to stage 4 (denied resting state; option-image definer read)

**Branch:** `feature/s172-selections-amendments` off `main` @ `12084ec`. rebuild-test only. Not pushed.

## Build — ✅

- **Migration `20261028000000_selections_denied_and_image_read.sql`** (pushed, exit 0): `'denied'`
  added to `selections_status_check`; `selection_option_images(uuid)` SECURITY DEFINER, restating the
  staff and client arms verbatim (RLS does not run inside a definer), `EXECUTE` to `authenticated`.
- **Service:** `declineSelection` → `denied` with offered stamps **kept**; new `reopenSelection`
  (denied → draft, stamps cleared, declined session retained, RLS-gated); withdraw unchanged
  (→ draft). `signSelectionOptionImages()` — RPC under the caller, signing with the admin storage
  client. **Stage 3's `client_visible` flipping removed** from `intakeImage` and the link-thumbnail
  route — the general mechanism is untouched.
- **Routes:** `/api/selections/[id]/reopen`, `/api/selections/[id]/images`.
- **UI:** Denied pill (tab, `/m`), sheet shows "Denied by the client" + what was refused + **Reopen**;
  no re-offer without reopening; all option thumbnails (tab and sheet) now come from the definer read.
- **Spec §6.1 and §4 amended** with the superseded text quoted and the flag-vs-definer reasoning.

## Proof

- `s171-selections-lifecycle.live.ts` — **30/30 twice** (18 + D1 **inverted** + D1b/D1c + S172-B ×9).
  **D1b:** a denied selection stays denied, the client still sees it, re-offer is refused. **D1c:** a
  sub cannot reopen; the PM can; the declined session survives. **S172-B1/B2 — the pair that proves
  the ruling:** the LINKED client **cannot** read a PM-uploaded `client_visible = false` file row
  directly, **yet the definer read hands her its path and a signed URL**; owner/PM/sub get it too;
  CONTROL gets `[]` with a working session; a draft's images are hidden from the client and not from
  staff; **B7: the file row still says `client_visible = false`** — the general mechanism untouched.
- `s171-selections-tables.live.ts` 41/41. `desktop-selections.spec.ts` **11/11** (Denied pill, refused
  figure shown, no Offer button, Reopen → Draft). type-check 0, lint 0.

## Verification battery

| # | Step | Status | Result |
|---|---|---|---|
| V0 | snapshot BEFORE | ⏳ | |
| V1 | type-check --force | ⏳ | |
| V2 | lint | ⏳ | |
| V3 | build --force | ⏳ | |
| V4 | committed vitest | ⏳ | |
| V5 | every live harness | ⏳ | |
| V6 | Playwright ×4 from `apps/web` | ⏳ | |
| V7 | migration list | ⏳ | |
| V8 | snapshot AFTER | ⏳ | |
