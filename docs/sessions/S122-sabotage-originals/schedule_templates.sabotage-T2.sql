-- SABOTAGE T2 (S122 Part 8): a permissive INSERT policy on schedule_templates. Permissive policies OR together,
-- so this admits every authenticated caller of the company... and beyond. RESTORE drops exactly this policy.
CREATE POLICY schedule_templates_insert_sabotage_t2 ON public.schedule_templates FOR INSERT TO authenticated WITH CHECK (true);
