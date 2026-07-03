# 5D — Change Orders — Spec

> **Module 5 (Project Management) · Sub-module 5D · Session 55**
> **Status:** Spec (design-ready, build-deferred). Not yet built.
> **Interview:** Completed Session 55. Locked decisions below are the acceptance basis.
> **Hard build dependency:** `company_members` foundation (not built) — every CO assignment/authorship references a `member_id`; RLS uses `get_my_member_id()`.

---

## 1. Scope

5D lets a project record **change orders (COs)** — additions to, or removals from, the contracted scope after a project has been created from a converted estimate.

**In scope (launch):**
- Author a CO with the same structure as an estimate (line items → typed rows).
- Add scope and credit (remove) previously-contracted scope on the same CO.
- Send a CO (internal acceptance) and capture the client's binding signature.
- Surface each signed CO's net delta in the project budget view (display-only).
- Per-project CO numbering.

**Out of scope (explicitly):**
- **Mutating `projects.contract_value`.** COs are display-only in 5D; the write-through into the headline contract value and draw schedule is **Module 7** (tracked: TECH_DEBT **#80**).
- **Client delivery mechanism** (how the client reaches the signature surface). Signature *capture* is in-house and locked; the *delivery* path (email / magic-link / portal) is a client-facing surface gated by the **Pre-Module 9 Decision Gate**. See §11 flag F-3.
- Expense tracking, subcontractor draw schedules — Module 7.

---

## 2. Locked decisions (Session 55 interview)

| # | Decision |
|---|----------|
| D-1 | **A CO is written identically to an estimate.** It owns its own line items, each with typed rows (`labor` / `material` / `subcontractor` / `other`), the same cost roll-up, and the same §4.4a tax-then-markup. **This supersedes §5.7b** (the before/after-quantity + unit_price design pointing at an original `estimate_line_items` row). |
| D-2 | **Credits are negative numbers.** Removed or reduced scope is expressed as a normal typed row with a **negative** value (e.g. a `material` row at unit_cost −$8,000). The **row description** carries the "this is a credit" meaning. **No `is_credit` flag.** |
| D-3 | **Credits flow through §4.4a like any other row.** A credit is not a flat price reduction — tax then markup apply to it exactly as to a positive row. E.g. a −$8,000 credit surfaces as **−$10,272** on the client contract at an illustrative 7% tax + 20% markup. |
| D-4 | **Send = internal acceptance; client signature = binding.** There is no separate contractor-side approval step after a CO is written — the act of sending it is the internal (contractor-side) yes. The client then signs (reusing the M4 in-house signature capture), and the CO is binding at that signature. |
| D-5 | **Owner + Admin + PM all create AND send COs.** No Owner-release / final-approval gate between them. (Amends the architecture doc's "Admin creates; Owner holds final authority" — the Owner-final-approval gate is removed; the existing creator list, which already included PM, is unchanged.) See §10 amendment A. |
| D-6 | **Money is display-only in 5D.** The project budget view derives `contract_value + Σ(signed COs) = revised total`; `projects.contract_value` is **not** mutated by CO sign-off. Write-through is Module 7 (TECH_DEBT **#80**). |
| D-7 | **CO numbering:** `CO-####-##` = project number + a per-project sequence from `projects.change_order_sequence` (established 5A §2). |

---

## 3. Data model (build-deferred shape)

A CO mirrors the estimate structure. `[BUILD-VERIFY]` items must be checked against the **shipped** M4 schema at build time (same caution §8 carried — the typed-row revision is live, but exact column names/constraints are confirmed from `database.ts`, not this doc).

```
change_orders
  id                    uuid pk
  project_id            uuid fk -> projects(id)
  co_number             text            -- "CO-0042-01", see §7 / D-7
  title                 text
  status                <lifecycle enum> -- NOT YET LOCKED — see §11 flag F-1
  created_by            uuid fk -> company_members(member_id)   -- authorship
  sent_at               timestamptz     -- set on send (internal acceptance, D-4)
  signed_at             timestamptz     -- set on client signature (binding, D-4)
  signature_source      <ref>           -- reuse M4 in-house capture [BUILD-VERIFY]
  + standard audit cols (created_at, updated_at, updated_by, is_deleted, deleted_at)

change_order_line_items      -- mirrors estimate_line_items
  id                    uuid pk
  change_order_id       uuid fk -> change_orders(id)
  description           text
  presentation          <same 5-value enum as estimate line items> [BUILD-VERIFY]
  sort_order            int
  -- cost = roll-up of its change_order_line_rows (no cost columns on the item itself,
  --        exactly as estimate_line_items had its cost columns dropped)

change_order_line_rows       -- mirrors estimate_line_rows
  id                    uuid pk
  change_order_line_item_id  uuid fk -> change_order_line_items(id)
  row_type              text  -- 'labor' | 'material' | 'subcontractor' | 'other'
  description           text  -- carries "credit" meaning when the row is negative (D-2)
  quantity              numeric   -- may be present per row_type, as estimate_line_rows
  rate / unit_cost      numeric   -- labor: rate; material: unit_cost   (SIGNED — may be negative, D-2)
  amount                numeric   -- sub/other: amount                  (SIGNED — may be negative, D-2)
  total                 numeric   -- marked-up price for the row (§4.4a), signed
```

**Grain note (resolves the §5.7b / §8 mismatch):** quantity and unit-price live on **`change_order_line_rows`**, not on the line item — identical to `estimate_line_rows`. §5.7b placed before/after qty + unit_price on the line item pointing at `estimate_line_items`; that grain is wrong under the typed-row model and is superseded by D-1.

---

## 4. CO numbering

`CO-<project#>-<seq>`, e.g. **CO-0042-01**, **CO-0042-02** …

- `<project#>` = the project's number (which itself reuses the estimate number — 5A §2).
- `<seq>` = a per-project counter from `projects.change_order_sequence` (added in 5A §2), incremented per CO on that project, zero-padded to 2 digits.
- Sequence is **per project**, not global.

---

## 5. Cost & credit math (§4.4a inheritance)

CO rows use the **same** cost roll-up and the **same** §4.4a rule as estimate rows — **tax applies to cost first, then markup applies to cost-plus-tax.** No CO-specific math.

- Positive row: cost → +tax → +markup → row `total` (positive).
- Credit row (D-2/D-3): negative cost → +tax → +markup → row `total` (negative). A −$8,000 cost becomes **−$10,272** at illustrative 7% tax + 20% markup (−8,000 × 1.07 = −8,560 × 1.20 = −10,272).
- **CO net delta** = Σ of all row `total`s (positive and negative).

> Per-`row_type` taxability follows whatever the **M4 estimate** model applies — CO rows inherit it, they do not redefine it. The worked example in §9 assumes uniform 7% tax + 20% markup on every row for illustration; actual taxability per row type is an M4-inherited behavior `[BUILD-VERIFY]`.

---

## 6. Sign-off & lifecycle

Per D-4/D-5:

1. **Author** — Owner, Admin, or PM writes the CO (`created_by` = their `member_id`).
2. **Send** — any of Owner/Admin/PM sends it. Sending **is** the internal contractor-side acceptance; there is no separate approval gate. `sent_at` set.
3. **Client signature** — client signs via the M4 in-house signature capture. `signed_at` set. **The CO is binding at this point.**
4. **Effect** — the signed CO's net delta appears in the project budget view (display-only, D-6). No `contract_value` mutation.

The exact **status enum** backing this lifecycle is **not yet locked** — see §11 flag F-1 for the recommended minimal set.

---

## 7. Money treatment (display-only)

Per D-6:

- Project **budget view** shows: `original contract_value` + `Σ(signed CO net deltas)` = **revised contract total** (display).
- `projects.contract_value` **is not written** by CO sign-off — it continues to hold the original (headline) figure from conversion.
- The write-through of signed-CO deltas into `contract_value` and the draw schedule is **Module 7**, tracked as **TECH_DEBT #80**. Nothing is lost by deferring: the signed COs are the source of record and M7 sums them at build time.

---

## 8. RLS (build-time; company_members-based)

- **Create + send CO:** role in (`owner`, `admin`, `pm`) — D-5. Uses `get_my_member_id()` / role lookup on `company_members`.
- **View COs:** follows project visibility — Owner/Admin see all; PM/Foreman/Crew see COs only on projects they're assigned to (via `project_assignments`), consistent with 5A project RLS.
- **Soft-delete CO:** restricted to Owner/Admin (mirrors 5A soft-delete restriction). `[BUILD-VERIFY]` against 5A's final policy.
- Client-side signing authorization is **not** an app-role RLS concern — it rides the client delivery/signature surface, which is gated (F-3).

---

## 9. Acceptance example (worked trace)

Ties to the **5A acceptance example** for continuity: project 0042 was created from an estimate with final contract **$17,236**, fixed price.

**CO-0042-01 — "Kitchen cabinet upgrade + powder-room vanity"**

Client wants premium cabinets instead of the contracted stock cabinets, plus a powder-room vanity added. Written identically to an estimate (D-1):

| Row | type | entry | cost |
|-----|------|-------|------|
| Premium cabinets | material | unit_cost $9,500 × qty 1 | $9,500.00 |
| Cabinet install | labor | rate $65 × 6 hrs | $390.00 |
| Powder-room vanity | material | unit_cost $600 × qty 1 | $600.00 |
| **CREDIT — remove stock cabinets** | material | unit_cost **−$8,000** × qty 1 | **−$8,000.00** |

Apply §4.4a per row (illustrative 7% tax → 20% markup):

| Row | cost | +tax (×1.07) | +markup (×1.20) = row total |
|-----|------|--------------|------------------------------|
| Premium cabinets | 9,500.00 | 10,165.00 | **12,198.00** |
| Cabinet install | 390.00 | 417.30 | **500.76** |
| Powder-room vanity | 600.00 | 642.00 | **770.40** |
| Credit — stock cabinets | −8,000.00 | −8,560.00 | **−10,272.00** |

**CO-0042-01 net delta** = 12,198.00 + 500.76 + 770.40 − 10,272.00 = **+$3,197.16**

After the client signs (D-4, binding):

- **Budget view (display-only, D-6):** original $17,236.00 + signed CO $3,197.16 = **revised total $20,433.16**.
- **`projects.contract_value` = $17,236.00 — UNCHANGED.** (Write-through deferred to M7 / #80.)

This example exercises: identical-to-estimate structure (D-1), a negative credit row (D-2), credit flowing through §4.4a (D-3, the −$10,272 line), and display-only money (D-6, contract_value not mutated).

---

## 10. Amendments this spec depends on (Session 55)

Both landed in `module5-architecture.md` (annotative — original text marked superseded, not deleted); a superseded-pointer was also annotated into `CLAUDE.md` for amendment A.

- **Amendment A (§5.7c):** CO authority — Owner/Admin/PM all create + send; the Owner-final-approval gate is removed. Superseded the "Admin creates; Owner holds final authority" framing. (D-5.)
- **Amendment B (§5.7b):** CO line grain — a CO is written identically to an estimate (line items → typed rows); the before/after-qty + unit_price design is superseded. (D-1.)

---

## 11. REVIEW-BEFORE-BUILD flags / OPEN items

Live here in the spec; resolve at (or before) build. Items marked **OPEN — decision needed** were **not** pinned by the Session 55 interview and must **not** be treated as locked.

- **F-1 — CO status/lifecycle enum. OPEN — decision needed.** D-4 implies at least three states (pre-send → sent → signed). **Recommended minimal set (not yet confirmed):** `draft` → `sent` → `signed`, plus `voided` for a CO withdrawn before signature. Accept/override before build; do not build the enum from this recommendation without confirmation.
- **F-2 — CO PDF generation. OPEN — confirm reuse.** "Identical to an estimate" (D-1) strongly implies reusing the M4 React-PDF proposal generation for the CO document. **Recommended:** reuse it. Not explicitly confirmed in interview — confirm before build.
- **F-3 — Client delivery mechanism is Decision-Gate-gated.** Signature *capture* is in-house and locked (D-4). **How the client reaches the signature surface** (email / magic-link tokenized page / hosted portal) is a **client-facing surface** and is a hard block under the **Pre-Module 9 Decision Gate**. Do **not** spec or build CO client delivery until that gate resolves.
- **F-4 — Void / revise after send. OPEN — decision needed.** What happens to a sent-but-unsigned CO that needs changing, or a signed CO the parties later reverse, is not covered by the interview. Flag; interview before building any edit/void path beyond the bare `voided` state in F-1.
- **F-5 — Notification behavior. OPEN.** The old doc had "Admin is notified"; the new model (D-5) has Owner/Admin/PM all authoring. Who is notified on author/send/sign is unpinned. Flag.
- **F-6 — `tasks.change_order_id` FK wiring.** 5B stubbed `tasks.change_order_id` bare (no FK). The FK to `change_orders(id)` wires in here at 5D. `[BUILD-VERIFY]` the column exists as stubbed before adding the constraint.
- **F-7 — `[BUILD-VERIFY]` schema confirmations** (all in §3): exact `change_order_line_rows` columns vs. shipped `estimate_line_rows`; the presentation enum reuse; the signature-source reference. Confirm from `database.ts` / migration history, never from this doc.

---

## 12. Dependencies

- **`company_members` (hard block, not built):** every CO `created_by` and all CO RLS reference `member_id` / `get_my_member_id()`. Must exist before any 5D build.
- **5A:** `projects.change_order_sequence` (numbering, D-7) and project RLS (view/soft-delete inheritance, §8).
- **M4 (live):** typed-row model (`estimate_line_items` → `estimate_line_rows`), §4.4a tax-then-markup, React-PDF proposal generation, in-house signature capture — all inherited by COs.
- **Module 7:** owns the `contract_value` write-through (TECH_DEBT #80).
- **Pre-Module 9 Decision Gate:** blocks CO client delivery (F-3).