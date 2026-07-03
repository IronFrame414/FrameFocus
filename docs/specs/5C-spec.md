# 5C — Punch Lists — Spec

> **Design authority:** `module5-architecture.md` (`7eaaaa3`) §5.9 (and `future_module_architecture.md` §5.3). Cites them by section. Immutable once its build starts; changes are additive blocks.
>
> **Status:** Fully specced. No open Q-numbers remain — **Q-N8** (verification authority) is resolved below. The §5.9 single-photo model is **extended** from the planning interview (reference + completion photos, two per-item requirement toggles); those deltas are marked against §5.9.
>
> **External dependency — `company_members`:** `punch_list_items.assignee_id`, `completed_by`, and `verified_by` target `company_members(id)`. Pre-M5 foundation, not built — 5C cannot build until it ships. RLS uses `get_my_member_id()`.
>
> **Build position:** after **5A** (projects; and the project-complete transition this spec wires the punch gate into — §6) and **5B**; before/independent of **5D**. Supersedes `CLAUDE_MODULES.md` §6.4 (per `future_module_architecture` §5.3 — mark 6.4 superseded).

---

## 1. Scope & Dependencies

**Scope (§5.9):** `punch_lists` and `punch_list_items`; the found→closed item lifecycle with a photo gate and an optional verification sign-off; reference + completion photos (Module 3 reuse, annotatable); the project-complete gate; punch-specific permissions.

**Locked model (from the planning interview):**

- **Multiple lists per project** (e.g. "Final walkthrough," "Pre-drywall").
- **Per item, set at list-build:** an optional **reference photo** (the defect), a **completion-photo requirement** (default on), and a **verification requirement** (default on). The requirement toggles are **Foreman+ only**.
- **Crew fixes** → marks **complete** (blocked until a completion photo is attached, if required). **Sometimes** a supervisor **signs off** → **verified**.
- Both photos are **Module 3 files** — shown on the item _and_ in project photos (one file, no duplicate), both **annotatable** with the shared markup.

**Dependencies:** 5A (`projects` parent FK; project-complete logic, §6); `company_members` (external — assignment/completion/verification); Module 3 `files` + shared `MarkupViewer` (photos, §5); Module 1 `profiles` (roles for permissions, §7). Module 9 reads the `is_client_visible` stub later.

**Conventions (CLAUDE.md):** standard columns; per-tenant BEFORE UPDATE trigger; RLS via `get_my_company_id()`; service/client split; soft-delete filtered in the service layer.

---

## 2. `punch_lists` table (§5.9a)

Standard columns plus:

```sql
punch_lists
  project_id  UUID NOT NULL REFERENCES projects(id)
  name        TEXT NOT NULL      -- e.g. "Final walkthrough — Johnson kitchen"
```

---

## 3. `punch_list_items` table (§5.9a + interview deltas)

Standard columns plus:

```sql
punch_list_items
  punch_list_id             UUID NOT NULL REFERENCES punch_lists(id)
  project_id                UUID NOT NULL REFERENCES projects(id)   -- denormalized for direct project queries
  title                     TEXT NOT NULL
  description               TEXT
  status                    TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','in_progress','complete','verified'))
  priority                  TEXT CHECK (priority IN ('low','medium','high','urgent'))
  location                  TEXT                    -- room / area
  trade                     TEXT                    -- responsible trade

  assignee_id               UUID REFERENCES company_members(id)   -- broad; NOT membership-gated

  -- Photos (REPLACES §5.9's single photo_file_id) — both are Module 3 files (§5)
  reference_photo_file_id   UUID REFERENCES files(id)   -- optional defect photo, set at list-build
  completion_photo_file_id  UUID REFERENCES files(id)   -- proof-of-fix, added by crew at complete
  requires_completion_photo BOOLEAN NOT NULL DEFAULT true   -- toggle at list-build (Foreman+)
  requires_verification     BOOLEAN NOT NULL DEFAULT true   -- toggle at list-build (Foreman+)

  -- Completion (added to support "completer can't verify own" — §4)
  completed_by              UUID REFERENCES company_members(id)
  completed_at              TIMESTAMPTZ

  -- Verification
  verified_by               UUID REFERENCES company_members(id)
  verified_at               TIMESTAMPTZ

  -- Module 9 hook (stub): client visibility
  is_client_visible         BOOLEAN DEFAULT false
```

**Deltas from §5.9 (flagged):** the doc's single `photo_file_id` is dropped in favor of `reference_photo_file_id` + `completion_photo_file_id`; `requires_completion_photo`, `requires_verification`, `completed_by`, and `completed_at` are new (needed for the toggles and the separate-eyes rule confirmed in the interview).

---

## 4. Item lifecycle & gates

Status flow: `open → in_progress → complete → verified`.

- **Complete** — marked by the assignee/crew. Sets `completed_by` = the acting member, `completed_at` = `now()`.
  - **Photo gate:** if `requires_completion_photo` is true, the service layer **blocks the transition to `complete`** until `completion_photo_file_id` is set.
