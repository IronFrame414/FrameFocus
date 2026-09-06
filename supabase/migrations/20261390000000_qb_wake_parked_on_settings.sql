-- ============================================================================
-- 7G MIGRATION M-F — wake the work a PARK was waiting on.
-- ============================================================================
--
-- ⚠️ THE DEFECT THIS CLOSES, stated plainly because the symptom lies.
--
-- `parkAwaitingHuman()` (lib/quickbooks/queue.ts) leaves a row `queued` with
-- `next_attempt_at = now + 5 minutes`. That is correct and deliberate: nothing
-- is wrong with the record, a person simply has to answer something first, and
-- re-checking every drain would burn Intuit reads on a question only a human
-- can close.
--
-- The contract that makes it safe is that ANSWERING THE QUESTION UN-PARKS THE
-- ROW. Two of the three park reasons honour it in their answer routes:
--
--   income item missing        -> app/api/quickbooks/income-item/route.ts
--   customer name conflict     -> app/api/quickbooks/customer-conflict/route.ts
--
-- The third does not, and could not. `billAccountRef()` parks an expense with
-- *"No QuickBooks account is mapped for <category> costs. Set it on Settings ->
-- Accounting, and this expense will sync automatically"* — and Settings ->
-- Accounting is `gl-mapping-settings-form.tsx`, which saves the `gl_account_*`
-- columns CLIENT-SIDE through `updateGLMappingSettings()` on the anon key.
-- `qb_sync_queue` has NO client UPDATE policy by design ("a client-side INSERT
-- would let a PM enqueue arbitrary pushes to the company's books",
-- 20260929000000), so that save CANNOT un-park anything. The promise in the
-- park message was unkeepable from where it was made.
--
-- Observed on rebuild-test at S181: an approved subcontractor expense parked on
-- an unresolvable GL account name, the name was corrected in Settings, and the
-- next several drains returned `{"companiesConsidered":1,"companiesDrained":0}`
-- with every other counter zero -- which is EXACTLY what an empty due-set
-- returns. The row was not stuck and not unclaimable; it was inside its park
-- window, and nothing in the drain's output distinguished that from "no work".
--
-- ⚠️ WHY A TRIGGER AND NOT A CALL IN THE SAVE PATH. The same two reasons M-E
-- (20261380000000) gives for the enqueue hooks, and the second one is what
-- actually bit here: "a call site is a list someone forgets to add to." The GL
-- mapping form predates 7G entirely and has no idea a sync queue exists. A
-- trigger hangs off the row, so it catches the existing form, the API route, a
-- future screen, and a hand-run SQL fix alike.
--
-- ⚠️ SECURITY DEFINER IS REQUIRED, NOT DECORATION. The settings form updates
-- `companies` as an ordinary authenticated user. `qb_sync_queue` has no UPDATE
-- policy for any client role, so an invoker-rights trigger would update ZERO
-- rows and report success -- a silent no-op wearing a green tick, which is the
-- failure mode this migration exists to remove, not to reproduce.
-- ============================================================================


CREATE OR REPLACE FUNCTION public.qb_wake_parked_queue()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- ⚠️ `status = 'queued'` AND NOTHING WIDER, and the distinction is the whole
  -- safety argument:
  --
  --   queued + next_attempt_at in the future  = PARKED. Waiting on a person.
  --                                             The person just acted. Wake it.
  --   queued + next_attempt_at IS NULL        = never attempted. Already due;
  --                                             the WHERE below skips it.
  --   failed_transient                        = a REAL error backing off with
  --                                             `attempts`. Clearing that clock
  --                                             would hammer Intuit on recovery
  --                                             and discard the jitter that
  --                                             exists to prevent a thundering
  --                                             herd. NEVER woken here.
  --   in_flight / pushed / failed_terminal    = not ours to touch.
  UPDATE qb_sync_queue
     SET next_attempt_at = NULL
   WHERE company_id = NEW.id
     AND status = 'queued'
     AND is_deleted = false
     AND next_attempt_at IS NOT NULL;

  RETURN NULL;   -- AFTER trigger; the return value is discarded.

EXCEPTION WHEN OTHERS THEN
  -- ⚠️ AN UN-PARK MUST NEVER BLOCK A SETTINGS SAVE. Same doctrine as M-E's
  -- enqueue triggers: the Owner correcting a GL account name is not allowed to
  -- fail because a queue table was unhappy. The cost of swallowing is a row
  -- that waits out its five minutes -- i.e. exactly today's behaviour.
  RAISE WARNING '[7G] un-park failed for company %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.qb_wake_parked_queue() IS
  '7G M-F. Clears next_attempt_at on a company''s PARKED (status=queued) sync '
  'rows when the Owner supplies the thing a park was waiting for: a GL account '
  'mapping, the income item, or a reconnect. Never touches failed_transient -- '
  'that clock is a real backoff, not a park.';


-- ⚠️ THE `WHEN` CLAUSE IS THE COST CONTROL. `companies` is updated on plenty of
-- unrelated paths (branding, notification hours, Stripe flags); without this the
-- trigger would run a queue UPDATE on every one of them.
--
-- The three groups, and why each earns its place:
--   gl_account_*      the case that was actually broken -- billAccountRef()'s
--                     park names Settings -> Accounting as the remedy.
--   qb_income_item_*  belt to the income-item route's own braces. The route
--                     still clears explicitly and that is left alone: it is the
--                     documented behaviour of that endpoint, and a redundant
--                     write costs nothing next to a second mechanism to forget.
--   qb_connection_state -> 'connected'
--                     the reconnect promise. The 7G checklist Step 8.3 says
--                     "anything still queued flows on the next drain"; without
--                     this a reconnected tenant waits out a park window first.
DROP TRIGGER IF EXISTS companies_qb_wake_parked_queue ON public.companies;

CREATE TRIGGER companies_qb_wake_parked_queue
  AFTER UPDATE ON public.companies
  FOR EACH ROW
  WHEN (
       OLD.gl_account_labor        IS DISTINCT FROM NEW.gl_account_labor
    OR OLD.gl_account_material     IS DISTINCT FROM NEW.gl_account_material
    OR OLD.gl_account_subcontractor IS DISTINCT FROM NEW.gl_account_subcontractor
    OR OLD.gl_account_other        IS DISTINCT FROM NEW.gl_account_other
    OR OLD.qb_income_item_id       IS DISTINCT FROM NEW.qb_income_item_id
    OR OLD.qb_income_item_name     IS DISTINCT FROM NEW.qb_income_item_name
    OR (NEW.qb_connection_state = 'connected'
        AND OLD.qb_connection_state IS DISTINCT FROM NEW.qb_connection_state)
  )
  EXECUTE FUNCTION public.qb_wake_parked_queue();
