# Public site, before the Intuit production-keys review

**Branch:** `feature/public-site-intuit-review`, cut from `main` @ `f3223d1` (the merged 7G
conformance work — this ships in the same deploy).
**Mode:** unattended. Reversible defaults taken and recorded below rather than stopping to ask.

---

## 0. What the brief asked for versus what was already true

⚠️ **Two of the three requested changes were already shipped.** Verified by measurement, not by
reading — the disclosure was requested for `/pricing`, and `/pricing` already served it.

| Brief said | Measured |
| --- | --- |
| "The marketing side is NOT [built]" | **False.** `/pricing` → 200 with no cookies, and the exact disclosure string present. Same for `/`, `/terms`, `/privacy`. |
| Add the disclosure to `apps/web/app/pricing/page.tsx` | **Not needed.** It lives once in the shared `components/public/site-footer.tsx`, which all four public pages render — one placement instead of four that drift. |
| "Extend the regression guard to cover the marketing page" | Already covered: `s180-intuit-disclosure.test.tsx` → *"placement 1: the marketing pages"*. **Extended anyway**, see §3. |
| `/terms` + `/privacy` read `/docs/specs/*.md` by **absolute path**, failing a local production build | **False / already fixed.** `lib/legal-docs.ts` joins from `process.cwd()`: `path.join(process.cwd(), '..', '..', 'docs', 'specs', …)`. A clean `npx next build` exits **0** and prerenders both as `○`. |

**The one genuinely missing thing was the contact page.** It did not exist.

---

## 1. What shipped

- **`app/contact/page.tsx`** — new, public, statically prerendered (`○ /contact` in the build table).
- **`components/public/site-footer.tsx`** — a `Contact` link in the shared footer nav.
- **`test/s180-intuit-disclosure.test.tsx`** — guard extended.

### Why `/contact` is public, mechanically

`middleware.ts`'s `config.matcher` is an **allowlist of guarded paths**. `/contact` is absent from
it, so the middleware never runs for that route — the same reason `/pricing`, `/terms` and
`/privacy` load with no session. A test now asserts `/contact` stays out of that matcher, because
adding it would silently put the page behind auth and quietly remove the only reason it exists.

---

## 2. The copy constraints, and what they excluded

The business behind the product is **not a registered entity**, which drove every wording decision:

- **No corporate suffix** — no `LLC`, `Inc.`, `Corp.`. Writing one is a claim of a legal form that
  does not exist.
- **No claim of incorporation or registration** anywhere.
- **No owner, founder or officer named on this page.** `/terms` §1 and `/privacy` *do* name a
  natural person as the operator; that is left alone (§4). This page simply does not repeat it —
  silence is not a contradiction.
- **The separate property entity is named nowhere** on the public site (it never was; confirmed by
  a repo-wide grep across `app/`, `components/`, `lib/` and both legal documents).
- **One contact detail**: the shared public address. No phone, no mailing address.

⚠️ **Nothing was invented.** No founding date, team size, location, or response-time promise. The
product description is `brand.description` — the already-ruled manifest string — and the four
capabilities are the ruled landing copy (`app/page.tsx` `FEATURES`) verbatim. **The page therefore
makes no claim that had not already been approved.**

The address is **imported** from the footer (`PUBLIC_CONTACT_EMAIL`) rather than retyped, so the
site cannot drift into publishing two different addresses on two pages.

---

## 3. The guard, and why a list was not enough

The existing named-page list gained `/contact`. But **a list goes stale the day someone adds a
page**, so the load-bearing addition is structural:

> Any page under `app/` that renders the public `<SiteHeader />` **must** also render
> `<SiteFooter />` — the component carrying the disclosure declared to Intuit.

A new marketing page inherits the commitment or fails the suite, with nobody needing to remember
this file. Both sweeps assert a non-empty match first (`toBeGreaterThan(4)`), so a broken glob
cannot make them pass vacuously — the failure mode `brand-literals.test.ts` already guards against
in its own sweep.

The contact-page constraints are asserted against the source **with comments stripped**, because
the page's header comment deliberately *names* the things the page must never say — which is
exactly what makes it a useful warning to the next editor.

### ⚠️ `brand-literals.test.ts` caught me, and it was right

The first full-suite run went **red**: the new page wrote the product name as a **literal in a
comment**. That guard's own words are *"Comments count too — a name in a comment is one paste
away"*. The JSX already read `brand.name`; only the prose needed rewording.

**Adding the file to that test's `ALLOWED` list would have switched off a correct guard to protect
a comment.** Recorded because the tempting fix and the right fix pointed in opposite directions.

---

## 4. Reversible defaults taken (not asked, logged instead)

1. **Email casing.** The brief wrote `EZContractorBinder@gmail.com`; everything already published
   (`site-footer.tsx`, `/terms` ×3, `/privacy` ×4) uses lowercase `ezcontractorbinder@gmail.com`.
   **Kept lowercase** — same mailbox, and §3 of the brief requires the contact page to *match* what
   the live legal pages publish. Changing it would have meant editing reviewed legal text for a
   cosmetic difference. Reverse by editing the one constant in `site-footer.tsx`.
2. **The raw `mailto:` stayed in the footer** alongside the new `Contact` link. One fewer click for
   a reviewer, and it is the address the legal pages already publish.
3. **Contact link placed in the footer, not the header.** The header carries only the two visitor
   actions (sign in, start trial) by an existing ruling; the footer is where `Pricing`, `Terms` and
   `Privacy` already live.
4. **`/pricing` and `app/page.tsx` were not edited** — both already serve the disclosure via the
   shared footer, measured on the production build.

## 5. Dev-server handling

⚠️ Following the S190b lesson (`next build` writing into a live `next dev`'s `.next` corrupted the
QuickBooks callback into a permanent silent 404): the dev server was **stopped by PID** — never
`pkill -f` — `.next` deleted, the build run against a clean tree, and verification done against
`next start` on port 3100. The dev server was restarted afterwards.

## 6. Verification

| Check | Result |
| --- | --- |
| `npx vitest run` (full) | **76 files, 1064 tests, 0 failed**, exit line `0` |
| `npx tsc -p apps/web --noEmit` | exit line `0`, **0** `error TS` lines |
| `npx next build` (clean `.next`) | exit line `0`, **0** compile-failure lines; `○ /contact` prerendered |
| `/`, `/pricing`, `/contact`, `/terms`, `/privacy` on the **production** build, no session | all **200**; disclosure on **all five**; contact link on **all five** |
| Phone numbers on any public page | **none** |
| Email addresses on any public page | **exactly one**, the shared public address |
