# Context — FrameFocus Session 39

**Date:** April 21, 2026
**Scope:** Finish the team member edit page started in Session 37. Close #14, #15, #17. #16 partially closed (action works; email delivery blocked by rate limit during smoke test).
**Outcome:** `/dashboard/team/[id]` live. All 7 smoke-test cases from context37 passed (case 6 partial — Supabase rate limit, not a code issue).

---

## Tech debt closed

### #14 — Team member edit UI

**What was built:**

- `apps/web/app/dashboard/team/[id]/page.tsx` — server component. Auth gate, profile fetch, and four redirect paths: not signed in → `/sign-in`; no profile → `/sign-in`; PM/Foreman/Crew → `/dashboard`; Admin viewing Owner/Admin (non-self) → `/dashboard`. Self-access renders a read-only amber notice instead of the form.
- `apps/web/app/dashboard/team/[id]/edit-form.tsx` — client component. Five editable fields (first/last name, phone, role, notes). Role dropdown is caller-scoped: Owner sees admin+PM+foreman+crew, Admin sees only PM+foreman+crew. `useTransition` for pending state, inline success/error messages per action.
- Row-click wired on `team-page-client.tsx` (cursor:pointer, hover highlight, `router.push` to `/dashboard/team/{id}`).

**UX decisions locked before build (from context37 deferred list):**

1. Delete confirmation: two-step inline button (no modal).
2. Reset password: no pre-action confirmation, inline success message after.
3. Save success: "Saved." inline for ~1 second, then redirect to `/dashboard/team`. Added mid-build after case 1 smoke test.
4. Reset success: inline message "Password reset email sent to {email}".
5. Phone: free text. #5 stays open.
6. Role UI: native `<select>`.
7. Owner promotion: `owner` not in dropdown. #66's territory.

**Also added mid-build:** back link ("← Back to team") at top of form. Not in original scope but trivial and obviously needed.

### #15 — Team member delete UI

Two-step inline confirmation. `deleteTeamMemberAction` (Session 37) wires unchanged. Verified in smoke test: deleted crew member disappears from team list and cannot sign in (login rejected on retry).

### #17 — Team member notes field

Textarea in edit form, 4 rows. Writes to `profiles.notes` column added in Migration 026 (Session 37). Save + reload round-trip verified.

---

## Tech debt partial / not closed

### #16 — Team member password reset UI

