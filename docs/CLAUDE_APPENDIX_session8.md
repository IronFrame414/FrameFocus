# CLAUDE.md Appendix — Session 8 Additions

> **Purpose:** This file contains updates that need to be folded into the main `CLAUDE.md` during Session 9.
> **Action:** In Session 9, Claude Code should merge these additions into `CLAUDE.md` at the indicated sections, then delete this appendix file.
> **Created:** Session 8 (April 9, 2026)

---

## 1. Update the file header

**Find this line near the top of CLAUDE.md:**
```
> **Last updated:** April 8, 2026 (Session 6 — Planning, continued + Admin role audit)
```

**Replace with:**
```
> **Last updated:** April 9, 2026 (Session 8 — Housekeeping, repo restructure, generated types decision)
```

---

## 2. Add to "Known Codespaces Gotchas" section

**Append these new entries to the existing bullet list:**

- **RLS inside SECURITY DEFINER triggers:** `SET row_security TO 'off'` at the function level is silently ignored in Postgres unless the executing role is a superuser or table owner. Inside a `SECURITY DEFINER` trigger on `auth.users`, it does NOT bypass RLS. The working pattern is to put the RLS-protected query inside a separate `SECURITY DEFINER` **SQL** function (not plpgsql) and call that from the trigger. See `get_invitation_for_signup()` in Migration 015 for the reference implementation.
- **Context files describe intent, git describes state.** Never trust `context-N.md` files for "is X committed?" — always run `git log --oneline -15` at the start of a session to ground truth the repo. Session 8 wasted ~30 minutes chasing phantom work because context8.md said migrations were uncommitted when git log showed they were already in.
- **VS Code browser drag-and-drop targets are finicky.** Drop zones are ambiguous — files can end up at filesystem root (`/`) instead of the intended folder. If uploading fails with "Insufficient permissions" errors referencing `\filename.md`, the drop missed the target folder. Right-click the destination folder → "Upload..." is more reliable when available.

---

## 3. Add new section: "Database Patterns"

**Insert this as a new section after "Known Codespaces Gotchas":**

### Database Patterns

**RLS-bypassing helper functions for triggers.** When a trigger on `auth.users` (or any table) needs to query an RLS-protected table, the trigger runs in a context where `get_my_company_id()` and similar helpers return NULL — meaning RLS filters out every row. The working pattern:

1. Create a `SECURITY DEFINER` **SQL** function (not plpgsql) that does the query
2. Call that function from the trigger

SQL functions with `SECURITY DEFINER` reliably bypass RLS in this context. See `get_invitation_for_signup()` (Migration 015) and `get_invitation_by_token()` (used by the invite acceptance page) for working examples.

**Why SQL and not plpgsql:** plpgsql `SECURITY DEFINER` functions still hit RLS in some trigger contexts. SQL `SECURITY DEFINER` functions bypass reliably. When in doubt, use SQL.

---

## 4. Add new section: "Session Workflow"

**Insert this as a new section before "Platform Modules":**

### Session Workflow

Every session should follow this pattern to avoid drift between context and reality:

**At session start:**
1. Run the ground-truth snapshot (`scripts/session-start.sh` once created, or run the commands manually) and paste the output
2. State a definition-of-done for the session (3–5 specific, verifiable outcomes)
3. Review `STATE.md` for current status and open items

**During the session:**
- Commit often, even for WIP (prefix messages with `WIP:`)
- Use `// TODO(session-N):` comments for anything deferred to a later session
- Don't chase rabbit holes — log new tech debt to `STATE.md` and keep moving

**At session end:**
1. Update `STATE.md` with new state and any new tech debt discovered
2. Create `docs/sessions/contextN.md` with decisions made, outstanding items, and next session plan
3. Commit and push everything, including documentation files
4. Verify next session can be resumed by reading only `STATE.md` + the latest context file

**Chat vs. Claude Code:**
- **Claude Chat:** Strategy, architecture decisions, product planning, document generation (roadmaps, context files, CLAUDE.md updates), product research with web search, explaining concepts
- **Claude Code:** Multi-file edits, investigation (`grep`, file reads), refactors across the codebase, running migrations and verifying results, debugging builds, anything that involves touching code in the repo
- **Hybrid:** Plan in Chat → execute in Claude Code → review in Chat → close session in Chat

---

## 5. Update the Repository Structure diagram

**Find the existing structure diagram and add these new directories under the root:**

