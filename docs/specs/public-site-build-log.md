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

## Step 3a — plan catalog to ruled numbers ✅ (`8656600`)

`PLANS` → $50/$100/$200, 3/7/20 (storage 50/120/500 unchanged); portal on Professional + Business;
"workflow automations" strings removed. `billing/page.tsx` derives its labels from `PLANS` instead
of a second hardcoded copy. Obsolete unimported `SUBSCRIPTION_TIERS` deleted. New migration
`20261070000000` bumps the signup trigger's Starter `seat_limit` 2→3 (reproduced verbatim from
`pg_get_functiondef`, only the two literals changed; applied to rebuild-test). type-check 5/5,
billing units 21/21. ⚠️ **Stripe Price objects are Josh's to repoint** (§S1-STRIPE).

## Step 3b — /pricing + homepage ✅ (commit below)

Built from the ONE catalog: `components/public/pricing-table.tsx` (shared by `/` and `/pricing`),
`site-header.tsx`, `site-footer.tsx`. Homepage rewritten — ruled pitch, the four things (§2 order,
ruled copy), Josh's paragraph (his voice, leads with running his own jobs), pricing, footer. No fake
social proof, no analytics/pixels/scripts, no AI-estimates or QuickBooks claims.
⚠️ **Card copy deferred:** the homepage says "Start your 30-day free trial · Nothing is charged
without your approval" — both true TODAY. It does NOT yet claim "credit card required" because
card-at-signup (Step 4) is not built; adding that line before the build would put a claim on the
page the code does not do.

**Battery (Step 3b):** type-check 0; production build **exit 0, 117 static pages** (+3); `/`,
`/pricing`, `/terms`, `/privacy` all prerendered `○` (render with no session). One lint warning
(`<img>` for the logo) — matches the existing homepage/sign-up convention.

## Step 2 — /terms + /privacy — placeholder wired, verbatim BLOCKED

Josh created `docs/specs/terms-of-service.md` and `privacy-policy.md` but both are **empty (0 lines)**
at time of writing. `/terms` and `/privacy` routes are built and load, rendering an honest
placeholder that **asserts no policy** (no invented terms/retention/collection claims). The reviewed
text is rendered verbatim once it lands. CC does not author legal text.
⚠️ Also gated by Step 4 — the Terms assert card-required (Gate 5, below).

## Step 4 — card-at-signup — RULED and specced; runs as its own session

Josh chose "build it now" but his elaboration ruled the design, reserved the abandonment fork for
its own session, and named the critical path. Investigation then showed the coherent feature is a
large funnel/Stripe build whose **core (Stripe setup + email round-trip) is not e2e-verifiable in
the Codespace**, and whose **hard gate is entangled with existing accounts** (the Sabal Point
fixture has **no subscription row**; the 1552-test suite signs in as owner). Committing an
unverifiable funnel — or an unreachable column+webhook slice — would violate S173 (no half-built /
no banking dead code). So this session **fully specs it as the ruled, session-ready design** rather
than banking partial code:

- **Ruled design** written to `public-site-and-trial-conversion-spec.md` §S3 (onboarding gate after
  confirmation; plan choice in onboarding; Stripe Checkout `mode:'setup'`; extend the EXISTING
  signature-verified webhook for `mode:'setup'` — no new endpoint; lifecycle unchanged).
