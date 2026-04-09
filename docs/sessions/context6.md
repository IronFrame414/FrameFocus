# Context — FrameFocus Build Session (April 5, 2026)

## What happened this session

This was the fifth coding session. Company settings page was built, Module 2 (Contacts & CRM) was completed end to end, strategic decisions were made for QuickBooks integration and change orders, and a full architecture audit was performed.

### Company Settings Page completed:

- Migration 009: Added company detail columns (address_line1, address_line2, city, state, zip, phone, website, trade_type, license_number, logo_url) and created `company-logos` public storage bucket with RLS policies
- `apps/web/lib/services/company.ts` — Server-side getCompany() function
- `apps/web/lib/services/company-client.ts` — Client-side updateCompany() and uploadCompanyLogo() functions
- `apps/web/app/dashboard/settings/page.tsx` — Server component, owner/admin only access
- `apps/web/app/dashboard/settings/settings-form.tsx` — Client component with logo upload, trade type dropdown, license number, address, phone, website
- Settings link in sidebar gated to owner/admin roles

### Module 2 completed — Contacts & CRM:

**Architecture decision: Two-table design**
- `contacts` table for leads and clients (your customers)
- `subcontractors` table for subs and vendors (your supply chain)
- Separated because they represent different business relationships with different data needs

**Database changes:**
- Migration 010: Created `contacts` table (contact_type: lead/client, status, name, company, email, phone, mobile, address, source, notes, tags[]) and `subcontractors` table (sub_type: subcontractor/vendor, status, company_name, contact person, email, phone, mobile, address, trade_type, license_number, insurance_expiry, rating 1-5, rating_notes, notes, tags[]). RLS policies: any company member can read, owner/admin/PM can write.
- Migration 011: Added `ein` (Tax ID for 1099s), `default_hourly_rate`, and `preferred` boolean to subcontractors
- Migration 012: Added `default_markup_percent` to subcontractors (auto-applied when vendor is used in estimates)

**Service files created:**
- `contacts.ts` / `contacts-client.ts` — Server reads + client writes for leads/clients
- `subcontractors.ts` / `subcontractors-client.ts` — Server reads + client writes for subs/vendors

**Web app pages created:**
- `apps/web/app/dashboard/contacts/page.tsx` — Contacts list (server component)
- `apps/web/app/dashboard/contacts/contacts-list.tsx` — Filterable/searchable contact table with type badges, status badges, edit/delete actions
- `apps/web/app/dashboard/contacts/contact-form.tsx` — Shared form for create/edit with type, status, name, company, source, email, phone, mobile, address, notes
- `apps/web/app/dashboard/contacts/new/page.tsx` — New contact page
- `apps/web/app/dashboard/contacts/[id]/edit/page.tsx` — Edit contact page
- `apps/web/app/dashboard/subcontractors/page.tsx` — Subs & vendors list (server component)
- `apps/web/app/dashboard/subcontractors/subcontractors-list.tsx` — Filterable/searchable table with type badges, star ratings, trade type column
- `apps/web/app/dashboard/subcontractors/subcontractor-form.tsx` — Shared form with type, status, company name, contact person, trade type, license, insurance expiry, rating (clickable stars), rating notes, EIN, default hourly rate, standard markup %, preferred checkbox, contact info, address, notes
- `apps/web/app/dashboard/subcontractors/new/page.tsx` — New sub/vendor page
- `apps/web/app/dashboard/subcontractors/[id]/edit/page.tsx` — Edit sub/vendor page

**Sidebar updated:**
- Nav order: Dashboard → Contacts → Subs & Vendors → Settings (owner/admin) → Team → Billing (owner)

### Strategic decisions made this session:

**1. QuickBooks Integration Strategy**
- FrameFocus runs daily operations. QuickBooks runs the books. Data syncs so contractors never double-enter.
- Connection via OAuth 2.0 in Company Settings
- Sync points: Clients → QB Customers, Subs/Vendors (with EIN) → QB Vendors, Approved timesheets → QB Time/Payroll, Client invoices → QB Invoices, Sub payments → QB Bills, Change orders → QB adjustments
- QB handles 1099 filings using synced vendor records with EINs and payment totals
- Timeclock flow: crew clocks in/out on mobile → foreman/PM approves → approved hours sync to QB for payroll
- Build during Modules 6 and 7

**2. Change Order Workflow (Detailed)**
- Module 5 (Project Management): CO created by PM/Owner, references original estimate, shows cost/schedule impact, status lifecycle: draft → pending_approval → approved → rejected/executed
- Module 7 (Job Finances): Approved CO auto-updates project budget, modifies sub pay applications, syncs to QB
- Module 8 (Client Portal): Client-facing COs route to client for e-signature
- Data model: change_orders, change_order_line_items, change_order_approvals tables + document attachments

