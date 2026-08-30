-- ============================================================================
-- The signed-CO delete boundary meets the Q3 archive [deletion-sweep Phase 3].
--
-- S168 / #1-s167fx [Josh] ruled: "a signed change order cannot be deleted —
-- void it instead, the signed copy is kept", with deliberately NO service-role
-- escape. Q3 [Josh, Phase 3 on deletion-sweep-analysis.md] ruled: on account
-- deletion, executed instruments are ARCHIVED into archived_documents and the
-- originals are then deleted with everything else.
--
-- Both rulings stand. The reconciliation ENFORCES the S168 boundary's own
-- stated purpose instead of weakening it: a signed change order may be
-- deleted ONLY when its archive copy already exists — "the signed copy is
-- kept" becomes a checked precondition rather than a hope. Ordinary app
-- deletes still hit the original wall (nothing app-side writes
-- archived_documents; it has no tenant policies), so the only path through
-- is the deletion sweep, which archives first by construction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_change_order_delete_boundary()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF (OLD.signed_at IS NOT NULL OR OLD.status = 'signed')
     AND NOT EXISTS (
       SELECT 1 FROM public.archived_documents a
       WHERE a.source_table = 'change_orders' AND a.source_id = OLD.id
     )
  THEN
    RAISE EXCEPTION
      'A signed change order cannot be deleted. Void it instead — the signed copy is kept.';
  END IF;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.enforce_change_order_delete_boundary() IS
  'S168 / #1-s167fx [Josh]: unsigned change orders only — no service-role escape. AMENDED 20261056 [Q3]: a signed CO whose archived_documents copy EXISTS may be deleted (the deletion sweep archives, then deletes). The boundary now checks its own purpose: the signed copy is kept.';
