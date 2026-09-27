# docs/claude/gotchas.md

> Known Codespaces gotchas, in full. Verbatim from CLAUDE.md (main `80e15bad`).
> **Nothing here was rewritten.** CLAUDE.md carries the operative statement and links here.


<!-- CLAUDE.md lines 177–193 -->

### Known Codespaces Gotchas

- `.env.local` is gitignored and does NOT persist across Codespace rebuilds. Recreate from Vercel env vars if rebuilt.
- Shell heredocs (`cat << 'EOF'`) eat `<a` tags from JSX. Use Node.js `fs.writeFileSync()` or create files directly in the Codespace editor instead.
- Long file replacements via GitHub's web editor frequently truncate. Use a two-part paste strategy for long files.
- The Supabase anon key uses `sb_publishable_...` format.
- **RLS inside SECURITY DEFINER triggers:** `SET row_security TO 'off'` at the function level is silently ignored in Postgres unless the executing role is a superuser or table owner. Inside a `SECURITY DEFINER` trigger on `auth.users`, it does NOT bypass RLS. The working pattern is to put the RLS-protected query inside a separate `SECURITY DEFINER` **SQL** function (not plpgsql) and call that from the trigger. See `get_invitation_for_signup()` in Migration 015 for the reference implementation.
- **Context files describe intent, git describes state.** Never trust `context-N.md` files for "is X committed?" — always run `git log --oneline -15` at the start of a session to ground truth the repo. Session 8 wasted ~30 minutes chasing phantom work because context8.md said migrations were uncommitted when git log showed they were already in.
- **VS Code browser drag-and-drop targets are finicky.** Drop zones are ambiguous — files can end up at filesystem root (`/`) instead of the intended folder. If uploading fails with "Insufficient permissions" errors referencing `\filename.md`, the drop missed the target folder. Right-click the destination folder → "Upload..." is more reliable when available.
- **Supabase Storage rejects `<` and `>` in object keys.** Storage paths inherit any URL segment that flows into them. If you test a route by typing a literal placeholder like `<some-uuid>` into the URL, the upload will fail with "Invalid key" and the cause is not obvious. For testing routes that need a `project_id` before Module 5 ships, use a real UUID format like `11111111-1111-1111-1111-111111111111`.
- **Supabase signed URLs default to inline disposition.** A signed URL serves the file with `Content-Disposition: inline` by default — images and PDFs render in-browser, they don't download. To force a download with a chosen filename, append `?download=<filename>` to the signed URL. This is not in Supabase's primary docs. Check this whenever a "download" feature seems to "preview" instead.
- **Claude Chat strips `<` characters when code is pasted into the Codespace editor.** Pasting `Pick<Database['public']['Tables']...>` will reliably drop the `<` and produce broken TypeScript. For any code containing `<`, use Claude Code, or write the file via `node -e "require('fs').writeFileSync(...)"` with single-quoted contents. Do not paste through the chat editor and assume it round-tripped.
- **Bash history expansion eats `!` even inside double-quoted strings.** A `node -e "..."` command containing `!user` or any `!`-prefixed token triggers `event not found` and kills the command. Workarounds: use `printf '...'` with single quotes (no expansion), or run the command through Claude Code, or `set +H` first to disable history expansion for the session.
- **⚠️ Dev-mode first-hit page timings are NOT a latency signal — they are Next.js on-demand compilation.** `next dev` compiles each route the first time it is requested, and `/dashboard/projects` compiles **3,111 modules** on that first hit. A curl/browser first-load of that page measured **~11s in dev**; the same page in production is **337ms cold, 231ms warm**. The 11s was the compiler, not the app. **Any latency claim in this project must be measured against production or a production build (`next build && next start`), never against `next dev` first-hit.** This trap burned **four sessions** chasing `/dashboard/projects` — the full closed record and the four ruled-out causes are in **`GATED.md` → "CLOSED — `/dashboard/projects` '11s' was dev-mode compilation"**. RULED CLOSED [Josh, S179].

---
