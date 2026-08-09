# M6M-edit-surfaces-spec.md — Editing subs, vendors, team members and contacts on `/m`

> **Status:** SPEC ONLY — nothing in this document is built. [S121]
> **Asked for:** "EDIT ON MOBILE for subs, vendors, team members and contacts — Owner/Admin/PM only."
> **Prerequisite:** §3's five findings. Three of them need a ruling from Josh before any code is written.

---

## 0. Boundary & scope

**In scope.** Editing existing rows from the mobile detail views that now exist: M-27 detail
(`/m/subs/[subId]`, `e07c05c`), M-35 (`/m/team/[memberId]`) and M-36 (`/m/contacts/[contactId]`).

**Out of scope, and each for a stated reason:**

- **Create.** The ask says edit. Create is a different screen, a different set of required fields and a
  different empty-state story, and `contacts` / `subcontractors` both have required columns a mobile form
  would have to collect. Not smuggled in behind "edit".
- **Delete.** `deleteContact` and `deleteSubcontractor` exist and are soft deletes, but a destructive
  action on a phone needs a confirmation pattern `/m` does not have yet, and nothing in the ask requests it.
- **Role changes, invites, deactivation, password reset.** M-35's inherited A-47c cut. These are
  `profiles` operations (see finding 2) and are management, not field work.
- **Rates, markup, EIN.** Finding 5. Not editable, not renderable, not in the form's payload.

### The ask is four surfaces; it is **three tables and three routes**

**Subs and vendors are one table.** `subcontractors.sub_type` is a CHECK-constrained
`'subcontractor' | 'vendor'`, M-27's chips filter on it, and `subcontractors_update_authorized` is one
policy over both. There is no second entity, no second service function and no second policy. So the
build is **three edit routes**, not four — recorded here because "four surfaces" sets an expectation of
four times the work and the honest number is three.

---

## 1. Enforcement audit — what the live policies and services actually permit

Read from the migrations and the service files, not inferred from the pattern.

| # | Surface | Table the mobile screen shows | Existing write function | RLS UPDATE policy | Matches the Owner/Admin/PM ruling? |
|---|---------|-------------------------------|-------------------------|-------------------|-----------------------------------|
| 1 | Subs (M-27) | `subcontractors` | `updateSubcontractor` — `subcontractors-client.ts:15` | `owner, admin, project_manager` — `20260101000000:3758` | **✅ exact match** |
| 2 | Vendors (M-27) | `subcontractors`, `sub_type='vendor'` | *same function* | *same policy* | **✅ exact match** — one table, see §0 |
| 3 | Contacts (M-36) | `contacts` | `updateContact` — `contacts-client.ts:15` | `owner, admin, project_manager` — `20260101000000:3277` | **✅ exact match** |
| 3b | Contact **address** (M-36 renders it) | `contact_addresses` | **NONE** — the file exports only `getPrimaryAddress` | `company_id = get_my_company_id()` **and nothing else** — `20260101000000:3242` | **❌ NO FLOOR — finding 3** |
| 4 | Team member (M-35) | `company_members` | **NONE for this table** — `updateTeamMember` writes `profiles` | `owner, admin` **only** — `20260704210000:92-97` | **❌ PM IS REFUSED — finding 1** |

Two of the three tables already enforce exactly what was ruled. That is the good news and it is worth
stating plainly, because it means for subs, vendors and contacts the mobile guard is **honesty about a
real refusal** (the `requireCoWriteAccess` precedent) rather than the refusal itself.

---

## 2. Where the role gate lives

`app/m/detail-access.ts`, extended — and this is a case where extending it is **correct**, unlike the
read-side temptations that file warns about at length. The difference is the one it already draws for
`requireCoWriteAccess`: on a READ surface with no DB role arm, a new guard invents a permission that
does not exist; on a WRITE surface the database is already refusing these roles, and the guard exists so
the refusal arrives as a screen that explains itself (A-66) instead of an RLS error under a Save button.

Proposed, mirroring `CO_WRITE_ROLES` exactly:

```ts
/** The ruling's three roles. Mirrors subcontractors_update_authorized and contacts_update_authorized. */
const EDIT_ROLES = ['owner', 'admin', 'project_manager'];
export async function requireEditAccess(surface: EditSurface, backTo: string): Promise<void>
export function canEdit(role: string | null | undefined): boolean
```

`DENIED_COPY` gains one entry per surface, worded **by role** and not by exclusion — the
`'co-write'` precedent: this refuses four roles, not one, and a foreman reading "not available to
subcontractors" would reasonably conclude the app is broken.

