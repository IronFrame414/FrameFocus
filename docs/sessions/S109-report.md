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

## Step 2 — #160 profile ↔ member deletion agree by construction

- **Migration `20261710000000_profile_member_delete_sync.sql`**: `sync_member_deleted_from_profile()`
  (plpgsql SECURITY DEFINER, as `sync_member_display_name()`) + trigger
  `profiles_sync_member_deleted` **AFTER UPDATE OF is_deleted**. Both directions (delete and
  restore; restore clears `deleted_at`); fires only on `IS DISTINCT FROM`; `profile_id` match
  only; **`member_type = 'subcontractor'` excluded** (ruling 160.C). Then the ghost clean-up
  (ruling 160.A, a soft delete — nothing destroyed), then a `DO` block that **raises and aborts the
  migration if any ghost remains** — so on production "Jo B must be gone" is checked by the
  migration itself.
- **Back-fill proven on a real ghost.** Rebuild-test had 0 (and 0 deleted profiles — a probe that
  could not fire), so one was planted first: a throwaway signup whose profile was soft-deleted
  before the trigger existed → query A returned exactly 1 (`aaf87b06…`, crew). Pushed the migration
  (link verified, dry-run listed it alone, `PUSH_EXIT=0`) → that member row `is_deleted = true`,
  `deleted_at` copied from the profile; ghosts left **0**. Planted company, member, profile and
  auth user then removed (verified 0/0/0); the temporary planting file was never committed.
- **`test/s109-profile-member-sync.live.ts`** — every delete done **the wrong way** (a bare
  service-role UPDATE of `profiles.is_deleted`, never `softDeleteTeamMember()`):
  D delete follows · R restore follows, `deleted_at` cleared · S a profile save that does not
  change `is_deleted` leaves a member-only deactivation alone · X a profile-linked sub row is untouched.
  - **Before the migration:** `PRE_MIGRATION_EXIT=1` — D failed, _"GHOST: the member row stayed
    live after the profile was deleted"_. (R and X passed trivially there — nothing propagated.)
  - **After:** `POST_MIGRATION_EXIT=0`, 5/5.
  - **Sabotage of rule 2** — function replaced on rebuild-test with one that copies on every
    UPDATE, trigger widened to `AFTER UPDATE` → `SABOTAGE_S_EXIT=1`, S failed: _"a profile save
    undid the deactivation"_. Restored from the migration file's exact text → `RESTORED_EXIT=0`,
    5/5; live `prosrc` md5 `a31b3b1c…` (514 bytes) **equals** the file's body; `pg_get_triggerdef`
    reads `AFTER UPDATE OF is_deleted`. `npm run db:verify` → `DBVERIFY_EXIT=0`, **LEDGER CLEAN**,
    232/232, tip `20261710000000`.
- **Sweep of older tests** touching profile deletion: `s177-self-name-edit` (a self-update to
  `is_deleted` is refused — unaffected), `s138-trial-unlock` (soft-deletes a profile whose member
  row it then hard-deletes — unaffected), the rest read `is_deleted = false` only. None encodes the
  old behaviour.
- `TECH_DEBT.md`: #159 and #160 carry an S109 status line (built, open until production + merge);
  **`#1-s109` filed** — `/m/team` Inactive leaves a live login (ruling 160.B, a DEFECT).
- No app code changed in this step, so no build was run for it.
- **Production:** Josh applies `20261710000000` before the merge; its DO block aborts the migration
  if the Jo B ghost is not cleaned.

## Step 3 — #162 change your own password, no email

- **One check, shared.** `lib/auth/verify-current-password.ts` — the plain-client
  `signInWithPassword` re-verify, extracted from `transferOwnership`, which now calls it (ruling
  162.A: "reuse the transfer-ownership check"). ⚠️ **Found while extracting:** the throwaway
  session was never revoked, and supabase-js's `signOut()` **defaults to `scope: 'global'`** (read
  in `auth-js` 2.100.1, `GoTrueClient.js:3138`) — revoking it the obvious way would have signed
  the user out on every device. It uses `scope: 'local'`, and a test fails if that changes.
