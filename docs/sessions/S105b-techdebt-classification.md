# S105b — item T: re-derived TECH_DEBT classification (PROPOSAL — not applied)

⚠️ **NOTHING WAS MOVED.** This is a re-derivation of the lost S105 classification,
recorded for Josh to confirm/adjust. The moves were **STOPPED** unattended — see
"Why this was not executed" below. Once Josh confirms the per-entry buckets, the
moves are mechanical (verbatim, by ordinal).

## Target (preserved from the lost run)
Partition the **186** current OPEN entries: **106 stay OPEN, 69 → CLOSED, 11 →
IDEAS**. Final files then: OPEN 106, CLOSED 34+69=103, IDEAS 3+11=14 → **223
conserved**. Five forced-OPEN: `#31`, `#54`, `#77`, `#150`, `#1-trial`. Six pointer
blockquotes kept. RENUMBER NOTHING; move verbatim; classify by ORDINAL (ids repeat).

## Why this was NOT executed (the spec's designed STOP)

1. **It contradicts a RULED line.** The spec (ITEM T) rules that **`#110`, `#131`,
   `#151` appear in BOTH OPEN and CLOSED — the superseded "(original)" half moves to
   CLOSED, the live half stays OPEN.** The re-derivation below classified *both
   halves of all three* as OPEN (ordinals 64/65, 91/92, 182/183). That contradicts a
   settled ruling, and the spec's rule is: *"If a measurement contradicts a RULED
   line, STOP and report. Do not reconcile it yourself."*
2. **The totals were fitted, not recovered.** The classifier explicitly moved three
   borderline entries into IDEAS "to reach 11." Matching totals ≠ reproducing Josh's
   original per-entry partition, which was LOST and is **not settled in the spec**
   (only the totals + 5 forced-OPEN + 6 blockquotes are). Executing 80 verbatim moves
   on a fitted classification would misfile entries relative to Josh's actual
   decisions — stop rule 2 ("a decision not settled in the spec").

**Net:** the analysis below is a starting point for an ATTENDED reconciliation, not
an authorization to move entries. The register (`TECH_DEBT.md`, `_CLOSED`, `_IDEAS`)
is **unchanged** by this session.

## Borderline calls a human must check (most likely divergence points)
- **#110 / #131 / #151 dual-file halves** — the RULED line says each "(original)"
  half → CLOSED; re-derivation said OPEN. **Reconcile first.**
- **OPEN↔IDEAS** (fitted to reach 11): `#1-s175`, `#3-m9`, `#113` (each has a known
  fix direction and could read OPEN); swap candidates: `#105`, `#148`, `#106`–`#109`.
- **CLOSED-by-ruling (no ✅ headline):** `#91`, `#92`, `#93`, `#2-s146`, `#3-s146`,
  `#154`, `#57`.

## Re-derived classification (PROPOSAL, 186 entries, sums to 69/11/106)