```
├── docs/                       # Reference documentation (NEW Session 8)
│   ├── roadmap/                # Platform roadmap docs (.docx, .xlsx)
│   │   ├── FrameFocus_Development_Roadmap.docx
│   │   ├── FrameFocus_Platform_Roadmap.docx
│   │   ├── FrameFocus_Platform_Roadmap.xlsx
│   │   └── FrameFocus_Quick_Reference.docx
│   └── sessions/               # Session-by-session context files
│       ├── context1.md         # Session 1: Strategic planning
│       ├── context2.md         # Session 2: First coding session
│       ├── context3.md         # Session 3: Module 1E (Invites + Admin)
│       ├── context4.md         # Session 4: Module 1F (Stripe billing)
│       ├── context5.md         # Session 5: Audit fixes + full system test
│       ├── context6.md         # Session 6: Company settings + Module 2
│       ├── context7.md         # Session 7: Module 3 planning
│       ├── context8.md         # Session 8: Admin invite bug fix (Migration 015)
│       └── context9.md         # Session 9: Housekeeping + Option C decision
├── STATE.md                    # Live repo state dashboard (NEW Session 8)
```

---

## 6. Add to "Known Technical Debt" section

**Append these new items to the existing Known Technical Debt table or list:**

| # | Item | Priority | Discovered | Notes |
|---|------|----------|------------|-------|
| 18 | `team-page-client.tsx` has local `ROLE_LABELS` | Medium | Session 8 | Should import from `@framefocus/shared`. Resolves once Option C (generated types) lands in Session 9. |
| 19 | `invite-form.tsx` has local `INVITABLE_ROLES` | Medium | Session 8 | Should import from `@framefocus/shared`. |
| 20 | `invite-form.tsx` imports `Invitation` without `import type` | Low | Session 8 | Cross-boundary type import should use `import type` per convention. |
| 21 | `packages/shared/constants/index.ts` has role constants inline AND re-exports `./roles` | High | Session 8 | Duplication inside the shared package. The inline `COMPANY_ROLES` and `ROLE_LABELS` are **missing the `admin` role** — latent drift bug. Fix: move inline `SUBSCRIPTION_TIERS` and `MODULE_STATUS` to their own files, make `index.ts` a pure barrel. |
| 22 | `packages/shared/types/index.ts` `Company` interface missing `website` and `license_number` | Medium | Session 8 | Columns exist in DB (Migration 009) but not in the type. Will be fixed automatically by Option C generated types in Session 9. |
| 23 | Migration filename `014_handle_new_User_Bypass_rls.sql` breaks naming convention | Low | Session 8 | Rename to `014_handle_new_user_bypass_rls.sql` for consistency. Cosmetic only. |
| 24 | Supabase email confirmation is currently **OFF** (from Session 7 rate-limit workaround) | High | Session 7 | Must be re-enabled before any real users sign up. Dashboard → Authentication → Providers → Email → "Confirm email" toggle. |

---

## 7. Add new section: "Generated Types Workflow" (Session 9+)

**Insert this as a new section near "Database Patterns" — only after Option C is implemented in Session 9:**

### Generated Types Workflow

FrameFocus uses `supabase gen types typescript` to generate TypeScript types from the live database schema. This is the single source of truth for all database types.

**Regenerate types after every migration:**
```bash
npm run db:types
```

(Script defined in root `package.json` — runs `supabase gen types typescript --project-id jwkcknyuyvcwcdeskrmz > packages/shared/types/database.ts`)

**Using generated types:**
```typescript
import type { Database } from '@framefocus/shared';

// Row type (what you read from the DB)
type Contact = Database['public']['Tables']['contacts']['Row'];

// Insert type (what you write — omits auto-generated columns)
type ContactInsert = Database['public']['Tables']['contacts']['Insert'];

// Update type (all fields optional)
type ContactUpdate = Database['public']['Tables']['contacts']['Update'];
```

**View types (trimmed subsets for forms, etc.) should be derived, not redefined:**
```typescript
type CompanyData = Pick<
  Database['public']['Tables']['companies']['Row'],
  'id' | 'name' | 'address_line1' | 'city' | 'state' | 'zip' | 'phone' | 'website' | 'trade_type' | 'license_number' | 'logo_url'
>;
```

**Do not hand-write database interfaces.** If a hand-written interface is tempting, either (a) derive it from the generated type with `Pick`/`Omit`, or (b) add the column to the database and regenerate.

---

## 8. Reference documents list update

**Find the "Reference Documents" section and update it to reflect the new repo location:**

All reference documents now live in `docs/roadmap/` in the repo (no longer uploaded per session):

- **FrameFocus_Platform_Roadmap.docx** — 51-page comprehensive reference (11 modules, workflows, AI features, roles, risks)
- **FrameFocus_Platform_Roadmap.xlsx** — 8-tab planning spreadsheet
- **FrameFocus_Quick_Reference.docx** — 5-page scannable summary
- **FrameFocus_Development_Roadmap.docx** — Original Session 1 business roadmap

---

## 9. Cleanup instructions for Session 9

After merging the above into `CLAUDE.md`:

1. Verify `CLAUDE.md` contains all 8 sections above
2. Delete `docs/CLAUDE_APPENDIX_session8.md` (this file)
3. Commit: `docs: merge Session 8 CLAUDE.md appendix`
4. Push

---

**End of appendix.**
