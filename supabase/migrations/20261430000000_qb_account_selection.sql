-- ============================================================================
-- 7G MIGRATION M-J — stop typing account names. Pick them. [RULED Josh, S103]
-- ============================================================================
--
-- ⚠️ THE DEFECT, AND ITS FREQUENCY. Every account field is FREE TEXT resolved
-- to an id at push time. Josh hit the typo failure THREE times in one session —
-- most memorably `Cost of goods sold:Subcontractor expenses` against the real
-- `Cost of Goods Sold:Subcontractor Expense`. Wrong plural, wrong capitals,
-- parked expense. **Picking from the chart of accounts removes the entire
-- park-on-typo class**, and storing the ID means a rename in QuickBooks no
-- longer breaks the mapping.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHAT WAS MEASURED FIRST — the API refuses different things in the two
-- places an account is used, and the two pickers are filtered differently
-- BECAUSE OF THAT, not because of taste.
-- ----------------------------------------------------------------------------
-- Probed on the live sandbox by making Intuit refuse (S182):
--
--   As `Purchase.AccountRef` (the account money came FROM) — 3 of 14 accepted:
--     ✅ Bank ✅ Credit Card ✅ Other Current Liability
--     ❌ Expense, Cost of Goods Sold, Other Expense, Fixed Asset, Income,
--        Other Income, Other Current Asset, Equity, Long Term Liability,
--        Accounts Payable, Accounts Receivable   -> "Invalid account type"
--
--   As the LINE's `AccountRef` (the account it was spent ON) — 12 of 14:
--     ❌ ONLY Accounts Payable and Accounts Receivable are refused.
--
-- ⚠️ SO THE GL PICKER MUST NOT BE FILTERED TO "EXPENSE ACCOUNTS". QuickBooks
-- allows almost anything there, and a filter we invent would hide a valid
-- choice somebody's accountant told them to use. It excludes exactly the two
-- QuickBooks itself rejects.
--
-- ⚠️ AND `Other Current Liability` IS IN THE PAYMENT LIST BECAUSE INTUIT
-- ACCEPTS IT, not because it was guessed. It is how a contractor's petty-cash
-- or owner-payable clearing account is often typed.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHAT HAPPENS TO THE FOUR NAMES ALREADY STORED
-- ----------------------------------------------------------------------------
-- `companies.gl_account_*` are KEPT, and their meaning changes:
--
--   BEFORE: the name WAS the mapping, resolved to an id on every push.
--   AFTER:  `gl_account_*_id` is the mapping. The name is a CACHED LABEL for
--           the screen, refreshed when the chart of accounts is refreshed.
--
-- **This is not two sources of truth.** The id is authoritative and is the only
-- thing `billAccountRef()` will use once set. The name is display, and if
-- QuickBooks renames the account the label goes stale until the next refresh
-- while the mapping keeps working — which is the entire point of the change.
--
-- ⚠️ NOTHING IS DROPPED AND NOTHING IS BACKFILLED BY GUESSWORK. A company with
-- names but no ids keeps working through the existing name-resolution fallback
-- until someone opens the picker. Resolving a name to an id needs a live
-- QuickBooks call, which a migration must not make.
--
-- ----------------------------------------------------------------------------
-- ⚠️ AND `companies.qb_payment_account_id / _name / _type` ARE DROPPED
-- ----------------------------------------------------------------------------
-- They shipped in M-G earlier in this same unmerged branch as a single
-- company-wide default. Josh superseded that: a contractor has business
-- checking, one or more cards, maybe petty cash, and **a Purchase must say
-- which one paid or the books are wrong.** Their value is migrated into
-- `company_payment_accounts` first so nothing configured is lost.
--
-- Keeping them "as a fallback" was rejected: a company-wide default beside a
-- per-expense account is exactly the second source of truth that makes it
-- impossible to say which one posted a transaction.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The cached chart of accounts
-- ----------------------------------------------------------------------------
--
-- ⚠️ ONE QUERY RETURNS THE WHOLE CHART AND COSTS ONE METERED READ. Measured:
-- `select … from Account maxresults 1000` returned all 93 sandbox accounts in a
-- single call, and `qb_read_budget.coreplus_reads` advanced by one. So the cost
-- of a refresh is one read — cheap, but not free, and a settings page that
-- refetched on every render would spend the budget §7G.3a exists to protect.
--
-- ⚠️ WHAT INVALIDATES IT, stated because "cache" without this is a bug waiting:
--   * the Owner presses Refresh (the visible control — the only guaranteed way)
--   * a disconnect (the rows are deleted; a different realm has different ids)
-- It is NOT invalidated by time. A stale label is cosmetic — the ID is what
-- posts — so an automatic TTL would spend reads to fix nothing.
CREATE TABLE IF NOT EXISTS public.qb_account_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id),

  -- The QuickBooks Account list, exactly as fetched. JSONB rather than a row
  -- per account on purpose: this is a CACHE of someone else's table, it is
  -- replaced wholesale on every refresh, and nothing joins to it.
  accounts      jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at    timestamp with time zone DEFAULT now(),

  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  updated_by    uuid REFERENCES auth.users(id),
  is_deleted    boolean DEFAULT false,
  deleted_at    timestamp with time zone
);

