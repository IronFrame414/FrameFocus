# S107 — SPEC (skeleton) — burst photo capture + estimate sub-upload end to end

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. Do not re-litigate.
**FILL-n** = a hole CC measures and fills in place.
**ASK-n** = goes to Josh in Phase 2 and becomes a ruling.

⚠️ **Do not build from this file until the audit at the end passes.**

---

## How to use this file

1. **Fill every FILL by measurement** — read the file, run the query, go to the
   wire. Not from memory, not from a context file.
2. **Put every ASK to Josh in one message.** Record his answer here as RULED,
   with the alternative it beat.
3. **Then audit** — the checklist at the bottom.
4. Commit and **push** the completed spec before any build.

⚠️ **A FILL you cannot fill must say why, in one line. Do not delete the
marker.**

⚠️ **If a measurement contradicts a RULED line, STOP and report.** Do not
reconcile it yourself.

**FILL-0** — Report `main`'s tip, the current branch, and whether the tree is
clean. ⚠️ **Confirm S105b and S106 are merged to `main` and deployed** — this
build sits on top of both.

> **MEASURED.** `main` tip **`ca562dc`** (the S106 merge). Branch **`feature/s107`**,
> cut from it. Tree clean. **Both merged:** `git branch --merged main` lists
> `feature/s105b` and `feature/s106`; `ca562dc` is the `--no-ff` merge commit and
> S105b is an ancestor beneath it.
> ⚠️ **"Deployed" is NOT confirmed, and cannot be from this box.** The push
> succeeded (`662b531..ca562dc`) and the site answers **200 in ~50–150 ms**, but a
> 200 can be the PREVIOUS deployment. There is no `gh`, no Vercel CLI, no
> `VERCEL_*` token and no `.vercel` link here, so the deployment API is
> unreachable. A bundle-hash comparison is **not** valid evidence either: a local
> build has no `.env.local`, so the `NEXT_PUBLIC_*` values Vercel inlines are
> absent and the chunk hashes legitimately differ. **Josh must confirm green in
> the Vercel dashboard.**

---

## ⚠️ What makes this session different

**Part A cannot be verified by CC.** Burst capture is camera behaviour on a
phone; a Codespace cannot test it. **RULED [Josh]: CC builds it, Josh tests it
in the field.**

Two consequences, both ruled:

1. ⚠️ **It merges and deploys BEFORE it is verified.** Josh is the only user of
   the mobile/field side today, so the blast radius is his own retaken photos.
   That is what makes shipping-unverified acceptable here, and it stops being
   true the moment a crew is on it.
2. ⚠️ **With no test behind it, VISIBILITY is the safety net.** A failure the
   user cannot see is a photo that silently does not exist. Every failure path
   must surface on the phone, not in a log line.

**Part B is the opposite: it must work end to end before it is done.** ⚠️ **RULED
[Josh]: a real bid request to a real subcontractor, who uploads a real file, and
it lands.** Route-exists-and-page-renders is not done.

---

# PART A — burst photo capture

## What already shipped (S105b, on `feature/s105b`)

- ⚠️ **The clock→job wiring EXISTS.** `projectInContext()` gained the open clock
  segment as a **third** project source, precedence **URL path > `?project=` >
  clock > null**, with 7 unit tests. **Do not rebuild it — verify it.**
- The weak-signal auto-queue fix.
- ⚠️ **The multi-shot UI was DEFERRED** as device-dependent. **That is this
  part.**

## RULED

- **Take several photos back to back.** ⚠️ **10–15 in a run is not uncommon** —
  design for that, not for three.
- **Auto-save to the clocked-in job.**
- ⚠️ **ALL photos in a burst land in the SAME project. One project per BATCH, not
  per photo.** The project is resolved once for the batch — a user who clocks
  into a different job mid-batch does not split the photos.
- ⚠️ **ASK-A.1 is RULED [Josh]: approved.** Multi-shot replaces the single-slot
  `PendingShot`. **State what is lost from the prior ruling and record it** — the
  single slot was deliberate and tied to §7a.
- **If not clocked in, the job picker appears ONCE, when the batch is DONE.**
- **If the user dismisses that picker, the shots stay HELD** with a visible
  "needs a project" state. Nothing inserts until a job is chosen. ⚠️ **Nothing
  lost, nothing illegal sent** — a field INSERT without a `project_id` is refused
  by RLS (§7a).
- **A failed photo SURFACES and the batch PROCEEDS.** ⚠️ **Per-photo status.
  Photos 1–3 and 5–7 continue; photo 4 is held with a retry.** It does not block
  the batch and it does not drop silently.

## ⚠️ The things that make this hard, all measured previously

- ⚠️ **The offline queue EXISTS and capture already uses it** — the handoff claim
  that there is none was false. **The real gap is narrower and worse: it fires on
  `!navigator.onLine`, so a jobsite with one bar reads as ONLINE and fails, on an
  unhandled rejection path.** ⚠️ **That is the single most likely field failure
  and it is exactly the case Josh will hit.**
- ⚠️ **`capture` IS set at five sites**, including the burst entry point — the
  handoff claim that none set it was also false.
- **The single-slot `PendingShot` is deliberate**, tied to the §7a invariant.
  ⚠️ **Multi-shot replaces it. That is a ruling change to a ruled subsystem** —
  see ASK-A.1.

## What CC measures

**FILL-A.1** — ⚠️ **Read `docs/sessions/debt-split-ux-log.md` §2.5** and the
S105b report's item 7 section. Summarise what is already decided. **If either
contradicts a RULED line above, that is a STOP.**

> **MEASURED. No contradiction with any RULED line.** §2.5 decides four things and
> this build follows all four:
> 1. **The constraint is the single-slot store + the confirm-and-return nav**, not
>    the input and not the service. `capture-store.tsx` holds ONE `PendingShot`
>    and each `hold()` overwrites; `capture-screen.tsx` is a terminal
>    "saved / take another" card. **Burst = replace the slot with a LIST and
>    accumulate WITHOUT navigating.**
> 2. **`uploadFile()` is single-file with no loop — the caller loops N times**,
>    and its `id?` option gives an idempotent UPSERT replay, which is the
>    per-photo retry mechanism.
> 3. ⚠️ **Route burst shots through the existing `offline-sync` queue, NOT bare
>    `uploadFile`** — the queue is idempotent and auto-retries; the bare online
>    path has no retry. This is #118's batch-failure requirement.
> 4. ⚠️ **Parity: batch/retry logic belongs in `lib/`, not `app/m/`.** Capture is
>    mobile-only *presentation* over a shared mechanism.
>
> **One line in §2.5 is now STALE, and it is chronology rather than conflict:**
> its CORRECTION that _"the clock→job routing DOES NOT feed capture today"_ was
> true when written and was **fixed by S105b item 7** — which is why this spec
> lists the wiring under "what already shipped". Its other CORRECTION
> (`capture="environment"` is already set) still holds — see FILL-A.7.

**FILL-A.2** — `PendingShot` as it stands after S105b: the type, where it lives,
and exactly what changes to hold N shots instead of one.

> **MEASURED.** `apps/web/app/m/capture-store.tsx:33-38`:
> `interface PendingShot { file: File; projectId: string | null; takenAt: string }`.
> Held in a React **context + `useState`** (`CaptureStoreProvider`, `:53`), API
> `{ pending: PendingShot | null; hold(file, projectId); clear() }`. `hold()`
> **overwrites** — that is the single slot.
>
> **What changes to hold N:** `pending` becomes `PendingShot[]`; `hold()` appends
> instead of replacing; `clear()` gains a per-shot form (`remove(id)`) because a
> batch settles one photo at a time. Each shot needs an **`id`** it does not have
> today — both as a React key and as `uploadFile`'s idempotency id, so a retry
> cannot double-insert. It also needs a **per-shot status**
> (`held | uploading | queued | failed`) to satisfy the ruled "photo 4 is held
> with a retry while 1–3 and 5–7 continue".
> ⚠️ **`projectId` moves OFF the shot and onto the BATCH** — the ruling is one
> project per batch, and leaving it per-shot is precisely the representation that
> would let a mid-batch clock change split the photos.

**FILL-A.3** — ⚠️ **The `!navigator.onLine` path, precisely.** What throws, where
the rejection goes unhandled, and what the user sees today. **State the fix and
how a weak-signal failure becomes visible rather than silent.**

