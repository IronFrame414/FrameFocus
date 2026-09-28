# Open items audit — 2026-09-27

Everything surfaced during the S180/S181 sessions that is not closed. Written so it survives a chat
window.

**How to read the evidence markers.** Nothing here is a fact unless marked.

- `[VERIFIED 2026-09-27]` — measured this session, by git or by SQL against the named database.
- `[CLAIM]` — asserted by a report, an earlier session, or a verbal note. **Treat as unverified.**
  Verify before acting on it.

⚠️ Several items below are `[CLAIM]` precisely because they were reported as done or reported as
broken and never re-measured. Do not close one on the strength of this file.

---

# PART 1 — affects real users on production today

**1.1 Password reset is unusable.** `[CLAIM]` The recovery email's link verifies and then lands on the
site root, which does not exchange the PKCE code. Deferred by Josh in an earlier session and still
open. Anyone locked out of production stays locked out.
*Closes when:* the real path is walked end to end — request the email, click the link that actually
arrives, set a password, sign in with it. The S112 proof used `/auth/confirm?token_hash=…`, a link
shape the emails never send, and passed while the real flow was broken.

**1.2 Photos are still filed under Files.** `[CLAIM]` Reported by Josh on 2026-09-26 and not resolved.
Not in tonight's work.
*Closes when:* a photo from a site visit or estimate, on a converted project, appears under Photos and
can be marked up. ⚠️ Filter by CATEGORY, never by MIME type — excluding `image/*` would make a scanned
plan or a photographed permit vanish from Files and appear nowhere.

**1.3 The bid page never lists its documents.** `[CLAIM]` The endpoint serves them; nothing on the page
calls it. A subcontractor invited to bid cannot reach the scope documents through the UI at all.

**1.4 B-10 is deployed and unclicked.** `[VERIFIED 2026-09-27]` Merged to `main` at `cc53bbc3`, 14:29
ET, and Vercel deployed. Markup moved to the photo viewer's bottom action bar; the dead Comments tile
was removed. **No person has opened it.**
*Closes when:* someone opens a project photo on a phone and marks it up.

**1.5 Comments on photos were removed, not built.** `[CLAIM]` Josh asked for the Comments button to
work. The resolution was to delete the dead button and file comments as a scoped item. ⚠️ **This is a
deferral, not a fix**, and it should be named as one.

---

# PART 2 — a security surface nobody has measured

**2.1 The `authenticated` enumeration — S113 A-4.** `[VERIFIED as not done]` The audit that found 272
anon-callable functions was closed down to 3 and verified by object. That enumeration has **never been
re-run against `authenticated`**. We shut the logged-out door and never asked what an ordinary
signed-in user of any company can execute.
*Closes when:* the same catalog query runs with `has_function_privilege('authenticated', …)`, with the
full count and the command stated.

**2.2 The `supabase_admin` default-ACL guard is unapplied.** `[VERIFIED 2026-09-27]` Built as
`20261900000000` on `feature/s112-default-acl-guard`. Unmerged, and not on production. The `postgres`
default is fixed; this one cannot be altered from a migration (42501 on both routes, proven).

**2.3 The CDN revocation measurement is in limbo, third time.** `[CLAIM]` Two attempts, both killed by
Codespace restarts. We still do not know how long a revoked user keeps reading. ⚠️ **Half-measured is
the worst state.** Either finish the run on a disposable tenant and record the number, or record that
it is dropped and why.

---

# PART 3 — dropped during the S180/S181 sessions

**3.1 `feature/s113-photo-viewer-ui` is merged and still on origin.** `[VERIFIED 2026-09-27]` Set aside
deliberately during the build session and never deleted.

**3.2 Whether B-9 was filed is unverified.** `[CLAIM]` Ruled Option A: file it as a scoped
site-visit-record-view item. The commit message says "B-9 re-targeted … with finding," but no one has
confirmed a tracked item exists carrying the correction.
*What the item must say:* the `/m` project photo viewer can never show a frozen site-visit photo — its
gallery is `project_id`-filtered, and conversion, which sets `project_id`, also nulls `estimate_id`,
which is what un-freezes a capture, since the freeze keys on `site_visits WHERE estimate_id =
OLD.estimate_id`. B-9 therefore belongs on `/m/site-visits/[id]` and desktop `site-visit-record.tsx`,
which have no markup entry point at all. The frozen case must render a notice explaining WHY — "part of
a sent estimate, can't be annotated" — not a missing or dead control. PARITY across both surfaces.

