# `clone_estimate_line` — captured before S128 1a replaces it

- **Captured 2026-10-04** from production (`jwkcknyuyvcwcdeskrmz`) AND rebuild-test (`nmyphyhmfttxkdoposvf`):
  one overload `clone_estimate_line(estimate_line_items,uuid,uuid,uuid,uuid)`,
  `md5(pg_get_functiondef(oid))` = **`c93289708a15f1de5223db5da9b5acb5` on both** (identical).
- ACL: production `{postgres=X, service_role=X, supabase_admin=X}`; rebuild-test carries the same three plus that
  project's extra platform roles. No `authenticated`/`anon` EXECUTE on either (S112 revoked it; only `clone_estimate`
  calls it, SECURITY DEFINER).
- **Why it is being replaced (S128 1a, B-0 defect 2):** it does not copy `estimate_line_rows.total_override`, so a clone
  or a REISSUE (`reissueEstimate` → `clone_estimate` → this) loses every hand-set total on its next recalculation.

## RESTORE

`original.sql` is `pg_get_functiondef` verbatim plus a terminating `;`. `CREATE OR REPLACE` keeps the ACL. Apply with:

    npx supabase db query --linked -f docs/sessions/S128-sabotage-originals/clone_estimate_line/original.sql

then read back `md5(pg_get_functiondef('public.clone_estimate_line(estimate_line_items,uuid,uuid,uuid,uuid)'::regprocedure))`
and expect `c93289708a15f1de5223db5da9b5acb5`.
