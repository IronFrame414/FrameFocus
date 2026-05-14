---
name: framefocus-contacts-subs-split
description: Use when designing schema involving people/companies external to FrameFocus (leads, clients, subs, vendors), when modifying the `contacts` or `subcontractors` tables, or when deciding which table a new entity belongs to.
---

# FrameFocus contacts vs subcontractors

## The split

Two separate tables — `contacts` and `subcontractors` — not one polymorphic table. They model different business relationships with different data shapes.

- **`contacts`** → leads and clients (people who pay you). Types: `lead`, `client`. Tracks: name, company, email/phone, source, status, notes, tags. Addresses live in `contact_addresses`.
- **`subcontractors`** → subs and vendors (people you pay). Types: `subcontractor`, `vendor`. Tracks: company name, contact person, trade type, license, insurance expiry, rating, EIN (for 1099s), default hourly rate, default markup percent, preferred flag.

## Why two tables (not one with a polymorphic type column)

Different data needs: subs need `trade_type`, `license_number`, `insurance_expiry`, `rating`, `EIN`, billing/markup defaults that contacts never need. Contacts need `source`, `status` (sales funnel) that subs never need. A polymorphic table would have ~half the columns null on any given row and confuse both RLS and UX.

Different join points: estimates pull from `subcontractors`, sales flow pulls from `contacts`.

## When adding something new

- A person or company that **pays you** → `contacts`. If shared by leads + clients, add to the table; if specific to one type, gate on the `type` column.
- A person or company that **you pay** → `subcontractors`. Gate on `type` (sub vs vendor) if specific.
- Employees → `profiles`. Platform admins → `platform_admins`. Neither belongs in these tables.