**3.3 `20261910000000`'s header comment contradicts a ruling.** `[CLAIM]` It still says `client_refunds`
is "Unruled for this role." Q1 ruled it: no refunds, neither issue nor approve. The migration was
deliberately not edited again because it is applied on rebuild-test — so **that stale comment ships to
production tonight**, and a future reader of the file sees "unruled."

**3.4 `feature/s112-m-loading` was pushed without CI.** `[CLAIM]` S113 B-7. The `loading.tsx` drop is
unverified.

**3.5 The drift detector will report false drift after tonight.** `[VERIFIED 2026-09-27]` The committed
fingerprint baseline was generated from rebuild-test, which carries `20261850000000`,
`20261860000000`, `20261890000000` and `20261900000000` from unmerged branches. Production is about to
gain five migrations it does not have. The daily cron will compare production against that baseline and
report drift that is not drift. Filed as `#1-s112f`; the fix is to build the baseline from the
**migration files** rather than from a shared mutable database.

**3.6 CLAUDE.md is over its target.** `[VERIFIED 2026-09-27]` 391 lines against E-2's 350. It was 389
before tonight's one-line addition.

---

# PART 4 — tonight's production sequence, in order

**4.1 Verify the CI exemption.** HEAD is `b62e877b`; CI ran green on `173f9f31` (run 36357719601).
A docs-only delta is exempt from merge condition 1 by ruling. `git diff --name-only
173f9f31..origin/feature/s111-project-role` must show only `docs/` paths or a root `*.md`.
**Status: not yet run.**

**4.2 Close CC.** It shares `supabase/.temp/project-ref` with Josh's terminal. The runbook points that
file at production; CC must not be able to issue a `db push` while it does.

**4.3 Work `docs/sessions/S181-PRODUCTION-RUNBOOK.md`, all five sections.** `[VERIFIED 2026-09-27]`
Production has **none** of `20261820000000`, `20261830000000`, `20261910000000`, `20261920000000`,
`20261930000000`. `pe_profiles_now = 0`, `newest_migration = 20261880000000`, and all five function-body
hashes match the values the migration files predict, so the Step 0 gate passed. One migration per
section, dry run must list exactly one file, verify by object before the next. ⚠️ **Never run the
`migration repair --status reverted` the CLI suggests** — it would falsely record four other branches'
migrations as reverted.

**4.4 Merge the branch.** All three conditions are then met. Vercel deploys.

**4.5 ⚠️ Create a Project Executive on production — no UI path exists.** The role is withheld from the
invite form and the Team edit form by ruling Q3, and both grant routes refuse it. It takes a direct SQL
update to `profiles.role`. The `josh+qa-pe` login the tests used exists on **rebuild-test only**.
⚠️ CC's closing report says to "log in as the Project Executive test account on production." There is
no such account. Do not go looking for it.

**4.6 Click it, as that PE, on an assigned project.** Budget, Invoices, Payments (record-new only),
Profitability, Change Orders and Lien Releases must all show money. Then confirm an unassigned project
is **not listed at all**. Then confirm neither the invite form nor the Team edit form offers "Project
Executive".

---

# PART 5 — migrations owed to production beyond tonight's five

`[VERIFIED 2026-09-27 as not on production]`

| migration | branch | note |
| --- | --- | --- |
| `20261850000000` | `feature/s112-bid-token-status` | unmerged |
| `20261860000000` | `feature/s112-bid-token-status` | unmerged |
| `20261890000000` | `feature/s112-bid-token-status` | unmerged |
| `20261900000000` | `feature/s112-default-acl-guard` | unmerged; **security item, see 2.2** |

These four are the cause of the `--include-all` friction and of 3.5. Unscheduled.

---

# PART 6 — carried debts and provisional numbers

