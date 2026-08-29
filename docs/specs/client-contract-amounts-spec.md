# Client Contract Amounts — `client_contract_amounts` (Fix 1, the live Floor exposure)

> **Status:** approved by Josh (blocking-items session, 2026-08-29) — build straight through.
> **Branch:** `feature/blocking-items`. Migration `20261051000000_client_contract_amounts.sql`.
> **Origin:** `docs/prompts/cc-blocking-items-prompt.md` item 1; Phase 1 re-verified every citation
> against rebuild-test and the current tree on 2026-08-29.

---

## 1. The ruling

| Contract type               | Who may see the value                                          | Why                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Subcontractor contracts** | Everyone **except** subs and clients                           | A **committed price — cost.** The Floor's cost tier is broadly visible; a foreman coordinating subs legitimately needs it. **CORRECT TODAY — unchanged by this spec.** |
| **Client contracts**        | **Owner/Admin only** — blocked for **PM, foreman, crew, subs** | Client-facing revenue, which is what the Financial Visibility Floor reserves. **This is the exposure.**                                  |
| **The client herself**      | **Sees her own contract's value** (portal)                     | S164: the Floor governs staff; a client is a counterparty. `portal.ts:313-319` selects it deliberately.                                  |

**The ruling is about the VALUE, not the row.** A PM keeps the contract — reaches it, edits its
notes, authors it on conversion. They lose the figure.

**Mechanism, as ruled: move `contract_value` off `client_contracts` onto a 1:1 side table
`client_contract_amounts`,** floored in RLS. Backfill, retarget the convert RPC and the readers,
drop the column and the trigger clause that guarded it, regen types. The `project_financials`
precedent (`20260811000000`), applied a third time (after `project_budget_amounts`).

### The live exposure, measured (2026-08-29, rebuild-test)

`client_contracts_select_visible` is
`company_id = get_my_company_id() AND get_my_role() <> ALL ('{subcontractor,client}') AND can_view_project(project_id)`
— every staff role with project view reads the row, and the row carries the money. PM, foreman and
crew read client contract values today.

---

## 2. ⚠️ Two mechanisms were tried and REJECTED. Do not revisit them.

Recorded verbatim from the prompt, because this is the most reusable thing the project learned
that week — the next person to floor a column will need it.

### Rejected 1 — floor SELECT *and* INSERT/UPDATE on `client_contracts`

Rejected: the write side is **already floored** by two deliberate triggers —
`enforce_client_contracts_column_scope` (`20260809000000_financial_rls_floor_part3.sql`, function
`:137-164`, the `contract_value` clause at `:152`, trigger at `:162`) and
`enforce_contract_void_authority` (`20260926000000_7i_contracts.sql:487-521`, client trigger
`:511`). The trigger-over-policy choice was ruled **twice**, specifically so **a PM can still edit
contract notes.** Narrowing UPDATE would overturn that ruling as a side effect.

### Rejected 2 — floor SELECT only

Rejected on a **measured** finding: **in Postgres an `UPDATE … WHERE` must match the row through
the SELECT policy.** Impersonation on rebuild-test showed a PM's WHERE-filtered update matched
**0 rows** while `client_contracts_update_authorized` still admitted that PM. So a row floor
**silently removes PM writes**, kills notes-editing, and makes both triggers dead code. It also
breaks four tests: `s97ct-floor3` 4a and an s145 case go **red** (the trigger never fires), and
`s97ct-floor3` 4b plus the s145 narrow-guard go **FALSE-GREEN** — passing vacuously on zero rows.

> **The generalising lesson:** flooring SELECT floors UPDATE with it, and it does so *silently* —
> `UPDATE … WHERE` on an invisible row is not an error, it is 0 rows matched wearing a success
> status. Any future column floor must ask: does a narrower role legitimately WRITE other columns
> of this row? If yes, the floor belongs on a side table, not the row.

### Why a side table is right here when S121 rejected one

S121 rejected a side table because *"the money sits on rows a PM must INSERT and UPDATE."* Here
the inverse holds — a PM **does not** write the money (the column-scope trigger already blocks it)
but **does** write other columns (notes). That is precisely the case a side table exists for.

---

## 3. ⚠️ The client arm — the part that would have shipped looking correct

`client_contracts` carries a second SELECT policy, `client_contracts_select_client`:

```sql
company_id = my_company_id_flat()
AND is_client_of_project(project_id)
AND client_document_visible(status)
```

`portal.ts:319` selects `contract_value` for the portal document list and maps it at `:347`. **An
Owner/Admin-only side table breaks the client portal.** The new table needs a client SELECT arm.

**And that arm cannot be a bare FK-containment `EXISTS` on the parent.** The parent's SELECT is
the OR of *both* its arms — containment would admit **every staff role** `select_visible` admits,
defeating the floor this table exists to build. The arm must **restate the client predicate
against the parent's own columns** (the amounts row carries neither `project_id` nor `status`, so
it joins to the parent for both):

