# Public site & trial conversion — build log

> Spec: `public-site-and-trial-conversion-spec.md` (finalised S176). Branch
> `feature/public-site-trial-conversion`. Opus 4.8. Steps committed path-scoped; CC does not push.

---

## Phase 1/2 — analysis and rulings

Four Explore agents + direct verification filled all seven `§S`. Josh ruled the four open decisions
(AskUserQuestion, S176):

1. **Legal docs** — Josh supplies the text; `/terms` + `/privacy` blocked until then.
2. **Card at signup** — BUILD it (Stripe **setup mode**, not trial-subscription mode, to honour the
   no-auto-charge ruling). The spec's premise "card is taken at signup" was **false** — verified: no
   card today, and nothing auto-charges (trial → lock).
3. **Company rename** — to **Sabal Point Construction**, do the full sweep, prove the battery.
4. **Screenshot data** — sanitize all ad-hoc rows.

Spec finalised and committed `8708631` before any build commit.

---

## Step 1 — fixture rename + sanitation ✅ (commit below)

**The company is renamed at the DATA layer on rebuild-test, not just in code.** The seed script
(`seed-test-identities.mjs:188`) looks the company up by name and never creates it, and **no upstream
import recreates it** (the only non-test hit is a stale, different-id row in `prod_backup_pre_S98.sql`,
left untouched). So a live DB rename is durable; the seed constant is updated in lockstep.

**Applied to rebuild-test (`03bb903f…`):**
- `companies.name` → `Sabal Point Construction`. ⚠️ **Slug kept as `bishop-contracting`** — the email
  From local-part derives from slug (`email-service.ts:131`), is never screenshotted, and keeping it
  shrinks the blast radius and keeps `s136`'s slug-collision test valid.
- Three **real Florida addresses** replaced with invented ones (contacts **and** subs):
  `123 Rosalie Ct` → `418 Palmetto Grove Dr`; `2455 Sugarloaf Lane` → `1725 Harbor Reach Way`;
  `2835 Nokomis Avenue` → `902 Cypress Bend Ct` (city/state/zip kept).
- Gibberish ad-hoc contacts/subs → plausible names (`af SAZF`→`Marcus Webb`/Coastal Building Supply,
  `fb Bishop`→`Diane Foster`, `xfgn`→`Everglade Lumber & Supply`, `btb`→`Benson Tile & Stone`).
- 8 ad-hoc projects (`test4`, `Copy of …`, `test5`) → plausible project names, by id.
- ⚠️ **Left untouched (test-pinned or founder):** every `QA …`/`S97…` row, `kitchen test`, all
  `M6MC …` project names (alphabetical-order assertion), the `DVDF` sub name (expense-supplier
  label), and anything named `Josh Bishop` (founder). Each verified 0-or-pinned by grep first.

**Code sweep:** `Bishop Contracting` → `Sabal Point Construction` across **58 test/e2e files**
(73 refs), plus `seed-test-identities.mjs:47` and the `/sign-up` placeholders (TECH_DEBT #120).
- ⚠️ **`s136-company-slug.live.ts:88` deliberately excluded** and annotated: its `'Bishop Contracting'`
  is a slug-FUNCTION input that must still normalise to the kept slug `bishop-contracting` and collide
  (→ `-2`). Blind-replacing it would have made the collision test prove nothing (the S157 trap).
- The 4 `lib/**/*.test.ts(x)` pure-function tests and all docs/session logs left as-is (not
  fixture-coupled; historical records).

**Battery (Step 1):**
- type-check (`tsc --noEmit`): **exit 0**.
- live sample (`s136`, `s97ct-budget-floor`, `email-unsubscribe`, `s171-selections-lifecycle`,
  `webhook-resend`): **67/67**.
- **Full live suite: 109 files, 1552/1552, exit 0** — matches baseline exactly, so nothing was
  silently dropped or turned green-against-nothing.

---

## Step 2 — /terms + /privacy — BLOCKED

Josh created `docs/specs/terms-of-service.md` and `privacy-policy.md` but both are **empty (0 lines)**
at time of writing. Will render verbatim once the text lands. CC does not author legal text.
