# S114 PARTS C and B — Phase 2 questions (2026-09-28)

Sent in chat as plain text; repeated here so they survive a restart. Evidence for every line:
`docs/sessions/S114-C-report.md` Steps 1–3. Rulings, when given, are recorded under each question.

## Production queries for Josh (read-only; each tested on rebuild-test first, where it ran without error)

Run in the production SQL editor (`jwkcknyuyvcwcdeskrmz`). Paste the output back.

**P1 — C-2.3: images the Files list shows, per company, project and category.**
```sql
SELECT c.name AS company, p.name AS project, f.category,
       CASE WHEN split_part(f.file_path,'/',2)='estimates' THEN 'from_estimate' ELSE 'project_upload' END AS origin,
       count(*) AS n
FROM files f JOIN companies c ON c.id=f.company_id JOIN projects p ON p.id=f.project_id
WHERE f.is_deleted=false AND f.category <> 'photos' AND f.mime_type LIKE 'image/%'
GROUP BY 1,2,3,4 ORDER BY 1,2,3;
```
Rebuild-test for comparison: 15 image rows — `daily_logs` 12, `safety` 2, `receipts` 1, `other` 0.

**P2 — C-2 legacy set:** run **STEP 1 only** of `docs/sessions/S111-photos-backfill-PREPARED.sql`, exactly as written. It is a count;
nothing is changed.

**P3 — C-4.3: orphaned photo rows (expect 0 — the CHECK forbids them) and the guard.**
```sql
SELECT company_id, count(*) FROM files
WHERE project_id IS NULL AND estimate_id IS NULL AND category='photos' GROUP BY 1;
SELECT conname, convalidated FROM pg_constraint WHERE conname='files_owner_arm_check';
```
Expected: no rows from the first; `files_owner_arm_check | true` from the second.

**P4 — C-9: contacts a name-or-company CHECK would reject today.**
```sql
SELECT company_id, count(*) AS would_violate
FROM contacts
WHERE NOT ((btrim(first_name) <> '' AND btrim(last_name) <> '') OR btrim(coalesce(company_name,'')) <> '')
GROUP BY 1;
```
Expected: ideally no rows. Any row here would abort a CHECK migration.

**P5 — B-5: QuickBooks exposure per company.**
```sql
SELECT c.name AS company, c.qb_connection_state, (c.qb_realm_id IS NOT NULL) AS qb_linked,
  (SELECT count(*) FROM projects p WHERE p.company_id=c.id AND NOT p.is_deleted) AS projects,
  (SELECT count(DISTINCT x.pid) FROM (
     SELECT i.project_id pid FROM invoices i WHERE i.company_id=c.id AND i.qb_invoice_id IS NOT NULL
     UNION SELECT e.project_id FROM expenses e WHERE e.company_id=c.id AND (e.qb_purchase_id IS NOT NULL OR e.qb_bill_id IS NOT NULL)
     UNION SELECT e.project_id FROM expense_payments ep JOIN expenses e ON e.id=ep.expense_id WHERE ep.company_id=c.id AND ep.qb_purchase_id IS NOT NULL
     UNION SELECT i.project_id FROM client_payments cp JOIN client_payment_applications a ON a.payment_id=cp.id AND NOT a.is_deleted JOIN invoices i ON i.id=a.invoice_id WHERE cp.company_id=c.id AND cp.qb_payment_id IS NOT NULL
     UNION SELECT r.project_id FROM client_refunds r WHERE r.company_id=c.id AND r.qb_refund_id IS NOT NULL) x) AS projects_with_qb_records,
  (SELECT count(*) FROM invoices i WHERE i.company_id=c.id AND i.qb_invoice_id IS NOT NULL) AS qb_invoices,
  (SELECT count(*) FROM expenses e WHERE e.company_id=c.id AND e.qb_purchase_id IS NOT NULL) AS qb_purchases,
  (SELECT count(*) FROM client_payments cp WHERE cp.company_id=c.id AND cp.qb_payment_id IS NOT NULL) AS qb_payments,
  (SELECT count(*) FROM client_payments cp WHERE cp.company_id=c.id AND NOT cp.is_deleted AND
     (SELECT count(DISTINCT i.project_id) FROM client_payment_applications a JOIN invoices i ON i.id=a.invoice_id
       WHERE a.payment_id=cp.id AND NOT a.is_deleted) > 1) AS multi_project_payments,
  (SELECT count(*) FROM qb_sync_queue q WHERE q.company_id=c.id AND q.status IN ('queued','in_flight','failed_transient') AND NOT q.is_deleted) AS queue_pending
FROM companies c ORDER BY 1;
```

