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

## Verification battery — all printed exit lines

| # | Step | Result |
|---|---|---|
| V0 | snapshot BEFORE | exit 0 |
| V1 | type-check --force | **exit 0**, 5/5, 0 cached |
| V2 | lint | **exit 0**, still 0 |
| V3 | build --force | **exit 0**, 0 cached, compiled |
| V4 | committed vitest | **exit 0**, 59 files, 904/904 |
| V5 | every live harness | **exit 0 COLD — 92/92 files, 1285/1285.** Third consecutive battery with no warm pass. (1285 = 1273 + 12 new in the lifecycle harness) |
| V6 | Playwright ×4 from `apps/web` | **exit 0,0,0,0 on the first pass** — 147 / 124+3sk / 157+4sk / 104+2sk = **532 passed, 9 skipped, 0 failed**, `✘` 0 |
| V7 | migration list (repo root) | **exit 0**, 135 = 135, latest `20261028000000`. (A first attempt ran from `apps/web` by my cwd drift and failed to parse — re-run from the root, as the standing rule says.) |
| V8 | snapshot AFTER | exit 0; known profile (+6 members, +3 soft-deleted COs with live 25 → 25, +3 files); named arrays identical; **0 rows in every selection table, 0 fixture files** |

## Closing — 🟢 both amendments landed and verified on `feature/s172-selections-amendments`

- **Denied is a resting state.** D1 inverted (not deleted), D1b proves it does not auto-return and
  cannot be re-offered, D1c proves reopen is company-gated and keeps the declined session.
- **Option images through the definer read.** S172-B1/B2 is the pair: the client cannot read the
  PM's `client_visible = false` file row, and the definer read hands her its path anyway; B7 proves
  the flag was never touched. Stage 3's flag-flipping is removed; the general mechanism is exactly
  as it was.
- Spec §4 and §6.1 carry the rulings with the superseded text quoted and the flag-vs-definer
  reasoning recorded.
- **Stage 5 not started.** No 7B/7D/7H file touched; nothing written to `project_budget_items`.