> ## ⚠️ MEASURED — THE SPEC'S PREMISE IS STALE, AND THE REAL GAP IS A DIFFERENT PATH
>
> _Superseded text, quoted rather than rewritten:_ _"it fires on
> `!navigator.onLine`, so a jobsite with one bar reads as ONLINE and fails, on an
> unhandled rejection path."_
>
> **The weak-signal case is already handled, and this spec says so itself two
> bullets earlier** ("The weak-signal auto-queue fix" under what S105b shipped).
> The two statements contradict each other; the code settles it.
> `capture-screen.tsx:99-108` (ASK-7.B, S105b): when `uploadFile` fails **for any
> reason** — `navigator.onLine` true or false — it calls the SAME
> `queueForLater()` and the shot is queued, not stranded. `navigator.onLine` is
> only consulted to try the queue FIRST; it is not what decides whether a failure
> is recoverable.
>
> **And the failure resolves, it does not throw. MEASURED, not assumed** — the app's
> own `@supabase/supabase-js` 2.100.1 against an unreachable host:
> ```
> RESOLVED  error: StorageUnknownError / fetch failed
> PostgREST RESOLVED error: TypeError: fetch failed
> ```
> Both **resolve with `{ error }`**. `handleOperation` rethrows only a
> non-`StorageError`, and a dead network is wrapped into `StorageUnknownError`. So
> `uploadFile` returns `{success:false}` and the fallback runs. `convertHeicToJpeg`
> is separately wrapped in its own try/catch (`files-client.ts:50-67`).
>
> ### The unhandled rejection is REAL, but it is in the QUEUE WRITE
>
> `queueForLater()` → `offlineSync.enqueue()` → `getQueue().enqueue()` →
> `idb-storage.ts`, which contains **zero `try {`** (measured: `grep -c` = 0). An
> IndexedDB failure — **quota exceeded**, Safari private mode, storage denied —
> propagates out of `enqueue`, out of `submit`, and into `void submit(...)`
> (`capture-screen.tsx:126`, `:229`). Nothing catches it.
>
> **What the user sees today: the "Saving…" spinner forever.** `setBusy(false)`
> never runs, `setError` never runs, no toast, nothing in the UI. The photo is
> lost the moment they navigate away. ⚠️ **This is the "storage full" row of
> FILL-A.8 and it is currently invisible by construction** — and multi-shot makes
> it far more likely, because 10–15 photos is when a quota is actually reached.
>
> **The fix:** wrap the queue write, surface the failure per-shot, and keep the
> shot HELD rather than clearing it. `capture?.clear()` must never run on a path
> that did not persist the photo somewhere.

**FILL-A.4** — ⚠️ **Verify the clock→job routing works.** Do not rebuild it. Say
how you verified — a test passing on zero rows is not verification; state the row
count.

> **MEASURED — HALF of it is verified, and the half that touches the database is
> verified by nothing.**
>
> - **The precedence RULE: verified.** `s105b-capture-project-precedence.test.ts`
>   + `m6m-capture.test.ts` — **2 files, 16 tests, all passing** (`VITEST_EXIT: 0`),
>   7 of them over `projectInContext`/`resolveCaptureProjectId` including the full
>   chain URL > `?project=` > clock > null. These are **pure functions**, so a row
>   count is not applicable and their passing is real verification.
> - ⚠️ **The clock READ: NOT verified. Zero tests, zero rows.**
>   `getOpenClockProjectId()` (`time-tracking-client.ts:686`) queries
>   `time_clock_sessions` joined to `time_segments` and picks the open segment.
>   Grepping `apps/web/test/*.live.ts` and `apps/web/e2e/*.spec.ts` finds **no
>   test that calls it**. So "clocked in → shot files to that job" has never been
>   executed against a real session row by anything.
>
> **This corrects the spec's "verify it" instruction into two halves:** the pure
> half is done; the database half needs a live test (cheap — clock a QA member in
> against a project, assert the function returns that project id, assert null when
> clocked out) or Josh's field check. ⚠️ Note `getOpenClockProjectId` uses
> `.maybeSingle()` on `clock_out IS NULL` with no ordering — safe only while at
> most one session is open per member, which `s123-still-clocked-in` implies but
> this query does not enforce.

**FILL-A.5** — What the capture flow does at 15 shots: memory held client-side,
upload concurrency, and whether the UI stays responsive. ⚠️ **A 15-shot batch of
phone photos is roughly 10 MB per shot before compression.** State the ceiling
and what happens past it.

> **MEASURED, and the 10 MB figure needs qualifying — see FILL-X.0.**
>
> - **Holding is cheap; decoding is not.** A `File` is a handle to bytes the
>   browser already has on disk, not a JS-heap copy. 15 held `File` refs cost
>   almost nothing. **The spike is HEIC→JPEG conversion** (`convertHeicToJpeg`,
>   `files-client.ts:50`), which decodes to a full uncompressed bitmap: a 12 MP
>   frame is **~48 MB of RGBA** while decoding, regardless of the 10 MB on disk.
>   ⚠️ **Concurrency is therefore the ceiling, not batch size.** Two or three
>   concurrent HEIC conversions on an older iPhone is the realistic limit; 15 is
>   an out-of-memory tab reload — which on iOS looks exactly like the app closing
>   and takes every held shot with it (FILL-A.6).
> - **Concurrency today: one, by construction.** There is one slot, so there is
>   one upload. Multi-shot must CHOOSE a concurrency; nothing in the code implies
>   one. → **ASK-A.3.**
> - **Responsiveness:** `uploadFile` is `async` and the network waits are fine,
>   but `heic2any` decoding runs **on the main thread** (dynamic `import`, no
>   worker), so each conversion janks the UI for its duration. Serial conversion
>   keeps the app usable; parallel does not.
> - **Per-file ceiling that already exists:** `MAX_FILE_SIZE_BYTES` is checked in
>   `uploadFile` against the **original** bytes and returns a clean
>   `{success:false}` — so an oversized shot fails visibly per-photo and the batch
>   can continue. **There is no batch-level ceiling of any kind today.**

**FILL-A.6** — Where held shots live, and ⚠️ **whether they survive the app being
backgrounded or closed.** A jobsite user closes the app. If held shots are in
memory only, a dismissed picker plus a backgrounded app loses them — which
contradicts the "nothing lost" ruling. **Report this even if the answer is
uncomfortable.**

> ## ⚠️ MEASURED — THEY DO NOT SURVIVE. THE "NOTHING LOST" RULING IS NOT MET TODAY.
>
> Held shots live in **`useState` inside a React context provider**
> (`capture-store.tsx:53`). That is **memory only** — not IndexedDB, not the
> offline queue, not `sessionStorage`. A reload, a tab discard, or iOS evicting a
> backgrounded PWA loses every held shot with no trace and no message.
>
> **This is deliberate and documented**, and the reasoning is sound —
> `capture-store.tsx:24-32`, quoted:
> _"A photo only enters the queue once it HAS a project (§5.2, and
> `buildPhotoEntry` requires `projectId`). A reload before choosing loses the
> shot, and that is the honest behaviour: the alternative is a persisted blob
> nothing can ever legally insert, which would sit in storage looking like a
> queued item that never syncs."_
>
> ⚠️ **So this is not a bug to fix quietly — it is a collision between two ruled
> positions.** §7a says a field user's `files` INSERT without a `project_id` is
> refused by RLS, so a project-less photo cannot be queued. The S107 ruling says a
> dismissed picker leaves shots HELD and **nothing is lost**. Both cannot hold
> while "held" means "in a React state variable".
>
> ⚠️ **And multi-shot makes it materially worse, not equally bad.** One lost shot
> was one retake. **Fifteen lost shots is a lost site visit** — and the batch
> ruling means the picker appears once, at the END, so the entire batch is exposed
> for the whole run rather than one photo at a time.
>
> **→ ASK-A.2 must be ruled before Part A is built (stop rule 6, audit item 4).**
> The options are set out there; the measurement is that persistence does not
> exist today in any form.

**FILL-A.7** — The five `capture` sites, and which one the burst flow uses.

