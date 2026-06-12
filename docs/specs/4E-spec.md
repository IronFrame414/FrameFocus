# SPEC — Sub-module 4E: Proposal Generation & Email Delivery (+ 4F Signature, 4J Reminders)

> **Covers:** 4E (Proposal PDF + email delivery) + 4F (built-in signature capture) + 4J (follow-up reminders + auto-expiration) + Resend email infrastructure + additive schema extensions.
> **Source of truth:** `docs/module4-architecture.md` §4.5, §4.6, §4.8, §4.11, §4.18, with interview deltas captured below.
> **Conventions:** `CLAUDE.md` (standard columns, per-tenant column defaults, standard triggers, RLS naming, trash-bin pattern).
> **Templates:** 4D-spec.md (spec format), 4C migration (schema pattern), `contacts-client.ts` (service-layer pattern).
> **Depends on:** **4D** (estimate builder, status workflow, all estimate/line-item/material data, cover letter, scope of work, terms sections, pricing mode, markAsSent/submitForReview/approveAndSend). 4D branch MUST be merged to main before this build starts.
> **Branch:** dedicated feature branch (suggested `feature/module-4-spec-2`). Do not commit to main.
> **Status:** design locked. No open blockers. Three build-time questions reserved (see "Open build-time questions").

---

## Goal

Four coherent deliverables on one branch:

1. **Resend email infrastructure.** Domain verification (`frames-focus.com`), React Email templates, email-sending service, delivery-tracking webhook, `email_logs` table. Foundation for all email features across the platform.
2. **4E — Proposal Generation & Email Delivery.** Server-side React-PDF branded proposal output. Full-page preview at `/dashboard/estimates/[id]/proposal`. "Send Proposal" flow: customizable email editor → Resend delivery with PDF attachment + signing link → auto-sets `sent_at` and status. Manual "Mark as Sent" (from 4D) remains for hand-delivery scenarios.
3. **4F — Built-in Signature Capture.** Public signing page at `/sign/[token]` (no authentication required). Client reviews HTML-rendered proposal, then accepts (draw or type signature) or declines (with reason code). On accept: `pdf-lib` composites signature onto PDF, stores signed copy in Module 3, updates estimate status. Full ESIGN Act audit trail.
4. **4J — Follow-up Reminders & Auto-Expiration.** Vercel Cron daily job. Configurable multi-step reminder schedule (company default + per-estimate override). Reminder emails to client via Resend. Heads-up emails to Owner/Admin on sign/decline/expiration. Auto-expiration when `expires_at` passes (estimate data preserved, status set to `expired`).

Plus an additive migration extending `companies` (branding + email defaults + reminder config) and `estimates` (proposal pricing level + reminder tracking + unsubscribe).

---

## Decisions (locked)

### Email infrastructure

- **Provider:** Resend.
- **Sending domain:** `frames-focus.com` (registered at Cloudflare, owned by Josh). Sender address per tenant: `companyname@frames-focus.com` (dynamic local part, single verified domain).
- **Send mechanism:** Next.js API routes (consistent with Module 3H GPT-4o pattern). No Edge Functions.
- **Email templates:** Branded HTML via React Email. Template variables supported: `{{company_name}}`, `{{contact_name}}`, `{{estimate_number}}`, `{{estimate_name}}`, `{{signing_link}}`, `{{expiration_date}}`, `{{sent_date}}`.
- **Delivery tracking:** Resend webhooks → `email_logs` table. Track sent, delivered, opened, bounced, complained, failed.
- **#27 and #47 stay separate:** Resend infrastructure built here benefits invite emails (#27) and branded auth emails (#47) later, but those are out of scope for this spec.

### 4E — Proposal Generation

- **E1 — Per-line discount visibility:** Shown on the proposal. Each discounted line renders: original amount → discount sub-line (`Discount: -$X`) → line total. Whole-estimate discount shown in the Subtotal / Discount / Total block (per architecture doc).
- **E2 — PDF generation:** Server-side React-PDF via API route (`/api/proposals/generate`). Returns PDF buffer.
- **E3 — PDF storage:** Regenerated on demand from estimate data. Only the signed PDF (4F output) is stored in Module 3. No unsigned PDF storage — avoids stale-PDF drift.
- **E4 — Preview UX:** Full-page preview route at `/dashboard/estimates/[id]/proposal`. Renders React-PDF in-browser via `@react-pdf/renderer`. User sees exactly what the client receives. Pricing-level toggle on this page (total only / category totals / full line items) — persisted to `estimates.proposal_pricing_level`.
- **E5 — "Send Proposal" flow:** Preview page → "Send Proposal" button → email editor modal (pre-filled with company defaults, editable per-send) → on send: generates PDF, creates signing session, sends via Resend, logs email, auto-sets `sent_at` + `expires_at`, status → `sent`. Manual "Mark as Sent" (4D) remains available for hand-delivery without email/e-sign.
- **E6 — Email content:** Branded HTML email. Company logo, intro text, PDF attached, CTA button linking to signing page. Subject and body customizable: company-level defaults in settings, editable per-send in the send modal. Template variables replaced at send time.
- **E7 — Branding:** Company logo (existing) + company name (existing) + `brand_color` hex field on `companies` (new, default `#1a56db`). Used as accent color in PDF and email templates. No additional branding fields in v1.

