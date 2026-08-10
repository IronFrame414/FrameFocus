# Context 99 — rebrand, mobile PWA, notifications core

One long session. Three bodies of work shipped to production: the EZ Contractor
Binder rebrand, the M6M mobile PWA, and the notifications module. Fifteen
migrations applied to production, attended. Tech debt worked from #117 to #149.

`main` at `40d65f1`. Production schema current through `20260905000000`.

---

## 1. Rebrand — EZ Contractor Binder

Live on **ezcontractorbinder.com**, DNS at Spaceship, Resend verified (DKIM, SPF,
DMARC), and a real proposal confirmed delivered with all three passing.

Three names were live in the tree, not two. The dashboard nav said RafterWorks,
tenant email sent from rafterworks.com, and the landing and auth pages said
FrameFocus. All three are gone from user-visible surfaces.

- `apps/web/lib/brand.ts` is the single brand source. Manifest, page titles and
  on-screen names read from it; A-26b2 and A-26b3 assert no literals anywhere in
  `/m` or the manifest.
- Logo variants by background: `logo-full-ice.svg` on navy (sidebar, landing),
  `logo-full-light.svg` on the white auth cards. Named for their **kicker
  colour**, not their background — the trap that cost a round trip.
- `SENDING_DOMAIN` stays in `email-service.ts`, deliberately not in `brand.ts`:
  it is a claim about external Resend/DNS state, not a brand string, and the two
  must be able to diverge.
- Package scopes (`@framefocus/*`), the GitHub repo, the Supabase project and the
  Vercel project all keep their names. 169 imports across 130 files for no
  user-visible gain.
- Billing kill-switch built (`DISABLE_BILLING_ENFORCEMENT`, fail-safe: only the
  exact string `'true'` disables) but **deliberately never set**. Test accounts
  are comped in the database instead.

Three comped accounts in production, all `active` / `seat_limit 10` /
`plan_tier business` / `stripe_subscription_id NULL`: Bishop Contracting, Worth
Properties, H&H Signature Renovations. The NULL Stripe id is what makes the state
stable — no webhook branch can match the row.

---

## 2. M6M mobile PWA

Built end to end and installed on a real iPhone. A-26 passes, including the
offline relaunch.

Shipped: the shell, twelve section screens, six hamburger destinations, photos
(gallery, viewer, markup), five capture screens, detail views, write paths, the
offline queue, and the service worker. ~30 routes under `/m`.

### Decisions worth carrying

- **D-31 reversed D-21**: the derivative _is_ the display source. Safe only
  because no existing marked-up photos needed preserving. `photos.ts` resolves
  which file server-side and hands components one `displayUrl`, so the original
  cannot flash first — structural, not a promise.
- **D-54**: role-gated surfaces are hidden **and** route-guarded. A hidden button
  is not a permission.
- **D-57/D-58**: a subcontractor sees a punch item only if assignee or creator.
  Note the two identity axes — `assignee_id` is `company_members(id)`,
  `created_by` is `auth.users(id)`. Mixing them returns no rows rather than
  erroring.
- **D-60/D-63/D-64**: punch lists are standalone; item creation picks or creates
  a list; save-and-add-another keeps the list selected. D-60 governs _arrival_
  (nothing chosen), D-64 governs _continuation_.
- **ND-14** (from notifications): notifications live in the app-bar bell, not a
  sixth tab slot. Six slots gives 61.6px per item; "Notifications" needs ~70px at
  11px Barlow, and six slots plus a centre camera has no centre.
- **D-65** scoping held until award auto-assign and the backfill gave it real
  data. Sub side was empty on 6 of 8 projects; now 3 of 8, and those three are
  truthfully empty.

### Defects found by building

- `middleware.ts`'s matcher omitted `/m`. Server Components cannot set cookies,
  so `/m` could not refresh a stale token, bounced to `/sign-in`, and middleware
  forwarded to `/dashboard`. Phone-only, because a desktop token never goes stale.
- The service worker cached non-immutable dev chunks stale-while-revalidate, so a
  phone ran the previous build's JS against the current build's HTML. Fixed by
  storing only what the origin declares immutable; `VERSION` bumped to evict.
