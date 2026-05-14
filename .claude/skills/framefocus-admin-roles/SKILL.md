---
name: framefocus-admin-roles
description: Use when adding features that require permission decisions, writing RLS policies that check `get_my_role()`, or deciding whether an action is Owner-only or Admin-allowed.
---

# FrameFocus admin role rules

## The principle

**"Admin is Owner minus money minus Admin promotion."** For any action not explicitly Owner-only, Admin has the same access as Owner. When in doubt: Owner + Admin can do it.

## Owner-only actions (Admin NOT allowed)

1. Billing/subscription management (Admin cannot see the Billing page).
2. Promoting users to Admin (only Owner can create more Admins).
3. Transferring ownership.
4. Connecting/disconnecting QuickBooks.
5. Releasing final sub payments — the click that records payment and triggers QB sync. Admin can review/adjust/approve up to that point.
6. Approving client-facing AI weekly summaries.
7. Approving marketing content for publishing.
8. Deleting the company account.

## Default rule for new permission decisions

- Money out, billing, QuickBooks, or client-facing AI content → **Owner-only**.
- Everything else → **Owner + Admin**.
- PM/Foreman/Crew/Client are case-by-case per their role's scope.

Platform Admins (FrameFocus internal team) live in `platform_admins` with no `company_id` — separate from the company role hierarchy.