- **Verify** — applies only when `requires_verification` is true.
  - Sign-off by a permitted role (§7) sets `verified_by`/`verified_at`, `status → verified`.
  - **Separate eyes:** `verified_by` **must not equal `completed_by`** (the person who fixed it can't verify their own). Service-layer enforced.
  - When `requires_verification` is **false**, `complete` is the terminal closed state — no sign-off step applies.
- **Gate order (confirmed):** the photo gate sits **before** the sign-off gate — an item that can't reach `complete` can't be `verified`. Not a separate rule; it falls out of the ordering.

**Requirement toggles** (`requires_completion_photo`, `requires_verification`) are set when the list is built and are **Foreman+ only** to change (§7) — crew editing an item cannot alter them.

---

## 5. Photos & Module 3 integration

- `reference_photo_file_id` and `completion_photo_file_id` are **`files` rows carrying the project's `project_id`** — so each photo appears in the project's photos **automatically**, and on the punch item, as **one file** (no duplicate copy).
- Both are **annotatable** via the Module 3 shared `MarkupViewer` — same markup as any project photo.
- Reference photo: optional, added at list-build. Completion photo: added by crew at `complete` (required unless the toggle is off).

---

## 6. Project-complete gate (wires the 5A §2 obligation)

5A §2 **defined and owns** the rule "a project can't be marked `complete` until its punch items are closed"; **5C implements enforcement** (it's the module that creates `punch_list_items`).

- An item is **closed** when:
  `(requires_verification = true  AND status = 'verified')`
  **OR** `(requires_verification = false AND status = 'complete')`.
- The `projects` **`active → complete`** transition is **blocked** unless **every `punch_list_items` row for the project** (across all its lists) is closed by that definition. Open / in_progress items, and complete-but-verification-pending items, block completion.
- Enforced in the service layer at the project-complete transition (the same layer that owns the §5.2a lifecycle).

---

## 7. Permissions (punch-specific — overrides the 5A §3 write pattern)

| Action                                                                                          | Who                                                                    |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Create lists**                                                                                | all roles **incl. Crew**                                               |
| **Add items** to any list                                                                       | all roles **incl. Crew**                                               |
| **Edit item fields** (title, description, priority, location, trade, assignee, reference photo) | all roles **incl. Crew** — applies to **any** item, not just their own |
| **Toggle** `requires_completion_photo` / `requires_verification`                                | Foreman / PM / Admin / Owner                                           |
| **Complete** an item (mark fixed + attach completion photo)                                     | its assignee / crew                                                    |
| **Verify** (sign-off)                                                                           | Foreman / PM / Admin / Owner — **not** the completer                   |
| **Soft-delete** a list or item                                                                  | Foreman / PM / Admin / Owner (baked in — crew cannot delete)           |

- Crew can add lists/items, edit item fields on any item, and complete their assigned items — but **cannot** change the requirement toggles, verify, or delete.
- Enforcement split: RLS handles the row-level INSERT/UPDATE/DELETE role gates; **column-level and cross-field rules are service-layer** (crew not changing the toggle columns; `verified_by ≠ completed_by`; photo-before-complete). A trigger can harden the toggle-column protection if wanted (log as tech debt).

---

## 8. RLS & visibility

- **Read** — company-scoped + **project-visible** (inherit **5A §3**: Owner/Admin all projects; PM/Foreman/Crew their assigned projects). A punch row is visible when its `project_id` resolves to a visible project. (Crew must see a project's lists to add to them — consistent.)
- **Write** — the §7 matrix: crew may INSERT lists/items and UPDATE item fields; Foreman+ may DELETE and change toggles; verification restricted per §7.
- Soft-delete Foreman+ only.

---

## 9. Acceptance example

**PRJ-0001 final walkthrough.** Foreman creates list **"Final walkthrough — Johnson kitchen."** Items added:

- **"Gouge in island panel"** — reference photo attached (the defect); `requires_completion_photo` = on; `requires_verification` = on; assignee Bob, trade carpentry.
- **"Touch up paint, hallway"** — no reference photo; Foreman **unchecks** `requires_verification` (minor); `requires_completion_photo` stays on; assignee Bob.
- **"Missing outlet cover, kitchen"** — crew member adds it mid-walk (crew can add); assignee Mike.

Flow:

- Bob fixes the gouge, tries to mark **complete** → **blocked** until he attaches a **completion photo** (required). He attaches it (lands on the item _and_ in project photos, annotatable) → `status = complete`, `completed_by` = Bob. Foreman signs off → `verified_by` = Foreman (≠ Bob), `status = verified`. **Closed.**
- Bob touches up paint, attaches the completion photo, marks **complete**. Verification was unchecked → `complete` is terminal. **Closed.**
- Outlet cover still `open`.

**Project-complete gate:** the project **cannot** go `complete` while the outlet-cover item is open. Once it's fixed and closed (per its own toggles), all items are closed → the project may be marked `complete`.

— End of 5C spec —