### 4F — Built-in Signature Capture

- **F1 — Public route:** `/sign/[token]`. No authentication — the token IS the access credential. Route lives outside `/dashboard`.
- **F2 — Signature methods:** Draw (canvas pad) + Type (name rendered in script font). Client picks.
- **F3 — Token storage:** New `signing_sessions` table with full audit fields (see Schema).
- **F4 — Token expiration:** Matches the estimate's `expires_at`. One expiration to manage.
- **F5 — Signing page content:** HTML-rendered proposal (not embedded PDF). Same data as the PDF, rendered as responsive HTML for mobile-friendly viewing. Signature capture area at the bottom.
- **F6 — Signed PDF compositing:** Server-side `pdf-lib`. Regenerates the unsigned PDF via React-PDF, overlays signature image at the signature-line position, stores the result in Module 3 via `signed_proposal_file_id` (already on `estimates` from 4C).
- **F7 — Legal audit trail:** Captured on sign: IP address, user agent, timestamp, consent checkbox text ("I acknowledge that I have reviewed this proposal and agree to the terms and conditions stated herein. This constitutes my electronic signature."), signature image data, signer name. Stored in `signing_sessions`. ESIGN Act compliant (intent + identity + consent + record).
- **F8 — Decline flow:** "Decline" button on signing page. Reason code selector (same codes as architecture doc: `too_expensive`, `chose_competitor`, `project_canceled`, `timing`, `scope_changed`, `other`) + optional notes. Updates estimate status → `declined`, `declined_at` set, reason stored.
- **F9 — Notifications on sign/decline:** Email to Owner/Admin via Resend (heads-up with estimate name + client name + action taken). In-app notification deferred — no notification UI exists yet.
- **F10 — Resend Proposal:** "Resend Proposal" button on estimate detail page (available when status = `sent`). Generates a new signing session + token, invalidates the old session (status → `invalidated`), sends fresh email. Old signing link stops working.

### 4J — Follow-up Reminders & Auto-Expiration

- **J1 — Trigger:** Vercel Cron → hits `/api/cron/estimate-reminders` daily. Secured with `CRON_SECRET` env var.
- **J2 — Reminder schedule:** Configurable array of day-offsets after `sent_at` (e.g., `[3, 7, 14]`). Company-level default in `companies.default_reminder_schedule`. Per-estimate override in `estimates.reminder_schedule` (nullable — `NULL` = use company default). Empty array `[]` = no reminders (opt-out).
- **J3 — Notification method:** Email-only. Reminder email to client. Heads-up email to Owner/Admin. No in-app notification UI in v1.
- **J4 — Reminder email content:** Branded HTML template. Company-level default subject + body in settings (`default_reminder_email_subject`, `default_reminder_email_body`). Template variables replaced at send time. Not editable per-send (reminders are automated).
- **J5 — Per-estimate opt-out:** Set `reminder_schedule = []` on the estimate. Also: client can click unsubscribe link in reminder email → sets `client_unsubscribed_at` on the estimate → cron skips.
- **J6 — Double-send prevention:** `estimates.reminder_count` (int, default 0) + `estimates.last_reminder_sent_at` (timestamp). Cron logic: fire reminder N when `reminder_count = N-1` AND `sent_at + schedule[N-1] days ≤ now()` AND status still = `sent`.
- **J7 — Auto-expiration:** Same daily cron job. For estimates where `expires_at < now()` AND status = `sent`: set status → `expired`. Estimate data preserved — nothing deleted. `default_expiration_days` on `companies` (default 30), per-estimate via existing `expiration_days` field. To revive: create a new version (existing versioning path from architecture doc).
- **J8 — CAN-SPAM:** Unsubscribe link in every client-facing reminder email. Hits `/api/sign/unsubscribe/[token]` which sets `client_unsubscribed_at`.

---

## Schema

### New table: `signing_sessions`