**P6 — C-3: who can reach estimate files through a bid token today.**
```sql
SELECT c.name, count(DISTINCT r.id) AS live_tokens, count(DISTINCT f.id) AS staff_files_reachable,
       count(DISTINCT f.id) FILTER (WHERE f.site_visit_capture) AS site_visit_captures
FROM estimate_sub_bid_requests r JOIN companies c ON c.id=r.company_id
LEFT JOIN files f ON f.estimate_id=r.estimate_id AND f.company_id=r.company_id AND NOT f.is_deleted AND f.created_by IS NOT NULL
WHERE NOT r.is_deleted AND (r.expires_at IS NULL OR r.expires_at > now()) GROUP BY 1 ORDER BY 1;
```

## Questions

(Numbered ASK-1 … ASK-18; the chat message carries the identical text.)

### Branching and merging

**Q1. [ASK-1] Which C items go on which branch, and may they be merged?**
My proposed split:
- **C-branch 1, no migration (`feature/s114-c-no-migration`):**
  - C-1: the reset email carries our own `/auth/confirm` link.
  - C-2: the fix ASK-3 picks, plus correcting the false comment in `files.ts`.
  - C-3: the exposure hotfix, if ASK-5 says A.
  - C-5: multi-file upload.
  - C-8: site-visit markup through a server route, plus fixing the silent-failure bug in the shared markup save.
  - C-9: the app side.
  - C-10: the desktop subcontractor page.
- **C-branch 2, migration (`feature/s114-c-migration`):**
  - C-9: relax the check inside the `create_site_visit` database function, and optionally add a CHECK.
  - The `project_financials` PE write-arm drop, if ASK-15 says A.
  - C-7 is **not** here unless ASK-9 says build it; if so, it gets its own branch.
- **On neither:**
  - C-3's document list waits for PART E (ASK-5).
  - C-6 is already on `main` at `26bb3ba7`.
  - C-4 needs no code (ASK-4).

Options:
- A) This split. C-branch 1 merges under R8 once CI is green on current `main` and every check is measured. C-branch 2 and PART B wait for your production runbook.
- B) The same split, but nothing merges without you.

My recommendation: A.

**Q2. [ASK-2] C-1's proof can only happen after the fix is deployed.** FILL-C-1.3 requires a real email, clicked on a second device, on production. It cannot be walked before the code is on production. Rebuild-test has the hook off and an empty redirect allow list, so it cannot reproduce the bug.

Options:
- A) Merge C-1 on CI plus unit tests (the email builder emits `/auth/confirm?token_hash=…&type=recovery` for recovery, and the existing test is inverted in place). The real-path walk becomes the first item on your click list. C-1 stays marked "deployed, unproven" until you walk it.
- B) Hold C-1 off `main` until you can test on a Vercel preview. Preview URLs are not in the production redirect allow list; the new link does not need them, but the hook would still send production users' emails, so this is awkward.

My recommendation: A. The admin reset on the Team page already uses exactly this link shape in production.

Separately: whether or not code changes, the production allow list entry `…/auth/callback?next=*` does not match `?next=/reset-password` (the `*` stops at `/`). May I leave the dashboard settings alone? The code fix bypasses them.

### PART C

**Q3. [ASK-3, was ASK-C-2] Daily-log and safety images live under their own categories (`daily_logs`, `safety`), so today they show in Files and NOT in Photos.** A comment in `files.ts` claims Photos was widened to include them in S111 Q18. It was not: Q18 was stopped. These are most of what Files shows as images (on rebuild-test, 14 of 15).

Options:
- A) Photos shows categories `photos` + `daily_logs` + `safety`, and Files excludes all three. Both filter by category only (R7).
  - Markup and the viewer must then accept those categories too; today `getPhoto` requires `photos`.
  - Risk: a PDF filed under `daily_logs` or `safety` would appear in Photos. On rebuild-test every row in those categories is an image, but production needs P1 first.
- B) Photos shows all three categories; Files keeps showing them too.
- C) No change. Correct the false comment only.

My recommendation: A, after P1 confirms those categories hold only images on production. No migration either way.

**Q4. [ASK-3b] The legacy images.** Images on estimates converted before `20261770000000` are still category `'other'`, so they sit in Files. The prepared backfill (`S111-photos-backfill-PREPARED.sql`) was never run on production. Running it moves rows between surfaces, which is stop rule 3, so it is yours.

Options:
- A) You run P2 (STEP 1, a count), then you run the backfill's STEP 2 yourself if the count looks right.
- B) Leave the legacy rows where they are.