> **MEASURED — exactly five, and the count is right.** (`grep -rn 'capture='`
> returns eight hits; three are a prose comment at `mobile-shell.tsx:557` and two
> e2e references, leaving five real attributes.)
>
> | # | Site | Flow |
> | - | ---- | ---- |
> | 1 | `app/m/mobile-shell.tsx:575` | ⚠️ **the tab-bar camera — THE BURST ENTRY POINT** |
> | 2 | `app/m/logs/new/log-form.tsx:359` | daily log photo |
> | 3 | `app/m/p/[projectId]/punch/[itemId]/punch-actions.tsx:170` | punch item photo |
> | 4 | `app/m/p/[projectId]/safety/new/incident-form.tsx:328` | incident photo |
> | 5 | `app/m/p/[projectId]/deliveries/check-in/check-in-form.tsx:336` | delivery check-in |
>
> **The burst flow uses #1**, whose handler is `onShot` (`mobile-shell.tsx:328`).
> Beside it in the same flex slot is the **library** input
> (`m-camera-library-input`, `:588`) — the same `onShot`, deliberately WITHOUT
> `capture`, which is §6's "switch to the photo library" control.
>
> ⚠️ **`onShot` reads `e.target.files?.[0]` — ONE file — and then
> `router.push('/m/capture')`.** Both halves are what burst has to change: the
> library input can take `multiple` (there is precedent at
> `selection-sheet.tsx:493`), but **the camera input cannot usefully** — see
> ASK-A.4, the mechanism this spec assumes and does not state.

**FILL-A.8** — ⚠️ **What Josh will see in the field for each failure mode:** one
photo fails, all fail, signal drops mid-batch, app backgrounded mid-batch,
storage full. **A table.** This is the deliverable that replaces test coverage.

> ## THE FAILURE TABLE — what is on the phone, for each mode
>
> ⚠️ **This is the contract for Part A, because nothing else checks it.** Each row
> is written against the design as RULED (persisted held store, serial conversion,
> per-shot status, cap 25). **"Nothing" in the right-hand column is a defect, not a
> quiet success.** The BEFORE column is what happens today, so the field test can
> tell a fix from a coincidence.
>
> | Mode | Today (single-slot) | ⚠️ After this build — what Josh SEES |
> | ---- | ------------------- | ------------------------------------ |
> | **One photo fails** (4 of 7) | N/A — one shot at a time | Shot 4 in the tray turns **`Failed`** with a **Retry** on that row. 1–3 and 5–7 finish and turn `Added`/`Queued`. **The batch is never blocked.** Tray header reads e.g. **"6 added · 1 failed".** |
> | **All fail** | one error line under the picker | Every row shows `Failed`, each with Retry, plus **one summary line: "0 of 7 added."** ⚠️ **No shot is cleared** — all 7 stay in the held store and survive a close. |
> | **Signal drops mid-batch** | the shot is queued and the confirmation says so | Rows already sent stay `Added`; the rest turn **`Queued — will upload when you're back online`**, which is the existing offline-sync path (idempotent by `uploadFile`'s `id`, so a replay cannot double-insert). ⚠️ **The word "Queued" must appear per shot**, not once for the batch — a single banner over a mixed batch is the misreport this row exists to prevent. |
> | **App backgrounded mid-batch** | ⛔ **every held shot is silently lost** (memory-only `useState`) | ⚠️ **The tray is still there on reopen**, restored from the held IndexedDB store, with each shot's status intact and a **"N photos waiting for a project"** indicator. **This is the row ASK-A.2 was ruled to fix**, and it is the single most important line in the table. |
> | **Storage full** (IndexedDB quota) | ⛔ **the "Saving…" spinner stays up forever** — the rejection is unhandled (`idb-storage.ts`, zero try/catch), no error, nothing on screen, photo lost on navigation | The write is caught. The shot shows **`Couldn't save to this device — storage full`** with Retry, **the shot stays held**, and the spinner clears. ⚠️ **The old behaviour is invisible by construction and multi-shot makes it likely** — 10–15 photos is when a quota is actually reached. |
> | **Tray at capacity (25)** | N/A | The camera refuses the 26th with **"Tray full — file or discard these first."** ⚠️ **Never evicts an older shot** [RULED A.2 cleanup rule]. |
> | **A shot nears its 7-day TTL** | N/A | An age warning on the row before the sweep can ever remove it. ⚠️ **Nothing expires that was not visible first.** |

## ASK

**ASK-A.1 is RULED above** — approved, one project per batch. Not an open
question. **You still owe the record of what the prior ruling lost.**

> ## THE RECORD OWED — what the single-slot ruling bought, and what multi-shot gives up
>
> The single slot was not a simplification; it was an **invariant carrier**.
> `capture-store.tsx:24-32` states its purpose: a photo is held in memory and
> **never persisted** precisely because §7a means a project-less `files` INSERT is
> refused by RLS, so _"the alternative is a persisted blob nothing can ever legally
> insert, which would sit in storage looking like a queued item that never syncs."_
>
> **What the single slot bought, and what is now lost:**
>
> | Bought | Lost to multi-shot |
> | ------ | ------------------ |
> | **At most one photo can ever be in limbo.** A lost shot = one retake. | **A whole batch can be in limbo.** 15 lost shots = a lost site visit. |
> | **No queue-vs-store ambiguity** — one photo, one destination. | Per-shot state (`held`/`uploading`/`queued`/`failed`) must now be modelled and rendered, or "photo 4 failed" is invisible. |
> | **`clear()` is unambiguous** — the shot is settled, drop it. | `clear()` must become per-shot; a batch-wide clear on a partial failure **destroys shots that never landed**. |
> | **The picker's blast radius is one photo.** | The picker now gates the whole batch, and it appears **once, at the end** — so every shot is exposed for the entire run. |
> | **No ordering or concurrency question exists.** | Both must be decided (ASK-A.3). |
>
> ⚠️ **The invariant itself is NOT lost and must not be** — nothing may insert
> without a project, and nothing may be persisted that cannot legally insert. What
> is lost is the *cheapness* of honouring it. That is exactly why FILL-A.6 turns
> into a ruling (ASK-A.2) rather than an implementation detail.

**ASK-A.2** — On FILL-A.6: if held shots do **not** survive backgrounding, does
the build add persistence, or does the picker become non-dismissible while shots
are pending?

**ASK-A.3** — On FILL-A.5: the ceiling on a single batch, if one is needed.

**ASK-A.4 — NEW, and the build cannot start without it.** ⚠️ **The spec assumes a
burst mechanism and never states one, and the platform does not give it for
free.** `onShot` reads `files?.[0]` from an input carrying
`capture="environment"`. A camera-capture input returns **one** photo per
shutter session and `multiple` does not change that — so "10–15 back to back"
requires **re-invoking the camera N times**. Three shapes, and they are different
products:
  A) **Auto-reopen** — after each shot the app immediately re-triggers the input,
     so the camera feels continuous; the user exits with a "Done" control.
  B) **Manual re-tap** — shots accumulate in a visible tray and the user taps the
     camera button again for each one.
  C) **Library multi-select** — add `multiple` to the *library* input (precedent:
     `selection-sheet.tsx:493`) and let the phone's own camera app take the burst
     natively, then select them all at once.
⚠️ **(C) is the only one that gets a true native burst**, but it means the shots
are taken outside the app. (A) is closest to the ruling's words and is the most
fragile on iOS — a programmatic `.click()` on a file input without a user gesture
is blocked in some Safari versions.

---

# PART B — the sub-upload path, end to end

## What already shipped (S106 Part C, on `feature/s106`)

- `/api/estimates/[id]/files` — GET lists, POST uploads. ⚠️ **Session read before
  the service-role client in both handlers; 404 not 403 so there is no existence
  oracle.** Edit rights on POST (owner/admin any draft, PM own draft). 25 MB,
  PDF/JPEG/PNG/HEIC enforced in the route. Orphan blob cleaned on insert failure.
- The estimate Files tab.
- The anonymous sub-upload route and signed URLs.
- `s106-estimate-files-route-floor.live.ts` — a real live test with non-vacuous
  guards (29 estimates, 4 contracts).
- On production: `files.estimate_id`, the three-arm CHECK VALID, and the
  conversion re-point.

## RULED

