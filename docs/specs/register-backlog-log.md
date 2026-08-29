# Register backlog — session log

## Phase 1 — analysis (read-only), 2026-08-29

Every `§S` block of `Register-backlog-spec.md` filled from the tree and the live rebuild-test DB.
No code touched. Findings summarised here; the spec is finalised with these facts in Phase 3 after
Josh's Phase 2 answers.

| Block | Fact |
| --- | --- |
| §S1 | Highest allocated number is **#154** (S136 reconciliation fully discharged — its header block says it can be removed). Next free on main: **#155+**, but per the S136 rule a branch files **provisional ids** (`#N-regbacklog`) and converts at merge. Entry shape: the "Branch-scoped, awaiting real numbers" section pattern (`TECH_DEBT.md:86`), reasoning-rich bullets. |
| §S2 | `brand.ts` has **no `description` field**. Consumers of `crewManifest()`: `app/manifest.webmanifest/route.ts` (browser install UI / splash) + 3 tests, **none of which assert the description**. Recommendation: **add the field** — it is user-facing brand copy with a natural home; the banner then holds without an exception comment. |
| §S3 | **54 `useConfirm` / 20 `useAlert` / exactly 1 clicked** (`selection-lifecycle.tsx:84` via `desktop-selections.spec.ts:268`, testids `confirm-accept`/`confirm-cancel`). 12 sites are money-irreversible. Proposal: **7 tests** covering all of them (details in Phase 2). |
| §S4 | All five `prompt()` sites **still native**, lines drifted: `items-tab.tsx:207` · `markup-editor.tsx:92` · `releases-panel.tsx:85` · `contract-settings-form.tsx:309` · `lien-release-settings-form.tsx:106`. None behind a restyled surface. `#1-dialogsweep` already records the owed `usePrompt()` design. |
| §S5 | Live constraints on `subcontractor_compliance_documents`: PK, FKs, and **one CHECK (`doc_type`)**. The rule is same-row-only → **a CHECK**: `doc_type NOT IN ('coi','license') OR expiration_date IS NOT NULL`. A trigger buys nothing here. |
| §S6 | Rebuild-test: **0 rows** (0 violating, 0 deleted). **Production: UNREADABLE from this Codespace** — `live-sql.mjs` is pinned to the linked rebuild-test project and the never-production rule stands. Phase 2 carries the exact count SQL for Josh. |
| §S7 | `api/stripe/webhook/route.ts` handles `customer.subscription.updated` (`:113-161` — writes `cancel_at_period_end` a.o.; **releases the trial lock when status goes `active`**, `:152`) and `customer.subscription.deleted` (`:163-182` — writes `status:'canceled'` **only**; no lock, no clock). |
| §S8 | Trial clock: `trial_lifecycle.delete_after` (stored fact, `lifecycle.ts:186-188` comment; set with `locked_at` in one update at `:218-222`; `RETENTION_DAYS_TRIAL = 14` at `:30`). Table is 1:1 with companies. Reuse: recommended **with a `reason` discriminator** — Phase 2 Q. |
| §S9 | The lock is a **middleware gate** (`middleware.ts:138-154`) on `is_my_company_locked()` (SECURITY DEFINER), exempting only `/locked`, billing, sign-in/up + payment/webhook/cron APIs (`lock-guard.ts:45-68`). **It reaches the client portal deliberately**: `/portal` is matched, not exempt, and `middleware.ts:266-267` rules "a locked tenant's client portal going dark is the correct behaviour." |
| §S10 | **Deletion is NOT automatic** even for trials: `api/cron/trial-deletion/route.ts` is built + tested and **deliberately unscheduled** pending legal review (TL-24); vercel.json carries 8 crons, deletion absent, "that line is Josh's to add, after legal returns." Chain: `runTrialDeletion()` sweeps `delete_after <= now`, `deleted_at IS NULL`. |
| §S11 | Shipped Billing copy (`billing/page.tsx:143-144`): *"Your data is kept for 90 days after cancelling. You'll need an active subscription to access it."* — **matches the spec exactly** (90 days, locked-not-read-only). No other retention copy anywhere; ToS/privacy state no period (legal copy pending TL-23/24). |

Premise corrections found: **§1.1's "local-only" is stale** — `feature/full-audit` was pushed to
origin during the audit-fixes session; the remaining act is Josh's merge. **§1.2's s146-C5 row**:
fixed in the audit-fixes pass (s145-C5 now drives company B; the next full battery ran 1497/1497
with zero parallel reds) — to be recorded as fixed, not filed.

S157 sweep for §3: `s140-compliance-floor.live.ts:192` ("PM INSERT is refused") inserts a dateless
`license` — under the new CHECK it would pass **for the wrong reason** (CHECK, not RLS); the
fixture gains a date at build time. `:130`'s dateless `w9` success survives and becomes §5's
admit-proof.
