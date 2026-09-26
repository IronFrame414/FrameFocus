# S112 — rulings R1–R7, attended session (2026-09-26)

## ⚠️ Q6 — REVOKING ACCESS DOES NOT REVOKE REPEAT READS WITH THE OLD TOKEN (measured, rebuild-test)

Harness: `apps/web/test/s112-cdn-revocation.live.ts` + `s112-cdn-probe.live.ts` on
`feature/s112-cdn-investigation`. A subcontractor, 4 fixture objects on 2 fixture projects, primed
(fetched until `cf-cache-status: HIT`), then revoked at t0 two ways — **A** assignment soft-deleted,
**B** the file's row deleted while still assigned — and polled every ~7 s for the 70-minute run limit
(569 ticks). Controls every tick: a same-company crew member never assigned, and another company's owner.

| | Result |
| --- | --- |
| **(a) Layer** | **Cloudflare — Supabase's (Smart) CDN.** `cf-cache-status` MISS→HIT, `cache-control: public, max-age=3600`. Not the browser (Node has no HTTP cache). |
| **(b) Keying** | Object bytes are cached **per object**: a different authorised user and a brand-new token both HIT an object another user primed. But the *allow* decision behaves as if cached **per token**: after revocation the user's OLD token keeps getting 200/HIT, while a token minted after revocation is refused. (The R7 observation was `download()` on the authenticated endpoint, not a signed URL, so "a fresh signature" was never in play.) |
| **(c) How long** | **Longer than 4,195 s** — the run's limit, not the cache's. The old token was still served at the last tick, **~10 minutes after that JWT's own expiry** (3,600 s lifetime, minted just before t0). The real ceiling is unmeasured. |
| **(d) Exposure** | **4 of 4** previously-fetched objects stayed readable with the pre-revocation token for the whole 70 min, under BOTH revocations. Everything else closed: a NEW signature refused at **0 s**; a token minted after revocation refused by **14 s**; a 20 s signed URL refused **6 s** after it expired (Supabase's docs say an expired token's cached response may keep being served — measured, it was not). A 7,200 s signed URL issued before revocation still works, by design, until it expires. |
| **(e) Third parties** | **None.** Across 569 ticks × 4 objects the unassigned crew member and the other company's owner were served **0** times. Only the holder of the previously-authorised token — a bearer credential, so exactly as exposed as that session itself. |

**What this means for the policies hardened this week** (20261790000000, 1800, 1810, the R5b
function): they stop NEW reads at once, but a user who had already fetched an object keeps re-reading
it through Storage's authenticated endpoint with the token they already hold, for at least 70 minutes
and past that token's expiry. It needs deliberate use: the app renders via signed URLs, and a user
refreshing normally gets a new token, which is refused.

**Not measured:** an object the revoked user never fetched before revocation (expected refused — no
cached decision — but not tested); the cache's true lifetime; whether rewriting or purging the object
ends it (Supabase documents cache invalidation on update/delete and a purge API on Pro).

**Options — not built (read-only, as ruled):** (1) purge the CDN cache for a project's objects when
someone is unassigned (Supabase `purgeCache`, Pro plan); (2) ask Supabase whether authenticated-endpoint
authorisation is cached and for how long; (3) serve private files only through short signed URLs,
which measured as refused promptly after expiry. **To measure (c) to its end** needs a run of several
hours holding a fixture, and every spare identity is used by CI — it needs a throwaway identity.


## Security rulings, round 3 — built and proven on rebuild-test (NOT production)

