# Session 71 — Signed-Artifacts Code Audit (read-only)

**Date:** July 12, 2026
**Branch:** `feat/signed-artifacts` (HEAD `bd109cc`) — read-only, no edits, no DB.
**Scope:** confirm/refute the five known-open issues by reading source only.

## Verdict summary

| # | Issue | Verdict |
| --- | --- | --- |
| 1 | Client name/email auto-populate | **NOT REPRODUCED** (works server-side; UI doesn't prefill) |
| 2 | Signature capture = paste-region vs file-upload | **CONFIRMED** — file upload |
| 3 | Default markup imports into the CO | **CONFIRMED** — copied from source estimate |
| 4 | Logo upload path broken | **NOT REPRODUCED** — code path is functional |
| 5 | Client email send miscoded (vs. env) | **NOT REPRODUCED** — send path is correct; absence is env |

## ⚠️ Cross-cutting discrepancy (read this first)

The builder UI and the send route disagree about whether an email is sent.

- **Builder UI** (`co-builder.tsx`) tells the user no email goes out:
  - line 396: `placeholder="For your records — no email is sent"`
  - lines 466-467: *"Sending is your internal acceptance. You'll get a signing link to share with the client — no email goes out automatically."*
- **Send route** (`api/change-orders/[id]/send/route.ts`) actually generates the
  v1 PDF and emails it to the client with the signing link (lines 276-288), and
  **auto-resolves the recipient from the project's primary contact** (lines 152-172).
- The validation schema agrees with the route, not the UI —
  `co-signing.ts`: *"client delivery by email (signed-artifact spec §7) … when
  omitted the send route resolves the change order's project primary contact."*

So the route + spec + validation all intend **email delivery with auto-resolved
recipient**; the builder UI copy is stale and contradicts them. This single
mismatch is the likely root of the "auto-populate" (#1) and "email not sending"
(#5) reports, so treat #1 and #5 together with this discrepancy in mind.

---

## 1. Client name/email auto-populate — NOT REPRODUCED (with a UI caveat)

**The send route DOES auto-populate** the recipient from the project's primary
contact when the caller doesn't pass one.

`apps/web/app/api/change-orders/[id]/send/route.ts:152-172`:

```ts
// ── Recipient resolution (Q C) — override wins; else the project's contact.
let recipientEmail = input.recipient_email ?? null;
let recipientName = input.recipient_name ?? null;
if (!recipientEmail) {
  const { data: project } = await admin
    .from('projects').select('contact_id').eq('id', co.project_id).maybeSingle();
  if (project?.contact_id) {
    const { data: contact } = await admin
      .from('contacts').select('first_name, last_name, email').eq('id', project.contact_id).maybeSingle();
    if (contact?.email) {
      recipientEmail = contact.email;
      recipientName = recipientName ?? `${contact.first_name} ${contact.last_name}`.trim();
    }
  }
}
```

The render/PDF path resolves the client the same way
(`lib/change-orders/co-data.ts:122-135`).

**Caveats that likely produced the "broken" report:**
- The **builder form does not visually prefill** those fields — they start empty
  and are labeled "optional": `co-builder.tsx:150-151`
  `const [recipientName, setRecipientName] = useState('');` /
  `const [recipientEmail, setRecipientEmail] = useState('');`. The server-side
  props passed in (`page.tsx:64-73`) include `companyName` and
  `hasSavedSignature` but **no client name/email**, so there is nothing to
  prefill from. A tester expecting to *see* the name/email pre-filled sees blanks.
- The CO **create** path (`change-orders-client.ts` `createChangeOrder`, 79-140)
  pulls pricing/tax context only — it does **not** pull contact name/email. If
  "CO create path" was meant literally, then create does not auto-populate; the
  auto-populate lives in the **send** path.

**Bottom line:** auto-populate is implemented and functional at send; the gap is
cosmetic (form doesn't prefill / label says "optional"). Decide whether the ask
is "prefill the visible fields," which is genuinely not done.

## 2. Signature capture: paste-region vs file-upload — CONFIRMED (file upload)

The saved contractor signature is captured via a hidden file `<input>` — a file
picker, not a paste-an-image-region control.

`apps/web/app/dashboard/settings/settings-form.tsx:298-304`:

```tsx
<input
  ref={sigInputRef}
  type="file"
  accept="image/*"
  onChange={handleSignatureUpload}
  style={{ display: 'none' }}
/>
```

`handleSignatureUpload` (123-151) reads `e.target.files?.[0]` and calls
`uploadContractorSignature`. A repo-wide search for a paste/canvas capture
(`onPaste`, `<canvas`, `getImageData`, `signaturePad`, `clipboardData`) found
**no** signature-capture implementation anywhere — the only hit was an unrelated
`pastEstimates` variable. Per the issue's stated rule (paste-region correct,
file-upload is the bug), this is the bug, present as described.

## 3. Default markup imports into the CO — CONFIRMED

Creating a CO copies the source estimate's markup defaults onto the change order,
and the totals recompute then applies them to any row left at "default" markup.

`apps/web/lib/services/change-orders-client.ts:110-119` (create):

```ts
if (project?.source_estimate_id) {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('pricing_mode, tax_rate, subcontractor_markup_percent, material_markup_percent, labor_markup_percent')
    .eq('id', project.source_estimate_id).single();
  if (estimate) pricing = estimate;      // ← estimate markup defaults imported
}
```

…written into the CO via `...pricing` in the insert payload (121-130), then read
back and applied as `defaults` in `recalculateChangeOrderTotals` (440-444, 488-493).
A row with `markup_percent = null` (the builder's default — `co-builder.tsx:875-877`,
`change-orders-client.ts:332`) therefore inherits the estimate's markup.

**Caveats:** this is `createChangeOrder`, which is **5D** code and is *not*
changed on the signed-artifacts diff; and `signed-artifact-spec.md` contains **no
markup language at all** (grep: 0 hits). So the code definitively imports the
default markup — but confirm this is the same "default markup" the known issue
means before treating it as a signed-artifacts regression.

## 4. Logo upload path — NOT REPRODUCED (code is functional)

`apps/web/lib/services/company-client.ts:61-92` is a complete, correct upload:

```ts
const filePath = `${companyId}/logo.${fileExt}`;
const { error: uploadError } = await supabase.storage
  .from('company-logos').upload(filePath, file, { upsert: true });
...
const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(filePath);
const { error: updateError } = await supabase
  .from('companies').update({ logo_url: publicUrl, ... }).eq('id', companyId);
```

The UI wiring is sound too (`settings-form.tsx:93-121`, 235-255): image/MIME +
2 MB guards, then `uploadCompanyLogo`, then a cache-busted preview. The path is
`{companyId}/logo.ext`, whose first segment is the company_id — consistent with
the storage-RLS convention in CLAUDE.md.

**Caveat (not verifiable by code read):** the `company-logos` bucket is **not**
created in any migration here (grep of `supabase/migrations/` for `company-logos`
= 0 hits; buckets are provisioned out-of-band). Runtime success depends on that
bucket existing, being public, and its RLS allowing the write. If logo upload
"breaks" in practice, look there — it is infra, not this code.

## 5. Client email send, independent of env — NOT REPRODUCED (correct code)

The send route builds and sends the email correctly.
`api/change-orders/[id]/send/route.ts:276-303`:

```ts
const { messageId, error: sendError } = await sendEmail({
  from: sender, to: recipientEmail, subject,
  react: ChangeOrderEmail({ companyName: company.name, logoUrl: company.logo_url,
    brandColor: company.brand_color || '#1a56db', bodyText, signingUrl }),
  attachments: [{ filename: `${co.co_number}.pdf`, content: v1 }],
});
await logEmail(admin, { ... status: sendError ? 'failed' : 'sent', ... });
```

`sendEmail` (`email-service.ts:144-158`) is a correct Resend wrapper. The **only**
env dependency is `getResend()` (19-24): `if (!key) throw new Error('RESEND_API_KEY is not set')`.
So a "client email not sending" symptom with the key absent is **env, not code** —
the send logic is right and would deliver once the key is present.

**One real code nuance to flag:** when `RESEND_API_KEY` is missing, `getResend()`
**throws** (it isn't caught in the route), so the POST returns a 500 *after* the
CO was already flipped to `sent` and the v1 PDF stored (route 204-258). That
defeats the route's own stated intent that "a failed email is a warning, not a
rollback" (305-307) — the graceful `emailWarning` path only covers a returned
`sendError`, not a thrown missing-key. Worth a small hardening (wrap the send in
try/catch, or have `getResend`/`sendEmail` return an error instead of throwing),
but it does not change the verdict: the send path itself is correctly coded.

---

## Files read

- `apps/web/app/dashboard/projects/[id]/changes/[coId]/co-builder.tsx`, `page.tsx`
- `apps/web/app/api/change-orders/[id]/send/route.ts`
- `apps/web/app/dashboard/settings/settings-form.tsx`
- `apps/web/lib/services/company-client.ts`, `change-orders-client.ts`, `email-service.ts`
- `apps/web/lib/change-orders/co-data.ts`
- `apps/web/lib/proposal/proposal-defaults.ts`
- `packages/shared/validation/co-signing.ts`
- `supabase/migrations/*` (grep for bucket/logo/markup)

**Not exhaustively read** (main-path finders only): `co-pdf-service.ts`,
`co-signing-service.ts`, `co-template.tsx`, `change-order-email.tsx`,
`cron/co-reminders/route.ts`. None bear on the five verdicts above; flag if you
want them traced too.