ALTER TABLE public.qb_account_cache ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.qb_account_cache ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.qb_account_cache ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_account_cache_one_per_company
  ON public.qb_account_cache (company_id) WHERE is_deleted = false;

ALTER TABLE public.qb_account_cache ENABLE ROW LEVEL SECURITY;

-- ⚠️ SELECT IS OWNER/ADMIN, not company-wide. This is the CHART OF ACCOUNTS —
-- every income and equity account the business has. It is only ever read to
-- populate a settings picker, and settings are Owner/Admin. The payment-account
-- LIST below is company-wide precisely because that one is not the chart.
CREATE POLICY qb_account_cache_select_owner_admin ON public.qb_account_cache
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- Written only by the refresh route through the service role. No client policy.

CREATE TRIGGER qb_account_cache_updated_at
  BEFORE UPDATE ON public.qb_account_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.set_qb_account_cache_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER qb_account_cache_set_updated_by
  BEFORE UPDATE ON public.qb_account_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_qb_account_cache_updated_by();


-- ----------------------------------------------------------------------------
-- 2. The payment-account LIST
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_payment_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id),

  -- The QuickBooks Account.Id. THE mapping; everything else here is label.
  qb_account_id  text NOT NULL,
  name           text NOT NULL,
  account_type   text NOT NULL,

  -- Cash | Check | CreditCard — what a Purchase and a BillPayment post AS.
  -- Defaulted from `account_type` by the UI, overridable: a Bank account used
  -- as petty cash is legitimately 'Cash'.
  payment_type   text NOT NULL DEFAULT 'Check',

  created_at     timestamp with time zone DEFAULT now(),
  updated_at     timestamp with time zone DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id),
  updated_by     uuid REFERENCES auth.users(id),
  is_deleted     boolean DEFAULT false,
  deleted_at     timestamp with time zone,

  CONSTRAINT company_payment_accounts_payment_type_check
    CHECK (payment_type = ANY (ARRAY['Cash'::text, 'Check'::text, 'CreditCard'::text])),

  -- ⚠️ THE THREE TYPES INTUIT ACCEPTS AS A PURCHASE PAYER, measured (header).
  -- A CHECK rather than a UI filter: the UI can be bypassed, and an account of
  -- the wrong type does not fail here — it fails inside the customer's books.
  CONSTRAINT company_payment_accounts_account_type_check
    CHECK (account_type = ANY (ARRAY['Bank'::text, 'Credit Card'::text,
                                     'Other Current Liability'::text]))
);

ALTER TABLE public.company_payment_accounts ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.company_payment_accounts ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.company_payment_accounts ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_payment_accounts_one_per_qb_account
  ON public.company_payment_accounts (company_id, qb_account_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_company_payment_accounts_company_id
  ON public.company_payment_accounts (company_id);

ALTER TABLE public.company_payment_accounts ENABLE ROW LEVEL SECURITY;

-- ⚠️ SELECT IS COMPANY-WIDE, AND THAT IS NOT A FLOOR BREACH. A crew member
-- entering a receipt must say which card they spent from, so the list has to be
-- readable by everyone who can author an expense. The Financial Visibility
-- Floor governs contract value, budget/sell figures, instrument rates and CO
-- dollars — an account NAME is none of those and carries no amount. The chart
-- of accounts itself stays Owner/Admin (see qb_account_cache above); this is
-- the short, curated list of "cards and accounts we spend from".
CREATE POLICY company_payment_accounts_select_company ON public.company_payment_accounts
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY company_payment_accounts_insert_owner_admin ON public.company_payment_accounts
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY company_payment_accounts_update_owner_admin ON public.company_payment_accounts
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  ) WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- No DELETE policy: removal is a soft delete through the UPDATE policy.

