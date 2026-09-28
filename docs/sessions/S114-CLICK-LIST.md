# S114 — what a person still has to click (Josh, on a phone where it says so)

Ordered to find the most breakage soonest. ✅ = passed; ✗ = what you saw instead (send it to me).
Everything here is deployed to production UNLESS marked "(after merge)" or "(after your runbook)".

## 1. Production queries first (SQL Editor, production)
- **P6 — bid-token exposure (most urgent).** Query in `docs/sessions/S114-C-questions.md`. It says which live
  bid tokens existed and which staff files each could have fetched before the C-3 hotfix deployed
  (`951d2623`, 2026-09-28). Decides whether anyone has to be told.
- **P2 STEP 2 — the one legacy image** (Best Western, category `other`): run the backfill's STEP 2 from
  `docs/sessions/S111-photos-backfill-PREPARED.sql` yourself (it moves a row between surfaces).

## 2. Password reset — C-1 is DEPLOYED-UNPROVEN until this passes (after merge)
On production, from a signed-out browser: Forgot password → your email → open the email **on your phone**
(a different device) → tap the link → you land on "Set a new password" (NOT the site root) → set one →
sign in with it on the phone. Then again on the first device. The link in the email should start with
`https://frame-focus-eight.vercel.app/auth/confirm?token_hash=`.

## 3. The Project Executive — G-6, PART A is NOT verified until this passes
Sign in as the production PE. On its assigned project: Budget, Invoices, Profitability, Payments, Change Orders,
Lien Releases show money. Create a task; open the schedule; upload a photo. Contracts: no route to edit or void.
Then confirm an UNASSIGNED project is not listed at all. (After C-branch 1 merges, add: open a subcontractor
from Subcontractors → the profile opens, read-only, no Edit.)

## 4. Bid page (deployed)
Open a live bid link: the page works, bid submits; nothing lists documents (expected until PART E, `#169`).

## 5. After C-branch 1 merges
- **Contacts:** add a contact with ONLY a company (no first/last) on desktop → saves; the list and the project
  client card show the company. Also "Also send to" on an estimate: add a company-only recipient.
  On /m, edit a contact down to company-only → saves (it used to fail with a database error).
- **Photos:** on a project with a daily log that has a photo, the Photos page shows that photo and it can be
  marked up; the same photo is still in Files.
- **Site-visit markup (both surfaces):** on an UNSENT visit, tap a photo → markup opens → draw → save → the tile
  shows the marks. On a SENT visit, photos captured before sending show "Part of a sent estimate — can't be
  annotated." on the tile; a photo added after sending can still be marked up. Try as a crew member on the phone.
- **Phone photos with no project:** take a photo from the tab bar, don't pick a project, tap Done → every /m screen
  shows the red "…will be DELETED from this phone in N days" strip; tapping it opens the tray.
- **Proposal (C-6):** open a "Summary with Descriptions" proposal's signing link — each described line shows its
  name and description, no price.

## 6. After your runbook (C-branch 2 + PART B)
- **/m new site visit:** new contact with only a company → records.
- **PE cannot change the contract value** — there is no screen for it; nothing to click.
- **QuickBooks exclusion:** as Owner, project overview → Status card → "Exclude from QuickBooks" → confirm → the
  card says "Not syncing to QuickBooks since …". As Admin: the line shows, no button. As the PE / a PM: nothing
  about QuickBooks at all. "Include in QuickBooks again" works.

## 7. Carried from earlier sessions (G-4, unchanged)
B-10 markup placement; the 2026-09-26 markup fix / display size / sixteen audit fixes; the site-visit textarea vs
the camera button on a real iPhone; a file from each of the nine file-sheet sites and the portal; a crew phone in
Español; a Spanish-named proposal; a row dragged in Safari on a Mac.