My recommendation: A. This is most likely what you saw on 2026-09-26.

**Q5. [ASK-4, was ASK-3] C-4, orphaned photos.** No surface writes a project-less photo row today. /m holds the shot on the phone until a project is picked; `uploadFile` refuses; and the DB CHECK `files_owner_arm_check` forbids such a row. So R4 is already the behaviour, and P3 should show 0. One residual: shots held on the phone with no project **expire silently after 7 days** (`lib/offline/held-shots.ts`).

Options:
- A) If P3 is 0, close C-4, and add a visible "N photos waiting for a project — they're deleted after 7 days" notice on /m capture. No migration.
- B) Close C-4 with no change.

My recommendation: A.

**Q6. [ASK-5] ⚠️ C-3, the bid-documents endpoint exposure on production today.** `GET /api/bid/[token]/files` on `main` returns signed URLs for **every staff-uploaded file on the estimate** to anyone holding an unexpired bid token. That includes Files-tab attachments (e.g. vendor quotes), site-visit photos and voice notes. Nothing on the page calls it, but the URL is callable directly. The fix is on `feature/s112-bid-token-status` (PART E; migrations 1850/1860/1890, owed to production): only files marked "Share with bidders" are served, and settled tokens are closed.

Options:
- A) Hotfix now on C-branch 1 (no migration): GET returns only files tagged `bid-scope`. On `main` nothing is tagged yet, so it returns an empty list until PART E lands, and nobody loses anything, because no UI calls it. The document list on the bid page is built after PART E merges.
- B) Leave it until PART E merges.

My recommendation: A. P6 shows how many live tokens and reachable files production has right now.

**Q7. [ASK-6] C-5, multi-file upload.** 37 file inputs.
- Add `multiple` to:
  - the /m library pickers for daily log, delivery check-in and incident (their desktop twins are already multiple, so this is a PARITY defect today);
  - desktop estimate attachments (its route takes one file per POST, so the client loops).
- Route every multi-file control through the existing `runUploadBatch` (concurrency 3, per-file status, named failures, retry-failed-only). Today only desktop Files and Add Photos use it; the rest upload in a serial loop.
- Keep single, each because it fills one field or one record: punch completion photo, selection option image, bill document, lien releases, compliance doc, templates, logo, signature, bid document, and the 6 camera inputs (a capture returns one shot).
- Leave the public bid reply single for now.

Options:
- A) As listed.
- B) As listed, plus the bid reply.

My recommendation: A. I will measure a 10-image batch with thumbnails on rebuild-test and state the timing.

**Q8. [ASK-7] C-6 is already on `main`** (`26bb3ba7`, 2026-09-27). The signing page and the PDF show descriptions for Summary with Descriptions, and the payload is trimmed to the corrected page. I will re-run its tests and state the counts. What remains is a person looking at a real proposal.

Options:
- A) Close C-6 on the re-run plus your click.
- B) Something about it is still wrong on your screen; tell me what.

My recommendation: A.

**Q9. [ASK-8, was ASK-5] C-7, photo comments: build it, or not now.** No schema exists.

The cost:
- One migration: a `file_comments` table with its own project-scoped RLS, notification types and regenerated types.
- A thread on the /m viewer and on the desktop file sheet.
- Notifications.
- Total role-map tests and no-RETURNING negatives.
- About 1.5–2.5 sessions.

Before any build, these need ruling:
- (a) Who may comment: staff only, or subs and clients too?
- (b) Do comments reach the client portal?
- (c) Who is notified: the uploader, other commenters, @mentions?
- (d) Someone will type a price into a comment. Is that accepted as-is, or does it get the no-price hint `#1-cosum` uses?

Options:
- A) Not this session. File it as `#166`+ with those four questions.
- B) Build it now. Answer (a)–(d).

My recommendation: A. C's other items are defects users hit; this is a feature.

**Q10. [ASK-9] C-8, site-visit markup: per photo or per visit?** The database freezes site-visit photos **one at a time**: a photo captured at or before the estimate was sent is frozen, and one added afterwards is still editable. The record already groups photos as "before send" and "after send". Your ruling says "unsent visits only".

Options:
- A) Per photo. Photos added after the send can be marked up. Frozen photos show "Part of a sent estimate, can't be annotated" on the tile.
- B) Per visit. Once the estimate is sent, no photo on the visit can be marked up, and every tile shows the notice.

My recommendation: A. It matches what the database enforces, so the UI never offers what the DB refuses or refuses what it allows.

