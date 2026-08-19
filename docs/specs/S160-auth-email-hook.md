# S160 — Supabase Auth email over Resend. Built, not enabled.

> **Rulings [Josh, S160]:** all five proposals in
> [`S159-invite-email-investigation.md`](S159-invite-email-investigation.md) §8 approved.
>
> ## ⚠️ THIS IS INERT UNTIL §3 IS DONE BY HAND.
>
> The code, the migration and the tests are on the branch and green. **Two production settings and
> one environment variable are not, because changing production configuration is attended.** Until
> §3 runs, every auth email still goes over Supabase's built-in shared mailer exactly as S159 found
> it — nothing is broken by merging this, and nothing is fixed either.

---

## §1 — What was built

| # | Proposal | Where | Status |
| --- | --- | --- | --- |
| **P1** | Auth email over Resend | `app/api/auth/send-email/route.ts` + `lib/services/auth-email.ts` + `lib/email/templates/auth-email.tsx` | Built. **Needs §3.** |
| **P2** | Log those sends | `handleAuthEmail()` → `logEmail()`; six `auth_*` rows in `20261009000000` | Built, falls out of P1 |
| **P3** | Invited users do not confirm | `handleAuthEmail()`'s signup branch | Built. **Needs §3** (it runs inside the hook) |
| **P4** | `emailRedirectTo` on invite acceptance | `app/invite/accept/accept-invite.tsx` | **Live on merge** — no config needed |
| **P5** | A live harness over the invite send | `test/s160-invite-send.live.ts` | **Live now**, 8/8 |

---

## §2 — The two decisions worth arguing about

### 2.1 The Send Email Hook, not custom SMTP — because of P2

Both routes fix deliverability. **Only one fixes the invisibility**, and Josh's brief asked for the
hook to be preferred *"if the hook can call into email-service.ts — that is what makes P2 fall out
for free rather than needing its own plumbing."* It can, so it was.

| | Custom SMTP | **Send Email Hook** |
| --- | --- | --- |
| Config | 5 fields | 2 fields + a secret |
| Code | none | one route, one service, one template |
| Who composes the email | **GoTrue**, from its own templates | **us**, from React |
| Sender | one fixed address | the **tenant's** slug address, per message |
| `email_logs` row | **impossible** — no moment at which our code runs | one `logEmail()` call |
| P3 possible? | **no** | yes — the hook is where an invited signup is distinguishable |
| Rate limit | `rate_limit_email_sent` still applies to GoTrue | GoTrue sends nothing, so **the cap stops applying at all** |

The cap going away is a *consequence*, as the brief asked, not a number that was raised.

**The cost, stated plainly:** GoTrue treats a non-2xx from the hook as a **failed auth operation**.
If this endpoint is down, sign-ups and password resets fail — not just their emails. That is why
`handleAuthEmail()` never throws, why the route answers 200 on a send failure, and why the only 4xx
it can return is for an unauthentic payload. A lost email must never become a lost sign-up.

### 2.2 P3 without touching `mailer_autoconfirm`

**The ruling was that INVITED users do not confirm. `mailer_autoconfirm` is project-wide**, so
flipping it would also skip confirmation for public sign-ups, where the address is self-asserted and
nobody has vouched for it. The brief refused that explicitly, and asked for the invited path to be
confirmed programmatically or for the work to stop.

It is achievable, and the distinction is drawn per message inside the hook:

- **invited signup** → confirm the user via the service role, send nothing, return 200;
- **public signup** → send the confirmation exactly as before, now over Resend.

**Why an invited address is already proven.** `handle_new_user()` raises `check_violation` when
`get_invitation_for_signup()` cannot resolve the token — pending, not deleted, `expires_at > now()`.
A raise inside the `auth.users` insert means **no auth user is created**, so no hook fires. The mere
existence of a user carrying an `invitation_token` is therefore already proof the trigger validated
it.

**The token is re-checked anyway**, on both token and address (`invitedCompanyFor()`).
`user_metadata` is user-controlled; a public signup can put any string in it. And the argument above
rests on a trigger this repository did not create until S135 and that production had configured *by
hand* (`20260914000000` §1). `s160-auth-email.live.ts` **B3** is the assertion that matters: a real
token presented for a different address confirms nothing.

**If confirming fails, the hook falls through and sends the confirmation email.** A user who is
neither confirmed nor sent a link cannot sign in and cannot fix it — strictly worse than what this
replaces.

---

## §3 — ⚠️ THE ATTENDED STEPS. Nothing below was applied.

Do these **in order**. Steps 1–2 are safe to do early; **step 3 is the switch** and nothing changes
until it is thrown.

### Step 1 — Deploy the code

`main` must be deployed to Vercel first. The hook URL has to answer before GoTrue is pointed at it,
or the first sign-up after step 3 fails outright.

Verify the route exists and refuses an unsigned request:

```bash
curl -si -X POST https://ezcontractorbinder.com/api/auth/send-email \
  -H 'content-type: application/json' -d '{}' | head -1
```

Expect **`HTTP/2 400`** (missing `svix-id`). A `404` means it is not deployed; a `500` means
`SEND_EMAIL_HOOK_SECRET` is missing — do step 2 first.