| Ord | id-as-written | Bucket | Evidence |
| --- | --- | --- | --- |
| 1 | #1-cai | OPEN | residual risk open until production push |
| 2 | #1-estred | IDEAS | features Josh ruled out of this build |
| 3 | #2-estred | IDEAS | deferral, blocked on one unanswered question |
| 4 | #3-estred | OPEN | needs a by-subcontractor_id compliance read |
| 5 | #4-estred | OPEN | needs schema addition + send path |
| 6 | #5-estred | OPEN | needs storage + anon-download exposure path |
| 7 | #1-delsweep | CLOSED | reclassified out of debt → register |
| 8 | #1-email | CLOSED | converted to a real number → #156 |
| 9 | #1-regbacklog | IDEAS | custom composable roles, ruled toward custom ROLES |
| 10 | #2-regbacklog | OPEN | owed work, needs schema |
| 11 | #3-regbacklog | OPEN | mechanical ~340-reference sweep |
| 12 | #4-regbacklog | CLOSED | ✅ CLOSED [register close-out, S180] |
| 13 | #1-dialogsweep | OPEN | native prompt() sweep owed, five sites |
| 14 | #1-s174 | OPEN | fix direction — do not reuse signer_profile_id |
| 15 | #2-s174 | OPEN | fix direction — widen estimates_update_manager |
| 16 | #1-s175 | IDEAS | decide whether a sent estimate is soft-deletable |
| 17 | #3-s174 | CLOSED | ✅ CLOSED [S175] estimate_void_reissue.sql |
| 18 | #4-s174 | CLOSED | ✅ CLOSED [S175] as WON'T BUILD, DB enforces |
| 19 | #5-s174 | OPEN | fix direction — one primitive, not 38 rewrites |
| 20 | #6-s174 | CLOSED | ✅ NOT A DEFECT — EST-1951 correct |
| 21 | #1-s175i6 | OPEN | owed, a build not a filter |
| 22 | #1-s168 | CLOSED | ✅ CLOSED [S175 item 6] |
| 23 | #3-s168 | OPEN | fix in one pass after click-test |
| 24 | #2-s168 | CLOSED | ✅ CLOSED [S175 item 6] |
| 25 | #1-s167fx | CLOSED | ✅ CLOSED [S168] co_void_reissue_delete.sql |
| 26 | #1-m9 | OPEN | belongs to M1 pass, don't close on green probe |
| 27 | #2-m9 | CLOSED | CLOSED [S170] cost_catalog_select_floor.sql |
| 28 | #3-m9 | IDEAS | needs a ruling, not a policy edit |
| 29 | #4-m9 | CLOSED | FIXED here, raised and closed S164 |
| 30 | #5-m9 | CLOSED | both repaired in the same session |
| 31 | #1-audit | OPEN | enforcement owed in the database [RULED S150] |
| 32 | #2-audit | OPEN | fix is one edit, not done at S150 |
| 33 | #3-audit | OPEN | two things that must move together |
| 34 | #2-7i | CLOSED | ✅ FIXED [S150] |
| 35 | #1-7i | CLOSED | ✅ CLOSED [S150] one box editor |
| 36 | #3-7i | CLOSED | ✅ CLOSED [S150] superseded |
| 37 | #1-s143 | CLOSED | ✅ FIXED [S148] |
| 38 | #1-s147 | CLOSED | ✅ FIXED [S147] |
| 39 | #2-s147 | CLOSED | ✅ FIXED [S147b] |
| 40 | #1-s146 | CLOSED | ✅ FIXED [S146] |
| 41 | #2-s146 | CLOSED | RULED [S146] should not get one, rejected |
| 42 | #3-s146 | CLOSED | NOT BUILT [S146], direction filters close leak |
| 43 | #5-s146 | CLOSED | ✅ FIXED [S146] |
| 44 | #4-s146 | CLOSED | ✅ FIXED [S146] |
| 45 | #1-m7cpl | CLOSED | ✅ CLOSED [Josh, S150] in favour of shipped code |
| 46 | #1-m7cpl (original entry) | CLOSED | superseded/closed by #1-m7cpl |
| 47 | #1 | OPEN | no tags UI on contacts/subs forms |
| 48 | #2 | OPEN | no loading.tsx/error.tsx boundaries |
| 49 | #3 | OPEN | no CSV import for contacts/subs |
| 50 | #4 | OPEN | no active-page highlighting in nav |
| 51 | #5 | OPEN | no phone format enforcement |
| 52 | #6 | IDEAS | Source CHECK may be too restrictive |
| 53 | #7 | OPEN | optional cleanup of debugging artifacts |
| 54 | #83 | OPEN | consider persisting the typed text string |
| 55 | #84 | OPEN | needs a void action superseding the sent CO |
| 56 | #86 | OPEN | fix: pass client's typed text + mode |
| 57 | #102 — ✅ CLOSED | CLOSED | ✅ CLOSED [S103], OBSOLETE |
| 58 | #102 | CLOSED | original, superseded by #102 CLOSED |
| 59 | #105 | OPEN | two fix shapes to decide at build |
| 60 | #106 | OPEN | no bill-document attachment path on 7C bills |
| 61 | #107 | OPEN | no expense↔budget link, Committed column dead |
| 62 | #108 | OPEN | no read-only sub profile at closeout |
| 63 | #109 | OPEN | needs a void-and-reenter path |
| 64 | #110 — REASSESSED | OPEN | ⚠️ RULED says dual-file; see STOP #1 |
| 65 | #110 | OPEN | ⚠️ RULED says original half → CLOSED |
| 66 | #112 | OPEN | documented-accepted, fix shape if needed |
| 67 | #113 | IDEAS | SPEC not a patch, with money-representation |
| 68 | #114 | OPEN | re-evaluate in-force state after a rate write |
| 69 | #115 | IDEAS | deferred post-launch, Josh will evaluate |
| 70 | #116 | OPEN | 13 remaining desktop prompt() sites |
| 71 | #117 ✅ CLOSED | CLOSED | ✅ CLOSED [S121] floor in the database |
| 72 | #117 (original entry) | CLOSED | superseded by #117 CLOSED |
| 73 | #132 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 74 | #132 (original entry) | CLOSED | original, superseded |
| 75 | #133 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 76 | #133 (original entry) | CLOSED | original, superseded |
| 77 | #119 | OPEN | slug is the sender address, owed copy fix |
| 78 | #120 | OPEN | trivial fix, warrants a copy pass |
| 79 | #121 | OPEN | undiagnosed, establish where time goes |
| 80 | #122 | OPEN | unverified both directions, retest |
| 81 | #125 | OPEN | should be deleted, delete Stripe object |
| 82 | #126 | OPEN | blocking for real client-facing send |
| 83 | #8 | OPEN | local ROLE_LABELS should import from shared |
| 84 | #9 — ✅ CLOSED | CLOSED | ✅ CLOSED [S103] as STALE |
| 85 | #9 | CLOSED | original stub, superseded |
| 86 | #10 | CLOSED | closed S76 as never-existed |
| 87 | #12 | OPEN | PRIORITY fix before Module 4, drift |
| 88 | #90 | OPEN | verify when Crew login exists, blocked on #70 |
| 89 | #128 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 90 | #128 (original entry) | CLOSED | original, superseded |
| 91 | #131 — AMENDED | OPEN | ⚠️ RULED says dual-file; see STOP #1 |
| 92 | #131 (original entry) | OPEN | ⚠️ RULED says original half → CLOSED |
| 93 | #137 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 94 | #137 (original entry) | CLOSED | original, superseded |
| 95 | #138 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 96 | #138 (original entry) | CLOSED | original, superseded |
| 97 | #135 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 98 | #135 (original entry) | CLOSED | original, superseded |
| 99 | #13 | OPEN | row click should open read-only detail |
| 100 | #89 | OPEN | label each assignee by its actual type |
| 101 | #100 | OPEN | render SVG overlay in every photo surface |
| 102 | #101 | OPEN | add a switch mode to ClockModal |
| 103 | #18 | OPEN | add converted_at timestamp to contacts |
| 104 | #19 | OPEN | add cursor-based pagination |
| 105 | #140 ✅ FULLY CLOSED | CLOSED | ✅ FULLY CLOSED [S122] |
| 106 | #140 (S115) | CLOSED | [S115] FIXED |
| 107 | #141 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 108 | #141 (original entry) | CLOSED | migration built, applied, proven |
| 109 | #142 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 110 | #142 (original entry) | CLOSED | original, superseded |
| 111 | #145 — ✅ CLOSED | CLOSED | ✅ CLOSED [S123] as MITIGATED |
| 112 | #145 (original entry) | CLOSED | FIXED S120, diagnosis was wrong |
| 113 | #20 | OPEN | add insurance_carrier / policy_number |
| 114 | #21 | OPEN | tm_rate column on profiles, needs migration |
| 115 | #91 | CLOSED | 6A emits events only, decided S83 |
| 116 | #92 | CLOSED | documented-accepted behavior |
| 117 | #93 | CLOSED | documented-accepted (S87) |
| 118 | #129 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 119 | #129 (original entry) | CLOSED | original, superseded |
| 120 | #139 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 121 | #139 (original entry) | CLOSED | original, superseded |
| 122 | #134 ✅ CLOSED | CLOSED | ✅ CLOSED [S122] |
| 123 | #134 (original entry) | CLOSED | design question resolved |
| 124 | #95 | OPEN | remove one at a time when picked up |
| 125 | #24 | OPEN | unavoidable until company_id in JWT, defer |
| 126 | #25 | OPEN | no INSERT has run against files yet |
| 127 | #50 | OPEN | delete once Module 3G editor complete |
| 128 | #51 | OPEN | add .claude/ to .gitignore |
| 129 | #27 | OPEN | Resend integration deferred |
| 130 | #29 | OPEN | shadcn/ui not yet installed |
| 131 | #130 — ✅ CLOSED | CLOSED | ✅ CLOSED [S123] as NOT A DEFECT |
| 132 | #130 (original entry) | CLOSED | original, superseded |
| 133 | #118 | OPEN | designed but unwired, an asset for the queue |
| 134 | #30 | IDEAS | stays open until Josh makes it, his call |
| 135 | #31 | OPEN | forced-OPEN (no tests, infra not set up) |
| 136 | #32 | OPEN | profiles uses user_id column |
| 137 | #33 | OPEN | promote-to-admin UI not built |
| 138 | #34 | OPEN | per-seat overage billing not implemented |
| 139 | #36 | OPEN | legacy subscription_tier/status columns |
| 140 | #37 | OPEN | TypeScript any workaround in webhook |
| 141 | #38 | OPEN | may need manual subscription row |
| 142 | #39 | OPEN | would benefit from isOwnerOrAdmin() helpers |
| 143 | #40 | OPEN | inline style objects duplicated |
| 144 | #47 | OPEN | customize Supabase auth emails |
| 145 | #49 | OPEN | inline styles across Module 3 pages |
| 146 | #52 | OPEN | replace window.prompt(), unpolished |
| 147 | #53 | OPEN | decide when first email feature ships |
| 148 | #54 | OPEN | forced-OPEN (dedicated getTrash() fn) |
| 149 | #55 | OPEN | image-aware file browsing, dedicated session |
| 150 | #56 | OPEN | add automated diff check before launch |
| 151 | #57 | CLOSED | won't fix; documented for clarity |
| 152 | #58 | OPEN | address before public launch |
| 153 | #60 | IDEAS | add-on pricing structure undecided |
| 154 | #61 | OPEN | platform admin dashboard not built |
| 155 | #62 | OPEN | address after public launch, depends #61 |
| 156 | #64 | OPEN | needs re-verification before launch |
| 157 | #67 | OPEN | delete the file or wire the functions |
| 158 | #68 | OPEN | add Service Layer Pattern note to CLAUDE.md |
| 159 | #69 | OPEN | verify and decide before launch |
| 160 | #70 | OPEN | forgot-password flow broken, investigate |
| 161 | #71 | OPEN | pre-beta banner, force-add-card |
| 162 | #72 | OPEN | no email to new Owner, pre-beta polish |
| 163 | #73 | OPEN | add ownership_transfers audit log |
| 164 | #74 | OPEN | Stripe Customer email drift, pre-beta |
| 165 | #75 | OPEN | fails silently, detect or design a path |
| 166 | #76 | OPEN | resolves when companies writes migrate |
| 167 | #77 | OPEN | forced-OPEN (optional-address vs empty/NULL) |
| 168 | #78 | OPEN | add SECURITY DEFINER to match template |
| 169 | #87 | OPEN | make it persistent (Codespaces secret) |
| 170 | #123 | IDEAS | deferred pending an eval, not oversight |
| 171 | #124 | OPEN | multi-resolution .ico, cosmetic |
| 172 | #88 | OPEN | migrate to sb_publishable_ key |
| 173 | #146 | CLOSED | accepted as service-layer, RULED [S122] |
| 174 | #147 | OPEN | gap is one form, no migration |
| 175 | #148 | OPEN | createContact() exists, one component |
| 176 | #149 | OPEN | reproducible seed is the real unlock |
| 177 | #150 | OPEN | forced-OPEN (future sharding starts here) |
| 178 | #1-trial | OPEN | forced-OPEN (headline BUILT; body ✅; forced) |
| 179 | #3-trial | CLOSED | ✅ CLOSED [deletion-sweep, 2026-08-30] |
| 180 | #2-trial ✅ BUILT | CLOSED | ✅ BUILT [S138] export exists |
| 181 | #2-trial (original entry) | CLOSED | superseded by ✅ BUILT |
| 182 | #151 — RENUMBERED | OPEN | ⚠️ RULED says dual-file; see STOP #1 |
| 183 | #151 | OPEN | ⚠️ RULED says original half → CLOSED |
| 184 | #152 | OPEN | PARTLY CLOSED [S123], (b) stays open |
| 185 | #153 | OPEN | nothing done, do the duplicates |
| 186 | #154 | CLOSED | NOT a defect, keep it, dead weight on purpose |

Method: `grep -cE '^- \*\*#' TECH_DEBT.md` → 186; ordinals in file order. Excluded
non-matching near-misses (`#### #N-7gqb`, `**#1-blk`, `#### #81`) are out of scope.