**The Edit affordance is hidden by `canEdit()` on the detail screen and refused by
`requireEditAccess()` on the route.** Both, per D-54's two obligations: a build that ships only the
hidden button has shipped no permission at all.

---

## 3. FINDINGS — three need a ruling before any code is written

### Finding 1 ✅ **CLOSED [S121, Josh] — team edit narrows to Owner/Admin. No migration.**

> **RULED:** _"TEAM EDIT NARROWS TO OWNER/ADMIN. `company_members`' UPDATE policy already enforces exactly
> that; the ruling changes, not the policy. No migration."_
>
> Option **(a)** below is taken. `EDIT_ROLES` is therefore **per-surface**, not one shared constant:
> subs, vendors and contacts carry `['owner','admin','project_manager']` (mirroring their policies), and
> team carries `['owner','admin']` (mirroring its own). A single shared list would have to be wrong for
> one of them, and the whole point of this audit is that the three policies are not identical.
>
> **This closes the ruling half of the blocker and nothing else. Finding 2 still blocks the build** —
> see below.

#### The original finding, retained


`company_members_update_authorized` is `company_id = get_my_company_id() AND get_my_role() = ANY
(ARRAY['owner','admin'])`. There is no `project_manager` arm. A PM who is shown an Edit button on M-35
and taps Save gets an RLS refusal.

This is the same shape as the punch flag: a ruling and a live policy that disagree, found by reading the
policy rather than by trusting the pattern that held for the other two tables.

**Two ways out, and it is Josh's call:**

- **(a) Narrow the ruling for team to Owner/Admin.** No migration. `EDIT_ROLES` becomes per-surface, and
  the team surface carries `['owner','admin']`. Defensible: `company_members` is roster management, it
  sits beside invite/deactivate/role-change which are already Owner/Admin, and mobile would then match
  desktop rather than diverge from it.
- **(b) Migrate the policy to add `project_manager`.** This changes DESKTOP behaviour too — the policy is
  not mobile-specific — so it is a platform ruling, not a mobile one, and it needs its own reasoning
  about why a PM may rename a crew member.

~~**Do not build the team edit surface under either assumption.**~~ **(a) is now ruled** — mobile is
deliberately narrower than the original ask for team, and it says so here rather than silently.

### Finding 2 ✅ **CLOSED [S121, Josh] — it is BOTH tables. M-40 is built.**

> **RULED:** _"editing a team member means BOTH `company_members` (member type, schedule color, active
> status) and `profiles` (name, email, phone)."_ Not one or the other.
>
> Built as `/m/team/[memberId]/edit` with `lib/services/members-client.ts` — a NEW named function per
> table, because the desktop `updateTeamMember` writes `profiles` by profile id and cannot serve the
> `company_members` half at all.
>
> **THE COMBINED PERMISSION IS NOT "OWNER/ADMIN", and that is the finding inside the finding:**
>
> | | who may write it |
> | --- | --- |
> | `company_members` | owner, admin — **any** member |
> | `profiles` (owner) | owner — anyone (the WITH CHECK only stops self-demotion) |
> | `profiles` (admin) | admin — but **not** an owner/admin target, and **not** their own row |
>
> So **an Admin editing another Admin, the Owner, or themselves gets the roster half and a refused
> profiles half.** Ordinary, not an edge case.
>
> **⚠️ A REFUSED UPDATE DOES NOT ERROR — it affects zero rows.** Both writes therefore `.select()` and
> check the row count; without that the screen would report "Saved" while half the form was dropped.
>
> **PARTIAL FAILURE FOLLOWS A-67b**: two writes, no transaction, and whatever landed stays landed. The
> screen reports **per half** and names the permission reason. A compensating rollback would be a third
> write that can itself fail, on a screen whose whole problem is that writes fail — and it would discard
> an edit the user meant, since the refusal is usually a permission rather than a mistake.
>
> **A-47's trap is a first-class state, not an error**: 32 of 33 subcontractor members have no
> `profile_id`, so the profile inputs are ABSENT and the screen says why, rather than rendering four
> fields that write nowhere.
>
> **⚠️ FLAGGED — `profiles.email` IS NOT THE SIGN-IN ADDRESS.** The credential is `auth.users.email`,
> changed through Supabase Auth, which this does not touch. In scope by ruling; the form says so on the
> field, because the alternative is a user who "changed their email" and cannot sign in.

#### The original finding, retained