- ⚠️ **Done means a real bid request goes to a real subcontractor, the sub
  uploads a real file through the link, and it lands on the estimate's files.**
  Route-exists-and-page-renders is not done.
- **The sub receives an EMAIL SUMMARY plus a LINK.** Not the detail in the email.
- ⚠️ **The sub sees NO money** — scope, files, and their own bid form. Never
  totals, never margin. **The page is anonymous; anything it renders is public to
  whoever holds the link.**

  > ### ⚠️ AMENDED [Josh, S107 Q2] — "NO money" means TOTALS, MARGIN and COST. Not every dollar figure.
  >
  > _Superseded reading, quoted rather than rewritten:_ the line above taken
  > literally, i.e. **no dollar figure of any kind** on the anonymous page.
  >
  > **`allowance_amount` is an EXPLICIT, PERMANENT EXCEPTION.** It is carried in
  > the token payload (`get_sub_bid_request`) and rendered as **"Allowance carried
  > $X"** (`bid-reply-client.tsx:190`). Josh: _"The allowance is your own figure,
  > deliberately disclosed, and telling a sub what you're carrying is normal."_
  >
  > ⚠️ **RECORDED SO A FUTURE SESSION DOES NOT STRIP IT AS A FLOOR VIOLATION.**
  > An audit that greps the anonymous page for money **will** find this and it is
  > **not** a defect. It beat: (B) remove it from payload and page, and (C) keep it
  > but gate it behind a per-request opt-in with a warning.
  >
  > **What stays forbidden, unchanged:** estimate `grand_total`/`subtotal`, line
  > `total_price`, markup, margin, any cost figure, and **any other
  > subcontractor's bid**. FILL-B.4 verified all of those are absent from the
  > 21-key payload.
- **Token lifetime = the bid request's own expiry. A re-send REUSES the token**,
  so a link in flight never dies mid-upload.
- **Sub uploads are visible to the authoring PM**, who needs them to evaluate the
  bid.
- **Uploads carry to project files on conversion** — shipped as
  `20261550000000`, on production.

## ⚠️ PREREQUISITE — email is currently DISABLED

**RULED [Josh, ASK-B.1]:** re-enabling email is a **prerequisite for Part B, not
a side task.**

**FILL-B.0** — ⚠️ **What disabled email, where, and what re-enabling touches.**
Report this in Phase 2, **before any real send.** This repo has a history with
email delivery — a diagnosis log, a DMARC entry, and a `CRON_SECRET` that turned
out to hold a Resend key. FILL-B.7 still applies on top of this.

> ## ⚠️ MEASURED — NOTHING "DISABLED" IT. IT WAS NEVER ENABLED OUTSIDE PRODUCTION.
>
> _The spec's framing, quoted rather than rewritten:_ _"Something disabled it
> deliberately; find out what before undoing it."_ **The deliberate thing is
> DEFAULT-DENY, not an off switch**, and the distinction changes what
> "re-enabling" means.
>
> **The gate** — `emailSendAllowed()`, `email-service.ts:104-117`, called at the
> single choke point `sendEmail()` **before** `getResend()`:
>
> | env | result |
> | --- | ------ |
> | `EMAIL_SEND_ENABLED=false` | nobody, anywhere — outranks production |
> | `EMAIL_SEND_ENABLED=true` | **allowed — the deliberate supervised override** |
> | neither set | allowed **only** if `VERCEL_ENV === 'production'` |
>
> A Codespace sets neither, so it lands in default-deny. Measured in this shell:
> **`EMAIL_SEND_ENABLED`, `VERCEL_ENV`, `RESEND_API_KEY` are all absent**, and
> there is no `.env.local` (only `.env.local.example`).
>
> **Why it exists** — `docs/specs/email-loop-diagnosis.md`: **423 real sends** from
> the test environment since 2026-07-14, ~368 into Josh's own inbox, up to 78/day,
> plus **52 bounces to `example.invalid`** that cost sender reputation on
> `ezcontractorbinder.com`. Cause: `sendEmail()` had no environment guard at all
> and a **live, unrestricted, all-domains** Resend key sat in the dev env — as a
> **personal Codespaces secret that "returns each rebuild"**. Two remediations
> were ruled and BOTH are in force: **option 1** = this gate; **option 2** =
> _"take the live key out of the test environment"_.
>
> ### ⚠️ SO RE-ENABLING TOUCHES TWO THINGS, AND ONLY ONE IS CHEAP
>
> 1. **`EMAIL_SEND_ENABLED=true`** in the one process doing the send. This is
>    cheap and **explicitly sanctioned** — the gate's own comment calls it "the
>    deliberate override for a supervised non-prod send". It must be set in the
>    shell, never committed, never added to `.env.local.example`.
> 2. ⚠️ **A live `RESEND_API_KEY` must be put back into this environment** — and
>    that is **exactly the condition remediation option 2 removed.** The diagnosis
>    also records that this control **"has already failed twice"** because the
>    personal Codespaces secret reappears on every rebuild. Restoring the key
>    re-arms the original incident for as long as it is present, and the battery
>    running while it is there is what caused 423 sends.
>
> **→ This is a RULING-LEVEL conflict with the Part B standard, not a config step.
> It goes to Josh first. See ASK-B.3.**

**RULED [Josh, ASK-B.1]:** there is no existing subcontractor to test with.
**Create a new one on REBUILD-TEST with email `JSBishop14@gmail.com`.** Any
rebuild-test estimate is fine.

**RULED [Josh, ASK-B.2]: build the route-floor test NOW.** Do not leave it filed.
The estimate-files route is the sole access control, service role bypasses RLS
entirely, and **nothing currently fails if a future edit moves the admin client
above the session read.** Write the test that would fail. See FILL-B.6.

## What CC measures

**FILL-B.1** — ⚠️ **What actually remains.** S106 reported Part C complete. **For
each piece — the email, the token, the anonymous page, the upload, the PM's view
of it — state: shipped and tested, shipped and untested, or not built.** Be
exact; this spec's scope is whatever is not "shipped and tested."

> **MEASURED. ⚠️ The email is NOT BUILT — this is the session's largest scope
> discovery, and it is bigger than "email is disabled".**
>
> | Piece | Status | Evidence |
> | ----- | ------ | -------- |
> | **The email to the sub** | ⚠️ **NOT BUILT — nothing exists** | No sender, no template, no route. `grep -rln "sendEmail("` across `app/` + `lib/` returns **19 files and none is a bid path**. `email_logs.email_type` CHECK has **no bid value**. `createSubBidRequest` inserts a row and returns a token; it never sends anything. |
> | **The token + its RPCs** | **shipped, untested** | `20261230000000` (table, token default), `20261240000000` (`get_sub_bid_request`, `submit_sub_bid_reply`). No test references either RPC. |
> | **The anonymous page** | **shipped, untested** | `app/bid/[token]/page.tsx` + `bid-reply-client.tsx`. No e2e, no live test. |
> | **The sub's UPLOAD** | **shipped, untested** | `app/api/bid/[token]/files/route.ts` — POST only. Nothing exercises it. |
> | **The sub DOWNLOADING the scope files** | ⚠️ **NOT BUILT** | That route exports **`POST` only** — no `GET`. The sub can attach a file but cannot see anything the PM attached, though the ruling says the sub sees "scope, **files**". |
> | **The PM's view of sub uploads** | **shipped, untested** | `GET /api/estimates/[id]/files` lists by `estimate_id`, so a sub upload appears there. Never executed against a sub-uploaded row. |
> | **Carry to project on conversion** | **shipped, on production** | `20261550000000`. |
> | **The route floor** | **shipped; the TEST does not cover the route** | See FILL-B.6. |
>
> ⚠️ **Nothing in Part B is "shipped and tested".** The scope is therefore: build
> the email, build the sub's file GET, build the route-floor test, and execute the
> whole path once for real.

**FILL-B.2** — ⚠️ **Trace the whole path and name every step**, from "PM clicks
send" to "file appears on the estimate." Every route, function, table and email
template. **Where it breaks today, if it does.**