CREATE TRIGGER company_payment_accounts_updated_at
  BEFORE UPDATE ON public.company_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.set_company_payment_accounts_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER company_payment_accounts_set_updated_by
  BEFORE UPDATE ON public.company_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_company_payment_accounts_updated_by();


-- ----------------------------------------------------------------------------
-- 3. The per-user default — on `company_members`, and here is why
-- ----------------------------------------------------------------------------
--
-- ⚠️ CHECKED BEFORE ADDING, as instructed. `profiles` is USER-GLOBAL;
-- `company_members` is COMPANY-SCOPED and already carries per-member settings
-- (`schedule_color`, `member_type`), which is the precedent.
--
-- Three reasons `company_members` wins, and the first is decisive:
--   1. The FK target (`company_payment_accounts`) is company-scoped. A default
--      on `profiles` could point at another company's account.
--   2. One person can be a member of two companies and spend from a different
--      card in each. A user-global column cannot express that.
--   3. Expenses are already authored by `author_member_id`, a member id — so
--      the default is read on the same key the expense is written with, with no
--      extra hop.
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS default_payment_account_id uuid
  REFERENCES public.company_payment_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.company_members.default_payment_account_id IS
  '7G M-J. The account this member normally spends from; pre-fills an expense. '
  'SET BY OWNER/ADMIN ONLY (enforce_company_members_payment_default) because it '
  'determines where money posts. NULL is fine — it means "ask every time", and '
  'never blocks anything.';

-- ⚠️ OWNER/ADMIN ONLY. Josh: the default is set by Owner/Admin, "never by the
-- user: it determines where money posts".
--
-- ⚠️ RLS ALREADY ENFORCES THIS, AND THE TRIGGER BELOW IS STILL WORTH HAVING.
-- Checked rather than assumed: `company_members_update_authorized` is
-- `company_id = get_my_company_id() AND get_my_role() = ANY (owner, admin)` —
-- members cannot update their own row at all today, not even a display name. So
-- the ruling is satisfied without a trigger.
--
-- It is added anyway because **that policy is exactly the kind that gets
-- widened**: a "let members set their own display name / schedule colour"
-- screen is an ordinary future request, and the session that writes it will be
-- thinking about display names, not about which bank account money posts to.
-- The trigger keeps THIS column Owner/Admin whatever the policy becomes.
CREATE OR REPLACE FUNCTION public.enforce_company_members_payment_default()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Service role (auth.uid() NULL) is the worker and the seeders; exempt.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.default_payment_account_id IS DISTINCT FROM OLD.default_payment_account_id
     AND NOT (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) THEN
    RAISE EXCEPTION 'Only an Owner or Admin can set the default payment account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_members_payment_default ON public.company_members;

CREATE TRIGGER company_members_payment_default
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_members_payment_default();


-- ----------------------------------------------------------------------------
-- 4. The account ON the expense
-- ----------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_account_id uuid
  REFERENCES public.company_payment_accounts(id);

CREATE INDEX IF NOT EXISTS idx_expenses_payment_account_id
  ON public.expenses (payment_account_id) WHERE payment_account_id IS NOT NULL;

COMMENT ON COLUMN public.expenses.payment_account_id IS
  '7G M-J. Which account paid for this. Required to APPROVE an expense that '
  'will sync (see enforce_expense_payment_account). Pre-filled from the '
  'author''s company_members default; whatever is on the row wins.';

-- ⚠️ NOT ADDED TO enforce_expenses_column_scope's denylist, DELIBERATELY.
-- That list freezes REVIEW and SYSTEM columns against non-Owner/Admin roles.
-- This is a CAPTURE field — the crew member entering the receipt is exactly who
-- should be setting it. Naming it there would make the ruled flow impossible.