Audit/legal record of every signing-link interaction. NOT a standard per-tenant CRUD entity — no `is_deleted`/`deleted_at`/`created_by`/`updated_by` (these are system-generated legal records, never soft-deleted or user-attributed).

```
signing_sessions
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
  company_id        UUID NOT NULL REFERENCES companies(id)
  estimate_id       UUID NOT NULL REFERENCES estimates(id)
  token             TEXT NOT NULL UNIQUE
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','declined','expired','invalidated'))
  recipient_email   TEXT NOT NULL
  recipient_name    TEXT
  expires_at        TIMESTAMPTZ NOT NULL

  -- Completion (set on sign)
  signed_at         TIMESTAMPTZ
  signature_type    TEXT CHECK (signature_type IN ('draw','type'))
  signature_data    TEXT          -- base64 PNG
  signer_name       TEXT          -- declared name

  -- Decline (set on decline)
  declined_at       TIMESTAMPTZ
  decline_reason    TEXT CHECK (decline_reason IN (
                      'too_expensive','chose_competitor','project_canceled',
                      'timing','scope_changed','other'))
  decline_notes     TEXT

  -- Legal audit
  signer_ip         TEXT
  signer_user_agent TEXT
  consent_given     BOOLEAN NOT NULL DEFAULT false
  consent_text      TEXT

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:** `idx_signing_sessions_token` (UNIQUE, implicit from constraint), `idx_signing_sessions_estimate_id`, `idx_signing_sessions_company_id`.

**Triggers:** `updated_at` trigger only (standard shared function from Migration 001). No `updated_by` trigger (no auth user context on public routes).

### New table: `email_logs`

Delivery tracking for all platform emails. Log records — never soft-deleted.

```
email_logs
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
  company_id          UUID NOT NULL REFERENCES companies(id)
  estimate_id         UUID REFERENCES estimates(id)       -- nullable for future non-estimate emails
  signing_session_id  UUID REFERENCES signing_sessions(id) -- nullable
  resend_message_id   TEXT                                 -- Resend's ID for webhook correlation
  email_type          TEXT NOT NULL CHECK (email_type IN (
                        'proposal','reminder','signature_complete',
                        'signature_declined','estimate_expired'))
  recipient_email     TEXT NOT NULL
  sender_email        TEXT NOT NULL
  subject             TEXT NOT NULL
  status              TEXT NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent','delivered','opened',
                        'bounced','complained','failed'))
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
  delivered_at        TIMESTAMPTZ
  opened_at           TIMESTAMPTZ
  bounced_at          TIMESTAMPTZ
  metadata            JSONB DEFAULT '{}'   -- webhook payloads, custom body text, etc.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:** `idx_email_logs_company_id`, `idx_email_logs_estimate_id`, `idx_email_logs_resend_message_id`.

**Triggers:** `updated_at` trigger only.

### ALTER `companies` — additive columns

```
brand_color                       TEXT DEFAULT '#1a56db'
default_proposal_email_subject    TEXT
default_proposal_email_body       TEXT
default_reminder_email_subject    TEXT
default_reminder_email_body       TEXT
default_reminder_schedule         JSONB DEFAULT '[3, 7, 14]'
default_expiration_days           INTEGER NOT NULL DEFAULT 30
default_proposal_pricing_level    TEXT NOT NULL DEFAULT 'category_totals'
                                    CHECK (default_proposal_pricing_level IN (
                                      'total_only','category_totals','full_line_items'))
```

### ALTER `estimates` — additive columns

```
proposal_pricing_level    TEXT NOT NULL DEFAULT 'category_totals'
                            CHECK (proposal_pricing_level IN (
                              'total_only','category_totals','full_line_items'))
reminder_schedule         JSONB            -- NULL = use company default; [] = no reminders
reminder_count            INTEGER NOT NULL DEFAULT 0
last_reminder_sent_at     TIMESTAMPTZ
client_unsubscribed_at    TIMESTAMPTZ      -- set when client clicks unsubscribe in reminder
```

### Migration shape

Single migration covering both new tables and both ALTERs. Apply via `npx supabase db push`.

---

## RLS

### `signing_sessions`

- `signing_sessions_select_manager` — Owner/Admin SELECT on their company (for viewing signing activity in the dashboard). Standard `company_id = (SELECT company_id FROM profiles WHERE user_id = auth.uid())` pattern.
- **No INSERT/UPDATE/DELETE policies for authenticated users.** All writes happen via API routes using the Supabase service-role client (public signing flow has no auth context).

### `email_logs`

- `email_logs_select_manager` — Owner/Admin SELECT on their company.
- `email_logs_insert_service` — no authenticated INSERT policy. All inserts via service-role client (API routes, cron, webhooks).
- **No UPDATE/DELETE policies.** Log records are immutable from the user's perspective; status updates come from webhook API route via service-role client.

