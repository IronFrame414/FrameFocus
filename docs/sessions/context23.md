# Session 23 — Password Reset Flow (Tech Debt #44)

**Date:** April 13, 2026
**Goal:** Build `/reset-password` page that consumes Supabase recovery token. Close tech debt #44.
**Outcome:** ✅ Complete. Full flow shipped: forgot-password → email → reset-password → dashboard.

---

## What shipped

- `/auth/callback/route.ts` — now honors `?next=` query param (reusable for any future post-auth redirect: magic links, email change confirmation, Module 9 client portal magic-link signing)
- `/forgot-password/page.tsx` — calls `supabase.auth.resetPasswordForEmail()` with `redirectTo` pointing at `/auth/callback?next=/reset-password`
- `/reset-password/page.tsx` — calls `supabase.auth.updateUser({ password })` on the session established by the callback
- "Forgot password?" link added to `/sign-in`
- Both new pages styled to match sign-in card pattern (Tailwind, brand colors, white card on gray)
- Supabase Dashboard: added wildcard redirect URLs (`/auth/callback?next=*` for both prod and localhost), raised OTP/email link expiry to 24 hours

## Commits

1. `feat(auth): Tech debt #44 — password reset flow`
2. `style(auth): Match sign-in card pattern on forgot/reset password pages`

## Decisions

- **Option B chosen** over Option A for recovery handling: pass `?next=` to the callback rather than special-casing recovery detection in the callback. More resilient — uses Supabase's documented pattern, reusable for future flows, keeps the callback's job ("exchange code for session") separate from the destination's job.
- **`createClient()` must live inside handler functions, not at the top of the component body.** Top-of-component placement runs during Next.js prerender, where env vars aren't loaded, causing build failures. Existing `/sign-in` and `/sign-up` already followed this pattern; the new pages now match.

## Lessons / gotchas

- **Heredoc + JSX is unsafe even when "not JSX-heavy."** Mid-session attempt to recreate `/sign-in/page.tsx` via `cat > ... << 'EOF'` mangled the file (output showed `EOF;</main>>Link>...` jammed onto one line). CLAUDE.md already warns about heredocs eating `<a` tags; the new takeaway is broader — **for any file rewrite touching JSX, use the VS Code editor (right-click folder → New File, paste content, save). Never the terminal.**
- **Partial-edit instructions also failed once** — Step 10 told Josh to make three small edits to `/reset-password/page.tsx`, but the file ended up with markdown code fences (` ```typescriptreact `...` ``` `) wrapping the content, and the edits weren't applied. Full file rewrite via editor was the recovery. Lesson: when a file needs more than one edit, just have Josh paste the full final version rather than a sequence of partial edits.
- **Supabase recovery tokens expire FAST by default.** First test failed with `otp_expired` because the link sat in inbox a few minutes. Raised to 24 hours in Dashboard. Real users will not click reset links within minutes.
- **Ground-truth check at session start caught nothing surprising this time** — STATE.md and git were in sync. Worth continuing the habit.
- **`'use client';` directive is easy to lose during file rewrites.** When recreating `/reset-password/page.tsx`, the directive was missing on the first attempt — caused prerender errors that masqueraded as the `createClient()` placement bug. Always verify line 1 of any client component after a rewrite.

## Tech debt opened

- **#45** `/forgot-password` and `/reset-password` initially used inline styles with invisible inputs — fixed in same session.
- **#46** ✅ CLOSED in same session — OTP expiry raised to 24 hours.
- **#47** Customize Supabase auth emails (recovery, invite, signup) with FrameFocus branding. Currently using Supabase defaults.

## Tech debt closed

- **#44** Password reset flow — built end-to-end. Functional and styled.

## Next session candidates

- Tech debt cleanup pass (several Module 3 follow-ups #22–#26 are quick wins)
- Module 3 UI work (file list page — sub-module 3F)
- Open the Pre-Module 9 Decision Gate (webhook system + client-portal pivot)

Choose at session start based on energy/time available.