> **MEASURED — traced end to end. It breaks at step 3, and step 3 does not exist.**
>
> | # | Step | Mechanism | State |
> | - | ---- | --------- | ----- |
> | 1 | PM opens Sub Bids and requests a bid | `bidding-tab.tsx` → `createSubBidRequest()` | ✅ |
> | 2 | Row created, token minted | INSERT `estimate_sub_bid_requests`; `token` is a **DB default**, never client-supplied | ✅ |
> | 3 | **The sub is emailed a summary + link** | — | ⛔ **DOES NOT EXIST** |
> | 4 | Sub opens `/bid/{token}` | `app/bid/[token]/page.tsx` → `admin.rpc('get_sub_bid_request')`, which also flips `sent`→`viewed` | ✅ untested |
> | 5 | Sub reads scope / message / dates | rendered from the RPC's jsonb | ✅ untested |
> | 5b | **Sub downloads the PM's scope files** | — | ⛔ **NOT BUILT — no GET** |
> | 6 | Sub attaches a file | `POST /api/bid/[token]/files` → service role → storage + `files` row (`estimate_id` set, `project_id` NULL) | ✅ untested |
> | 7 | Sub submits the bid | `submit_sub_bid_reply` → `estimate_sub_bids` row | ✅ untested |
> | 8 | PM sees the file | `GET /api/estimates/[id]/files` → Files tab | ✅ untested |
> | 9 | Converts to a project | `20261550000000` re-points `estimate_id` files | ✅ on production |
>
> ⚠️ **`bidReplyUrl()` builds the link from `window.location.origin`** — a
> browser-only value. A server-side sender cannot use it and must build the URL
> from a configured public origin, or the emailed link points nowhere.
> ⚠️ **`sent_at` is `DEFAULT now()` at INSERT** — it records "row created", not
> "email sent", and nothing updates it. The ruled "a re-send REUSES the token" has
> **no re-send path at all** to reuse it from.

**FILL-B.3** — The email itself: what template, what it says, and ⚠️ **whether it
renders any money.**

> **MEASURED: there is no template.** Nothing to inspect — see FILL-B.1. The
> question becomes a design one this spec must answer before the build, and the
> ruling already constrains it: **a SUMMARY plus a LINK, not the detail**, and
> **no money**. ⚠️ Note the summary cannot carry the allowance if "no money" is
> read strictly — and the anonymous page **does** render the allowance today
> (FILL-B.4), so the two surfaces must be ruled together, not separately.

**FILL-B.4** — ⚠️ **The anonymous page's payload, not its rendering.** `#136`'s
class: a gate controlling only rendering still ships the data. **Check the actual
network response for totals, margin, cost, or other subs' bids.**

> ## ⚠️ MEASURED STATICALLY — AND IT CONTRADICTS A RULED LINE. REPORTING, NOT RECONCILING.
>
> **The payload is a fixed allow-list, which is the right shape.**
> `get_sub_bid_request` returns a hand-built `jsonb_build_object`
> (`20261240000000:55-79`) — **23 named keys and nothing else** ⚠️ (*first written
> as 21; corrected by counting the source in the audit re-verification*). It is not
> `to_jsonb(row)`, so no column can leak by being added later. The page passes
> exactly that object to `BidReplyClient`, so the RSC payload can contain only
> those keys.
>
> **Absent, verified by enumerating all 23 keys** — `token, status, reply_mode,
> expires_at, is_expired, scope_text, message, allowance_amount, bids_due_date,
> work_starts_date, site_visit_date, company_name, subcontractor_name,
> line_item_name, estimate_name, estimate_number, submitted_at, reply_bid_amount,
> reply_labor_amount, reply_material_amount, reply_scope_coverage_percent,
> reply_exclusions, reply_holds_until` **—:** estimate `grand_total` /
> `subtotal`, line `total_price`, any markup or margin, any cost, and **any other
> subcontractor's bid**. `estimate_sub_bids` is never read by this RPC.
>
> ### ⚠️ But one money field IS in the payload and IS rendered
>
> `allowance_amount` — `20261240000000:63`, rendered at
> `bid-reply-client.tsx:190-191` as **"Allowance carried $X"**.
>
> **This contradicts the RULED line "The sub sees NO money."** It is plainly
> deliberate — a nullable per-request field with its own input, and the schema
> comments it `-- "what you carry now"` — and an allowance is neither a total nor
> a margin, which is what the ruling names. But it is a dollar figure on an
> anonymous page readable by anyone holding the link, and **audit item 9 says the
> payload carries no money.** Per this file's own instruction I am not reconciling
> it. **→ ASK-B.4.**
>
> ⚠️ **The wire check the spec demands is BLOCKED**, and the static argument does
> not replace it: rendering the page needs a dev server, which needs `.env.local`,
> which this Codespace does not have. Recorded rather than skipped.

**FILL-B.5** — Token→estimate resolution: how the token scopes to exactly one
bid request, expiry, reuse, and ⚠️ **what a leaked or guessed token reaches.**

> **MEASURED.**
> - **Generation:** `DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`
>   — 64 hex chars from **two** v4 UUIDs, ~244 bits of entropy. `NOT NULL UNIQUE`.
>   **Guessing is not a threat model**; leaking is.
> - **Scope:** `WHERE token = p_token AND is_deleted = false` → exactly one
>   `estimate_sub_bid_requests` row; everything else derives from that row's FKs.
>   One token = one request = one line item = one sub.
> - **Expiry:** `expires_at`, default **14 days**. Reads flip `sent`→`viewed`; an
>   expired read flips to `expired`. `submit_sub_bid_reply` re-checks expiry and
>   refuses `submitted`/`cancelled`/`declined`. The upload route returns **410**
>   past expiry and **404** for missing/deleted — no oracle.
> - **Reuse:** the token is stable for the row's life, so the ruled "a re-send
>   REUSES the token" is satisfied **by construction** — once a re-send exists.
> - ⚠️ **What a leaked token reaches:** the 23 payload keys (including the
>   allowance), the ability to **upload a file onto that estimate**, and the
>   ability to **submit a bid once**. It reaches **no other estimate, no other
>   request, no other sub's bid, and no money beyond the allowance.** The upload
>   arm is the sharpest edge — anyone holding the link can put a 25 MB file on the
>   estimate until it expires, with no rate limit.

**FILL-B.6** — ⚠️ **The route floor gap: nothing fails if a future edit moves the
admin client above the session read.** ⚠️ **RULED [Josh]: BUILD the test that
would fail.** Describe it here, then build it. The estimate-files route is the
sole access control and service role bypasses RLS entirely.

> ## ⚠️ MEASURED — THE GAP IS EXACT, AND THE EXISTING TEST NAMES IT ITSELF
>
> `s106-estimate-files-route-floor.live.ts` is a real test on real rows (29
> estimates, 4 contracts — ⚠️ *those two figures are recorded in a source COMMENT
> as "currently" values, not asserted; the test asserts only `> 0`*) — but its own
> header says what it does **not** cover:
> _"The Next route handler can't be invoked with a real session in vitest, so the
> floor is tested at the layer that enforces it."_ It exercises
> **`estimates_select_authenticated`** (the RLS policy) and the `estimate_id`
> scoping. It **never imports or invokes `route.ts`.**
>
> ⚠️ **So if someone moved `getSupabaseAdmin()` above the session read, or deleted
> the `if (!est) return 404`, every assertion in that file would still pass.**
> That is precisely Josh's gap.
>
> ### The test to build — assert the CALL ORDER, not the source order
>
> A vitest unit test that imports the real handlers from
> `app/api/estimates/[id]/files/route.ts` with both clients mocked:
>
> - `@/lib/supabase-server` → a session client whose `estimates` select resolves
>   **`{ data: null }`** (RLS denial — the PM-does-not-own case).
> - `@/lib/supabase-admin` → `getSupabaseAdmin` as a **`vi.fn()` spy**.
>
> Then assert, for **GET and POST both**:
> 1. the response status is **404**, and
> 2. ⚠️ **the admin spy was never called** — `expect(adminSpy).not.toHaveBeenCalled()`.
>
> **(2) is the whole point.** A status check alone still passes if the admin client
> was constructed and queried before the 404 was returned. Asserting it was never
> *reached* is what fails the moment it moves above the floor. Add the mirror case
> — session read succeeds → admin IS called — so the test cannot pass by the mock
> being broken.
>
> **Runs with no server and no `.env.local`**, which the Playwright equivalent
> would need. A browser e2e remains the complement, not the substitute.

