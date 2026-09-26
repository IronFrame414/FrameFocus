# S112 — anon function lockdown (migration 1 of 2)

`supabase/migrations/20261870000000_s112_anon_function_lockdown.sql` — **applied to rebuild-test,
NOT to production.**

## Run on production FIRST (read-only) — how exposed has it been?

See the four catalog queries in the S112 report (headline counts, the default ACL, the named
functions, and the full list of anon-callable SECURITY DEFINER functions). rebuild-test before:
321 / 280 / 89, default `anon=X`.

## The allowlist — 3 functions, each on a measured logged-out path

`git grep -nE "\.rpc\(" origin/main -- apps/web` → 289 call sites, 78 distinct names. Traced through
every route and page reachable without a session:

| Function | Logged-out caller | Client |
| --- | --- | --- |
| `submit_sub_bid_reply` | `app/bid/[token]/bid-reply-client.tsx:87` | browser, anon key |
| `get_invitation_status` | `app/invite/accept/accept-invite.tsx:110` | browser, anon key |
| `get_invitation_by_token` | `app/invite/accept/accept-invite.tsx:116` | browser, anon key |

Every other logged-out surface uses the service-role client (bid page + files, proposal and CO
signing, unsubscribes, resubscribe) or the Auth API (sign-in, sign-up, forgot/reset password, auth
callback/confirm). The proposal page's `profiles` read runs only for a signed-in viewer, via the
admin client.

## Proof — `apps/web/test/s112-anon-lockdown.live.ts`, through PostgREST with the anon key

| | Before | After |
| --- | --- | --- |
| `allocate_invoice_number(other company)` | **INV-0002 allocated, sequence 1 → 2** (restored) | `42501 permission denied`, **sequence 1 → 1** |
| `apply_change_order_budget`, `sync_po_commitment`, `seed_default_tags` | ran their own bodies | `42501` |
| `get_sub_bid_request` (direct) | answered | `42501` |
| `test_invite_lookup` | present | dropped (`PGRST202`) |
| 3 allowlisted functions (control) | answer | answer — `submit_sub_bid_reply` reaches its own "not valid" check |
| signed-in owner runs `can_view_project` (control) | ok | ok |
| create an auth user → `auth.users` triggers as `supabase_auth_admin` (control) | ok | ok |
| public company logo, no credentials (control) | 200 | 200 |

Catalog after: 320 functions (test function dropped), **anon 3**, authenticated 296 (was 297 incl. the
dropped one), supabase_auth_admin 269, 321 ACLs backed up.

## ROLLBACK — restores every function's prior anon/PUBLIC grant exactly

```sql
BEGIN;
DO $$
DECLARE b record;
BEGIN
  FOR b IN SELECT fn, proacl FROM public.s112_anon_lockdown_backup LOOP
    CONTINUE WHEN to_regprocedure(b.fn) IS NULL;          -- e.g. the dropped test function
    IF b.proacl ~ '(^|[{,])=X' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', b.fn); END IF;
    IF b.proacl ~ '(^|[{,])anon=X' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', b.fn); END IF;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
COMMIT;
```

`test_invite_lookup` is not restored by the rollback (nothing calls it).

**The rollback was PROVEN on rebuild-test**, then migration 1 re-applied: after the rollback anon could
execute **279** functions (the original 280 less the dropped test function), with **0** granted that
the backup did not have and **0** the backup had but were not restored. Re-applied: anon 3,
authenticated 296.

## ⚠️ Merge-order note

`feature/s112-bid-token-status`'s live test calls `get_sub_bid_request` as anon to show a closed bid
returns no scope; after this lockdown that call is refused outright (stronger). Whichever branch
lands second updates that assertion to use the service role for the payload check.
