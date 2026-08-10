# FFNav Reindex — Spec

> **Status:** RULED [S130, Josh] and BUILT [S130].
> **Supersedes:** every "deferred to the FFNav reindex" note in the documents listed in §6.
> **Scope:** the DESKTOP sidebar only. Mobile is untouched — see §5.

---

## §0 — Why this document exists

The reindex was deferred by **seven documents across six sessions and never specified**. The
cost of that was not the delay; it was that three incompatible item counts entered the record and
each looked authoritative:

| Source | Count | Was it wrong? |
| --- | --- | --- |
| `ui-01-foundation-spec.md:107` | **ten** | No — true when written. |
| `docs/handoffs/module-6-field-operations/README.md:50` | **eleven** | No — the refreshed prototype. |
| `dashboard-shell.tsx` lock comment | **"12-item locked S86"** | No — true at S86 round-2. |
| `7A-spec.md:650` session brief | **"10-item"** | Stale by then, but it was quoting ui-01. |

**None of them was a mistake. They are successive snapshots of a list that grew four times and
had no owner.** ui-01 specced ten; the M6 handoff refreshed to eleven; S86 round-2 locked twelve;
7A appended Expenses (13); ND-12 appended Notifications (14). Each append was correctly flagged
as owing its final position to "the reindex session" — which is this one.

### §0a — The contradiction at `6B-1-spec.md:119`, and which was true

`6B-1-spec.md:119` says the reindex was **RESOLVED [S86/S87]**. `6a-ui-build-report.md:169`
records the **"FFNav 11-item reindex — out of scope per instruction"**, with interim links
code-commented.

**Both are true, and they are about different things.** Recorded rather than overwritten:

- **6a-ui-build-report is right about the 11-item version.** At S86-A it was not built, and it
  never was — the 11-item list was superseded before anyone implemented it.
- **6B-1-spec is right about the 12-item ORDER.** S86 round-2 locked it, and it shipped with the
  6B UI at S87. That is what "lands with this build" meant.

What neither covers, and what left the item genuinely open for six more sessions, is that
**"resolved" was about the ORDER, never about GROUPING or about the two items appended
afterwards.** A reader seeing "RESOLVED" reasonably stopped looking.

---

## §1 — The ruling [S130, Josh]

**Three sections. Two of them labelled. 14 items.**

### Top layer — ungrouped, no header (8)

`Dashboard · Projects · Schedule · Field Ops · Timeclock · Expenses · Estimates · Notifications`

### Reference — labelled header (4)

`Contacts · Subs & Vendors · Team · Cost Catalog`

### Admin — labelled header (2)

`Settings · Billing`

**Headers render as LABELS, not bare dividers. Always open — not collapsible.**

---

## §2 — Where the order came from

Recorded so a later reader can **meet** the reasoning rather than rediscover it:

- **Dashboard, Projects, Schedule lead** because they are what Josh opens every morning on
  desktop. He named that order explicitly. **It is not alphabetical and not inherited from
  ui-01.**
- **The top layer is the daily set** — the seven he uses on a normal working day, plus
  Notifications.
- **Reference and Admin are the ones he does not touch in a month.** The split is his own, from
  the same answer.
- **Contacts and Subs & Vendors are one thing in his head**, and the system treats them
  differently — hence adjacent, not merged.

### §2a — Notifications is 8th [RULED S130]

Left open at interview deliberately, proposed by CC, ruled by Josh.

**It is checked by BADGE, not navigated to.** The badge is equally visible wherever the item
sits, so proximity to the top buys nothing — while positions 1–3 are load-bearing, being the
three Josh named as his morning order. Inserting a bell above Schedule would displace a ruled
position to buy visibility the badge already provides. Eighth also puts it against the Reference
header, where it reads as the end of the daily set.

### §2b — Team is in Reference [RULED S130]