**Q11. [ASK-10] C-8: how the save is authorised.** Today RLS lets only Owner/Admin save markup on a site-visit photo (`project_id` is NULL on those rows). PM, foreman and crew are refused, even though they can capture those photos. The shared save then tells them "marks saved" when nothing was saved (a latent bug; fixed either way).

Options:
- A) No migration. A server route `/api/estimates/[id]/files/[fileId]/markup` checks the caller with `resolveEstimateFileAccess` (the same check photo capture uses), then writes with the service role. The freeze trigger stays as the database backstop. Whoever may capture on the visit may mark it up.
- B) A migration widening the `files` UPDATE and storage policies for site-visit captures. Riskier: the storage arm would also let those roles overwrite the **original** object, which the freeze trigger does not guard.

My recommendation: A.

**Q12. [ASK-11] C-9: the contact name rule.**
Proposal:
- (i) One shared predicate in `packages/shared`: "first AND last, OR company". Used by every writer: the desktop contact form, estimate "also send to", the project contacts panel, /m contact edit, and the /m site-visit new contact.
- (ii) Blank names are stored as `''`, never `NULL`. The columns stay NOT NULL, because the list code calls `.toLowerCase()` on them.
- (iii) "Also send to" and the /m site-visit new-contact form each gain a Company field.
- (iv) One display helper, used at the 28 places that print `first last`, shows the company when the names are blank.
- (v) A migration relaxing the same rule inside `create_site_visit()`.
- (vi) Optionally, a database CHECK enforcing the rule.

Options:
- A) (i)–(v). No CHECK now.
- B) (i)–(vi). The CHECK only after P4 returns no rows.
- C) (i)–(iv) only. The /m site-visit new-contact form keeps requiring both names until a later migration.

My recommendation: A. (i)–(iv) ship on C-branch 1 today. (v) rides C-branch 2 with your runbook. Until (v) is applied, the site-visit form keeps requiring both names, so its UI never offers what its RPC refuses.

**Q13. [ASK-12] C-10: who may open the desktop subcontractor profile.** Today it is Owner/Admin/PM only. The page shows no money; rates live in the Owner/Admin-only `subcontractor_financials`. The /m sub page has **no** role gate, so foreman, crew and the PE can already read it there. Its Edit link is ungated and protected only by the redirect.

Options:
- A) PARITY with /m: every dashboard role may open it read-only. Edit goes behind one shared predicate (Owner/Admin/PM) in `packages/shared`, used by desktop and /m alike, with a total role map.
- B) Add only the PE to the view list; foreman and crew stay redirected on desktop but not on /m.

My recommendation: A. B leaves the same page behaving differently per surface, which PARITY forbids.

### Carried over from PART A

**Q14. [ASK-13] `project_financials.contract_value`: should the Project Executive keep its write arms?** PE INSERT/UPDATE arms on `project_financials` came from `20261910000000` and are on production. Q2 dropped `client_contract_amounts` because the contract value is the signed agreement's defining term.

Measured:
- A client never reads `project_financials`; the portal shows `client_contract_amounts`.
- **No app code writes it.** Only `convert_estimate_to_project()` does, and `updateProject` explicitly refuses the column.
- **On a fixed-price project it is the enforced billing ceiling**: `enforce_contract_billing_ceiling` locks and reads it, and no value means no ceiling. On cost-plus/T&M it is an unbilled projection.

So it is not a working margin figure. A PE UPDATE lets the PE raise, or null, the cap it bills against.

Options:
- A) Drop both PE write arms in a new migration on C-branch 2. Keep the PE's SELECT arm. Add a no-RETURNING negative on its own project, with sabotage.
- B) Keep them.

My recommendation: A. Nothing uses the write, and it sits squarely in carve-out 2.

**Q15. [ASK-14] Q4, subcontract commitments entered by hand.** A PE can record expenses linked to a `sub_contract_id` (committed, subcontractor category) without `setup_payment_schedule()`. Measured: the PM has exactly the same ability today (`expenses_insert_authorized`), so this is not a PE-specific widening, and the subcontract's own terms stay untouchable.

Side effect, for PM and PE alike: one hand-entered expense linked to a subcontract makes `setup_payment_schedule()` refuse afterwards, **for the Owner too**, because the one-schedule check sees it and says "a schedule already exists".

Options:
- A) Keep the PE's reach equal to the PM's. File the side effect as debt `#166`+ (a schedule check that counts only schedule-built rows, or a warning).
- B) Narrow both the PE and the PM so a sub-linked expense needs Owner/Admin.

