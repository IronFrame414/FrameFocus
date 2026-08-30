# Storage caps, trash, the project archive, and the AI cap — build log

> Spec: `storage-archive-ai-spec.md` (FINALISED — eleven §S blocks filled Phase 1, seven Phase-2
> rulings folded in). Branch: `feature/storage-archive-spec` off main. Built in the ruled order;
> every step committed path-scoped; nothing pushed. Migrations 20261057–20261059 applied to
> rebuild-test only.

## The steps, in commit order

| Commit | Step |
| --- | --- |
| `f372998` / `64400e4` | Phase 1 fills + Phase 2 rulings folded into the spec |
| `cee060b` | **1 · Measurement** — `company_storage_used_bytes()` (SECURITY DEFINER, caller-scoped, trashed rows INCLUDED) + covering index; catalog rewritten to the ruled 50/120/500 with `storageGb` enforced-and-advertised from one field; AI-estimates lines removed; `storage-cap.ts` pure boundaries, unknown tier FAILS OPEN |
| `5509ee0` | **2 · Trash** — `emptyTrash()` loops the one verified object-first delete (per-project + company-wide); Empty Trash button; `runTrashPurge` daily cron **scheduled with the build** (a stated retention behaviour); orphan rows cleared, not wedged |
| `336b504` | **3 · Cap + limit screen** — `uploadBlockedByCap()` in the three capped writers (fails open on error); `StorageLimitNotice` with the five ruled elements; Billing shows the real number with 80/95/100 colouring |
| `aecdcf9` / `3587b68` | **4 · Archive** — `export_jobs.kind` + `project_id` (Q4, no new table); `runArchiveChunk` (category folders, `trash/`, MANIFEST honesty, parts); worker branches on kind; Owner/Admin API + panel with honest ~minutes copy, 24h links, delete prompt ONLY after a download click |
| `7e82b4a` | **5 · AI cap** — `company_ai_tags_this_month()` (SECURITY DEFINER — see the trap below), pre-flight 4.5 before any OpenAI spend, $20/1,500 copy (price display-only per Q2) |

## The acceptance list, as proven

- ✅ Over-cap blocks the three tenant-upload paths and NOTHING else (`storage-cap.test.ts`
  boundaries; system artifacts and portal-client uploads never touch the check).
- ✅ Emptying trash reclaims BYTES — the object-first verified delete is the only deleter, and
  `s178` proves object+row both gone.
- ✅ The 6-month purge removes files and objects, spares fresh trash (the negative case), clears
  orphan rows, is idempotent — `s178`, with an s138-style foreign-due safety gate.
- ✅ The archive contains every file INCLUDING trash, foldered, **and opens** — `s178` unzips the
  real part from the real bucket and round-trips the bytes; MANIFEST names counts + unreadables.
- ✅ The delete prompt appears only after a download click, warns CHECK THE ZIP FIRST, says
  irreversible; the archive itself never deletes anything.
- ✅ Tagging stops at 1,500 (calendar month, company timezone, success-only) and uploads still
  succeed; the counter proven live to rise by exactly the in-month successes.
- ✅ The negative case: an under-cap company is untouched — fail-open defaults, `warn`-only
  levels, purge spares in-retention files, quota below cap changes nothing.

## ⚠️ Two traps found while building, worth remembering

1. **`ai_tag_logs` SELECT is Owner/Admin-only, and the uploader usually is neither.** A client-side
   quota count would read 0 for crew/foremen — the heaviest uploaders — and the cap would silently
   never fire. The counter is SECURITY DEFINER and caller-scoped for exactly this reason.
2. **`subscriptions_select_owner_admin` is misnamed** — its USING clause is company-only, no role
   arm, which is what lets every role read `plan_tier` for the cap check. If anyone ever "fixes"
   that policy to match its name, the storage check starts failing open for non-admins (uploads
   would stop being capped, not start being blocked — the safe direction, but worth knowing).

## The battery

| Suite | Result | vs baseline |
| --- | --- | --- |
| Type-check | 🟢 exit 0 (every step) | — |
| Lint | 🟢 0 warnings | — |
| Cold build | 🟢; `/api/cron/file-trash-purge`, `/api/projects/[id]/archive` in the route table | — |
| Unit | 🟢 **1002/1002, 69 files** | prior 993 |
| Live RLS | 🟢 **1538/1538, 107 files, 0 markers** | prior 1531/106 |
| Playwright | **553 passed / 9 skipped** (141+151+157+104), 1 failed → **8/8 green in isolation** | prior 551 |

The one red is the SAME test as the deletion-sweep battery — `desktop-payload.spec.ts:129`
(#117 PM-CO payload) — failed in-shard, green in isolation on identical data, twice in a row now
across two sessions. Classified cross-suite contamination (the audit's "green in isolation"
class). ⚠️ Recurring twice makes it worth a debt entry when this branch's provisional ids are
reconciled: the contaminating neighbour in shard order should be identified once, not
re-diagnosed per battery.

## What this unblocks, and what it deliberately does not

- **The privacy policy/terms sentences this build makes TRUE:** plan storage limits (enforced,
  advertised at the ruled numbers), trash behaviour (counts against storage; 6-month auto-purge,
  scheduled), and the project archive/export. Publishing → Intuit sandbox keys → 7G.
- **Not done, by ruling or scope:** Stripe wiring for the $20 add-on (Q2 — copy only; the toggle
  stays manual); thumbnails (M8); AI overage; seat-limit enforcement; the `/terms`//`/privacy`
  routes themselves (their own prompt).
- **UI note:** the rich limit notice renders on the desktop upload form; every other surface
  (including `/m`) shows the sentinel message text through its existing error path — honest but
  plain. If Josh wants the rich notice on `/m` capture, that is a small follow-up.
