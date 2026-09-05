# Design mockups — handoff renders. NOT shipped screenshots.

⚠️ **These PNGs are DESIGN MOCKUPS (renders of the handoff prototypes), not captures of the shipped
app.** This directory was named `current-state/` and its README claimed *"Screenshots of the SHIPPED
state… Evidence, not design source."* **That was exactly backwards, and it caused three wrong audits**
— they compared the handoff against these images (design against design), which trivially "conforms,"
and never opened the shipped code.

**Proof they are the design, not the app** (from `docs/sessions/redesign-structure-audit.md` §B):

- `cost-catalog.png` shows the row copy **"used on 14 estimates"** — copy the spec rules OUT and the
  shipped code (`catalog-list.tsx`) was changed to render as **"used N times"**. A screenshot cannot
  show copy the code no longer contains.
- `payments.png` carries a **handoff-only "NEW" ribbon** that never renders in the app.
- `billing.png` shows **design-tool chrome** ("Comment / Edit / 75%").
- Several schedule PNGs show features the spec rules **⛔ WILL NOT BUILD** (crew-load "33/40h",
  "Resumes when permit clears", "By crew").

**How to use them:** as **design reference**, alongside the handoffs in `docs/handoffs/`. They match the
shipped app only where a screen was actually built to the design (estimates, money, settings); on the
un-built screens they show the *intended* state, not what ships.

⚠️ **To judge conformance, compare the shipped CODE under `apps/web/app/` against the handoffs — never
against these images.**