**FILL-B.7** — ⚠️ **What Resend actually sends.** Email delivery has its own
history in this repo. State the sending domain, whether the sub's address is
verified-domain-restricted, and **whether an email to an arbitrary external
address will actually arrive.**

> ## ⚠️ SETTLED [S107, re-measured on Josh's instruction]. THE DOMAIN IS FINE. MY EARLIER TEXT OVERSTATED THE RISK.
>
> _Superseded claim, quoted rather than rewritten:_ _"Gmail weighs bounce rate, so
> a first send to a Gmail address can land in **spam** rather than fail visibly."_
> **The causal link in that sentence is false** — see the bounces below. Corrected.
>
> ### Authentication — measured live via public resolvers (8.8.8.8 / 1.1.1.1)
>
> ⚠️ *`dig`, `nslookup` and `host` are all absent from this box; the first attempt
> returned exit 127 and its empty output read as "no records exist". Re-run through
> node's resolver. **A missing tool looks exactly like a missing DNS record.***
>
> | Record | Value | Verdict |
> | ------ | ----- | ------- |
> | **DKIM** `resend._domainkey.ezcontractorbinder.com` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDUMVPv/…` | ✅ present, **on the root domain — so it ALIGNS with the `From:` domain** |
> | **SPF** `send.ezcontractorbinder.com` | `v=spf1 include:amazonses.com ~all` | ✅ present on the **envelope/bounce** domain |
> | **MX** `send.ezcontractorbinder.com` | `feedback-smtp.us-east-1.amazonses.com` | ✅ Resend/SES feedback path wired |
> | **SPF** `ezcontractorbinder.com` (root) | ⚠️ **none** — only a `google-site-verification` TXT | acceptable: DMARC passes on **DKIM** alignment, and relaxed SPF alignment holds via the shared org domain. A receiver doing a bare SPF check on the From domain gets `none`, not `fail`. |
> | **DMARC** `_dmarc.ezcontractorbinder.com` | `v=DMARC1; p=none; rua=mailto:josh@worthprop.com` | ⚠️ `p=none` = monitoring only. The `rua` is **TECH_DEBT `#1-delsweep`**, already known and ruled; not blocking delivery. |
> | **MX** root | none | expected — the domain sends, it does not receive. |
>
> **Conclusion: mail from this domain is DKIM-signed and DMARC-aligned. It will not
> be rejected for authentication.**
>
> ### ⚠️ What the 52 bounces actually were — and why they do NOT damage Gmail reputation
>
> Measured on rebuild-test (`nmyphyhmfttxkdoposvf`; production is
> `jwkcknyuyvcwcdeskrmz` and was **not** touched):
>
> - **All 52 went to ONE address: `qa-client-a@example.invalid`**, 2026-08-03 →
>   2026-08-30. A single QA fixture address, repeated.
> - ⚠️ **`.invalid` is an RFC 2606 reserved TLD that does not resolve.** SES's MX
>   lookup returns NXDOMAIN and the message hard-bounces **inside the ESP**.
>   **No third-party mail provider ever received, saw, or rejected them.**
>   **Gmail's view of this domain is therefore completely unaffected by them.**
> - ⚠️ **They are logged `sent` in `email_logs`, not `failed`** — the app recorded a
>   successful handoff to Resend and never learned about the bounce. **So the
>   application's own logs cannot tell you an address bounced.** This is precisely
>   why check 1–2 of ASK-B.3's definition are insufficient alone.
> - The 15 later `example.invalid` rows are `failed` and all date from **2026-08-31
>   onward — i.e. the send gate refusing. That is the fix working**, not a residue.
>
> **Where the damage IS real: the ESP.** 52 hard bounces against 430 `sent` rows is
> a **~12.1% bounce rate** over the period, above SES's 5% review and 10% pause
> thresholds. ⚠️ **But an ESP restriction fails LOUDLY** — the send returns an
> error and `email_logs` records `failed`. It is the visible failure mode, not the
> silent one. Bounces stopped 2026-08-30.
>
> ### ⚠️ The decisive fact for the end-to-end test
>
> **`JSBishop14@gmail.com` — the exact ruled test recipient — has already received
> 15 successful messages from this domain, most recently 2026-08-20.**
>
> So it is **not** a cold sender/recipient pair: Gmail has accepted mail on this
> path three weeks ago. (7 `failed` rows to that address exist, all on the single
> day 2026-07-19 — an outage or missing key, not a rejection.)
>
> **→ ANSWER TO "can the end-to-end test prove anything": YES.** The domain is
> authenticated, its Gmail reputation is established rather than damaged, and the
> recipient is a known-good path. The residual risk is **spam-foldering of a
> per-company `From:` slug** (`{slug}@ezcontractorbinder.com`) that Gmail may not
> have seen before — the domain and DKIM key are the same, and reputation is
> largely domain-level, so this is low.
>
> ⚠️ **One sharpening of ASK-B.3's check 4: Josh must report WHICH FOLDER.**
> "It arrived" and "it arrived in spam" are different results, and only one of them
> means the feature works for a real subcontractor.

## ASK

**ASK-B.1 and ASK-B.2 are RULED above.** Recorded in the prerequisite section.

**ASK-B.4 — NEW. A measurement contradicts a RULED line; reporting, not
reconciling.** ⚠️ The RULED line is **"The sub sees NO money."** The anonymous
page **does** render money: `allowance_amount`, shown as **"Allowance carried
$X"** (`bid-reply-client.tsx:190`), carried in the token payload
(`get_sub_bid_request`). It is deliberate — an optional per-request field with
its own input, schema-commented _"what you carry now"_ — and it is neither a
total nor a margin, which is what the ruling actually names. But it is a dollar
figure on a page anyone holding the link can read, and audit item 9 says the
payload carries no money. **Does the allowance stay, or is the ruling literal?**

**ASK-B.3** — On FILL-B.0: if re-enabling email requires a change Josh should
know about — a domain record, a key rotation, a config flag with a reason behind
it — surface it before flipping it. ⚠️ **Something disabled it deliberately;
find out what before undoing it.**

---

# RULINGS — Phase 2 [Josh, S107]

**All six answered. Each records the alternative it beat.**

## ASK-B.3 → **RULED: Option B.** The live Resend key does NOT come back here.

**Josh:** _"The 423-send incident happened because the key was present, and the
diagnosis says this control has already failed twice on the same env hygiene. A
restores the exact condition."_

**Beat:** (A) restore the key for one supervised send then delete it — rejected
because it recreates the incident's precondition and relies on the same env
hygiene that has already failed twice; (C) stub the transport and send from
production after merge; (D) restore the key permanently.

**So the send is JOSH'S, from a machine that already has the key.** CC builds the
sender, the template and the log row, and **CC still proves link → upload →
lands**, which needs no email at all.

### ⚠️ JOSH'S CONDITION — "the email works" must be VERIFIABLE FROM THE SEND, NOT ASSUMED

_"CC still proves link → upload → lands, and defines 'the email works' as
something you can verify from the send you make — not assumed."_

**The email is proven only when ALL FOUR hold. Three are machine-checkable; the
fourth is Josh's eyes and cannot be delegated:**

| # | Check | Who | Why it is not redundant |
| - | ----- | --- | ----------------------- |
| 1 | `sendEmail` returns a non-null `messageId` | the send | A null id with no error means the gate refused; the send silently did nothing. |
| 2 | An `email_logs` row exists, `status='sent'`, `resend_message_id` = that id | the send | Proves the **new `email_type` survived the widened CHECK** — the one thing that would fail AFTER the mail had gone. |
| 3 | The link in the delivered body resolves to the request | ⚠️ **CC, WITHOUT SENDING** | `bidReplyUrl()` reads `window.location.origin` and is **browser-only**; a server sender that keeps it emits a link to nowhere. Unit-testable today. |
| 4 | ⚠️ **The mail arrived — and WHICH FOLDER it landed in** | **Josh only** | ⚠️ **`email_logs` records the 52 known bounces as `sent`** — the app never learns a bounce happened, so its own log can never establish delivery. "It arrived" and "it arrived in spam" are different results and only one means the feature works for a real sub. |

⚠️ **Check 4 is the one that cannot be inferred from anything CC observes.** If it
is skipped, "the email works" is exactly the assumption this condition forbids.