- **§S8** records the three dependencies: grandfather existing accounts via
  `companies.payment_method_on_file` (backfill true); the **abandonment fork** (RESERVED — rule it
  deliberately, don't inherit `delete_after`); and the un-verifiable Stripe/email paths Josh must
  test in Stripe test mode.
- ⚠️ **Critical path recorded in `GATED.md` Gate 5:** the reviewed Terms assert card-required, so
  **Terms cannot publish until card-at-signup ships**, and Terms are the **Intuit/QuickBooks** gate.
  Card-at-signup is not optional polish.

**Nothing for Step 4 was committed to code** — it is spec-complete for a dedicated session that can
verify against Stripe test mode. Offered to Josh to start building immediately on his word.

## Step 2 (continued) — /terms + /privacy now render the reviewed docs VERBATIM ✅

Josh committed the reviewed documents (`docs/specs/terms-of-service.md` 216 lines,
`privacy-policy.md` 285 lines) on `main` at `1544723`; cherry-picked onto this branch (`519a858`).

**Mechanism (reported before building):** the two pages are statically prerendered, so
`lib/legal-docs.ts` reads the `.md` at **build time** (`fs.readFileSync`, no runtime file access) and
the text is baked into the static HTML. **Single source** — editing the `.md` + rebuilding updates
the page; no component change, no transcription. Rendered with **`react-markdown` + `remark-gfm`**
(new deps; `remark-gfm` is what renders the GFM **tables** — the privacy policy's service-provider
list and retention windows). One shared `<MarkdownDoc>` maps every element to Tailwind classes (no
typography plugin); wide tables scroll in their own container. No raw HTML in the docs, so nothing is
dropped — the content is verbatim.

**Verified:** type-check 0; build **exit 0**, `/terms` and `/privacy` are `○` static (load with no
session); built HTML contains the headings/content and a rendered `<table>` with the service-provider
rows (Supabase / Stripe / Resend) and retention windows. Lint clean (the one `<img>` logo warning).

⚠️ **Do NOT submit these to Intuit yet:** two claims in the documents describe the finished state and
are not yet true — the Terms assert card-required at signup (Step 4, not built) and the pricing shows
amounts the Stripe Prices do not yet charge (§S1-STRIPE). The documents are correct-as-written and
must not be softened; they publish once both land.

## Header + homepage polish (same pass)

- **Logo** enlarged `h-9 → h-12` (the "EZ Contractor" line was barely legible) and given a real
  clickable affordance — it already linked to `/`; the fault was size + no hover cue. Added
  hover-opacity + focus-visible ring; `aria-label` now "…— home".
- **Homepage qualifier** ("For contractors running jobs with subs, client selections, and progress
  billing") promoted from muted `text-base text-gray-500` to `text-xl font-semibold text-brand-900`
  — it does the filtering work (names the reader) and should outweigh the two pitch lines above it.

## Owner profile rename (post-merge, branch `fix/fixture-owner-name`)

The sidebar showed the Owner as **"Josh Bishop"** (a real name, in every screenshot) — the S176
fixture rename covered company/addresses/contacts/subs/projects but not the signed-in user's own
profile. Renamed the owner profile (`josh+test50@worthprop.com`, id `4cc43826…`) to **"Dave
Whitfield"** on rebuild-test. Coupled code:
- `desktop-chat-mentions.spec.ts` — the self-exclusion assertion reads the LIVE owner name; updated
  `not.toContain('Josh Bishop')` → `'Dave Whitfield'` + the roster comment, or it would pass
  vacuously (S157). The three other `'Josh Bishop'` refs (`s123`, `brand-*-footer`) are literal test
  inputs, not the fixture — left as-is.
- `seed-test-identities.mjs` owner identity synced to Dave/Whitfield.
- ⚠️ **e2e verification blocked by environment instability** — a concurrent session was bouncing the
  shared checkout, restarting the dev server mid-run; `desktop-chat-mentions` failed on
  `waitForURL`/`ERR_ABORTED` navigation timeouts, and an UNMODIFIED test in the same file failed the
  same way, so it is infra, not the edit. The change is a name-independent swap (self-exclusion is by
  profile id). **Re-run `desktop-chat-mentions` when the environment is quiet.** (⚠️ the background
  wrapper reported "exit 0" — that was the trailing `echo`; the real `E2E_EXIT=1`, trap #137.)

## Self-service name edit — investigated, RULED, not built [Josh]

**Finding:** no self-service name edit exists (no `/profile` or `/account`; `m/settings` documents its
own nonexistence). Names ARE correctable, but only under **Team → member → Edit** (`/dashboard/team/[id]/edit`,
mobile `/m/team/[memberId]/edit`) — Owner edits any other member, Admin edits non-owner/admin members.
⚠️ The desktop edit **blocks editing your own profile** for everyone, and an Admin can't edit an Owner,
so **the Owner's own name has no in-app path** (why S176 fixed it in the DB). RLS `profiles_update_owner`
would permit owner-self-update; the block is UI-layer.

**Ruled [Josh]: it lives on a personal profile/account page** (self-service, every role). **Do not
build yet** — policy shape reported below first.

⚠️ **Constraint 1 — NAME ONLY, for now [Josh].** Only first/last name. NOT password, email, avatar, or
notification preferences. Reasons: notification preferences don't exist (no `notification_preferences`
table; per-type routing was deferred); email is an **auth** surface (changing it is a Supabase Auth
re-confirmation flow, not a profile write). **A page with one working field beats one with four
disabled ones.** The page grows later when there's something real to add.

⚠️ **Constraint 2 — the RLS needs a NEW self arm, column-scoped to the NAME columns [Josh].** The two
existing UPDATE policies are `_owner` and `_admin`; **a foreman correcting their own name has no policy
that admits it.** `profiles_update_owner` letting an owner update their own row is why the current
block is UI-layer only — it is not the arm this needs.

**Reported policy shape (mirrors `enforce_client_contracts_column_scope` + the payments trigger, which
column-scope via `NEW.<col> IS DISTINCT FROM OLD.<col>` in a BEFORE-UPDATE trigger — RLS `WITH CHECK`
cannot see `OLD`, so column scope is a trigger concern):**
1. **New RLS policy `profiles_update_self`** (UPDATE): `USING (user_id = auth.uid())`,
   `WITH CHECK (user_id = auth.uid())`. Admits a user editing their OWN row — the missing arm. ⚠️ This
   alone is a *blanket* self-update (it would admit a role change), which is why (2) is mandatory.
2. **New BEFORE-UPDATE trigger `enforce_profiles_self_column_scope()`** (SECURITY DEFINER plpgsql):
   on a self update (`auth.uid() = OLD.user_id`), `RAISE EXCEPTION` if ANY column other than
   `first_name`/`last_name` is `DISTINCT FROM OLD` — `role`, `company_id`, `user_id`, `email`,
   `contact_id`, `member_id`, `is_deleted`, … must be unchanged. This is the column scope that stops
   self role/company escalation, the whole authority model.
   - Keyed on `auth.uid() = OLD.user_id`, so it does **not** constrain Owner/Admin edits of *other*
     members (their management policies are untouched). Service-role (no auth context, `get_my_role()`
     NULL) bypasses, like `enforce_client_contracts_column_scope` does.
3. **Parity:** one shared self-update path for desktop and mobile (S122).

**Team → Edit self-block — reported recommendation:** the desktop server action throws *"Cannot edit
your own profile from this page"* for everyone. Once the personal page exists, **keep the block but
make it a signpost that points at the new page**, rather than removing it. Removing it would create a
second place to edit your own name (two save paths — the exact parity/divergence risk S122 names);
pointing keeps Team about *others* and self on the one canonical page. Josh's "editing your own name
from the roster you're standing on is not unreasonable" is satisfied by the signpost without the
second write path.
