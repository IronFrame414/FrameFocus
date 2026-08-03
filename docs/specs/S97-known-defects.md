# S97 — Known defects in this session's own output — FOR CC

> **What this is:** a self-audit of Session 97's five rewritten specs (`7d1` … `7h1`) and the five
> `claude/S97-7*-audit-rulings` docs. Written by the session that produced them, so the next builder
> does not inherit these as facts.
>
> **Status:** Josh reviewed and ruled these **"close enough for CC to handle."** Nothing here blocks
> the specs from being used — but each item is a claim that should be corrected, not trusted.

---

## 1. OVERCLAIM — the QuickBooks metering conclusion (highest consequence)

**Where:** `7g1-spec.md` §7G.3a, and §7G.6's verification queue, which marks it **RESOLVED**.

**What was claimed:** that the CorePlus metered-read quota is per **Workspace**, aggregated across
every connected company — i.e. all FrameFocus customers share one pool — presented as settled from
Intuit's App Partner Program Guide.

**Why that is too strong.** The quoted line — _"API calls and API Credits are aggregated across all
production **Apps** in a given Workspace"_ — is about multiple **apps**, not multiple **connected
companies**. The retrieval of Intuit's own guide returned explicitly: _"The document does **not
specify** whether the quota applies per realmId/company or across all connected companies within a
workspace."_ The conclusion actually rests on a **secondary source** (Apideck), which does state
"workspace level, not per individual app or realmId."

**Correct status:** _strongly indicated, not established._

**Action for CC:** downgrade §7G.3a and §7G.6 from RESOLVED to **"likely workspace-wide — confirm
with Intuit partner support before committing to Model A's webhook design."** The tier figures
(Builder 500k / Silver 1M / Gold 10M / Platinum 75M; writes free; Builder overage **blocked**) and the
CDC-cadence arithmetic are unaffected — only the per-app-vs-per-company scope is unconfirmed.

**Why it matters:** 7G itself called this _"the only open item that can invalidate a decision already
made rather than refine one."_ It should not be closed on a secondary source.

---

## 2. Stale cross-reference — 7G cites the wrong 7D acceptance number

**Where:** `7g1-spec.md` §7G.2 #3 (the ripple note) and §7G.8 (the amendment list). Both cite
**"7D §13 and acceptance #17."**

**Correct:** in the S97 `7d1-spec.md` the delivery criterion is **#18** (the rewrite added criteria and
renumbered from 18 to 20 items). #17 was its number in the pre-S97 file.

**Action for CC:** change both to **#18**, or match on the criterion text rather than the number.

**Wider risk:** the S97 7D rewrite renumbered its acceptance list. **Any document citing 7D acceptance
numbers is suspect.** Only `7g1` was swept; other specs, prep docs and `TECH_DEBT.md` were not.

---

## 3. 7D asks for a trace that was already supplied

**Where:** `7d1-spec.md` §15 "Traces still owed" and §O's owed-by-Josh table. Both still list the
**negative-CO credit document** as missing.

**Reality:** Josh supplied it — the real **−$5,000 tile-repair CO** (client removed scope after
signing; she had already paid a deposit for that work; she still owed more than $5,000, so it reduced
her remaining bill; no cash returned; QB CreditMemo). It was written up as **`7e1-spec.md` §9 trace D**
and never backported to 7D.

**Action for CC:** close the item in 7D's §15 and §O, citing 7E §9-D.

> **Caveat:** if the parallel-session 7D revision reversed §4a's credit document, this item may be
> moot rather than closed. Check 7D §4a's current state first.

---

## 4. `[S97]` is an assumed session number — the same trap this session corrected

The S97 pass corrected 154 `[S94]` tags to `[S96]` on solid evidence (`context94.md` names S94's
commits as 113c stage 1; the spec commits postdate S95 and are claimed by `context96`).

**It then tagged ~196 items across five specs `[S97]` — also assumed from sequence — and deleted the
original files' honest caveat** (_"Session number is assumed from the sequence. Confirm and adjust if
it differs."_) rather than carrying it forward.

**Action for CC:** confirm the real session number and either correct the tags or restore an explicit
"assumed" caveat in each `§P` / provenance section.

---

## 5. Claims shipped without verification (all since checked, all correct)

Recorded for process honesty, not because they need fixing:

| Claim                                                        | Cited in | Status                                                  |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------- |
| money-rep **P5** (effective-dated rates, bounded backdating) | 7H       | Verified correct — `money-representation.md:61`         |
| money-rep **P6** (signed COs write their own budget lines)   | 7H       | Verified correct — `:88`                                |
| `@react-pdf/renderer`                                        | 7H #9    | Verified present — `apps/web/package.json:19`, `^4.5.1` |

These were passed through on the specs' authority at writing time and confirmed only during the
self-audit. Correct by outcome, not by process.

---

## 6. Not reconciled — the parallel 7D revision

A parallel session revised `7d1-spec.md` during S97 (rulings R1–R6, including changes to §4a's
negative-CO credit document and §8's override/disposition model). **The S97 rewrites of 7E, 7F, 7G and
7H were all written against the pre-revision 7D** and cite it heavily:

- **7E** — §3a (negative-CO credit application), §8a (void rules), acceptance #11
- **7F** — #10 (billed minus retainage), §7F.9 (invoice-void → release void)
- **7G** — §7G.4's CreditMemo row and billed-amount rule
- **7H** — #1's completion switch and backlog, both of which assume 7D §8's write-off / hold-back split

**Action for CC:** run a cross-spec consistency pass once the 7D revision is settled. §7H.10-C and the
Backlog headline are the most exposed, since they depend on a write-off/hold-back distinction that may
no longer exist.

---

## 7. What was verified properly (for contrast)

So the list above is read as scoped, not as a general warning about S97's output. These were checked
directly against the repo and are cited to `file:line` throughout the five audit docs:

`instrument_rates` schema and its CHECK constraints · `deriveCostPlusSell` / `deriveTmLaborSell` /
`roundMoney` / `NoRateInForceError` · `supersede_instrument_rate`'s Owner-only gate ·
`change_orders` status and `net_delta` · `companies.default_labor_rate` and its three live consumers ·
`expense_payments`' immutability pattern · `getJobCostRollup()`'s two-branch spent rule and its
`payables.retainageHeld` · the estimate-reminder machinery and its per-document (not per-client) scope ·
`companies` having **no** signature column · **no** county or legal description anywhere ·
`pdf-lib` and its two shipped stamping services · `projects.project_number` / `next_project_number()`
returning `PRJ-###` · `can_view_project()` having no financial dimension · money-rep P1–P11 and §4.5 ·
architecture §7.2, §7.6, §7.10, §7.11, §7.12 · `context94.md` vs `context96.md` commit attribution.
