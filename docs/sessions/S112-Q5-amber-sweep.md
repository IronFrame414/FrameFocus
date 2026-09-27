# S112 Q5 — amber text on light surfaces, swept

**Ruled [Josh, S112 Q5]:** `#9d6506` on the hub's "Up next" date, and "sweep for every amber-on-white
text in the app at the same ratio, state the full count and the command, and fix them together."

## The command

Run from `apps/web`:

```bash
grep -rnE "#f59e0b|color\.amber\b|m6m-amber\b|accent-500" app components lib --include=*.tsx --include=*.ts
```

It returns **41 lines** on `feature/s112-audit-rulings` and **37** on this branch (counted with
`git grep -nP` against each ref, root-anchored pathspecs, `.ts`/`.tsx` only; the working tree agrees).
The four fewer are the desktop sites, which moved to `color.amberText` / `#9d6506`; the three `/m`
sites still match because `text-m6m-amber-text` contains `m6m-amber`. Every line was read and classified by what the amber
colours and what it sits on. Contrast was computed (WCAG relative luminance; control black/white = 21.00):

| `#f59e0b` on | ratio | `#9d6506` on | ratio |
| --- | --- | --- | --- |
| white `#ffffff` | **2.15** | white | 4.89 |
| page `#f4f6fa` | **1.98** | page | 4.52 |
| navy `#0f1729` | 8.32 | navy | **3.66** |
| markup canvas `#0d1220` | 8.70 | canvas | **3.82** |

**So the swap is correct on light surfaces and WRONG on dark ones.** The dark uses keep the original amber.

## Fixed — 7 amber TEXT uses on a light surface

| Site | What | Surface |
| --- | --- | --- |
| `app/m/p/[projectId]/page.tsx` (`m-up-next-date`) | "Up next" date | white card |
| `app/m/timeclock/timeclock-screen.tsx` (`m-switch-link`) | "Switch" link text (border stays amber) | page |
| `components/notifications/notification-list.tsx` (`notification-star`) | starred ★ | card |
| `app/dashboard/estimates/[id]/add-items-sheet.tsx` | favourite ★ | white sheet |
| `app/dashboard/subcontractors/subcontractor-detail-sheet.tsx` | rating | white sheet |
| `app/dashboard/subcontractors/subcontractors-list.tsx` | rating stars | white table |
| `app/dashboard/subcontractors/subcontractor-form.tsx` | star picker (selected) | white form |

Plus the R6 tile badge, already on `audit-rulings` (`mobile-ui.tsx`, `text-m6m-amber-text`).

## Deliberately NOT changed

| Site | Why |
| --- | --- |
| `app/m/p/[projectId]/page.tsx` punch stat | on the NAVY header: 8.32 now, 3.66 with the text shade |
| `app/dashboard/estimates/[id]/estimate-builder.tsx` grand total | on a navy bar |
| `app/dashboard/estimates/[id]/add-items-sheet.tsx` sell total | on a navy bar |
| `app/m/.../markup/markup-canvas.tsx` Save | on the dark markup canvas (8.70) |
| the remaining lines | fills, borders, dots, rings, avatar tints, timeline bars, comments — not text |

**Not in scope, flagged:** the amber BORDER on the Switch link and the log hazard toggle are
non-text UI boundaries, where WCAG 1.4.11 asks 3:1; amber on white is 2.15. That is a separate call.

## Guard

`e2e/m-hubs.spec.ts` A-11i now asserts the "Up next" date is `rgb(157, 101, 6)`.