-- ----------------------------------------------------------------------------
-- 5. ⚠️ THE BLOCKING RULE — fail at review, not silently hours later
-- ----------------------------------------------------------------------------
--
-- _Superseded instruction, quoted rather than deleted:_ M-G parked an expense
-- with _"QuickBooks needs to know which account paid for this"_. Josh reversed
-- it: **"An expense cannot be finalised without an account selected — an error
-- at entry or review, not a silent park later. This catches the problem where
-- the person has the context, instead of blocking a sync hours later on a page
-- they are not looking at."**
--
-- ⚠️ AND IT MUST NOT BLOCK A COMMITMENT. The prompt names
-- `expenses.commitment_only`; **that column does not exist** (see the build
-- log). The real test is the same five-term payable predicate M-G filters on —
-- a row that will never sync needs no account, and blocking it would stop 7C
-- dead.
CREATE OR REPLACE FUNCTION public.enforce_expense_payment_account()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_payable boolean;
BEGIN
  -- Only on the transition INTO approved. Editing an already-approved row is
  -- §2.4's ruled correction path and must not be blocked by this.
  IF NEW.status <> 'approved' OR OLD.status IS NOT DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- The locked payable predicate, term for term (payables-shared.ts).
  v_is_payable := (
       NEW.sub_contract_id IS NOT NULL
    OR NEW.purchase_order_id IS NOT NULL
    OR NEW.is_retainage
    OR NEW.state = 'committed'
    OR EXISTS (SELECT 1 FROM expense_payments p
               WHERE p.expense_id = NEW.id AND p.is_deleted = false)
  );

  -- A commitment never reaches QuickBooks, so it never needs a payer.
  IF v_is_payable THEN
    RETURN NEW;
  END IF;

  -- ⚠️ NO QUICKBOOKS, NO REQUIREMENT. A company that has never connected is not
  -- made to configure a QuickBooks account to approve an expense.
  IF (SELECT qb_realm_id FROM companies WHERE id = NEW.company_id) IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Choose which account paid for this expense before approving it.'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS expenses_require_payment_account ON public.expenses;

CREATE TRIGGER expenses_require_payment_account
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_payment_account();


-- ----------------------------------------------------------------------------
-- 6. GL account IDs alongside the names
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS gl_account_labor_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS gl_account_material_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS gl_account_subcontractor_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS gl_account_other_id text;

COMMENT ON COLUMN public.companies.gl_account_material_id IS
  '7G M-J. The QuickBooks Account.Id an expense of this category posts to. THE '
  'mapping — gl_account_material is now only a cached display label. An id set '
  'here survives a rename in QuickBooks; a name does not.';


-- ----------------------------------------------------------------------------
-- 7. Migrate M-G's single company-wide default into the list, then drop it
-- ----------------------------------------------------------------------------
INSERT INTO public.company_payment_accounts
  (company_id, qb_account_id, name, account_type, payment_type)
SELECT c.id,
       c.qb_payment_account_id,
       COALESCE(c.qb_payment_account_name, 'QuickBooks account ' || c.qb_payment_account_id),
       -- ⚠️ TYPE WAS NEVER STORED by M-G, and it cannot be derived from the id
       -- without a QuickBooks call a migration must not make. 'Bank' is the
       -- honest default: it is what the M-G picker offered first, and the
       -- Owner re-picks from the real list the moment they open the screen.
       'Bank',
       COALESCE(c.qb_payment_type, 'Check')
FROM public.companies c
WHERE c.qb_payment_account_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Everyone in a company that had one gets it as their default, so the flow
-- keeps working for whoever was already using it.
-- ⚠️ SCOPED TO THE ACCOUNT JUST MIGRATED, not "an account of this company".
-- Joining on company_id alone would be an unordered pick the moment a company
-- has two payment accounts — the S165 category-2 shape, where ordering would
-- only make the wrong choice stable. `qb_payment_account_id` still exists at
-- this point in the transaction; that is why the DROP comes after.
UPDATE public.company_members m
SET default_payment_account_id = a.id
FROM public.company_payment_accounts a
JOIN public.companies c
  ON c.id = a.company_id AND c.qb_payment_account_id = a.qb_account_id
WHERE a.company_id = m.company_id
  AND m.default_payment_account_id IS NULL
  AND m.is_deleted = false;