**There is no update function for the table M-35 reads, and the desktop one edits a different entity**

M-35 renders `company_members` via `getMember(id)` (`members.ts:34`). `team.ts`'s `updateTeamMember`
writes **`profiles`**, by profile id. Those are different tables holding different columns:

| Lives on `company_members` | Lives on `profiles` |
| -------------------------- | ------------------- |
| `display_name`, `member_type`, `schedule_color` | `first_name`, `last_name`, `phone`, `role`, `notes` |

This is the **A-47 trap** the codebase already documents: `profiles` drops every subcontractor roster
member, of which rebuild-test holds 32 with no profile at all. So `updateTeamMember` cannot edit most of
the rows M-35 can display.

> **⚠️ STILL OPEN AND STILL BLOCKING [S121]. Finding 1 being closed does not close this one.**
> Ruling 4 settled WHO may edit a team member. It did not settle WHAT a team member is, and the build
> cannot start without that: `updateTeamMember` writes **`profiles`**, which is **A-47's trap** — it
> resolves by profile id and drops every roster member without one, of which rebuild-test holds **32 of
> 33 subcontractors**. M-35 reads `company_members`. A build that called the existing function would
> edit a different entity from the one on screen and silently fail for most of the roster.

**The ruling needed: what does "edit a team member" mean?** Renaming the roster entry
(`company_members.display_name`) and renaming the person (`profiles.first_name`) are different actions
with different policies — `profiles` is Owner-or-Admin with `WITH CHECK` and an Admin arm that excludes
owners and self. Answering it by writing whichever table is convenient would silently pick one.

Whichever is chosen, **a new named service function is required** (`members-client.ts` does not exist).
Not a page-level query — §4.11's "every figure bound to a named service function" applies to writes.

### Finding 3 ⚠️ **`contact_addresses` has no role floor at all**

`contact_addresses_insert_authenticated`, `_update_authenticated` and `_delete_authenticated` are each
`company_id = get_my_company_id()` and nothing else. **Every role — crew, foreman, subcontractor —
can rewrite or DELETE any contact's address today.** There is also no write function: the file exports
`getPrimaryAddress` only.

Pre-existing and desktop-wide; mobile does not introduce it. But M-36 renders the address, so the
obvious edit form would include it, and that form would be the first FIELD-FACING way to reach a table
that gates nothing.

**Recommendation: cut the address from v1 of the contact edit form.** The contact's own columns are
properly floored at Owner/Admin/PM; the address is not, and shipping them in one form would put a
correctly-gated field and an ungated one behind the same Save button. If the address is wanted, it wants
a policy first. Filed for TECH_DEBT alongside #117/#132.

### Finding 4 ⚠️ **None of the three UPDATE policies carries `WITH CHECK`**

`contacts_update_authorized`, `subcontractors_update_authorized` and `company_members_update_authorized`
are all `USING (…)` with no `WITH CHECK` — verified by parsing each statement, not by eye.

`USING` decides which rows you may target. `WITH CHECK` decides what a row may BECOME. Without it, an
authorized PM may UPDATE a contact and set `company_id` to another tenant's id, and the row leaves the
company. No trigger prevents it: the company_id-immutability migrations cover 6A segments, 7A expenses,
7C payables and 7E payments, and none covers these three tables.

That the codebase knows the pattern is visible one screen away — `profiles_update_owner` and
`profiles_update_admin` both carry `WITH CHECK`. So this reads as an omission, not a decision.

**Pre-existing, desktop-wide, and NOT caused by this work** — the desktop edit forms already run through
these policies. It is recorded here because a spec that adds three more write surfaces should not
inherit it silently. **Mitigation available without a migration:** the service functions accept a named
field subset and never a spread of the row, so `company_id` is never in an update payload (§4). That is
a service-layer mitigation of a database gap, which is exactly the weak shape detail-access.ts warns
about — so it is a mitigation, not a fix. TECH_DEBT entry recommended.

### Finding 5 ⚠️ **An edit form is the easiest way to undo A-46's cut**

`getSubcontractor()` is `select('*')`, so `default_hourly_rate`, `default_markup_percent` and `ein`
arrive in the page's props. A form built by loading the row into state and saving it back would put
markup — the company's margin on that sub, withheld from PM/foreman/crew everywhere else by the
Financial Visibility Floor — into the DOM and into the update payload.

**The rule this spec sets: the edit form is a NAMED FIELD SUBSET, never the row.** §4 lists the fields
per surface. A-46's absence assertion must be repeated against the edit route, exactly as `e07c05c`
repeated it against the detail route.