**6.1 `#1-pe`** — the Payments retainage-release panel (`payments-view.tsx:400`, gated `canRecord` =
Owner/Admin) does not offer the Project Executive what `20261910000000` permits. Fails closed. RULED:
keep the database arm, do not edit 1910 again, build the panel with the operational arms. ⚠️ Releasing
retainage also drafts an invoice, so that build must prove the PE's invoice arms admit the exact
sequence, live.

**6.2 `#2-pe`** — 14 masked off-project negatives remain in 7 files, each listed by file:line.
`[VERIFIED 2026-09-27]` 429 `.insert().select()` calls across 151 live test files; 54 run as a signed-in
user in 21 files; 24 are real refusal tests; 18 are masked; 4 already paired on this branch.
**Blind spots, stated:** the script misses the `expect(error ?? data?.length === 0).toBeTruthy()` form
(3 found by hand), and does not parse 136 calls passing the table name as a variable, or 5 `.upsert()`.
⚠️ **Prior art:** `s98ct-offline.live.ts:365` documented this exact mechanism in S105. It was written
down and never applied to the floor tests.

**6.3 `#3-pe`** — the PE reading stored contract files on its own projects. RULED yes, read-only, on the
operational-arms branch, with two conditions: a database read arm that resolves the project through the
file's subject, not a UI gate (`#136`); and a no-RETURNING negative proving a contract file on another
project is unreachable, with its own sabotage.

**6.4 All three `#n-pe` numbers are provisional** and must be renumbered when the branch lands. Next
free on `main` is `#164`.

**6.5 The operational arms — the larger half of the role.** `[VERIFIED 2026-09-27]` Of 98 policies that
name `project_manager` in a positive role list, **0** name `project_executive`. On its own projects the
role cannot upload a photo or file, touch tasks, phases, schedule, purchase orders, inspections or
selections, see safety incidents, read the roster (Q2, ruled and unbuilt), assign people (Q8, ruled and
unbuilt), or read the cost catalog (Q3, ruled and unbuilt). Roughly 40 tables and a new migration.
Separate branch by ruling Q3.

**6.6 UPDATE and DELETE arms cannot be isolated by any API test.** `[VERIFIED 2026-09-27]` Every
PostgREST update carries a WHERE, so Postgres applies the SELECT policy to the existing row and the new
row, RETURNING or not. Those arms remain bounded by the SELECT arm, whose sabotage does go red. Stated
limit, not a defect — but it means a widened UPDATE arm is invisible to the test suite.

**6.7 S113 items untouched tonight:** B-2 (photos uploaded with no project selected land in no-man's
land), B-5 (multi-file upload), B-6 (the proposal signing page showing line descriptions), D-1/D-2/D-3
(the unrun production counts), D-4/D-5 (the performance measurement pass), E-4 (the cost catalog
importer, never run, neither company has a catalog).

**6.8 PART F — deployed but never confirmed by a person.** The markup fix, display-size, and sixteen
audit fixes, all deployed 2026-09-26 and unclicked. The site-visit textarea against the camera button on
a real iPhone. A file opened from each of the nine file-sheet sites and the client portal. A crew phone
set to Español on `/m`. A proposal with a Spanish name. A row dragged in Safari on a Mac.

---

# PART 7 — process observations

**7.1 Four instrument errors in this session, three caught by Josh:** pointing the CLI at production
while CC was alive in the same working tree; advising CC be closed while it was usefully monitoring CI;
handing CC a prompt that named FILL-C markers while pointing only at the spec that does not contain
them; and a `&&`/`||` command whose output could not be read. The pattern is optimising for speed at
the cost of safety, and it is a pattern rather than three coincidences.

**7.2 "Done" must mean merged, or say where it is.** A report line claiming B-10 was built, when it
existed only on an unnamed branch, cost a full recovery pass on 2026-09-27.

**7.3 A report is a claim.** The S181 report held up on 22 of 24 items when re-measured — and the two
that failed were a citation of evidence that did not exist yet, and a whole class of negative test that
could not fail. Both were found by re-running, not by re-reading.

**7.4 The recurring failure class, now with a third variant on the record:** the thing inspected was not
the thing being judged. Variants seen: a `grep` truncated by `head`; a catalog filter that did not match
how a policy was named; and an off-project negative written with `.insert().select()`, which measures
the READ policy rather than the write policy.