### Existing tables

- **`companies`** ALTER columns: covered by existing Owner/Admin UPDATE policy. No new policies needed.
- **`estimates`** ALTER columns: covered by existing policies. `reminder_count`, `last_reminder_sent_at`, and `client_unsubscribed_at` are updated by the cron job and public unsubscribe route via service-role client, bypassing RLS. `proposal_pricing_level` is user-editable and covered by existing Draft-status UPDATE guard.

### Service-role usage

Three contexts use the Supabase service-role client (bypasses RLS):

1. **Public signing routes** (`/api/sign/[token]/*`) — no auth.uid() available.
2. **Resend webhook** (`/api/webhooks/resend`) — inbound from Resend, no auth context.
3. **Vercel Cron** (`/api/cron/estimate-reminders`) — server-to-server, secured by `CRON_SECRET`.

---

## Service layer

### New: `apps/web/lib/services/email-service.ts`

Resend client wrapper. Core functions:

- **`sendProposalEmail(estimateId, customSubject, customBody)`** — generates PDF, creates signing session, sends email via Resend, logs to `email_logs`, returns `{ signingSessionId, emailLogId }`. Does NOT update estimate status (caller handles that).
- **`sendReminderEmail(estimateId, signingSession)`** — sends reminder to client using company's reminder template + variables. Logs to `email_logs`.
- **`sendNotificationEmail(estimateId, eventType, recipientUserId)`** — sends heads-up to Owner/Admin on sign/decline/expiration. Logs to `email_logs`.
- **`buildSenderAddress(company)`** — returns `companyname@frames-focus.com` (slugified company name).
- **`replaceTemplateVariables(template, variables)`** — string replacement for `{{var}}` tokens.

### New: `apps/web/lib/services/proposal-service.ts`

PDF generation orchestration:

- **`generateProposalPDF(estimateId)`** — fetches full estimate with all children (contact, address, categories, subcategories, line items, materials, sub-bid winners, terms, scope, cover letter, company branding). Renders React-PDF. Returns PDF buffer.
- **`compositeSignedPDF(pdfBuffer, signatureImageBase64, signerName, signedAt)`** — uses `pdf-lib` to overlay signature image + name + timestamp on the signature line of the unsigned PDF. Returns signed PDF buffer.
- **`storeSignedPDF(companyId, estimateId, signedPdfBuffer)`** — uploads to Supabase Storage (`project-files` bucket), creates a `files` record in Module 3, returns `file_id`. Naming: `proposals/[estimate_number]-signed.pdf`.

### New: `apps/web/lib/services/signing-service.ts`

Signing session management:

- **`createSigningSession(estimateId, recipientEmail, recipientName, expiresAt)`** — generates cryptographically random token (`crypto.randomUUID()` or `nanoid`), inserts `signing_sessions` row, returns `{ token, sessionId }`.
- **`getSessionByToken(token)`** — fetches session with estimate + company data. Returns null if expired/invalidated/completed/declined.
- **`completeSignature(token, signatureData)`** — validates session is `pending`, records signature fields + audit data (IP, user agent, consent), sets status → `completed`, composites signed PDF, stores in Module 3, updates `estimates.signed_proposal_file_id` + `estimates.status → 'accepted'` + `estimates.accepted_at`, sends notification to Owner/Admin. Single transaction where possible.
- **`declineEstimate(token, reason, notes)`** — validates session is `pending`, records decline fields, sets session status → `declined`, updates `estimates.status → 'declined'` + `estimates.declined_at` + `estimates.decline_reason` + `estimates.decline_notes`, sends notification to Owner/Admin.
- **`invalidateSessionsForEstimate(estimateId)`** — sets all `pending` sessions for this estimate to `invalidated`. Called before creating a new session (F10 resend flow).
- **`recordUnsubscribe(token)`** — sets `client_unsubscribed_at` on the linked estimate.

### Extend: `apps/web/lib/services/estimates-client.ts`

- **`sendProposal(estimateId, emailSubject, emailBody)`** — orchestrator: calls `sendProposalEmail`, then updates estimate status → `sent`, `sent_at = now()`, `expires_at = now() + expiration_days days`. Role: Owner/Admin only. Service-layer guard: status must be `draft` or `review` (for Owner/Admin direct send) — if `review`, also sets `reviewed_by`/`reviewed_at`.
- **`resendProposal(estimateId, emailSubject, emailBody)`** — invalidates existing sessions, calls `sendProposalEmail` with fresh token. Status stays `sent`. Role: Owner/Admin only.
- Existing `markAsSent(estimateId)` from 4D unchanged — remains for hand-delivery without email.