- All date maths used `toISOString().slice(0,10)`. Six mobile sites fixed; the
  helper existed **six times** across the repo and now lives once in
  `packages/shared/utils/dates.ts`. Thirteen desktop sites remain (#116).

---

## 3. Notifications core

Ten traces built, deployed, five crons registered. **Chat is the one unbuilt
leg** and has never been interviewed — it was ruled in scope at S89 and
described rather than explored.

The S89 spec was **ahead of** D-1, not behind it: it already rejected native and
chose the PWA. What superseded it was M6M building the entire third leg.

### Rulings (ND-series, prefixed to avoid colliding with M6M's D-1…D-56)

- **ND-2**: recipients, mentions and chat access key on **`profiles`**, not
  `company_members`, and follow `can_view_project()`. Forced by the schema —
  Owner, Admin and PM have no member row at all, and 34 of 41 member rows have
  no login.
- **ND-3**: desktop push via a **second push-only worker** at `/dashboard`
  (`sw-dashboard.js`), not by widening `sw.js`'s scope. The mobile worker's
  cache policy caused a real hydration failure on a handset.
- **ND-4**: all incident types override notify-hours. No severity column.
- **ND-5**: the **shipped** incident rule wins — hierarchy strictly above the
  submitter, company-wide, assignment-independent, Owner→Admin floor. An
  off-project injury must still reach leadership.
- **ND-6**: R3 narrowed to internal email. The 7 client-facing senders stay
  email-only.
- **ND-7**: CO signed — author, Owner and Admin get a linked notification; other
  project PMs get **text only, no link**, because the S121 floor makes the row
  unreadable and a link would 404.
- **ND-9**: one row, surface-agnostic key, resolved per surface.
- **ND-18**: assignment writes moved to **server routes** so `notify()` has
  somewhere to run. The route _is_ the distinction — no `notify: false` flag,
  which would be a suppression switch on the one trace where silence means
  someone does not know they have work.

`week_starts_on` needed no migration: the CHECK was already 0..6 and
`weekWindow()` already general. The constraint was one array in the settings
form.

### Defects found by the new coverage

- §3i's day window was read in UTC, so a New York company's "no daily log today"
  could fire on yesterday evening's crew.
- §3g's denominator summed every line — "3 of 30 windows damaged" counted trim.
- Teardown leaked 24 rows, because id lists only held what a test read back
  before asserting.
- §3j's emitter **never existed**. TECH_DEBT #91 recorded an S83 interview
  decision as though it were shipped code.

---

## 4. Production defects caught, and how

Two reached production and were fixed the same day.

**A trigger outlived its columns.** Migration `20260903000000` moved
`default_hourly_rate`, `default_markup_percent` and `ein` to
`subcontractor_financials` but left `enforce_subcontractors_column_scope()`
reading `NEW.default_hourly_rate`. plpgsql resolves record fields at runtime, so
the DROP raised nothing. Exactly one role hit it: owner/admin and the service
role take early returns, foreman/crew/sub are refused by RLS first, and only
**project_manager** falls through to a hard 42703. **A PM could edit no
subcontractor at all.** Every fixture passed because they all run as service
role. CI caught it — the e2e suite was the only caller that had ever tried as a
PM. Fixed by `20260904000000`.

**#117 was live, not latent.** `change_orders_select_visible` had no role floor:
`josh+crew@`, a real login, read 13 change orders with `net_delta` up to
$211,563.12 plus `unit_cost`, `markup_percent` and `total` on the lines. The
exposure was wider than the entry recorded — four markup columns nobody had
named. Floored by `20260830000000` with authored-by PM scoping, on both
platforms. `canSeeFinancials` had been Owner/Admin — **narrower** than the S97
ruling it cited.

Three RSC payload leaks found and closed: the expenses page, the CO list and the
CO detail all shipped money in the payload while gating only the render.

---

## 5. Practice — what actually cost time

**Masked exit status, five instances.** `next build | tail` reports `tail`'s
status. `db:types 2>/dev/null >` swallows the generator's _and_ truncates the
file first. A trailing `echo` makes the shell and the task notification report
the echo's. Twice this hid real failures of 89 and 91 tests. The mitigation that
works: print the real code into the output and corroborate with an independent
signal — a ✘ count, a test tally. Now #137, with `defaults.run.shell` in
`ci.yml`.

**`npm run dev` moves to 3001 on a port collision and warns rather than fails**,
while Playwright keeps driving whatever holds 3000. Cost two full runs. Now
`scripts/e2e-preflight.sh` (#138).

**A single Playwright run does not survive in this Codespace.** Split it: m-shell,
m-sections, m-photos, then the rest. #145 closed as _mitigated_ — the mechanism
is V8 aborting a renderer on heap exhaustion, which the kernel never sees, so
`oom_kill 0` never excluded it. The error lands on the _next_ navigation, which
is the whole "different test each time, each passes alone" signature. No crash
dump was ever possible: `chrome-headless-shell` ships no crashpad handler and
Playwright passes `--disable-breakpad`.

**A Codespaces secret shadowed a working Resend key** — third occurrence of the
trap `STATE.md:29` records. Two different keys: `.env.local`'s is valid,
`process.env`'s returns HTTP 400, and Next reads `process.env` first. Production
was never affected. Secret deleted at profile level; takes effect on rebuild.
Note: nothing escaped that Codespace **because the key was dead**, not because
of test isolation. The injected sender is the isolation.

**The service role bypasses RLS but not triggers.** `auth.uid()` is NULL under
the service key, so a trigger guarding on it refuses. Same mechanism as the PM
defect, from the other side.

**Vercel Hobby caps crons at 2/day.** Five crons with three hourly were rejected
_before a deployment was created_ — nothing appeared in the Deployments list to
debug. Upgraded to Pro.

---

## 6. Where things stand

**Live and working:** the rebranded app on ezcontractorbinder.com; the mobile PWA
installed and passing A-26 including offline relaunch; notifications deployed
with five crons; CI green on the production-build path.

**Never verified end to end:** push enrolment on a device. The install-gate UI,
the permission prompt, and an actual notification arriving. Josh has no projects
or crew set up yet, so it waits.

**Open tech debt:** #131 (e2e as a required check — deferred to first paying
customer, since required checks gate PRs and the workflow is direct-push),
#147(b) (an unexplained `next-server` death mid-run, and ~80 tests that ran
against a dead origin), #148 and #149 from the deletion survey, plus three new
UI items: multiple addresses per contact, inline contact creation from an
estimate, and reordering categories and lines on estimates and change orders.
The push enrolment control does not read as tappable.

**Next:** chat. Branch fresh off `main`; `feat/notifications` is spent. Start
with an interview — it is the only leg never interviewed, it has zero footprint
anywhere in the repo, and it is severable by §7.2, so the M8 gate is already
satisfied without it. Chat is wanted, not needed, which changes what scope is
worth.
