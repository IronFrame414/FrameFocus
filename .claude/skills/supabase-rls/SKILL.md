---
name: supabase-rls
description: Use when writing or reviewing Supabase RLS policies or debugging RLS issues. Covers FrameFocus tenant scoping (`get_my_company_id()`), the storage-policy inline-subquery exception, and the SECURITY DEFINER SQL pattern for triggers.
---

# FrameFocus RLS

## Standard tenant scoping

Per-tenant tables get 4 RLS policies (SELECT/INSERT/UPDATE/DELETE), all scoped via `get_my_company_id()`. RLS does NOT filter `is_deleted` — soft-delete is enforced in the service layer.

```sql
CREATE POLICY {table}_select_authenticated ON {table}
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
```

Every CREATE TABLE migration must also set per-tenant defaults, or client INSERTs fail RLS with confusing 403s:

```sql
ALTER TABLE {t} ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE {t} ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE {t} ALTER COLUMN updated_by SET DEFAULT auth.uid();
```

## Storage exception — inline subquery, NOT the helper

`get_my_company_id()` silently returns NULL in `storage.objects` policies. Use an inline subquery against `profiles` instead. Folder convention: `{company_id}/{rest}`.

```sql
(storage.foldername(name))[1]::uuid = (SELECT company_id FROM profiles WHERE id = auth.uid())
```

`get_my_role()` still works in storage — only tenant scoping changes. References: Migration 013, Migration 017.

## Trigger exception — SECURITY DEFINER SQL function

Triggers can't query RLS-protected tables directly; helpers return NULL in trigger context. Wrap the query in a `SECURITY DEFINER` **SQL** function (NOT plpgsql — plpgsql still hits RLS) and call it from the trigger.

```sql
CREATE OR REPLACE FUNCTION get_invitation_for_signup(invite_token uuid)
RETURNS TABLE (id uuid, company_id uuid, role text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, company_id, role FROM invitations WHERE token = invite_token;
$$;
```

Reference: Migration 015.

## Append-only log tables

Pure event logs (`ai_tag_logs`, `trial_emails`) omit `updated_at`, `updated_by`, `created_by`, `is_deleted`, `deleted_at` columns and have only SELECT + INSERT policies.