## ASK-B.4 → **RULED: Option A**, and the ruling is amended in place. See the Part B RULED list.

## ASK-A.2 → **RULED: Option B.** Held shots PERSIST, in a store that is not the sync queue.

**Josh:** _"It's the only one that honors 'nothing lost,' and CC is right that it
keeps §7a intact because nothing project-less reaches the queue."_

**Beat:** (A) a non-dismissible picker — _"traps the user in a modal on a
jobsite"_; (C) accept the loss with a loud warning — _"unacceptable at 15 shots."_

**The shape:** a held-shot store in IndexedDB, **explicitly outside the offline
sync queue**, holding blobs in a `no project yet` state. When a project is chosen
the shots are **adopted** — moved into the queue via `buildPhotoEntry` — and
removed from the held store. Nothing project-less is ever queued, so §7a and the
`capture-store.tsx:24-32` reasoning both stand: the queue still contains only
entries that can legally insert.

### ⚠️ JOSH'S CONDITION — THE CLEANUP RULE, stated before the build

_"State the cleanup rule — how long an unadopted blob lives and what removes it.
An orphan store with no eviction becomes its own problem."_

| Rule | Value | Rationale |
| ---- | ----- | --------- |
| **TTL** | **7 days** from `takenAt` | Longer than any plausible "I'll file these Monday"; short enough that a forgotten batch cannot sit for a quarter. |
| **Swept when** | app start, and after every successful adoption | No timer, no worker. The sweep runs where the store is already being opened. |
| **Removed by** | (1) **adoption** — the normal path; (2) **explicit discard**; (3) **TTL sweep** | Three exits, all of them definite. |
| **At capacity** | ⚠️ **REFUSE the new shot with a message. NEVER evict an old one.** | Evicting to make room is a silent photo loss, which is the exact failure the whole part exists to prevent. The user is told the tray is full and must file or discard. |
| **Capacity** | **25 held shots** — the same number as ASK-A.3's batch cap | One number, not two. A full tray and a full batch are the same condition. |
| **Visibility** | a persistent **"N photos waiting for a project"** indicator, and an age warning as a shot nears its TTL | ⚠️ **A silent store is the orphan problem.** Nothing may expire without having been visible first. |

⚠️ **The TTL sweep is the only path that deletes a photo the user did not choose
to lose. It is therefore the one that must never run without the count having
been on screen beforehand.**

## ASK-A.4 → **RULED: B plus C.** Manual re-tap with a visible tray, and library multi-select.

**Josh:** _"a programmatic click on a file input is blocked in some Safari
versions, and if A breaks in the field the feature is dead with no fallback. B
always works."_

**Beat:** (A) auto-reopen the camera after each shot — closest to the ruling's
wording and the most fragile; a gesture-less `.click()` on a file input is
blocked in some Safari versions, and there is no fallback when it is.

**So:** the tab-bar camera stays one-shot-per-tap and **shots accumulate in a
visible tray** instead of navigating away; **`multiple` is added to the LIBRARY
input** (precedent: `selection-sheet.tsx:493`) so a true native burst taken in the
phone's own camera app can be selected in one go.

## ASK-A.3 → **RULED: A plus C at 25.** Serial conversion, cap as a backstop.

**Josh:** _"48 MB of bitmap on the main thread per shot is the real constraint."_

**Beat:** (B) concurrency 2–3 — rejected as the thing that actually OOMs the tab.

**Concurrency is ONE.** Convert and upload strictly one at a time. The **cap of 25**
is a backstop only: it exists so a runaway batch **fails with a message** instead
of a memory reload that loses everything. It is the same 25 as the held-store
capacity above.

---

# Cross-cutting

**FILL-X.1** — Every migration this spec requires, with purpose. ⚠️ **If none,
say none.** Josh needs to know before the build whether another attended
production push is coming.

> **MEASURED — ONE migration is required, and it is small.**
>
> | Migration | Purpose | Why unavoidable |
> | --------- | ------- | --------------- |
> | widen `email_logs_email_type_check` | admit a `sub_bid_request` type | Every `sendEmail` caller writes an `email_logs` row; the CHECK enumerates types and has **no bid value**, so the first send would fail the INSERT **after the mail had already gone**. |
>
> **Possibly a second, and it is a design choice not a necessity:** if "a re-send
> REUSES the token" must be *recorded*, `sent_at` is wrong for the job — it is
> `DEFAULT now()` at INSERT and means "created". Either repurpose it (update on
> send) or add `last_sent_at`. **Repurposing needs no migration**; adding a column
> does. Recommend repurposing.
>
> ⚠️ **Both are rebuild-test only this session. No production push is proposed.**
> Neither adds a constraint over existing rows, so the `20261540000000`
> production-row trap does not apply — a CHECK widening is only ever safe in the
> widening direction, and this one widens.

**FILL-X.2** — ⚠️ **Part A ships to production unverified, by ruling.** State
plainly what is untested and what the field test needs to cover. **Green means no
regression, not a working feature.**

