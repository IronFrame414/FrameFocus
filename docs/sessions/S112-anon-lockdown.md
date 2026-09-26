# S112 — anon function lockdown (migration 1 of 2)

`supabase/migrations/20261870000000_s112_anon_function_lockdown.sql` — **applied to rebuild-test,
NOT to production.**

## Run on production FIRST (read-only) — how exposed has it been?

The four catalog queries, catalog-only — no rows are read or changed. _(This section used to say
they were "in the S112 report"; they were only ever given in chat. Recorded here so the reference
resolves.)_ rebuild-test before: **321 / 280 / 89**, default `anon=X`.

```sql
-- S112 — what the public anon key can EXECUTE on production. Read-only (catalog only).
-- 1) The headline numbers
SELECT count(*)                                                                    AS functions_in_public,
       count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))    AS anon_can_execute,
       count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
                          AND p.prosecdef
                          AND pg_get_function_result(p.oid) NOT IN ('trigger','event_trigger')) AS anon_callable_security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';

-- 2) The default that grants it to every new function
SELECT defaclrole::regrole, defaclobjtype, defaclacl::text
FROM pg_default_acl WHERE defaclnamespace = 'public'::regnamespace AND defaclobjtype = 'f';

-- 3) The named functions from the S112 finding: does production expose them?
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('allocate_invoice_number','apply_change_order_budget','clone_estimate_line',
                    'sync_po_commitment','revert_invoice_settlement','recompute_budget_item',
                    'recompute_budget_items','recompute_delivery_exceptions','seed_default_tags',
                    'seed_file_categories','test_invite_lookup','get_sub_bid_request','submit_sub_bid_reply')
ORDER BY 1;

-- 4) The full list of anon-callable SECURITY DEFINER functions (the ones that bypass RLS)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS returns
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND pg_get_function_result(p.oid) NOT IN ('trigger','event_trigger')
ORDER BY 1;
```

**After both migrations are applied, re-run query 1 and query 4.** Expected, as on rebuild-test:
query 1 `anon_can_execute` = **3**; query 4 returns exactly **get_invitation_by_token,
get_invitation_status, submit_sub_bid_reply**. Anything else means the lockdown did not take.

## The five logged-out surfaces — EXERCISED after both migrations [RULED Josh: "PROVE IT"]

`apps/web/e2e/s112-anon-exercise.spec.ts` (`S112_ANON_EXERCISE=1`), a logged-out Chromium on a
DISPOSABLE tenant, against rebuild-test with 20261870000000 + 20261880000000 applied. **6/6
passed, teardown 0/0/0.** Links built exactly as the emails build them; tokens minted with the
service role, because rebuild-test has no Send Email Hook and its built-in mailer delivers only to
project team members.

| | Surface | Result |
| - | - | - |
| control | direct anon `get_sub_bid_request` / `apply_change_order_budget` | **401 / 42501 both** — the lockdown is applied, so the passes below are not from an unlocked DB |
| a | `/bid/{token}` | renders; **Submit bid** → row `submitted`, 1234 (via `submit_sub_bid_reply`, anon); documents route 200, scope PDF fetched 200 logged out. ⚠️ **the page itself names no document — on main and every branch; nothing calls the GET route. Pre-dates the lockdown.** |
| b | `/invite/accept?token=` | form renders with the invitee (both invitation RPCs, anon); **signUp 200**; profile `crew_member` in the tenant; invitation `accepted`; the new login signs in → `/dashboard` |
| c | `/sign/{token}` | typed signature → session `completed`, estimate `accepted` |
| d | `/sign-co/{token}` | typed signature → session `completed`, change order `signed` (signing calls `apply_change_order_budget` as the service role, `co-signing-service.ts:263`; a failure there is LOGGED, not thrown, so `signed` alone would not prove it — the run's captured server stderr carries no such error) |
| e | `/auth/confirm?token_hash=…&type=recovery` | → `/reset-password`, new password set, **signed in with the new password** |

⚠️ **One thing (e) does NOT cover:** the self-service `/forgot-password` link goes through
GoTrue `/auth/v1/verify` → `/auth/callback?code=` (PKCE). That needs a real email from the same
browser, which rebuild-test cannot send to a disposable address. It runs through GoTrue and the
code exchange only; no `public` function is on that path.

**The grants the invite and hook paths depend on, read on rebuild-test after both migrations:**
`handle_new_user` and `get_invitation_for_signup` → `supabase_auth_admin` ✓ (the signup
trigger); `invited_signup_autoconfirm_installed` → `service_role` ✓ (production's Send Email
Hook calls it; it fails SAFE — an error would send an unneeded confirmation email, not block one).

**Teardown finding, for whoever writes the next disposable harness:** `deleteCompanies()` cannot
remove a tenant that signed anything. A signed proposal's file cannot be deleted before its estimate
(the FK null-out trips "A signature stamp cannot be rewritten"), and a signed CO needs its
`archived_documents` gate (the s138 stub-archive order). The spec's `removeTenant()` does both.

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