Button + action work. Smoke-test verification blocked by Supabase free-tier email rate limit (hit after earlier troubleshooting triggered the sign-in page's Forgot Password flow, which consumed the hourly quota). Deferred confirmation: next session after rate limit resets — trigger reset from edit page, confirm email arrives, confirm link opens `/reset-password` and allows new password.

Kept as IN PROGRESS rather than closing optimistically.

---

## Tech debt added

### #70 — Sign-in page "Forgot password" link is broken

Discovered during case 6 setup when attempting to recover a test user's password. Email sends, but the link in the email doesn't allow the user to set a new password. Pre-existing, not related to any Session 39 code. Pre-beta fix.

Important distinction: the NEW Admin-initiated reset flow built this session (button on `/dashboard/team/[id]`) works at the action level. The broken path is specifically the sign-in page's "Forgot password?" link, which predates this session.

---

## Side-effect issues encountered

### Next.js 14 server actions rejected by CSRF check in Codespaces

First Save attempt failed with `Invalid Server Actions request`. Root cause: Next.js 14 validates that the request's `Origin` header matches the expected host. Dev server runs on `localhost:3000`; browser sees it via `*.app.github.dev` forwarded URL. Origin mismatch → rejected as potential CSRF.

**Fix:** Added `experimental.serverActions.allowedOrigins` to `next.config.js` scoped to `NODE_ENV === 'development'` so prod config stays unchanged.

```js
...(isDev && {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '*.app.github.dev'],
    },
  },
}),
```

Prod is unaffected — same-origin requests on `frame-focus-eight.vercel.app` match automatically with no allowlist needed.

**Worth noting for future sessions:** any new Next.js feature that validates request origin (future middleware, future edge functions, etc.) may hit the same pattern in Codespaces. If a dev-only request mysteriously fails in the forwarded URL but works on localhost-only curl, check Origin/Host validation first.

### Paste-strip bit us mid-session

`<a` tag stripped during a chat-pasted edit, producing a broken JSX block and an orphaned `</label>` duplicate. Fixed by typing `<a` manually in the editor. CLAUDE.md already documents this — reinforced the lesson. Any code containing `<` goes via manual typing or Claude Code, never chat paste.

### Supabase email rate limit

Free-tier default: 4 auth emails per hour per project. Hit during smoke test. Worth considering a rate-limit bump in the Supabase Dashboard (Auth → Rate Limits → Email sending) before public beta. Logging here rather than opening a tech debt item — it's a config decision, not a code issue.

---

## Things assumed but not verified (from context37)

1. **Migration 025 RLS blocks Admin from setting role='owner'/'admin'** — not explicitly verified this session. The app-layer check in `actions.ts` blocks it before RLS sees the write, so RLS never got tested. Still worth a direct SQL-editor test before Module 4.
2. **`created_at` populated for all profiles** — Bishop Contracting test users had values; legacy edge case not exercised. Display code handles null gracefully (`'—'`).
3. **`revalidatePath` invalidates cached page** — implicitly verified: role changes on save appeared immediately on the team list after redirect. Working.
4. **`876000h` ban honored (#69)** — verified. Deleted crew user could not sign in. Login was rejected.

---

## Smoke test results (all 7 cases from context37)

| Case | Description                          | Result                                                                                                                            |
| ---- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Owner editing Crew                   | PASS                                                                                                                              |
| 2    | Owner editing self (read-only lock)  | PASS                                                                                                                              |
| 3    | Admin editing Crew                   | PASS                                                                                                                              |
| 4    | Admin editing Owner (block/redirect) | PASS                                                                                                                              |
| 5    | Admin editing self (read-only lock)  | PASS                                                                                                                              |
| 6    | Admin password reset (email sent)    | PARTIAL — action succeeded, delivery rate-limited                                                                                 |
| 7    | Delete team member + seat drop       | PASS — login blocked on retry, team list count drops. (No dedicated seat-count UI on billing page; team list count is the proxy.) |

Also verified mid-session: role dropdown shows correct caller-scoped options (no Owner anywhere; Admin's view excludes admin).

---

## Audit trail — files touched

**New:**

- `apps/web/app/dashboard/team/[id]/page.tsx`
- `apps/web/app/dashboard/team/[id]/edit-form.tsx`
- `docs/sessions/context39.md`

**Modified:**

- `apps/web/app/dashboard/team/team-page-client.tsx` — row-click navigation (useRouter import, onClick handler, hover styles)
- `apps/web/next.config.js` — dev-only allowedOrigins for Codespaces
- `TECH_DEBT.md` — #14, #15, #17 closed; #16 updated; #70 added; polish plan reduced
- `STATE.md` — header + tree updated

**Commits:**

- `1ec46b5` `[Team] Finish member edit page (#14, #15, #17) + dev config for Codespaces`
- (doc commit pending — next step)

---

## How to start Session 40

1. Open Codespace, `git pull`, run `bash scripts/session-start.sh`.
2. Open new Claude Chat with project knowledge (CLAUDE.md, STATE.md, Quick Reference).
3. Paste session-start snapshot + `context39.md`.

**Session 40 goal options (pick one):**

- **Close #16 fully.** ~5 minutes. Retest Admin-triggered password reset after Supabase email rate limit resets. Confirm email arrives, link opens `/reset-password`, new password can be set. Then move #16 to Closed.
- **Start #66 — ownership transfer UI.** This is the last polish item before Module 4. Likely 1 full session. Depends on team detail page (now built). Needs its own design decisions before code: where does the transfer button live (Owner's own `/team/[id]` or a dedicated settings page?), confirmation pattern (type company name to confirm? re-enter password?), post-transfer redirect, how to handle an active Stripe subscription under the old Owner.
- **Investigate #70** — sign-in page Forgot Password link broken. Tied to `/reset-password` page handler or email redirect URL. Not blocking Module 4 but blocking anyone who forgets their password.

Recommend handling #16 verification first (quick), then starting #66 design.

**After #66, Module 4 build can begin.**