### Extend: `apps/web/lib/services/company-client.ts`

Extend settings update to cover new fields: `brand_color`, `default_proposal_email_subject`, `default_proposal_email_body`, `default_reminder_email_subject`, `default_reminder_email_body`, `default_reminder_schedule`, `default_expiration_days`, `default_proposal_pricing_level`.

---

## Zod — `packages/shared/validation/`

### New: `proposal.ts`

```
proposal_pricing_level: enum ['total_only', 'category_totals', 'full_line_items']
```

### New: `email.ts`

```
sendProposalInput:
  estimate_id: uuid
  subject: string, 1–200 chars
  body: string, 1–5000 chars

reminderSchedule: array of integers ≥ 0, max 10 items, sorted ascending
```

### New: `signing.ts`

```
completeSignatureInput:
  signature_type: enum ['draw', 'type']
  signature_data: string (base64, max 500KB)
  signer_name: string, 1–200 chars
  consent_given: literal true (must be true to submit)

declineInput:
  decline_reason: enum ['too_expensive','chose_competitor','project_canceled','timing','scope_changed','other']
  decline_notes: string optional, max 2000 chars
```

### Extend: `company-settings.ts`

```
brand_color: regex /^#[0-9a-fA-F]{6}$/ (6-digit hex)
default_proposal_email_subject: string optional, max 200 chars
default_proposal_email_body: string optional, max 5000 chars
default_reminder_email_subject: string optional, max 200 chars
default_reminder_email_body: string optional, max 5000 chars
default_reminder_schedule: array of integers ≥ 1, max 10 items, sorted ascending, optional (default [3,7,14])
default_expiration_days: integer ≥ 1, ≤ 365, default 30
default_proposal_pricing_level: enum ['total_only','category_totals','full_line_items']
```

### Extend: `estimate.ts`

```
proposal_pricing_level: enum ['total_only','category_totals','full_line_items']
reminder_schedule: array of integers ≥ 1, max 10 items, sorted ascending, optional (NULL = company default, [] = disabled)
```

---

## UI

### Proposal preview page — `/dashboard/estimates/[id]/proposal`

- Full-page route. Server component fetches estimate with all children + company branding.
- Renders React-PDF in-browser (`<PDFViewer>` from `@react-pdf/renderer`) showing the branded proposal.
- **Pricing-level toggle** (dropdown or radio: Total Only / Category Totals / Full Line Items) — persists to `estimates.proposal_pricing_level` on change, re-renders preview live.
- **Action buttons:**
  - "Download PDF" — triggers PDF download.
  - "Send Proposal" — opens email editor modal.
  - "Mark as Sent" — manual toggle (from 4D), for hand-delivery scenarios. Confirm modal.
- **Navigation:** accessible from the estimate builder (button on Details tab or top bar).

### Email editor modal (used by "Send Proposal")

- Pre-fills subject + body from company defaults (or hardcoded defaults if none set).
- Template variable chips shown for reference (e.g., `{{contact_name}}`).
- User can edit subject and body freely.
- "Send" button → calls `sendProposal` → loading state → success toast + redirect to estimate detail (now showing `sent` status).
- Recipient shown (contact email) but not editable here (comes from the contact record).

### Company settings — Estimating section extensions

Add to the existing 4M Estimating settings page (or a new "Proposals & Email" sub-section):

- **Brand color** — hex color picker.
- **Default proposal pricing level** — dropdown (Total Only / Category Totals / Full Line Items).
- **Default expiration days** — number input.
- **Default proposal email** — subject + body textarea with template variable reference.
- **Default reminder schedule** — editable list of day numbers (e.g., 3, 7, 14). Add/remove/reorder.
- **Default reminder email** — subject + body textarea with template variable reference.

Owner/Admin only (existing settings page restriction).

### Public signing page — `/sign/[token]`

- Public route, no authentication.
- **Token validation:** if token invalid, expired, or already used → friendly error page ("This link has expired or is no longer valid. Please contact [company name] for a new proposal link.").
- **Proposal display:** HTML-rendered proposal content (same data as PDF, responsive layout). Company branding (logo, brand color). Scrollable.
- **Action area (bottom of page):**
  - **"Accept & Sign" section:**
    - Name input (pre-filled from `recipient_name` if available).
    - Signature method toggle: Draw / Type.
    - Draw: canvas pad with clear button.
    - Type: text input rendered in a script font preview.
    - Consent checkbox with legal text.
    - "Sign Proposal" button (disabled until name + signature + consent all provided).
  - **"Decline" section:**
    - "Decline Proposal" link/button (secondary styling).
    - Expands: reason code dropdown + optional notes textarea + "Confirm Decline" button.