My recommendation: A.

### PART B — QuickBooks exclusion

What exists (FILL-B-1): an automatic, trigger-driven integration.
- Invoices, receipts/expenses, expense payments, client payments and refunds queue through `qb_enqueue()`. A 5-minute cron pushes them.
- **QuickBooks has no project object here.** Everything posts to the client's Customer, with the project as memo text.

**Q16. [ASK-15] Where the flag lives and who can read it.** R3 says Owner only, and that must be a database policy. The `projects` UPDATE policy admits Admin, PM and now PE, so a plain column on `projects` would need a trigger to refuse them.

Options:
- A) A new table `project_qb_exclusions` (one row per excluded project: who, when; soft delete re-includes). INSERT/UPDATE are Owner only by RLS. SELECT is Owner + Admin. No PM, PE, foreman or crew arm. `qb_enqueue()` and the worker read it.
- B) A column `projects.qb_sync_excluded`, with a BEFORE UPDATE trigger refusing any non-Owner change. Everyone who reads the project row, the PE included, can then read the flag.

My recommendation: A. It is a real RLS policy, carries its own audit, and the PE cannot even read it.

And may the **Admin see** the state as a read-only line ("Excluded from QuickBooks by the Owner"), or should it be Owner only?

My recommendation: the Admin sees it read-only; otherwise an Admin reconciling books has no way to know why a project is missing.

**Q17. [ASK-16] What "stops future syncing" does at the edges.**
- (a) **Already queued, not yet pushed**, when the project is excluded. Recommendation: the worker drops it at pickup and marks the queue row terminal with the reason "Project excluded from QuickBooks", visible in the accounting panel.
- (b) **Re-included later.** Records created while excluded are never pushed automatically. Recommendation: yes, never. The accounting panel says how many were skipped.
- (c) **Already-pushed invoices edited or voided after exclusion.** They stop syncing, so QuickBooks keeps the old version. R3 implies this, and it is stated here so it is a choice, not a surprise. Recommendation: accept, and show "N records in QuickBooks are no longer updated" on the control.
- (d) **⚠️ Client payments are per client, not per project.** One payment can apply to invoices on several projects (`client_payment_applications`). Recommendation: push the payment only when every applied invoice is on a non-excluded project. Otherwise skip it, with a terminal reason. P5 counts `multi_project_payments` so you can see whether this happens at all.
- (e) **Inbound payments** (QuickBooks → FrameFocus, from the webhook and the CDC backstop) for an already-pushed invoice on a now-excluded project. Recommendation: keep recording them; R3 stops pushing, not receiving.

Options:
- A) All five recommendations.
- B) Name which differ.

**Q18. [ASK-17] The control.**
- It goes in the STATUS section, Owner only: "Exclude from QuickBooks" / "Include in QuickBooks again", with a confirm stating (c).
- When excluded, it shows a status line to Owner and Admin: "Not syncing to QuickBooks since <date> (<owner name>)".
- It is shown only when the company is connected to QuickBooks.
- A second Admin negative: an Admin's no-RETURNING INSERT is refused, counted with the service role, with a sabotage that must go red.
- /m has no STATUS section (it was cut), so no /m control; stated, not a divergence.

Options:
- A) As described.
- B) Also show the control while disconnected, so a project can be excluded before connecting.

My recommendation: B is cheap and useful if you plan to connect a second company; otherwise A.

**Q19. [ASK-18] Build order within C (ASK-6).**

Order:
1. C-3 hotfix (if ASK-5 A).
2. C-1.
3. C-10.
4. C-9 app side.
5. C-2.
6. C-8.
7. C-5.
8. C-4 notice.

Then C-branch 2, then PART B. The order is exposure first, then lockout, then the smallest ruled fixes, then the larger builds.

Options:
- A) This order.
- B) Reorder.

My recommendation: A.

### If you do not answer

Following the prompt:
- For reversible items I take the narrower option and record it:
  - ASK-5 A: the hotfix narrows exposure.
  - ASK-3 C: comment only; moving images between surfaces is not narrow.
  - ASK-10 A.
  - ASK-12 B: the narrower grant. It breaks PARITY, so I record it as a known divergence.
  - ASK-11 C.
  - ASK-6 A.
  - ASK-4 B.
  - ASK-8 A: no comments build.
  - ASK-9 B: per visit, the narrower of the two.
  - ASK-13 A: dropping an arm narrows. It needs your production run in any case.
- I stop at every migration's production step, at ASK-3b (moving rows), and at PART B's design (ASK-15/16/17), where I write up the decision and stop.