- **Server action** `lib/auth/change-my-password.ts` `changeMyPassword`: session required; length
  (`PASSWORD_MIN_LENGTH`, now in `lib/auth/password-policy.ts` and shared with `/reset-password`),
  confirmation and "different from current" all enforced **on the server**; then the re-verify;
  then `updateUser`. Errors log the real cause server-side.
- **One form, both surfaces:** `components/account/password-form.tsx` on `/dashboard/account` and
  `/m/account` (parity S122, beside `NameForm`). Every staff role and subcontractors reach it;
  clients are out of scope (ruling 162.B). `/m` header "Your name" → "Your account"; the Settings
  link reads "Your name and password →" (same `data-testid`; no e2e asserted the old text).
- **`/reset-password` redirect fixed:** lands on `dashboardDeniedRedirect(role) ?? '/dashboard'` —
  the helper middleware uses — instead of `/dashboard` for everyone.
- **Tests:**
  - `test/s109-change-password.live.ts` (rebuild-test, throwaway signup, the real server action) —
    `LIVE162_EXIT=0`, **6/6**: wrong current refused and password unchanged; too short and
    mismatch refused **by the server**; the caller's session survives (`refreshSession()` OK);
    new password signs in, old does not.
    - Sabotage 1 — `scope: 'global'` → `SABOTAGE_GLOBAL_EXIT=1`, K failed (and C, since the
      caller's session was gone before `updateUser`). Restored, `cmp` identical.
    - Sabotage 2 — re-verify skipped → `SABOTAGE_NOVERIFY_EXIT=1`, W failed (and the rest
      cascaded: the password had really changed). Restored, `cmp` identical.
    - Clean re-run with `s175-team-clients-off` (which drives the real `transferOwnershipAction`):
      `LIVE_EXIT=0`, 23/23. ⚠️ s175 B7 is refused BEFORE the password check, so
      transfer-ownership's password path is covered only through the shared helper's tests.
  - `test/s109-password-wiring.test.ts` (committed suite) — one shared check, scope local, same
    form on both pages, not on settings, redirect via the helper.
  - Full unit suite: `UNIT_EXIT=0`, **100 files / 1339 tests**. (One red first: my own negative
    regex matched the phrase `signOut()` in a comment; tightened to `auth.signOut()`.)
- `tsc` → `TSC_EXIT=0`. `next build` → `BUILD_EXIT=0`, compiled, 129/129.
- ⚠️ **OPEN — for Josh, not built (stop rule 2):** `/reset-password` still changes the password of
  any live session without asking for the current one. It must accept a recovery-link session
  (whose user does not know the password), and telling the two apart — for example by the JWT's
  `amr` recovery method — is a design decision, and getting it wrong would break the only
  recovery path on production. So the unlocked-phone case is closed on the Account page and still
  open at that URL. The real floor would be GoTrue's hosted "secure password change" setting, which
  is not visible from the repo.

## Step 4 — #163 the whole row opens the item: ONE shared primitive

- **`components/list-screen/row-activation.tsx`** (ruling 163.A, option 1): `rowActivation(onOpen,
  label)` returns role / tabIndex / aria-label / onClick / onKeyDown to spread onto the row a
  screen already renders; `ActivatableRow` wraps it for server-component pages (href + router).
  **The guard** `startedInInteractiveChild` — an event whose target sits inside an interactive
  descendant (`INTERACTIVE_SELECTOR`: links, buttons, inputs, selects, labels, `[draggable]`,
  ARIA widget roles, `[data-row-ignore]`) belongs to that child, for **click AND Enter/Space**.
  It owns no columns, grid, cells or data — `list-screen.tsx`'s "no generic table" stands.
- **Migrated (10 screens):**
  | screen | before | now |
  | --- | --- | --- |
  | contacts, subs | whole-row + keyboard (inline copy) | same behaviour, via the primitive |
  | projects, team members, files, changes panel | whole-row, **mouse-only** | + keyboard, announced, guarded |
  | estimates, invoices, project open-items | **text-only** link | whole row; title link → plain text |
  | catalog | no record target | row opens **Edit** for a manager (163.B); inert for others |
  Left alone: **expenses** inert (163.B); daily logs (already a whole-card `<Link>`);
  `portal-selections-ui.tsx` (a `<label>` that picks an option — Phase 1 correction); the
  **line-items card** (opens nothing; no click handler, asserted).
  Not ruled, so not changed: catalog's vendor `product_url` link stays on the name, so a click on
  the name opens the vendor page and a click elsewhere in the row opens Edit.
- **Tests:**
  - `test/s109-row-activation.test.tsx` (committed suite, node — ruling 163.C, no jsdom): the
    guard's decision against DOM-shaped stand-ins (`closest`/`contains`), including the icon inside
    a button and the drag handle; the handlers for click **and** keys (Enter on a child is NOT
    preventDefault'ed, so the child still activates); the selector's required entries (the
    stand-in trusts the selector, so the selector is asserted); trap-3 markup; every adopter
    routes through the primitive and none keeps a bare row `onClick={() => router.push`; expenses
    and the line-items card stay without one. 21/21.
  - Older tests inverted, not deleted: `s159-subs-sheet.test.tsx` asserted the inline
    `onClick={() => setOpenId(` and an inline Enter/Space match — superseded text quoted in place,
    now asserts both lists use the primitive. `s158` markup asserts unchanged and green.
  - `e2e/desktop-row-activation-s109.spec.ts` (own draft estimate, 2 lines, torn down):
    T3 focus+Enter opens · T3 a click on a formerly dead cell opens · T1 Clone owns its click
    **and** its Enter, URL unchanged · T2 **click** the drag handle → nothing opens, handle
    focused, ↓ writes the reorder (read back from the DB, 2 rows).
    - Sabotage 1 — guard disabled in the primitive → `SABOTAGE_GUARD_EXIT=1`, T1 failed.
      Restored, `cmp` identical.
    - Sabotage 2 — a card-level `onClick` added to the line card → `SABOTAGE_CARD_EXIT=1`, T2
      failed: _"clicking the handle navigated"_. Restored, `cmp` identical.
    - Clean: `E2E_CLEAN_EXIT=0`, 4/4.
  - Regression: every desktop spec that drives a migrated screen — dashboard-guard, confirms, lists,
    payload, selections, team, chat-panel — `E2E_AFFECTED_EXIT=0`, **53 passed**.
    `desktop-line-items-s108`: red once on its first run (30 s timeout on the cold dev-compile of
    the estimate page — the CLAUDE.md dev-timing trap), `E2E108_EXIT=0` warm, 8.0 s. Items tab
    unchanged.
  - Full unit suite `UNIT_EXIT=0`, 101 files / 1360 tests. `tsc` 0.
- Dev server started via `scripts/e2e-preflight.sh`, stopped by PID before the build.
  `next build` → `BUILD_EXIT=0`, 129/129. Its two lint warnings (`m/capture/capture-screen.tsx`,
  `components/public/site-header.tsx`) are pre-existing — present in Step 1's build log too.
- `TECH_DEBT.md`: #163 status line. **#13's stale open line struck** — it was CLOSED in
  `TECH_DEBT_CLOSED.md:42` but still listed open under UX Polish.

## Step 5 — #161 files open in a sheet; the Estimate Files 300 s expiry

- **The reusable modal** (ruling 161.A) — `components/sheet/modal-sheet.tsx`: portal, `role=dialog`
  + `aria-modal` + labelled title, Escape and scrim close, **focus moved in, trapped, and restored
  on close**, page scroll locked; full-screen on a phone, inset panel from `sm`. Owns no content.
- **The file sheet on it** — `components/files/file-sheet.tsx`: `FileSheetProvider` mounted in
  the dashboard layout (wrapping the whole shell, so the chat panel is inside) **and** the /m layout;
  `useFileSheet()` → `openFile({ fileName, mimeType, resolveUrl })`. Takes a RESOLVER and signs on
  open. Views by kind (`lib/files/file-view.ts`, pure): PDF = every page via pdf.js, lazily
  (`components/files/pdf-pages.tsx`; same dynamic `legacy` import as the box editor); image; HEIC
  tried, then no-preview if it will not decode; video/audio; **anything else → no-preview panel
  with the same actions** (FILL-161.2). Actions are real `<a>`s over a URL the sheet already holds
  (no post-`await` `window.open`): **Open in new tab**, **Download** (`withDownload`),
  **Print** (same-origin blob → hidden iframe; on iOS, a new tab for the share sheet — FILL-161.3,
  unverified on a device). Expiry (FILL-161.4): a failed load re-signs once silently, then shows
  "could not be displayed — Reload"; the actions' URL is refreshed before the 7200 s TTL.
- **Migrated (ruling 161.B scope):** desktop Files tab row · `/m` files (the S97 "no in-app viewer"
  cut **superseded in place, quoted**; the 403/500 distinction kept) · estimate Files tab · bid
  documents · compliance COI/W-9 · chat photos (shared; a plain click opens the sheet, a modified
  click still opens a tab, the `href` stays) · the three forced-download buttons (daily log,
  incident, delivery) now **"View PDF"** → sheet, whose Download still saves under the same name.
  Invoice PDF left as a new tab (ruling 161.C).
- **161.B's addition — sign on click.** New `GET /api/estimates/[id]/files/[fileId]/url`: the same
  `resolveEstimateFileAccess()` floor, **before** the service-role client; file scoped to id +
  estimate + company (+ own-files for the recorder arm); 7200 s. The list route now signs nothing
  and no longer selects `file_path`.
- `package.json` **`predev`** copies the pdf.js worker (FILL-161.2: before this the viewer failed
  under `next dev` unless `npm run pdf:worker` had been run by hand). Seen working: the preflight
  log shows `pdf.js worker 4.10.38 -> public/pdf.worker.min.mjs`.
- **Tests:**
  - `test/s109-file-sheet.test.ts` — the pure helpers; every migrated site imports the hook and
    calls `openFile`, and none keeps `window.open(url, '_blank'` / `window.location.href`; both
    layouts mount the provider; the three buttons say View; the /m supersession is quoted; the
    list signs nothing; the invoice builder does not use the sheet.
  - `test/s109-estimate-file-url-order.test.ts` — the s107 pattern for the new route: 401 and a
    denied estimate never reach `getSupabaseAdmin`; the MIRROR does, signs at 7200, and scopes the
    lookup to id + estimate + company + not-deleted; a file not on the estimate → 404.
    Unit total: `UNIT_EXIT=0`, **103 files / 1385 tests**.
  - `e2e/desktop-file-sheet-s109.spec.ts` (own estimate + three stored files: PDF, PNG, a Word
    doc; all removed): S1 PDF opens over the tab, `role=dialog aria-modal`, URL unchanged, pdf.js
    drew page 1 (`data-pages=1`), signed by the CLICK (the `/url` request 200), new tab / download
    (`download=`) / print present · S2 the list returns 3 rows with **no `url`, no `file_path`** ·
    S3 Escape closes and **focus returns to the row** · S4 the PNG decoded (`naturalWidth > 0`) ·
    S5 the Word doc gets the no-preview panel with new tab + download and **no** print. `5/5`.
    - Sabotage 1 — list-time signing restored → `SABOTAGE_LISTSIGN_EXIT=1`, S2: _"the list signed
      a URL again"_. Restored, `cmp` identical.
    - Sabotage 2 — focus restore removed from the modal → `SABOTAGE_FOCUS_EXIT=1`, S3 failed on
      `toBeFocused`. Restored, `cmp` identical.
  - Older test inverted, not deleted: `e2e/m-details.spec.ts` M-16 was titled _"…and navigates to
    it"_ — superseded title quoted; it now also asserts the sheet is up over the list and closes.
  - Regression: file-sheet + chat-photos + row-activation + m-details → `E2E_EXIT=0`, **40
    passed**; M-16 ran (not skipped) and passed.
- `tsc` 0 (one red on the way — the hook inserted into the wrong component in two files that
  have two components; moved, green). `next build` → `BUILD_EXIT=0`, 129/129; only the two
  pre-existing warnings.
- `TECH_DEBT.md`: #161 status with the **sites NOT yet migrated listed by name** (lien releases,
  contract/lien templates, delivery photos, receipts, **the portal**, signing activity, PO PDF,
  the inline-only surfaces). Filed: **`#2-s109`** (the 300 s expiry — fixed here, closes on merge),
  **`#3-s109`** (viewing a sent invoice re-stores its PDF — defect, ruling 161.C), **`#4-s109`**
  (the `?download=` mechanisms, now five — #161 said it becomes its own entry if not collapsed).
