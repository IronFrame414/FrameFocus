# Session Wrap

You are ending a FrameFocus development session. Do the following in order:

1. Run `git status` and `git diff --stat` to see what changed.
2. Update STATE.md to reflect what is now true:
   - Move anything that shipped from "In Progress" to "Complete."
   - Add any new pending items.
   - Update the "Next session priorities" section.
3. If anything came up that's worth tracking but not fixing now, append it to TECH_DEBT.md with today's date and a short description.
4. Create a context file at `docs/sessions/contextN.md` (use the next sequential N). Include:4. Create a context file at `docs/sessions/contextN.md` (use the next sequential N). Include:
   - **What shipped:** bullet list.
   - **What's still pending:** anything started but not finished.
   - **Gotchas / lessons learned:** anything I should remember next session.
   - **Suggested next session focus:** one paragraph.
5. Look at `git log -10 --oneline` to learn the commit message style, then suggest a commit message and show me the exact `git add` and `git commit` commands.

Do NOT run `git commit` or `git push` yourself — I will review and run them.
