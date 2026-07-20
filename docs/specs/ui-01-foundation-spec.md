# SPEC — UI Refresh 01: Foundation (Design Tokens + App Shell)

**Repo home when committed:** `docs/specs/ui-01-foundation-spec.md`
**Design source:** approved direction **1a "Refined Navy."** Do NOT build 1b or 1c.
**This is task 1 of 6** (Foundation → Dashboard → Projects list → Project detail → Budget → Change Orders). Build only the Foundation here.
**Amended 2026-07-19 (audit):** wordmark → RafterWorks; nav → 10 items incl. Schedule; branch gate added; branch-exists claim corrected.

---

## 0 · Task (single)
Establish the visual foundation the other five screens depend on:
1. Load the two font families (Barlow, IBM Plex Mono).
2. Register the design tokens (color, type, spacing) in the app's existing token system.
3. Rebuild the left **sidebar / app shell** in the 1a "Refined Navy" style.
4. Apply the page background + content-area shell.

Nothing else. No dashboard content, no screen bodies.

---

## 1 · Branch & safety (CC Phase 0)
- **Merge gate:** do not start this build until `feat/signed-artifacts` has merged to `main`. Verify with `git log origin/main --oneline -5` that the signed-artifacts commits are present; if not, STOP.
- Work on branch **`feat/ui-refresh`**, created fresh off `main` at session start (verified 2026-07-19: this branch does **not** exist yet). Verify with `git branch --show-current` before any edit; if not on it, STOP and report.
- **Do not touch** `feat/signed-artifacts`.
- **CC never commits.** Josh commits manually, path-scoped. Leave the working tree for him to review.
- Enter **Plan Mode first** (Shift+Tab). Read the §S files, propose a plan, wait for approval before writing code.

---

## 2 · §S — Structure to resolve LIVE before writing (do not assume; read the repo)
> These are unknowns from the planning side. Resolve each by reading actual source in Plan Mode. If a §S item can't be resolved or conflicts with this spec, STOP and surface it — do not guess, do not silently reorder or invent.

- **§S1 — Token home.** How does the app currently define design tokens? (Tailwind theme? CSS custom properties? a theme file?) Put the tokens in §4 wherever the app *already* keeps them. Do not introduce a second parallel system.
- **§S2 — Font loading.** How are fonts loaded today (`next/font`, a global CSS `@import`, a `<link>`)? Add Barlow + IBM Plex Mono via that same mechanism. **Do NOT load Barlow Semi Condensed** (1c only).
- **§S3 — Existing shell.** Locate the current sidebar / layout component. This task **replaces its visual treatment in place** — it must keep the existing nav routing/targets and the existing auth/user/company data wiring.
- **§S4 — Icon library.** Which icon set does the app use (Lucide/Feather/other)? Map the nav icons (§5) to that set. Do not hand-inline raw SVG if the app has an icon component.
- **§S5 — Nav inventory conflict check.** Compare the app's *current* top-level nav items to the **10** in §5. **Schedule is expected to be missing from the app — it is an intended addition** (see §5a). Any *other* diff (app has items not listed here, or is missing others listed here): **STOP and surface to Josh** — do not drop or add on your own.
- **§S6 — User/company data.** The sidebar header (company name) and footer (avatar initials, name, role) must bind to the real current user/company, not hardcoded. Find the existing source for these.

---

## 3 · Non-goals
- No screen bodies (dashboard, projects, budget, etc.) — later specs.
- No new routes or nav destinations **except** the Schedule nav item (§5a) — decision reversed 2026-07-19: schedule is BOTH a Dashboard card (ui-02) AND its own left-nav item.
- No restyle of the Schedule page body — the nav item routes to the existing schedule view as-is; its 1a restyle is later work.
- No mobile layout (desktop-first; mobile is a separate later effort).

---

## 4 · Design tokens (authoritative)
Register these exactly. Match the token to its role; reuse tokens instead of re-pasting hex.

### Color
| Role | Hex |
|---|---|
| Shell navy (sidebar bg, headings, primary text, dark cards) | `#14213d` |
| Nav text (inactive) | `#cdd6e8` |
| Sidebar secondary text | `#8fa0c4` |
| Primary (buttons, active nav, active tab, progress fill, links) | `#2f49d1` |
| Primary hover | `#1f33a8` |
| Blue tint (ghost-primary bg / info chip) | `#eef1fb` · `#e7ebf9` |
| Amber accent (logo "Focus", avatar, event accents) | `#f59e0b` |
| Page background | `#f4f6f9` |
| Card background | `#ffffff` |
| Card border | `#e6e9ef` |
| Table header / total-row bg | `#f7f9fc` |
| Row divider | `#f1f3f7` |
| Text body | `#374151` · `#4b5563` |
| Text muted | `#6b7280` · `#8a919c` |
| Text faint (placeholder/disabled/em-dash) | `#9aa1ac` · `#c3c9d4` |
| Success (text / bg / text-on-bg) | `#16a34a` · `#e4f0e6` · `#3d7a4b` |
| Warning (text / bg) | `#d97706` · `#b45309` · `#fdece0` |
| Danger | `#dc2626` · `#c0362c` |
| Neutral badge (bg / text) | `#eef1f6` · `#6b7280` |

### Typography
- **Barlow** (400/500/600/700/800) — all UI text, headings, labels.
- **IBM Plex Mono** (400/500/600) — **all numbers**: money, %, dates, project/CO/invoice IDs, and uppercase micro-labels (stat captions, table headers). This mono-for-numbers rule is the signature of the refresh.