-- ⚠️ THE TRIGGER MUST GO FIRST, AND POSTGRES SAYS SO PLAINLY:
--   "cannot drop column qb_payment_account_id ... trigger
--    companies_qb_wake_parked_queue on table companies depends on [it]"
-- A trigger's WHEN clause is a real dependency on every column it names. This
-- migration failed exactly once on that ordering, which is the useful kind of
-- failure — atomic, loud, and nothing half-applied. Dropped here and recreated
-- below without the three columns.
DROP TRIGGER IF EXISTS companies_qb_wake_parked_queue ON public.companies;

ALTER TABLE public.companies DROP COLUMN IF EXISTS qb_payment_account_id;
ALTER TABLE public.companies DROP COLUMN IF EXISTS qb_payment_account_name;
ALTER TABLE public.companies DROP COLUMN IF EXISTS qb_payment_type;

-- ⚠️ AND OUT OF THE OWNER-ONLY WRITE GUARD, which named all three. Leaving a
-- dropped column in a trigger body is a runtime error on the next UPDATE, not a
-- compile-time one — this is the half of a column drop that gets forgotten.
CREATE OR REPLACE FUNCTION public.enforce_companies_qb_scope()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = 'owner' THEN
    RETURN NEW;
  END IF;

  IF NEW.qb_realm_id IS DISTINCT FROM OLD.qb_realm_id
     OR NEW.qb_token_secret_id IS DISTINCT FROM OLD.qb_token_secret_id
     OR NEW.qb_payments_enabled IS DISTINCT FROM OLD.qb_payments_enabled
     OR NEW.qb_income_item_id IS DISTINCT FROM OLD.qb_income_item_id
     OR NEW.qb_income_item_name IS DISTINCT FROM OLD.qb_income_item_name
     OR NEW.qb_connection_state IS DISTINCT FROM OLD.qb_connection_state
     OR NEW.qb_connected_at IS DISTINCT FROM OLD.qb_connected_at
     OR NEW.qb_last_refresh_at IS DISTINCT FROM OLD.qb_last_refresh_at
     OR NEW.qb_refresh_rotated_at IS DISTINCT FROM OLD.qb_refresh_rotated_at
     OR NEW.qb_reauth_required_after IS DISTINCT FROM OLD.qb_reauth_required_after THEN
    RAISE EXCEPTION 'Connecting or disconnecting QuickBooks is Owner-only.';
  END IF;

  RETURN NEW;
END;
$$;

-- ⚠️ RECREATED WITHOUT THE THREE DROPPED COLUMNS. M-F's WHEN clause named
-- `qb_payment_account_id` and `qb_payment_type`; a WHEN clause referencing a
-- dropped column would make EVERY companies UPDATE fail. It gains the four new
-- `gl_account_*_id` columns in the same pass, so choosing an account from the
-- picker un-parks waiting work exactly as choosing a name did.
CREATE TRIGGER companies_qb_wake_parked_queue
  AFTER UPDATE ON public.companies
  FOR EACH ROW
  WHEN (
       OLD.gl_account_labor        IS DISTINCT FROM NEW.gl_account_labor
    OR OLD.gl_account_material     IS DISTINCT FROM NEW.gl_account_material
    OR OLD.gl_account_subcontractor IS DISTINCT FROM NEW.gl_account_subcontractor
    OR OLD.gl_account_other        IS DISTINCT FROM NEW.gl_account_other
    OR OLD.gl_account_labor_id     IS DISTINCT FROM NEW.gl_account_labor_id
    OR OLD.gl_account_material_id  IS DISTINCT FROM NEW.gl_account_material_id
    OR OLD.gl_account_subcontractor_id IS DISTINCT FROM NEW.gl_account_subcontractor_id
    OR OLD.gl_account_other_id     IS DISTINCT FROM NEW.gl_account_other_id
    OR OLD.qb_income_item_id       IS DISTINCT FROM NEW.qb_income_item_id
    OR OLD.qb_income_item_name     IS DISTINCT FROM NEW.qb_income_item_name
    OR (NEW.qb_connection_state = 'connected'
        AND OLD.qb_connection_state IS DISTINCT FROM NEW.qb_connection_state)
  )
  EXECUTE FUNCTION public.qb_wake_parked_queue();