- **Post-sign confirmation page:** "Thank you! Your signed proposal has been sent to [company name]." Clean, branded.
- **Post-decline confirmation page:** "Proposal declined. [Company name] has been notified." Clean, branded.
- **Unsubscribe:** footer link on the signing page: "Don't want to receive reminders about this proposal? Unsubscribe." Hits the unsubscribe endpoint.

### Estimate detail page — extensions

- **Status badge** reflects all statuses including `accepted`, `declined`, `expired`.
- **"Resend Proposal" button** — visible when status = `sent`. Opens the email editor modal (F10 flow).
- **Signing activity section** — on the Details tab (or a dedicated sub-section), show: signing session status, email delivery status (from `email_logs`), timestamps. Read-only. Owner/Admin only.
- **Signed PDF download** — once signed, a "Download Signed Proposal" link appears (pulls from `signed_proposal_file_id` in Module 3).

### React-PDF proposal template — `apps/web/lib/proposal/proposal-template.tsx`

React-PDF document component. Layout:

1. **Header:** Company logo (left) + company name, address, phone, email (right). Brand-color accent line.
2. **Estimate info block:** Estimate number, version, date, expiration date.
3. **Client info block:** Contact name, company (if any), job-site address.
4. **Cover letter:** Free-text section.
5. **Scope of work:** Free-text section.
6. **Pricing section** (varies by `proposal_pricing_level`):
   - **Total only:** single grand total line.
   - **Category totals:** one row per category with subtotal.
   - **Full line items:** every line item with description + price. Per-line discounts shown as: original amount → `Discount: -$X` → line total.
7. **Subtotal / Discount / Total block:** always shown. Whole-estimate discount displayed when present.
8. **Allowance summary box:** listed near the bottom when any material rows have `unit_of_measure = 'allowance'`. Each allowance with description + amount.
9. **Terms sections:** rendered from the JSONB array — one heading + body per section.
10. **Signature line:** `Accepted by: ____________  Date: ____________` (placeholder for e-sign).
11. **Footer:** "Proposal prepared by [Company Name]" + brand-color accent.

### React Email templates — `apps/web/lib/email/templates/`

- `proposal-email.tsx` — branded proposal delivery email.
- `reminder-email.tsx` — follow-up reminder with signing link + unsubscribe.
- `signature-notification.tsx` — Owner/Admin heads-up on sign/decline/expiration.

---

## API routes

### Authenticated (require auth, use standard Supabase client)

- **`POST /api/proposals/generate`** — accepts `estimateId`, returns PDF buffer. Used by the preview page download button.
- **`POST /api/proposals/send`** — accepts `estimateId`, `subject`, `body`. Orchestrates: generate PDF → create signing session → send email → update status. Returns success/failure.
- **`POST /api/proposals/resend`** — accepts `estimateId`, `subject`, `body`. Invalidates old sessions, creates new one, sends fresh email. Status stays `sent`.

### Public (no auth, use service-role client)

- **`GET /api/sign/[token]`** — validates token, returns estimate + company data for the signing page renderer. 404 if invalid/expired/used.
- **`POST /api/sign/[token]/complete`** — accepts signature data + consent. Records signature, composites PDF, updates estimate. Returns confirmation.
- **`POST /api/sign/[token]/decline`** — accepts reason + notes. Records decline, updates estimate. Returns confirmation.
- **`POST /api/sign/unsubscribe/[token]`** — sets `client_unsubscribed_at` on the estimate. Returns confirmation page.

### Webhook

- **`POST /api/webhooks/resend`** — Resend delivery webhook. Validates signature (Resend signing secret), correlates via `resend_message_id`, updates `email_logs` status + timestamps. Idempotent.

### Cron

- **`GET /api/cron/estimate-reminders`** — secured by `CRON_SECRET` header. Runs two passes:
  1. **Reminders:** query estimates where status = `sent` AND `client_unsubscribed_at IS NULL` AND `reminder_count < length(effective_schedule)` AND `sent_at + effective_schedule[reminder_count] days ≤ now()`. For each: send reminder email, increment `reminder_count`, set `last_reminder_sent_at`.
  2. **Expiration:** query estimates where status = `sent` AND `expires_at < now()`. For each: set status → `expired`, send notification to Owner/Admin.

---

## Build order