**The interview's structure accounted for 13 items; the code has 14.** `Team` was in none of the
three groups — an omission found by reading `NAV_ITEMS` in full rather than trusting the count.

Ruled into **Reference**, after Subs & Vendors: it is people-shaped and belongs beside the two
items Josh called "one thing in my head".

**Admin was rejected for it, and the reason is the ruling's own worked example.** `Team` is
**ungated** — every role sees it. Putting it in Admin would give a crew member an Admin header
with Team under it, contradicting §1's "a crew member's Admin is empty".

> ⚠️ **CONSEQUENCE, stated rather than buried.** The interview's example — *"A crew member's
> Reference is Contacts and Subs & Vendors"* — becomes **Contacts, Subs & Vendors and Team**.
> That is a change to the ruling's illustration, not to its rule, and it follows from Team being
> ungated. If Team should not be visible to crew, that is a **gate** change and this work was
> told not to make one.

---

## §3 — Role-gated lists

**Same order, items removed. Never a re-order per role.** Foreman order is the same as crew —
asked directly at interview, answered no.

**An empty section renders NO header.** A labelled group with nothing under it is worse than no
group. Nothing else is needed for the empty case, because headers are labels rather than
dividers — omitting one leaves no artefact behind.

Gates are **preserved exactly** and were not touched by this work:

| Item | Gate |
| --- | --- |
| Estimates, Cost Catalog | `owner`, `admin`, `project_manager` |
| Settings | `owner`, `admin` |
| Billing | `owner` |
| everything else | ungated |

Resulting lists:

| Role | Top | Reference | Admin | Total |
| --- | --- | --- | --- | --- |
| Owner | 8 | 4 | 2 | **14** |
| Admin | 8 | 4 | 1 (Settings) | **13** |
| Project Manager | 8 | 4 | — *(no header)* | **12** |
| Foreman | 7 *(no Estimates)* | 3 *(no Cost Catalog)* | — *(no header)* | **10** |
| Crew | 7 | 3 | — *(no header)* | **10** |

---

## §4 — Presentation

### §4a — This is the first labelled nav group in the app

No navigation surface in this codebase renders grouped items. `ToolGroup` (markup editor) and the
budget/invoice group labels are **content**, not navigation. **There is no precedent to follow,
so this spec sets one.**

### §4b — Header style [RULED S130]

**ui-01's existing `microLabelStyle`, recoloured for navy.** A token reused rather than one
invented:

- IBM Plex Mono, **11px**, weight **600**, UPPERCASE, letter-spacing **.04em**
- Colour **`#8fa0c4`** — the sidebar's existing secondary text (`color.navySecondary`), already
  used for the company name under the wordmark
- Top margin ~14px, aligned to the item label's text inset
- **No divider rule.** Josh ruled labels, not bare dividers, and adding a hairline alongside the
  label edges back toward the thing that was rejected.

### §4c — The unread badge is unchanged

Notifications keeps ND-12's badge exactly: **nothing at 0**, and **capped at `9+`** — verified
identical to parent §10.3's mobile rule, so the two surfaces do not diverge.

### §4d — Vertical budget — MEASURED, not computed

At 1280px wide, Owner's 14-item list:

| | |
| --- | --- |
| Item height | **40px** (`padding 10px 12px`, ui-01 §5) |
| Gap | 2px |
| Nav content | **586px** |
| Non-nav chrome (wordmark block + footer) | **250.5px** |
| **Sidebar total, before this work** | **836.5px** |

> ⚠️ **The sidebar ALREADY overflowed an 800px viewport before this change.** At 720px and 800px
> the aside is taller than the window and the page scrolls; the nav is not internally scrollable.
>
> Two header rows (~36px each) move the no-scroll threshold from **~837px to ~909px**. **The
> headers do not introduce overflow — they deepen one that existed.** The practical cost is that
> a 1440×900 MacBook now scrolls where it previously did not.