```sql
CREATE POLICY client_contract_amounts_select_client ON client_contract_amounts
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM client_contracts cc
      WHERE cc.id = client_contract_amounts.client_contract_id
        AND cc.company_id = my_company_id_flat()
        AND is_client_of_project(cc.project_id)
        AND client_document_visible(cc.status)
    )
  );
```

The subquery is additionally filtered by `client_contracts`' own RLS (policy subqueries run as the
invoker); for a client that filter admits exactly the same rows this predicate names, and for
staff the predicate itself refuses (`is_client_of_project` is false for any non-client role), so
the nesting is belt-and-braces rather than load-bearing.

---

## 4. Schema and migration shape — `20261051000000_client_contract_amounts.sql`

One migration, one transaction. Steps in order:

1. **Table** — the `project_financials` shape, verbatim conventions (per-tenant defaults
   checklist, both standard triggers):

```sql
CREATE TABLE client_contract_amounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) DEFAULT get_my_company_id(),
  client_contract_id UUID NOT NULL UNIQUE REFERENCES client_contracts(id) ON DELETE CASCADE,
  contract_value     NUMERIC,          -- same type as the column it replaces
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  updated_by         UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);
```

   No `is_deleted` — the row lives and dies with its contract (`ON DELETE CASCADE`), exactly as
   `project_financials` and `project_budget_amounts` have no independent trash lifecycle. The
   `UNIQUE` on `client_contract_id` is the 1:1.

2. **RLS** — enable; four policies, **no DELETE policy at all** (denied to every role):
   - `client_contract_amounts_select_owner_admin` — `company_id = get_my_company_id() AND get_my_role() IN ('owner','admin')`
   - `client_contract_amounts_select_client` — §3 above
   - `client_contract_amounts_insert_owner_admin`, `client_contract_amounts_update_owner_admin` —
     the `project_financials` quals verbatim.

3. **Triggers** — `client_contract_amounts_updated_at` (shared `update_updated_at()`) and
   `client_contract_amounts_set_updated_by` (per-table function, standard pattern).

4. **Backfill** — one row per contract that has a value (the `project_financials` convention:
   no row when there is nothing to hold; readers LEFT-JOIN):

```sql
INSERT INTO client_contract_amounts (company_id, client_contract_id, contract_value, created_by, updated_by)
SELECT company_id, id, contract_value, created_by, updated_by
FROM client_contracts WHERE contract_value IS NOT NULL;
```

5. **Rewrite `convert_estimate_to_project`** — the `client_contracts` INSERT loses
   `contract_value` and gains `RETURNING id INTO v_client_contract_id`; immediately after, mirror
   the existing `project_financials` block:

```sql
IF v_contract_value IS NOT NULL THEN
  INSERT INTO client_contract_amounts (company_id, client_contract_id, contract_value, created_by)
  VALUES (v_company_id, v_client_contract_id, v_contract_value, auth.uid());
END IF;
```

   The RPC is one plpgsql SECURITY DEFINER body — atomicity is unchanged, and SECURITY DEFINER
   means the new Owner/Admin-only INSERT policy does not block a converting PM (same authority
   the function already uses for `project_financials`, not a widening).

6. **Edit `enforce_client_contracts_column_scope`** — `CREATE OR REPLACE` dropping **only** the
   `NEW.contract_value IS DISTINCT FROM OLD.contract_value` clause. The
   `signed_proposal_file_id` and `executed_date` clauses **stay** — they are not moving tables,
   and they are why the trigger survives this migration rather than being dropped.
   ⚠️ `enforce_contract_void_authority` is **untouched** — it is shared by three triggers
   (`client_contracts:511`, `subcontractor_contracts:515`, `contract_documents:519` in the 7I
   migration) and has nothing to do with the money column.

7. **Drop the column** — `ALTER TABLE client_contracts DROP COLUMN contract_value;`

Then `npm run db:push` (rebuild-test — verify the CLI link first), regen `database.ts`, commit
migration + types together.

---

## 5. `input → store → output` trace, with real numbers

A fixed-price estimate with `grand_total = 48,750.00` converts (`v_contract_value := 48750`):

| Step | Table / surface | What is stored / shown |
| --- | --- | --- |
| convert | `client_contracts` | row `cc-1`, status `draft`, **no money column exists** |
| convert | `client_contract_amounts` | `{ client_contract_id: cc-1, contract_value: 48750 }` |
| convert | `project_financials` | `contract_value: 48750` (unchanged, separate figure family) |
| Owner opens Contracts panel | `getClientContracts` LEFT-embed | `contract_value: 48750` → renders `$48,750` |
| **PM opens the same panel** | same query, RLS refuses the embed | `contract_value: null` → **no money span renders; status, executed date and notes render as before** |
| PM edits notes on `cc-1` | `client_contracts` UPDATE | **succeeds** — parent row policy and triggers unchanged (this is 4b / narrow-guard staying genuinely green) |
| PM updates `client_contract_amounts` | RLS | **0 rows matched** — refused by policy, and the test proves the row exists via an Owner read first |
| Client opens portal documents | `portal.ts` embed via client arm | `amount: 48750` — her contract, S164; a `draft` contract stays invisible via `client_document_visible` |
| Anyone attempts DELETE on the amounts row | RLS | refused — no DELETE policy |