| Ruling | Branch | Migration | Proof |
| --- | --- | --- | --- |
| **Anon lockdown** (migration 1) | `feature/s112-anon-lockdown` | `20261870000000` | anon 280 → **3** functions (allowlist measured from code: `submit_sub_bid_reply`, `get_invitation_status`, `get_invitation_by_token`); defaults closed; `test_invite_lookup` dropped. As anon via PostgREST, `allocate_invoice_number` **INV-0002, sequence 1→2 before → 42501, 1→1 after**. 6 red → 12/12. Rollback **proven exact** (279 / 0 extra / 0 missing) and re-applied. |
| **Caller checks** (migration 2) | same | `20261880000000` | 13 internal-only definer functions off the API for signed-in users (every caller is itself definer); 2 policy helpers scoped to the caller's company; `apply_change_order_budget` fixed. As two companies' owners: 8 red (A allocated INV-0002 in B; B read A's member role and session member; B told "CO-100-01 is voided") → 12/12. |
| **Bid: Cancel/Decline, award, conversion** | `feature/s112-bid-token-status` | `20261850000000`, `20261860000000`, `20261890000000` | One DB rule (`bid_token_state`) read on every request. Cancel/Decline built. Losers close at award; **winner survives conversion** (ruled); void/delete close all. 24/24; sabotage 5 red. |
| **Bid files interim** | same | — | Measured first: served **every** staff file — Files-tab attachments, **site-visit photos, site-visit voice notes**. Now only files ticked "Share with bidders" (`bid-scope` tag). Old rule restored as control → bidder got **3** files, 5 red. Tech debt #1-bidtok, #2-bidtok filed. |
| **Proposal payload** | `feature/s112-proposal-payload` | — | Signing page + `/api/sign` carry exactly what the format draws; all 13 formats render identically from trimmed data; lump sum/total-only carry no breakdown. 20/20 with 2 controls. |

**Owed to production (read-only first):** the four anon catalog queries; the bid Q1/Q2 queries and
the bid-files query (`S112-bid-token-status.md`, this report); the R5b money-in-text query (titles
AND descriptions); the HEIC count and frozen site-visit count (PREPARED doc).
**Merge note:** `feature/s112-bid-token-status`'s live test now asserts anon is refused
`get_sub_bid_request`, which is true only once `20261870000000` is applied.

---

**Nothing touched production.** No migration, backfill or write to production; nothing merged. All
database work was on rebuild-test, with CI idle.

## Summary

| Ruling | Branch (stacked on) | State |
| --- | --- | --- |
| **R1** display-size + full-res export | `feature/s112-display-size` (on `markup-local-display`) | Built, measured, fallback proven. CI not yet run. |
| **R2** loading feedback | `feature/s112-m-loading` (on `audit-rulings`) | `loading.tsx` **plus a pending bar**, because taps were still dead. 20/20. CI not yet run. |
| **R3** 16px fields | `feature/s112-audit-rulings` (on `audit-fixes`) | 36 fields → 0 below 16px; static guard. No `maximum-scale`. |
| **R4** muted grey `#687081` | same | Token + 7 hard-coded sites. 4.97 / 4.60. |
| **R5a** CO notice + stale comments | same | Built; for foreman/crew it is superseded by R5b on the next branch. |
| **R5b** approved COs for all staff, no money | `feature/s112-co-summary` (on `audit-rulings`) | DB function applied to **rebuild-test**; proof 14/14 with row counts; sabotage went red. **CI running.** |
| **R6** punch badge, F11, F22, F23 | `feature/s112-audit-rulings` | Badge wraps; `#9d6506` amber text 4.89 / 4.52. F23 identified (below). |
| **R7** HEIC conversion | `feature/s112-heic-conversion` (on `main`) | Script + proof on rebuild-test, 17/17, control went red. **Not run on production.** |

## R1 — see `docs/sessions/S112-R1-display-size.md` (on its branch)

Same photo and three conditions as the 3d table:

| Condition | Save, 3d → R1 | Stored derivative | Export (Save to device) | Exported |
| --- | --- | --- | --- | --- |
| Local | 2,593 → **2,536 ms** | 559,442 B, 1536×2048 | **1,826 ms** | 2,090,890 B, **3024×4032** (full) |
| 1 Mbps uplink, CPU 4× | 20,994 → **8,236 ms** | same | **7,954 ms** | same |
| Fast 3G, CPU 4× | 29,871 → **11,209 ms** | same | **14,827 ms** | same |

- **(a) Fallback, tested both ways.**
  - Regeneration forced to fail → the stored 1536×2048 derivative, with the display-size note.
  - `markup_data` removed → the stored derivative.
- ⚠️ **The second case was broken until this session.** The /m viewer and grid exported the
  **unmarked original, silently**. I found this while measuring and fixed it: a derivative is now
  looked up at export time.
- **Chat still has this gap** (question 4).
- **(b) Mixed content.** Exports are identical, because both old and new derivatives rebuild from
  the original. Old photos keep a full-res stored derivative and new ones are 2,048 px. So:
  - A new marked photo zoomed past about 1.2× in the viewer looks softer.
  - The client portal and PDFs now show 2,048 px for newly marked photos.
  - A fallback export of an old photo is full-res; of a new one, 2,048 px.
- **Before R1, "Save" in the viewer didn't save.** It was an anchor to a cross-origin URL, and
  browsers ignore `download` on those.

## R2 — `loading.tsx` alone was not enough; the pending state was added (as ruled)

Held-tap re-run, method as the audit. Production builds, crew, the RSC payload held 3 s, 20 taps.

| Build | Changed by 800 ms | Punch row |
| --- | --- | --- |
| no `loading.tsx` (control) | **0 / 20** (3.4–3.7 s) | dead |
| `loading.tsx` | **16 / 20** (~30 ms, skeleton) | **still dead, 3.4 s** |
| + pending bar | **20 / 20** (13–17 ms) | bar |

- **Why the punch row stayed dead:** Next 14 remounts the `/m` boundary only when the first segment
  under `/m` changes. A tap that stays inside a project doesn't change it.
- **The bar** is one shell component: a capture-phase listener on same-origin `/m` links. The first
  build listened in the bubble phase, where next/link's `preventDefault` hid every navigation, and it
  raised the bar 0 of 4 times.
- **e2e guard added.** This does **not** unblock `staletimes-hold`.

## R5b — the database does the work

- **The function:** `get_approved_change_order_summaries(project)` (`20261840000000`). It is
  SECURITY DEFINER with `search_path = public`, and returns only six columns, none of them money:
  - id, project_id, co_number, title, description, signed_at
- **It checks, itself:** company, role (the five staff roles, as a positive list), `can_view_project`,
  `status = 'signed'` and `is_deleted`. `anon` has no execute grant.
- **Proof** (`s112-co-summaries.live.ts`, negative first), counted against the database:
  - **Not on the project → 0 rows** for PM, foreman and crew. The fixture holds a signed CO that the
    Owner reads.
  - **Subcontractor → 0** even on their own 2 projects, which hold 3 signed COs.
  - **Positive:** PM 11 = database 11, foreman 3 = 3, crew 9 = 9. Every row has exactly the six keys
    and no money key.
  - **Direct table read after the function exists:** foreman, crew and subcontractor read **0**
    change orders; the PM reads only their own.
  - **Sabotage:** with the role and project checks removed, 4 tests went red (1, 1, 1 and 3 leaked
    rows). Restored and green again.
- **UI, /m and desktop, one shared service:**
  - Foreman and crew get "Approved changes": number, title, description, approval date and a "Scope
    only" pill, with a note saying amounts stay with the office.
  - A PM sees their own COs in full, then other authors' approved COs as scope only, under a note
    explaining why there's no amount.
  - **Desktop was showing foreman and crew three 0-count cards and "No change orders yet."** Now
    fixed.
- **Applied to rebuild-test by hand.** The CLI push refuses because rebuild-test also holds the
  unmerged S111 Project Executive versions. I ran the SQL and inserted the history row.
  `database.ts` carries only this function's hunk.

## R6 — F23, identified before anything is proposed

**The "—" on a `/m/projects` card means `projects.target_end_date` is NULL**, i.e. the project has
no target end date. Code path:
- `projects/page.tsx:65-66`: `n === null ? '—'`
- `daysLeft()` returns null when `!targetEndDate`
- rendered in `projects-list.tsx:133-135`

A-10e specifies that em-dash, and `m-hubs.spec.ts:229` asserts `'—'`. **A second "—" sits
bottom-right, meaning 0 open punch items.** Nothing is built for F23.

## R7 — the thumbnail trap, handled and proven

**Approach.** The script repoints the row, then **copies** every side object to the new path's name
in the same pass: the plain thumbnail, the marked thumbnail and the `.markup.jpg` derivative. Old
objects are never modified or deleted, so undo is lossless. The thumbnail fingerprint depends only
on `markup_data`, so suffixes carry over.

**Proof**, run as an assigned subcontractor, whose only way to read a thumbnail is
`20261810000000`'s `regexp_replace` lookup:

| Check | Result |
| --- | --- |
| Row after apply | repointed to a real JPEG served as `image/jpeg`, 3000×4000 |
| Thumbnail at the NEW name | **1** (readable) |
| Thumbnail at the OLD name | **orphaned**: sign 0, download 0 |
| `--verify` | 0 |
| Undo | exact |

- **Control:** with the copy step removed, 4 red, including the script's own `--verify`.
- **Measurement trap, recorded in the PREPARED doc:** a `download()` probe first read the orphaned
  thumbnail as readable. It was a cached GET, not a policy decision.

Josh runs the production count, then dry run, one-row canary (`--only-ids`), apply and verify:
`docs/sessions/S112-heic-conversion-PREPARED.md` on its branch.

## Incidents (mine)

1. **A CI run started early.** I pushed the R5b branch without `[skip ci]` (run 36233826714). The
   cancel API returned 403, so it ran to the end, green. Nothing else was running.
2. **A scripted edit broke two spec files.** It used `String.replace` with a `'$'` in the
   replacement, which JS reads as `` $' `` (insert the rest of the file), mangling `m-writes.spec.ts`
   and `m-details.spec.ts` in `fe1ae1e1`. The type-check caught it before any CI run. It is repaired
   from the pre-edit files in `60639902`.
3. **Two measurement-premise errors, both corrected before they were reported:**
   - A "project-folder policy" I assumed and that does not exist.
   - A dimension caption.

## Branches and merge order

| Branch | CI | Migration |
| --- | --- | --- |
| `feature/s112-audit-rulings` | via `co-summary` (contains it) | none |
| `feature/s112-co-summary` | **running** | `20261840000000` — new function only |
| `feature/s112-m-loading` | queued | none |
| `feature/s112-display-size` | queued | none |
| `feature/s112-heic-conversion` | queued | none (script + doc) |

- **Order:** the overnight three, then `audit-rulings`, then `co-summary` and `m-loading` in either
  order, then `display-size`. `heic-conversion` is independent.
- ⚠️ **Migration order on production:** whichever of `20261840000000` (R5b) and S111's
  `20261820/30` lands second needs `supabase db push --include-all`.

## Owed to production (read-only first)

1. **R5b:** `20261840000000` adds one function and governs no row. Before it, measure how often money
   has been typed into descriptions:
   ```sql
   SELECT count(*) FILTER (WHERE status = 'signed') AS signed,
          count(*) FILTER (WHERE status = 'signed' AND
            (coalesce(description,'') ~ '\$\s?\d' OR coalesce(description,'') ~ '\d{1,3}(,\d{3})+(\.\d\d)?'
             OR title ~ '\$\s?\d')) AS money_like
   FROM change_orders WHERE NOT is_deleted;
   ```
2. **R7:** the HEIC count (unchanged from the overnight report), then the PREPARED runbook.