1. **Prerequisite: Resend domain verification.** Josh verifies `frames-focus.com` in the Resend dashboard, adds DNS records at Cloudflare. Manual step — not code.
2. **Prerequisite: Environment variables.** Add `RESEND_API_KEY`, `RESEND_SIGNING_SECRET`, `CRON_SECRET` to Codespaces secrets and Vercel env vars.
3. **Migration** — two new tables + two ALTERs + RLS + triggers + indexes. Apply via `npx supabase db push`.
4. **Type regen verified;** `npx tsc --noEmit` clean from `apps/web/`.
5. **Install dependencies:** `@react-pdf/renderer`, `pdf-lib`, `resend`, `react-email` (+ `@react-email/components`).
6. **Company settings extensions** — Zod + service-layer + UI for new fields (brand_color, email defaults, reminder schedule, expiration days, pricing level).
7. **Email service** (`email-service.ts`) — Resend client, template variable replacement, sender address builder.
8. **React Email templates** — proposal, reminder, notification.
9. **React-PDF proposal template** — the branded PDF layout component.
10. **PDF generation API route** (`/api/proposals/generate`) — orchestrates fetch + render.
11. **Proposal preview page** (`/dashboard/estimates/[id]/proposal`) — pricing-level toggle, download button.
12. **Signing service** (`signing-service.ts`) — session CRUD, token generation/validation.
13. **"Send Proposal" flow** — email editor modal + API route (`/api/proposals/send`) + estimate status update.
14. **Public signing page** (`/sign/[token]`) — token validation, HTML proposal renderer, signature capture (draw + type), consent, decline flow.
15. **Signature completion** (`/api/sign/[token]/complete`) — `pdf-lib` compositing, Module 3 storage, estimate status update, notification email.
16. **Decline endpoint** (`/api/sign/[token]/decline`) — estimate status update, notification email.
17. **"Resend Proposal" flow** — invalidate old sessions + create new + send. Button on estimate detail page.
18. **Resend webhook** (`/api/webhooks/resend`) — delivery tracking → `email_logs` updates.
19. **Vercel Cron setup** — `vercel.json` cron config + `/api/cron/estimate-reminders` route.
20. **Reminder logic** — query + send + increment.
21. **Auto-expiration logic** — query + status update + notification.
22. **Unsubscribe endpoint** (`/api/sign/unsubscribe/[token]`).
23. **Estimate detail page extensions** — signing activity display, signed PDF download, resend button.
24. **Final type-check + acceptance run + scoped commits.**

### Commits (proposed scope — one logical concern per commit)

Josh handles `git commit` and `git push`.

1. Migration + types regen
2. Dependencies (`package.json` additions)
3. Company settings extensions (Zod + service + UI)
4. Email service + React Email templates
5. React-PDF proposal template
6. PDF generation API route + proposal preview page
7. Signing service + signing session CRUD
8. "Send Proposal" flow (email editor modal + API route + status update)
9. Public signing page + signature capture UI
10. Signature completion + decline endpoints + pdf-lib compositing
11. Resend Proposal flow (invalidate + resend)
12. Resend webhook + email_logs tracking
13. Vercel Cron + reminders + auto-expiration + unsubscribe
14. Estimate detail page extensions (signing activity, signed PDF download)

---

## Acceptance checks

Run from `apps/web/` before merge. Order matters — schema first, then settings, then 4E, then 4F, then 4J.

### Schema

- 1. Migration applies clean.
- 2. `db:types` regenerates; `npx tsc --noEmit` passes.
- 3. Both new tables present and queryable.
- 4. All new columns on `companies` and `estimates` present with correct defaults.

### Company settings (Estimating extensions)

- 5. Owner: save brand_color, all email defaults, reminder schedule `[3, 7, 14]`, expiration days 30, pricing level — values persist across reload.
- 6. Owner: set reminder schedule to empty `[]` — persists (no reminders).
- 7. Owner: set expiration days to 0 — rejected by Zod (min 1).
- 8. PM/Foreman/Crew: settings page rejects access (existing restriction).

### 4E — Proposal Generation

- 9. Navigate to `/dashboard/estimates/[id]/proposal` for a Draft estimate with line items, discounts, allowances, terms — preview renders correctly.
- 10. Toggle pricing level between Total Only / Category Totals / Full Line Items — preview updates live, value persists on reload.
- 11. Download PDF — file opens in PDF reader, content matches preview.
- 12. Per-line discount: line shows original → discount → line total on the PDF.
- 13. Allowance summary box appears when allowance materials exist.
- 14. Click "Send Proposal" → email editor modal opens pre-filled with company defaults.
- 15. Edit subject + body, click Send → estimate status moves to `sent`, `sent_at` set, `expires_at` computed.
- 16. Check Resend dashboard (or email inbox): email received with PDF attachment + signing link.
- 17. Email sender shows as `companyname@frames-focus.com`.
- 18. "Mark as Sent" (manual) still works and does NOT create a signing session or send email.
- 19. After Send: estimate fields frozen (existing 4D behavior).
- 20. `email_logs` row created with correct `resend_message_id`, type `proposal`, status `sent`.