---

## 6. Readers — the complete list (re-verified 2026-08-29)

| Site | Change |
| --- | --- |
| `contracts.ts:39-52` `getClientContracts` | select `'*, amounts:client_contract_amounts(contract_value)'`, flatten to `contract_value: number \| null` |
| `contracts.ts:16-19` `ClientContract` type | regen removes the column from the Row; add `contract_value: number \| null` (derived, null = floored or absent) |
| `contracts-panel.tsx:222` | render the money span only when `contract_value !== null` — **the only client-contract site in the panel**; the other seven `contract_value` sites in that file are the subcontractor contract and are out of scope |
| `portal.ts:319/:347` | select `'id, status, created_at, executed_date, amounts:client_contract_amounts(contract_value)'`, map through the embed |
| `contracts-client.ts:82-100` `createClientContract` | remove the `contract_value` field — **the function has zero callers** (client contracts are created only by the convert RPC); the field would break at runtime once the column drops |
| `convert_estimate_to_project` | §4.5 |
| NOT affected | `lien-releases.ts:407/:491/:509` (sub contract) · `contract-value.ts` (`project_financials`) · every `subcontractor_contracts` site |

## 7. UI section (spec completeness rule, S86)

- **Screen:** Project → Contracts tab (`/dashboard/projects/[id]/contracts`), existing panel. No
  new screens, no nav changes.
- **Roles:** Owner/Admin see the value; PM/foreman/crew see the contract row without a money
  figure (no placeholder, no em-dash — the span simply doesn't render, matching how gated figures
  disappear elsewhere per ui-01 §11). Sub/client never reach this screen.
- **Client portal:** documents list unchanged in appearance; the amount keeps rendering for her.
- **Mobile:** the contracts panel is a desktop dashboard surface; no `/m` route reads
  `client_contracts.contract_value` (verified in the Phase 1 sweep) — parity rule not engaged.

## 8. Tests

| File | Action |
| --- | --- |
| `s97ct-floor3.live.ts` fixture `:165` | insert without `contract_value`; add the amounts row via the admin/service client |
| `s97ct-floor3.live.ts` 4a | rewrite to the side table: Owner proves the amounts row exists, PM SELECT returns 0 rows, PM UPDATE matches 0 rows — **say which refused: RLS, by policy absence for the PM role** |
| `s97ct-floor3.live.ts` 4b | untouched — must stay **genuinely** green (PM notes-edit on the parent) |
| `s145-contracts.live.ts` C4.1/C4.2/narrow-guard | untouched — must stay genuinely green |
| `s133-subcontractor-read-floor.live.ts` fixture `:97` | insert without the column + amounts row via admin |
| `s133-subcontractor-read-floor.live.ts` R7 `:264-270` | **false-green trap**: rewrite to probe `client_contract_amounts` under the sub identity (0 rows, proven non-vacuous by an admin count) |
| `s121-assignment-grant.live.ts:31` | retarget the `MONEY_TABLES` entry to `client_contract_amounts, 'id, contract_value'` |
| New coverage | amounts floor per role (PM/foreman/crew refused; Owner/Admin read) + the client arm (client reads her own; a `draft` contract's amount stays hidden) — added to `s97ct-floor3` and `s164-m9-read-arms` ARM 2 |

**Acceptance signal (Josh, verbatim):** `s97ct-floor3` 4b and the s145 narrow-guard must stay
GENUINELY green — if either passes on zero rows, the fix is wrong in the same way the two
rejected mechanisms were.

## 9. §S — open at build time

- **§S1** `client_contract_amounts` must join `COMPANY_CHILDREN` (`test-support/company-purge.ts`),
  trial deletion's `COMPANY_TABLES` (`lib/trial/deletion.ts`), and be checked against
  `lib/trial/export-categories.ts` — the `file_categories` regression is the standing trap, and
  this spec adds a table.
- **§S2** PostgREST embed cardinality: the `UNIQUE` FK should make the embed an object, not an
  array — verify against the live response shape when wiring `getClientContracts` and handle both.

## 10. Out of scope

- `subcontractor_contracts.contract_value` — ruled correct, broadly visible cost.
- `project_financials` / `contract-value.ts` — a different figure family, already enforced.
- `change_orders.net_delta` (#117) and any change to `client_contracts_select_visible` — the
  parent row stays broadly readable **on purpose**; the row is not the ruling, the value is.
- The void-authority trigger and the 7I document layer.
