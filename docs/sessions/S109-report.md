# S109 — report — tech debt #159–#163

Branch `feature/s109-debt-159-163`, cut from `main` `b75f201a`. Spec:
`docs/specs/S109-SPEC-debt-159-163.md` (rulings at its top). **Merge not authorised.**
Appended after every step; committed and pushed each time.

---

## Step 0 — Phase 1 + rulings recorded

- Phase 1 measured every FILL (`66f2bf86`). The session prompt file was committed **empty**; Josh
  delivered the Phase 3 rules in chat on 2026-09-23 and they are recorded in the spec.
- ⚠️ **CC error, recorded:** FILL-159.2's back-fill queries filtered `email_logs.status = 'sent'`.
  The webhook advances that status (the one real log row reads `delivered`), so the queries read a
  delivered email as never sent. Josh caught it on production. No back-fill is being built
  (ruling 159.A), so nothing was built on the wrong instrument.
- Linked project verified: `supabase/.temp/linked-project.json` → `nmyphyhmfttxkdoposvf`
  (`framefocus-rebuild-test`).