### 4F — Signature

- 21. Click signing link from email → `/sign/[token]` loads, shows HTML-rendered proposal.
- 22. Proposal content matches the PDF (same data: line items, discounts, terms, branding).
- 23. Mobile: signing page is responsive, scrollable, signature pad usable on phone.
- 24. Sign via Draw: draw signature on canvas, enter name, check consent, submit → confirmation page.
- 25. Sign via Type: type name, see script-font preview, check consent, submit → confirmation page.
- 26. After signing: estimate status → `accepted`, `accepted_at` set, `signed_proposal_file_id` populated.
- 27. Download signed PDF → signature visible at the signature line.
- 28. `signing_sessions` row: status `completed`, IP + user agent + consent captured.
- 29. Owner/Admin receives notification email about the signature.
- 30. Decline: click Decline → select reason + optional notes → confirm → estimate status → `declined`, `declined_at` set.
- 31. Owner/Admin receives notification email about the decline.
- 32. Visit an already-completed signing link → error page ("This link has expired or is no longer valid").
- 33. Visit an expired signing link → same error page.
- 34. "Resend Proposal" on a `sent` estimate → new email with new signing link. Old link stops working.
- 35. Cross-tenant: signing token for company A's estimate cannot be used to view/modify company B's data.

### 4J — Reminders & Expiration

- 36. Send a proposal. Wait (or manually adjust `sent_at` in DB for testing). Trigger cron endpoint manually (`curl` with `CRON_SECRET`). Reminder email sent to client after the first schedule interval.
- 37. `estimates.reminder_count` incremented to 1, `last_reminder_sent_at` set.
- 38. Trigger cron again immediately → no duplicate send (next interval not reached).
- 39. Set `reminder_schedule = []` on an estimate → cron skips it.
- 40. Click unsubscribe link in reminder email → `client_unsubscribed_at` set → cron skips.
- 41. Estimate with `expires_at` in the past + status `sent` → cron sets status → `expired`.
- 42. Expired estimate: data fully intact, all fields readable, no deletion.
- 43. Owner/Admin receives notification email on expiration.
- 44. Reminder email includes working unsubscribe link.
- 45. Cron endpoint without `CRON_SECRET` header → 401 rejected.

---

## Open build-time questions

Deferred to build time — not blocking spec approval.

- **Q1 — Signature canvas library.** Options: raw HTML Canvas API (lightweight, full control) vs. `react-signature-canvas` (npm package, handles touch events). Decide at the signing-page build. **Recommendation:** `react-signature-canvas` — handles touch/mouse normalization, saves time.

- **Q2 — React-PDF page breaks.** Long proposals (many line items, long terms) need sensible page-break handling in the PDF. React-PDF supports `break` and `wrap` props but behavior can be finicky. Test during the template build; may need explicit page-break rules per section. No schema impact.

- **Q3 — Resend webhook signature validation.** Resend provides a signing secret for webhook verification. Implementation detail: use their `svix` library or manual HMAC check. Decide at the webhook build. **Recommendation:** `svix` (Resend's documented approach).

---

## Cross-module dependency map

- **4D → 4E:** cover_letter, scope_of_work, terms_sections, line items + materials + sub-bid winners, pricing_mode, discount fields, allowance materials, company branding — all consumed by the proposal renderer.
- **4D → 4F:** `sent` status is the precondition for the signing flow. `markAsSent` (manual) and `sendProposal` (email) both set this status.
- **4D → 4J:** `sent_at` timestamp is the anchor for reminder schedule calculations. `expires_at` is the anchor for auto-expiration.
- **4E → 4F:** proposal PDF generation feeds into signing (PDF attached to email; PDF composited with signature). Signing link embedded in proposal email.
- **4F → Module 3:** signed PDF stored via existing file storage infrastructure (`files` table + `project-files` bucket).
- **4J → 4E/4F:** reminder emails include the signing link from the active `signing_sessions` row.
- **Module 2 (Contacts) → 4E:** contact email address is the recipient for proposal + reminder emails. Contact name + address appear on the proposal.
- **Module 5 (Projects):** accepted estimates (status set by 4F) become eligible for estimate-to-project conversion.
- **Resend infrastructure → future:** #27 (invite emails) and #47 (branded auth emails) can leverage the same Resend client and domain verification.

— End of spec —