> **STATED PLAINLY: after this session, essentially ALL of Part A is untested.**
>
> **What CC can prove:** the pure batch logic (accumulate, per-shot status,
> one-project-per-batch resolution, retry idempotency) in vitest, plus the app
> building and the existing 1149 tests still passing. **That is no-regression, not
> a working camera.**
>
> **What nothing here can prove — the field test must cover each:**
> 1. The camera **reopens** for shot 2..N on a real iPhone (ASK-A.4's mechanism).
> 2. **10–15 shots** complete without the tab reloading for memory.
> 3. A **weak-signal** batch queues and later syncs, and **says so on screen**.
> 4. **One photo failing** leaves the others alone and shows a retry.
> 5. The app **backgrounded mid-batch** behaves as ASK-A.2 rules.
> 6. HEIC frames land as JPEG and are visible on the project.
> 7. The **clocked-in job** is the one the batch lands on (FILL-A.4's untested half).
>
> ⚠️ **Every one is invisible to CI, and items 3 and 5 are the two that LOSE
> PHOTOS rather than merely annoy.**

## ⚠️ Any figure this spec names is an APPROXIMATION — correct it

**A lesson from S106, one session old.** The award prompt spec said the projected
total was _"the bid at the line's default subcontractor markup."_ That is true
only on fixed-price. On cost-plus and T&M an **instrument rate in force overrides
the estimate default** — a $10k bid on a 10% cost-plus lands at $11,000, not the
$12,000 the default implies. CC caught it. **Implemented as written, the prompt
would have shown a figure wrong by the whole difference on every non-fixed job,
at the moment of a money decision.** A dormant line-level discount that wakes on
award was a second thing the spec never mentioned.

⚠️ **So: where this spec names a figure, a formula, or "the X used for Y", treat
it as Josh's approximation of the mechanism, not as the specification of it.
Measure the real one and CORRECT THE SPEC. Do not implement the spec's wording
over the code's behaviour, and do not silently reconcile the two — report the
correction.**

**FILL-X.0** — List every figure or formula this spec names, and whether
measurement confirmed or corrected it.

> **MEASURED — 3 confirmed, 3 corrected, 1 qualified.**
>
> | # | The spec says | Verdict |
> | - | ------------- | ------- |
> | 1 | `capture` is set at **five** sites | ✅ **CONFIRMED** — exactly five real attributes (eight grep hits; three are a comment and e2e prose). |
> | 2 | Precedence **URL > `?project=` > clock > null**, **7 unit tests** | ✅ **CONFIRMED** — 7 tests, all passing. |
> | 3 | The floor test used **29 estimates, 4 contracts** | ✅ **CONFIRMED** — non-vacuity asserted in the test itself. |
> | 4 | The queue "**fires on `!navigator.onLine`** … and fails, on an unhandled rejection path" | ⚠️ **CORRECTED** — stale. S105b's ASK-7.B already falls back to the queue on **any** upload failure, and supabase **resolves** rather than throwing (measured against the real library). The real unhandled rejection is the **IndexedDB queue write** (`idb-storage.ts`, zero try/catch), which hangs the spinner forever. **A different path, and invisible.** |
> | 5 | "**Something disabled** email deliberately" | ⚠️ **CORRECTED** — nothing disabled it; it is **default-deny** and was never enabled outside production. The override is sanctioned; the **missing live key** is the real obstacle, and restoring it re-arms the 423-send incident. |
> | 6 | "**The sub sees NO money**" | ⚠️ **CORRECTED** — `allowance_amount` is in the payload and rendered as "Allowance carried $X". Deliberate, but it contradicts the line as written. → ASK-B.4. |
> | 7 | "**~10 MB per shot** before compression" | ⚠️ **QUALIFIED** — right on disk, wrong as the memory figure. The binding number is the **~48 MB RGBA decode** per HEIC conversion, on the **main thread** — so **concurrency**, not batch size, is the ceiling. |
>
> ⚠️ **Item 4 is the S106 lesson repeating exactly:** a spec sentence that
> described the mechanism accurately when written, still reads true, and now points
> at the wrong line of code. Implemented as written it would have "fixed" an
> already-fixed path and left the real one untouched.

## Standing constraints

**Push the feature branch to origin after every commit.** `main` stays Josh's;
never push to `main`, never merge. ⚠️ **A Codespace restart destroyed 11 unpushed
commits in S105.**

**Commit path-scoped after every unit. Never `git add -A`.**

**Migrations: rebuild-test only. NEVER production.** Verify the CLI link before
every `db push` — ⚠️ **the CLI can reach production.** ⚠️ **The ledger can lie —
check the object.** ⚠️ **And a constraint derived from rebuild-test's rows can
fail on production's:** `20261540000000` aborted on two orphan rows nobody had
measured. **Count on production before proposing a constraint.**

**Type-check is necessary and not sufficient. `next build` must pass.**

**A test that passes on zero rows is a failure.** State the row count each live
test exercised. Read the printed exit line, never a wrapper's echo.

⚠️ **MCP `apply_migration` strips comments from function bodies** on
rebuild-test, so its deployed objects no longer byte-match their files. Hash
comparisons there are noise until re-synced.

⚠️ **Do not hand-write probes that touch credentials.** Use the app's own path.

⚠️ **A Codespace rebuild removes Claude Code** —
`npm install -g @anthropic-ai/claude-code`.

---

# AUDIT — run before any build

1. Every FILL filled, or one line saying why not. State counts found and filled.
2. Every ASK has a recorded ruling, with the alternative it beat.
3. No measurement contradicts a RULED line.
4. ⚠️ **FILL-A.6 is answered.** If held shots do not survive backgrounding, the
   "nothing lost" ruling is not met and ASK-A.2 is ruled before the build.
5. ⚠️ **FILL-A.8's failure table exists.** It replaces test coverage for Part A;
   without it, Part A ships blind.
6. ⚠️ **FILL-B.1 is exact** — every piece marked shipped-and-tested,
   shipped-and-untested, or not built. The scope is what is not the first.
7. ⚠️ **FILL-B.0 is answered and email is working** before the end-to-end test is
   attempted. Email is disabled today; re-enabling it is a prerequisite, and
   something disabled it deliberately.
8. ⚠️ **FILL-B.7 is answered** — a real email to a real address that silently
   does not arrive wastes the test.
9. ⚠️ **The anonymous page's PAYLOAD carries no money** — checked on the wire,
   not in the renderer.
10. ⚠️ **FILL-X.0 lists every figure this spec named and whether measurement
    confirmed or corrected it.** The S106 award prompt's projected total was
    wrong as specified; assume at least one here is too.
11. ⚠️ **The route-floor test exists and FAILS if the admin client moves above
    the session read.** Ruled to be built this session, not filed.
12. Anything still unknown that the build will need.

---

## AUDIT RESULT — run 2026-09-09, before any build

| # | Item | Result |
| - | ---- | ------ |
| 1 | Every FILL filled | ✅ **20 of 20.** FILL-0, A.1–A.8 (8), B.0–B.7 (8), X.0–X.2 (3). Two carry a stated blocker rather than an answer: **FILL-B.4's wire check** (needs a dev server, needs `.env.local`, absent) and **FILL-0's "deployed"** (no `gh`, no Vercel CLI/token). Markers kept, reasons stated in one line each. |
| 2 | Every ASK has a ruling + the alternative it beat | ✅ **6 of 6** — A.1 (pre-ruled, owed record now written), A.2, A.3, A.4, B.3, B.4. B.1/B.2 were pre-ruled in the scaffold. |
| 3 | No measurement contradicts a RULED line | ⚠️ **One did, and it was reported not reconciled** — `allowance_amount` vs "the sub sees NO money". **Resolved by amendment [Q2]**, recorded as a permanent exception. |
| 4 | ⚠️ FILL-A.6 answered; ASK-A.2 ruled before build | ✅ Answered (**they do NOT survive**), and **ASK-A.2 is RULED (B)** with the cleanup rule stated. **Stop rule 6 is cleared.** |
| 5 | ⚠️ FILL-A.8's failure table exists | ✅ Exists — **seven** modes (the five named, plus tray-at-capacity and TTL-warning, which the rulings created). Each row gives today's behaviour and what Josh sees after the build. ⚠️ **This row was first recorded ✅ before the table was written** — caught by re-checking rather than by trusting the audit. |
| 6 | ⚠️ FILL-B.1 exact | ✅ Eight pieces classified. **Nothing is "shipped and tested."** Two are **NOT BUILT** (the email; the sub's file GET). |
| 7 | ⚠️ FILL-B.0 answered AND email working before the e2e test | ✅ Answered. ⚠️ **Email will NOT be working in this environment, by ruling [Q1/B]** — the key does not come back here. **The real send is Josh's**, against the four-check definition above. CC's half (link → upload → lands) needs no email. |
| 8 | ⚠️ FILL-B.7 answered | ✅ **SETTLED by measurement, and my first answer was wrong.** DKIM present and aligned; SPF on `send.`; DMARC `p=none`. The 52 bounces were **one non-resolving QA address** (`qa-client-a@example.invalid`) that **no mail provider ever saw**, so Gmail reputation is unaffected. **`JSBishop14@gmail.com` has received 15 messages from this domain, last on 2026-08-20.** Residual risk is spam-foldering only → check 4 sharpened to **"report which folder"**. |
| 9 | ⚠️ Anonymous payload carries no money, checked on the wire | ⚠️ **PARTIAL, and honestly so.** Verified **statically and exhaustively** — the payload is a hand-built **23-key** `jsonb_build_object`, not `to_jsonb(row)`, so it is enumerable and enumerated. ⚠️ *This row first said 21; the miscount is recorded rather than silently fixed. The conclusion is unchanged — the two keys I had missed are `reply_exclusions` and `reply_holds_until`, neither of which is money.* **The wire check is blocked** (no `.env.local`). The one money key, `allowance_amount`, is now a ruled exception. |
| 10 | ⚠️ FILL-X.0 lists every figure, confirmed or corrected | ✅ **7 figures: 3 confirmed, 3 corrected, 1 qualified.** The spec's assumption that at least one would be wrong held — three were. |
| 11 | ⚠️ The route-floor test exists and FAILS on the reordering | ✅ **BUILT AND PROVEN LOAD-BEARING.** `apps/web/test/s107-estimate-files-route-order.test.ts` — 7 tests, GET and POST. **Verified by sabotage, not by assumption:** hoisting `getSupabaseAdmin()` above the session read in GET turned the suite **red (exit 1)** with the intended message — _"the service-role client was reached on a DENIED estimate — the floor has been bypassed"_ — and green again on revert, with the route byte-identical to the committed file. A mirror case (visible estimate → admin IS called) keeps the not-called assertions from passing vacuously. |
| 12 | Anything still unknown the build will need | See below. |

### Still unknown, and named rather than discovered later

1. ⚠️ **Whether the sub's email address exists to send to.** `subcontractors.email`
   is nullable and the rebuild-test sub must be **created** with
   `JSBishop14@gmail.com` [RULED B.1]. The sender must refuse a null address
   loudly rather than throw.
2. ⚠️ **The public origin for the emailed link.** `bidReplyUrl()` is browser-only.
   The server sender needs a configured origin; which env var supplies it on
   production is **not yet established** and is the first thing Phase 3 checks.
3. **Whether iOS Safari fires `change` on a `multiple` library input for 15
   files at once.** Unknowable here; it is field-test item 1.
4. **IndexedDB quota on Josh's device.** The held store's 25-shot cap is a
   product decision, not a measured device limit.