| Role | Font | Size / Weight |
|---|---|---|
| Page H2 | Barlow | 25–28px / 800, letter-spacing −0.01em |
| Card title | Barlow | 15px / 700 |
| Section micro-label | IBM Plex Mono | 11–13px / 600–700, uppercase, letter-spacing .04em |
| Body | Barlow | 13–14px / 400–500 |
| Big stat number | IBM Plex Mono | 24–30px / 600 |
| Table cell number | IBM Plex Mono | 13–14px / 500–600 |
| Nav label | Barlow | 14px / 600 active, 500 inactive |
| Badge | Barlow | 12px / 600 |

### Spacing / geometry
- Sidebar width **236px**. Content padding `22–26px 30px`.
- Card radius **12–13px**, padding `15–20px`, border `1px solid #e6e9ef`.
- **In-app cards use the border, NOT a heavy shadow.** (The prototype's `0 12px 34px` shadow is frame-only — do not reproduce it.)
- Badge: `padding 4px 10px; radius 20px`.
- Buttons: `padding 9px 16px; radius 9px`. Primary = `#2f49d1` bg / white text. Secondary = white / `1px #e0e4ea` border / `#374151` text.
- Hover: primary → `#1f33a8`; secondary → `#f7f9fc` bg. Transitions 120–160ms ease, nothing flashy.

---

## 5 · App shell — sidebar
Rebuild as a normal component in the app's framework (reference only: `FFNav.dc.html`). Fixed **236px**, navy `#14213d`, full height, `padding 22px 0`, flex column.

**Header block** (`padding 0 22px 22px`):
- Wordmark: **"Rafter" white + "Works" amber `#f59e0b`**, Barlow 800 / 20px / letter-spacing −.01em. (Platform renamed; the `FFNav.dc.html` reference still shows the old FrameFocus mark — spec wins. Repo/package names stay FrameFocus; this change is display-only.)
- Company name below: Barlow 500 / 12px / `#8fa0c4`, margin-top 2px. **Bind to real company (§S6)** — this is the tenant (e.g. Bishop Contracting), not the platform name.

**Nav** (`padding 0 14px`, `gap 2px`, flex column). **Ten items**, **this order**:
`Dashboard · Projects · Schedule · Contacts · Subs & Vendors · Estimates · Cost Catalog · Settings · Team · Billing`

**§5a — Schedule nav item (added 2026-07-19).** Routes to the existing schedule view — the one the current dashboard renders (resolve its component/route live in §S3; if no standalone `/schedule` route exists, create the route and mount the existing component unmodified). Icon: calendar. Body restyle is out of scope.
- Item: flex, align center, `gap 11px`, `padding 10px 12px`, radius 9px.
- **Active** (matches current route): bg `#2f49d1`, text white, weight 600.
- **Inactive**: text `#cdd6e8`, weight 500.
- Icons 17px, stroke 1.9, `currentColor`, mapped to the app's icon set (§S4): grid=Dashboard, rows=Projects, calendar=Schedule, user=Contacts, two-people=Subs & Vendors, document=Estimates, list-dots=Cost Catalog, gear=Settings, people=Team, card=Billing.
- Active state is driven by the **current route**, not a hardcoded index.

**Footer** (`margin auto 14px 0`, `padding-top 16px`, `border-top 1px solid rgba(255,255,255,.08)`, flex align center `gap 11px`):
- Avatar: 36px, radius 9px, bg `#f59e0b`, text `#14213d`, Barlow 700 / 14px — **current user's initials (§S6)**.
- Name: white, weight 600, 13px — **current user (§S6)**.
- Role: `#8fa0c4`, 12px — **current user's role (§S6)**.

---

## 6 · Page / content shell
- App content background: `#f4f6f9`.
- Main content region padding: `22–26px 30px` (screens will specify their own top value later; default `26px 30px`).
- The shell is the sidebar (fixed 236px) + a flexible main region beside it.

---

## 7 · Build order (within this task)
1. Fonts (§S2) → 2. Tokens (§S1, §4) → 3. Sidebar (§5) → 4. Page/content shell (§6).
Do them in this order so the sidebar can already reference tokens and fonts.

---

## 8 · Codespaces gotchas (carry every session)
- **No heredocs / no clipboard for JSX.** CC writes files directly; prefer full-file rewrites over fragile diffs.
- CC does **not** commit. Leave changes staged-free for Josh's path-scoped review.
- If `.env` or fonts touch a build step, verify env state at session start (Codespaces can inject stale secrets).

---

## 9 · Acceptance checks
- Computed `font-family` on a **nav label** resolves to Barlow; on a **stat/number element** resolves to IBM Plex Mono. Barlow Semi Condensed is **not** loaded.
- Tokens live in the app's existing token system (§S1); no ad-hoc duplicate hex where a token exists.
- Sidebar renders: 236px navy, **RafterWorks wordmark with amber "Works"**, **10 items in the specified order**, the current route's item highlighted `#2f49d1`/white, footer showing the **real** signed-in user's initials/name/role and real company name.
- Schedule nav item routes to the existing schedule view (§5a); the view itself is unmodified.
- Page background is `#f4f6f9`; content region sits beside the fixed sidebar with correct padding.
- `tsc` / typecheck passes, app builds, no new console errors, existing nav routing still works.

---

## 10 · Follow-ups (out of scope here, noted so they aren't lost)
- Screens 2–6 each get their own spec.
- Any §S5 nav discrepancy Josh resolves becomes an amendment to this spec before the next screen is built.
- **Contacts merge pending (ui-07 Item 3):** "Contacts" and "Subs & Vendors" are slated to unify into one Contacts surface after a planning session resolves the data-model fork. Build both nav items now as specced; expect a later amendment dropping the nav to 9 items. Do not invest in either page body.
- **Task-creation panel (ui-07 Item 4):** the Schedule page body (deferred per §5a) will include a modal/slide-in task-entry panel; it is downstream of the Item 3 contact-model decision and the 6A UI build.