**3. Vendor Markup Auto-Flow**
- `default_markup_percent` on subcontractors table
- Module 4 (Estimating): When a vendor is selected for a material line item, auto-populate markup from their default_markup_percent. Can be overridden per line item.
- Module 7 (Finances): Track actual vendor cost vs. marked-up client price for profit analysis
- Module 9 (Reporting): Vendor cost vs. markup analysis feeds profitability dashboards

### Architecture Audit (performed end of session):

**Critical fix identified — `import type` needed:**
- Client components import TypeScript interfaces from server service files (which import `next/headers`)
- Works now because TypeScript erases type-only imports at compile time, but could break in future Next.js versions
- Fix: Change `import { Contact }` to `import type { Contact }` in contacts-list.tsx, contact-form.tsx, subcontractors-list.tsx, subcontractor-form.tsx
- **Status: Fix command provided, needs to be run and committed**

**Duplication to fix in Module 3:**
- US_STATES array copy-pasted in 3 form files → move to packages/shared/constants/form-options.ts
- TRADE_TYPES array duplicated in 2 form files → same shared location
- CompanyData interface duplicated in company.ts and company-client.ts → move to packages/shared/types/

**Missing functionality tracked for later:**
- No tags UI on contacts/subcontractors forms (columns exist, no input component) → Pre-beta
- No lead-to-client conversion tracking (need `converted_at` column) → Module 4
- No pagination on list pages → Module 4
- No loading.tsx or error.tsx boundary files → Pre-beta
- No CSV import for bulk data → Pre-beta
- No active page highlighting in sidebar → Pre-beta
- No insurance_carrier or insurance_policy_number on subcontractors → Module 5/6
- No phone format enforcement → Low priority

**All tracked in CLAUDE.md Known Technical Debt section.**

### Important technical lessons from this session:

1. **Shell heredocs (`cat << 'EOF'`) eat `<a` tags from JSX.** The `<a` looks like a shell redirect. This caused multiple failed Vercel builds. Fix: use Node.js `fs.writeFileSync()` or create files directly in the Codespace editor. Documented in CLAUDE.md.

2. **Server/client service split is mandatory.** Importing `supabase-server.ts` (which uses `next/headers`) in a client component causes build failure. Pattern: `{entity}.ts` for server reads, `{entity}-client.ts` for client writes. Documented in CLAUDE.md.

3. **Use `import type` for cross-boundary type imports.** When a client component needs a TypeScript interface defined in a server service file, use `import type { ... }` to ensure the server-side import is fully erased at compile time.

### CLAUDE.md fully updated this session with:
- Module statuses (1 & 2 complete)
- QuickBooks Integration Strategy section
- Change Order Workflow section
- Database Tables reference
- Service Layer Pattern documentation
- Codespaces Gotchas
- Known Technical Debt tracking table
- Updated Module 4, 6, 7, 9 descriptions with markup flow, QB sync, and data model references
- Environment variables list
- Instruction preference: avoid shell heredocs for JSX

### Known accounts:

- **Supabase:** josh@worthprop.com, FrameFocus project at jwkcknyuyvcwcdeskrmz.supabase.co
- **GitHub:** IronFrame414, repo: FrameFocus
- **Vercel:** Connected via GitHub, project: FrameFocus, URL: https://frame-focus-eight.vercel.app
- **Stripe:** FrameFocus sandbox (test mode), webhook + customer portal configured
- **Test users:** Josh Bishop (jsbishop14@gmail.com) Owner of Bishop Contracting

### Migrations run (all saved to packages/supabase/migrations/):

1. 001 — companies, profiles, platform_admins tables
2. 002 — handle_new_user() trigger (original)
3. 003 — admin role + invitations table
4. 004 — handle_new_user() updated for invite flow
5. 005 — RLS policies updated for admin role
6. 006 — handle_new_user() fixed to use user_id column
7. 007 — subscriptions table + handle_new_user() updated for auto trial creation
8. 008 — audit fixes (trial_emails, slug generation, RLS, indexes)
9. 009 — company settings columns + logo storage bucket
10. 010 — contacts and subcontractors tables with RLS
11. 011 — subcontractor extras (ein, default_hourly_rate, preferred)
12. 012 — vendor default_markup_percent

### What's next (first tasks for next session):

1. **Run audit fix #1** — Fix `import type` in 4 client component files (command provided in this session, needs to be run)
2. **Consolidate duplicated constants** — Move US_STATES, TRADE_TYPES, LEAD_SOURCES to packages/shared/constants/form-options.ts
3. **Module 3: Document & File Management** — Supabase Storage buckets for project files, file tagging, folder organization, upload from web
4. **Consider installing Claude Code** in Codespaces for faster multi-file coding tasks

### How to start the next session:

Paste this context.md and CLAUDE.md and say: "Starting a new FrameFocus session. Running the audit fixes first, then building Module 3: Document & File Management."