### Step 2 — Generate the secret and set it in three places

Supabase generates the secret when you create the hook (step 3), in the form
`v1,whsec_<base64>`. Either create the hook first with the URL blank, or generate your own:

```bash
node -e "console.log('v1,whsec_' + require('crypto').randomBytes(24).toString('base64'))"
```

Set the **same value** as `SEND_EMAIL_HOOK_SECRET` in:

1. **Vercel** → Project → Settings → Environment Variables → Production (and Preview, if previews
   should send).
2. **GitHub Codespace secrets** (the repo's convention — see STATE.md § Environment Variables).
3. **Supabase** → the hook's own secret field, in step 3.

> The route accepts the value **with or without** the `v1,` prefix — it strips it before handing the
> secret to `svix`. Pasting whichever form the dashboard shows you will work.

**Redeploy after setting it.** Vercel env changes do not apply to an existing deployment.

### Step 3 — Enable the hook

**Supabase Dashboard → Authentication → Hooks → Send Email Hook**

| Field | Value |
| --- | --- |
| Enable | **on** |
| Hook type | **HTTPS** |
| URL | `https://ezcontractorbinder.com/api/auth/send-email` |
| Secret | the `v1,whsec_…` from step 2 |

Do this on **production (`jwkcknyuyvcwcdeskrmz`)**. On **rebuild-test (`nmyphyhmfttxkdoposvf`)** it
can only be enabled if the endpoint is publicly reachable — a Codespace is not — so leave it off
there and rely on `s160-auth-email.live.ts`, which drives `handleAuthEmail()` directly.

### Step 4 — Verify, in this order

1. **Password reset** — `/forgot-password` for a real account. The email must arrive **from the
   company's slug address on `ezcontractorbinder.com`**, not from `mail.app.supabase.io`.
2. **The log row**, which is P2:
   ```sql
   select created_at, email_type, status, recipient_email, sender_email, resend_message_id
   from email_logs where email_type like 'auth_%' order by created_at desc limit 10;
   ```
3. **A public sign-up** — must still receive "Confirm your EZ Contractor Binder account", and must
   still be unable to sign in until it is clicked. **This is the P3 guard**: if a public sign-up
   stops requiring confirmation, stop and roll back.
4. **An invited sign-up** — invite an address, accept it, and the invitee should be able to sign in
   **immediately, with no confirmation email**. One `invite` row in `email_logs` and **no**
   `auth_signup_confirmation` row for that address.

### Rollback

Turn the hook **off** in the same dashboard screen. GoTrue reverts to its built-in mailer instantly;
no deploy and no migration are involved. P4 and P5 are unaffected either way.

### What must NOT be changed

- **`mailer_autoconfirm` stays `false`.** P3 is implemented per-message precisely so this flag never
  moves. Turning it on skips confirmation for public sign-ups too, which is the weakening the ruling
  refused.
- `rate_limit_email_sent` needs no change. Once GoTrue is not sending, it does not bind.
- The `mailer_templates_*` / `mailer_subjects_*` values become dead once the hook is on. Leave them:
  they are the fallback if the hook is ever disabled.

---

## §4 — What is proven, and what is owed

**Proven now** — `s160-auth-email.test.tsx` (15), `s160-auth-email.live.ts` (13),
`s160-invite-send.live.ts` (8):

- the verify URL is built from `token_hash` and never from the typeable OTP, and passes GoTrue's own
  `redirect_to` through unchanged so the `uri_allow_list` check still means something;
- an invited signup is confirmed and **no** email is sent; a forged or mismatched token is not;
- a recovery send goes out from the **tenant's aligned address** and writes an `auth_recovery` row;
- **a failed send is still logged, as failed** — the case S159 found nobody could see;
- a user with no profile still gets their email and only the log is skipped;
- an unrecognised action type is refused loudly rather than silently dropped;
- the TS union, the runtime map and the migration declare the same six types — the seam that shipped
  `mention` half-done at S126;
- the invite send really reaches Resend and really gets a message id back.

**Also proven, and it nearly was not.** The ROUTE — including the Standard Webhooks signature layer —
is covered in the committed suite, because `svix` can *sign* a payload exactly as Supabase does:

| Request | Answer |
| --- | --- |
| no signature headers | **400** |
| present but wrong signature | **401**, with no detail about why |
| correctly signed | **200**, with the outcome in the body |
| secret pasted **with** the `v1,` prefix | **200** — both forms accepted |

Verified against a running server once at S160, then made permanent as four tests that need no
server and no database. It was tempting to file the whole route as "unverifiable until the switch is
thrown"; only one thing actually is.

**Owed to §3, and not claimed here:** that GoTrue really calls this URL, and that its live payload
matches the shape assumed. Neither can be established from a Codespace. **Step 4 is the test**, and
its most important line is #3 — a public sign-up must still require confirmation.

---

## §5 — The one check still outstanding from S159

Production's `email_logs` for `email_type = 'invite'` — S159 §6. Left for Josh by his own
instruction. It is independent of everything here.