---

## 4. Proposed design (subject to §3)

**Routes** — pages, not sheets (D-28, D-55), and detail-depth so `showsBackChevron` already covers them:

```
/m/subs/[subId]/edit          M-38   subs and vendors — one route, one form
/m/contacts/[contactId]/edit  M-39
/m/team/[memberId]/edit       M-40   BLOCKED on findings 1 and 2
```

**Editable fields, named exhaustively.**

| Surface | Fields | Explicitly excluded |
| ------- | ------ | ------------------- |
| Subs / vendors | `company_name`, `contact_first_name`, `contact_last_name`, `phone`, `mobile`, `email`, `trade_type`, `license_number`, `insurance_expiry`, `status`, `sub_type` | `default_hourly_rate`, `default_markup_percent`, `ein` (finding 5); `rating`, `rating_notes` (§4.13.4's cut — a desktop management judgement); `notes`, `tags` |
| Contacts | `first_name`, `last_name`, `company_name`, `contact_type`, `phone`, `mobile`, `email` | the ADDRESS (finding 3); `notes`, `tags` (A-49d — the cut "matters more" on a detail surface, and more again on one that can write) |
| Team | *blocked — see findings 1 and 2* | every management control (A-47c); every rate |

**Offline.** Online-only, disabled with a plain message, in delivery check-in's shape (D-6). **Not
queued:** §5.2's offline entity set is closed at four and none of these is in it, and D-50's reversal
made "disabled offline with a plain message" load-bearing rather than hypothetical.

**Success.** Back to the detail view with `router.refresh()`, so the screen the user came from shows what
they just wrote. Not back to the list — the detail is what they were reading.

---

## 5. Acceptance criteria (proposed)

- **A-68** — the Edit affordance is absent on the detail view for foreman, crew and subcontractor, and
  present for owner, admin and PM.
- **A-68b** — the route itself refuses those three roles server-side and lands them on the detail view
  with a message that names the roles who can (A-66). A build that ships only A-68 has shipped no
  permission.
- **A-69** — a PM edits a subcontractor and a contact successfully; the DB accepts both, proving the
  guard mirrors the policy rather than guessing at it.
- **A-70** — no rate, markup or EIN in the DOM or in the update payload on the sub edit route, under
  **every** role including Owner (A-46's shape, on the write surface).
- **A-71** — the update payload contains only the named fields in §4. Asserted on the request, not the
  form: a hidden input or a spread row is invisible to a DOM assertion.
- **A-72** — offline, the Save control is disabled and says so; nothing enters the queue.
- **A-73** — `company_id` never appears in an update payload from `/m` (finding 4's mitigation, pinned so
  it cannot silently regress).
- **A-74** — the edit route carries the back chevron and not the hamburger (A-30f's family).

---

## 6. Open items — REQUIRING A RULING

1. ~~**Finding 1** — team edit: narrow the ruling to Owner/Admin, or migrate?~~ **✅ CLOSED [S121, Josh] — narrowed to Owner/Admin. No migration.**
2. ~~**Finding 2** — does "edit a team member" mean `company_members` or `profiles`?~~ **✅ CLOSED [S121, Josh] — BOTH.**
3. ~~**Finding 3** — is the contact address in or out of v1?~~ **✅ CLOSED [S121, Josh] — `contact_addresses` gains a role floor by migration; see `20260829000000_contact_addresses_role_floor.sql`. The address is a WRITE surface question separately from the floor, and stays out of v1's edit form (§4).**
4. **Finding 4** — raise a TECH_DEBT entry for the three missing `WITH CHECK` clauses? (Recommendation: yes;
   it is pre-existing and platform-wide, so it should not be fixed inside an M6M slice.)

~~**Item 2 blocks the team surface entirely**~~ **✅ ALL FOUR SURFACES ARE NOW BUILT [S121]** — subs,
vendors and contacts at `3912794`, team (M-40) at `/m/team/[memberId]/edit`. Findings 1, 2 and 3 are
closed.

**Finding 4 remains open, and it is deliberately NOT fixed here**: the three UPDATE policies missing a
`WITH CHECK` clause are pre-existing and platform-wide, so the fix does not belong inside an M6M slice.
It needs a TECH_DEBT entry rather than a migration in this branch.

_(The recommended split this section originally argued for — build subs, vendors and contacts against §4
rather than holding all three behind a ruling that only affected the fourth — was followed, and the
fourth has since caught up.)_