**RULED [S130, Josh]: accept it, change nothing.** Every fix trades away something already
ruled — an internal scrollbar is a visual change ui-01 did not spec, and tightening item padding
contradicts ui-01 §5's `padding 10px 12px`. Recorded here so the next reader does not rediscover
the measurement.

---

## §5 — What this ruling CLOSES

### §5a — Chat gets no nav item, on either surface

Desktop chat is **ND-33's global panel** — a persistent icon bottom-right with a project switcher
inside, shipped in chat slice 3. The in-project Chat tab is the **audit view** (§7.1b), not a
placement problem.

**The "Chat tab appended last" item logged at `S126-progress.md:683` is CLOSED by this ruling,
not deferred again.**

### §5b — Mobile is untouched

The bottom bar was resolved in chat slice 5: the daily log came off, chat took the slot, and
§14's nine M6M edits landed in the same commit.

⚠️ **Do not reopen ND-13/ND-14's geometry.** Six slots gives 61.6px against "Notifications"
needing ~70px, and five side items plus a centre camera has no true centre.

---

## §6 — Documents amended by this ruling

| Document | Was | Now |
| --- | --- | --- |
| `dashboard-shell.tsx` lock comment | "12-item order locked S86", position of Expenses and Notifications owed | Rewritten; S86 and 7A history quoted, not deleted |
| `notifications-architecture.md` ND-12, §7.3, §10.1, §14.2 | placement owed to the reindex | **Notifications is item 8, top layer** |
| `module8-architecture.md:89` | nav placement deferred | Reindex has happened; Inventory's own placement is still open and is M8's |
| `7A-spec.md:538-540`, `:650-651` | "item 13 of a locked 12", count dispute flagged | Resolved: **14 items in three sections** |
| `6B-1-spec.md:119` | "RESOLVED [S86/S87]" | Annotated: true of the ORDER, never of grouping — see §0a |
| `6a-ui-build-report.md:169` | 11-item reindex not built | Annotated: correct, and the 11-item version was never built by anyone |
| `ui-01-foundation-spec.md:107` | "Ten items, this order" | Superseded, quoted not rewritten |

---

## §7 — Acceptance criteria

- **A-N1** The sidebar renders three sections in the ruled order, with headers on Reference and
  Admin and none on the top layer. `[Playwright]`
- **A-N2** A crew member sees **no Admin header** — asserting the absence, because a build that
  renders an empty labelled group passes every ordering assertion. `[Playwright]`
- **A-N3** Every role's list is the same ORDER with items removed, never re-ordered. `[unit]`
- **A-N4** Notifications is the **8th** item and the last of the top layer. `[unit]`
- **A-N5** The badge shows nothing at 0 and caps at `9+`. `[unit]` _(ND-12, unchanged.)_
- **A-N6** Gates are unchanged from before this work — Estimates/Cost Catalog
  `owner/admin/project_manager`, Settings `owner/admin`, Billing `owner`. `[unit]`
  _(Asserting that this work changed no gate is the point; it is easy to "tidy" one while moving
  items between groups.)_
- **A-N7** Active state is derived from the **pathname**, not an ordinal. `[unit]` _(See §8.)_

---

## §8 — The index sweep, and why it was moot

The M6 handoff warns: *"this reindexes Settings to 9 — update any earlier `FFNav active="6"`
references."* That warning was **checked before anything was reordered**, and it does not apply:

**Active is href-based.** `isActive(href)` matches the pathname exactly for `/dashboard` and by
prefix elsewhere. **There is no index-based `active` anywhere in application code.**

The only `FFNav active="6"` references live in
`docs/handoffs/module-6-field-operations/README.md`, describing the `.dc.html` design prototype —
which **TECH_DEBT #130** already records as "not built, not imported, ships to nobody".

**Reordering therefore cannot break an ordinal reference, because none exists.** Recorded so the
next person to move a nav item does not repeat the sweep.
