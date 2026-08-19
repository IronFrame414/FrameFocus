import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { brand } from '@/lib/brand';
import {
  SENDING_DOMAIN,
  buildSenderAddress,
  logEmail,
  sendEmail,
  type EmailType,
} from '@/lib/services/email-service';
import { AuthEmail, type AuthEmailKind } from '@/lib/email/templates/auth-email';

// ===========================================================================
// P1 + P2 + P3 [S160] — Supabase Auth's email, delivered by us.
// ===========================================================================
//
// THE PROBLEM, from `S159-invite-email-investigation.md` §4. Four surfaces —
// sign-up, INVITE ACCEPTANCE, forgot-password and the team page's reset — call
// GoTrue, which on production has `smtp_host: null`. So they went out over
// Supabase's built-in shared mailer: no SPF/DKIM/DMARC alignment to
// `ezcontractorbinder.com`, a project-wide cap of **2 emails per hour**, and no
// `email_logs` row. Meanwhile every email the app composes itself has gone over
// Resend on the aligned domain since S135.
//
// ---------------------------------------------------------------------------
// ⚠️ THE SEND EMAIL HOOK, NOT CUSTOM SMTP — and the reason is P2
// ---------------------------------------------------------------------------
// Both routes fix deliverability. Only one fixes the invisibility.
//
//   * CUSTOM SMTP — point GoTrue at Resend's SMTP relay. Two config fields, no
//     code. GoTrue still composes the email from its own templates, still
//     decides the From address, and **still tells us nothing**: there is no
//     moment at which our code runs, so there is nowhere to call `logEmail()`
//     from. P2 would need its own plumbing — a Resend webhook correlation by
//     recipient and subject, which is guesswork.
//   * SEND EMAIL HOOK — GoTrue POSTs the payload here and sends nothing itself.
//     Our code renders, calls `sendEmail()` and calls `logEmail()`. **P2 falls
//     out of P1 for free**, which is exactly what Josh asked to be preferred,
//     and it is also what makes P3 possible at all (below).
//
// The cap goes away as a CONSEQUENCE rather than being raised:
// `rate_limit_email_sent` governs GoTrue's own mailer, and once GoTrue is not
// sending, Resend's limits are the only ones left.
//
// ---------------------------------------------------------------------------
// ⚠️ P3 — AN INVITED USER IS CONFIRMED HERE, AND `mailer_autoconfirm` IS NOT
//        TOUCHED. [RULED Josh, S160]
// ---------------------------------------------------------------------------
// The ruling is that INVITED users do not confirm their email. The obvious
// implementation — flipping `mailer_autoconfirm` to true — is the wrong one and
// was explicitly refused: that flag is PROJECT-WIDE, so it would also skip
// confirmation for PUBLIC sign-ups, where the address is self-asserted and
// nobody has vouched for it. That is a real weakening and is not what was
// ruled.
//
// So the distinction is drawn HERE, per message, where the two cases are
// actually distinguishable:
//
//   · an INVITED signup  → confirm the user, send nothing, return 200.
//   · a PUBLIC signup    → send the confirmation exactly as before, over Resend.
//
// **Why an invited address is already proven, in one step.** `handle_new_user()`
// raises `check_violation` when `get_invitation_for_signup()` cannot resolve the
// token — status pending, not deleted, `expires_at > now()`. A raise inside the
// `auth.users` insert means **no auth user is created**, so no hook fires. The
// mere existence of a user carrying an `invitation_token` is therefore already
// proof the trigger validated it. Josh's reasoning, recorded: *"an invitee
// arrived through a link only they could have received, at an address the
// inviter typed. The invitation already establishes what the confirmation
// re-proves, and it is the step most likely to fail."*
//
// **The token is re-checked anyway** — see `invitedCompanyFor()`. `user_metadata`
// is user-controlled, and a public signup can put any string in it. The argument
// above depends on a trigger that this repository did not create until S135 and
// that production had configured BY HAND (`20260914000000` §1). A check that
// costs one indexed lookup is not worth skipping on the strength of "the trigger
// would have stopped them".

/**
 * GoTrue's `email_action_type`. `email_change_current` / `email_change_new` are
 * the two halves of a secure email change (`mailer_secure_email_change_enabled`
 * is true on production), and both are real values on the wire.
 */
export type AuthEmailAction =
  | 'signup'
  | 'recovery'
  | 'magiclink'
  | 'invite'
  | 'email_change'
  | 'email_change_current'
  | 'email_change_new'
  | 'reauthentication';

/** The Send Email Hook payload, as GoTrue posts it. */
export interface AuthEmailPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown> | null;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

export interface AuthEmailOutcome {
  /** What happened, for the route's response body and for the tests. */
  action: AuthEmailAction | 'unknown';
  /** True when P3 short-circuited: user confirmed, no email sent. */
  autoConfirmedInvite: boolean;
  sent: boolean;
  logged: boolean;
  error: string | null;
}

/**
 * `email_action_type` → the `email_types` row it logs under, and the copy it
 * renders. `email_change_current` and `email_change_new` deliberately collapse
 * onto one type: they are two messages from ONE user action, and splitting them
 * would make `email_logs` imply two different things happened.
 */
const ACTIONS: Record<
  AuthEmailAction,
  { emailType: EmailType; kind: AuthEmailKind }
> = {
  signup: { emailType: 'auth_signup_confirmation', kind: 'confirm_signup' },
  recovery: { emailType: 'auth_recovery', kind: 'recover_password' },
  magiclink: { emailType: 'auth_magic_link', kind: 'magic_link' },
  invite: { emailType: 'auth_invite', kind: 'auth_invite' },
  email_change: { emailType: 'auth_email_change', kind: 'change_email' },
  email_change_current: { emailType: 'auth_email_change', kind: 'change_email' },
  email_change_new: { emailType: 'auth_email_change', kind: 'change_email' },
  reauthentication: { emailType: 'auth_reauthentication', kind: 'reauthenticate' },
};

/**
 * The verification URL GoTrue would have put in its own template.
 *
 * ⚠️ BUILT FROM `token_hash`, NEVER FROM `token`. `token` is the raw 6-digit (or
 * 8-digit — `mailer_otp_length` is 8 on production) OTP a human types;
 * `token_hash` is what `/auth/v1/verify` accepts in a link. Swapping them
 * produces a link that always fails verification, and it fails at the far end,
 * on someone else's screen, with no error anywhere near this code.
 *
 * `redirect_to` is GoTrue's own — it comes from the client's `emailRedirectTo`
 * and has ALREADY been checked against the project's `uri_allow_list`. Passing
 * it through unchanged is what keeps that check meaningful; constructing our own
 * destination here would route around it.
 */
export function buildVerifyUrl(
  supabaseUrl: string,
  emailData: AuthEmailPayload['email_data'],
  /** The `email_change_new` half verifies with the NEW address's hash. */
  useNewToken = false
): string {
  const hash =
    useNewToken && emailData.token_hash_new ? emailData.token_hash_new : emailData.token_hash;
  const base = supabaseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    token: hash,
    type: emailData.email_action_type,
  });
  if (emailData.redirect_to) params.set('redirect_to', emailData.redirect_to);
  return `${base}/auth/v1/verify?${params.toString()}`;
}

/**
 * The company whose identity this email goes out under, and whose `company_id`
 * the log row needs.
 *
 * ⚠️ `email_logs.company_id` IS NOT NULL [LIVE], which is why this is resolved
 * rather than defaulted. Every real case has one by the time the hook runs — the
 * `auth.users` trigger creates the profile (and, on the owner path, the company)
 * INSIDE the insert, so the row exists before GoTrue gets as far as sending.
 * When it somehow does not, the email still goes out and only the LOG is
 * skipped: see `deliver()`. An unsent email is a user-visible failure; an
 * unlogged one is a bookkeeping gap, and trading the first for the second would
 * be the wrong way round.
 */
async function senderFor(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<{ companyId: string; from: string } | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!profile) return null;

  const companyId = (profile as { company_id: string }).company_id;
  const { data: company } = await admin
    .from('companies')
    .select('name, slug')
    .eq('id', companyId)
    .maybeSingle();
  if (!company) return null;

  const co = company as { name: string; slug: string };
  return { companyId, from: buildSenderAddress(co) };
}

/**
 * Did this user arrive on a real invitation? Returns the invitation's company
 * id, or null.
 *
 * The token is read from `user_metadata` — where `accept-invite.tsx` puts it and
 * where `handle_new_user()` reads it from — and then CHECKED against the row, on
 * both token and address. See the header for why the check is kept even though
 * the trigger has already enforced it.
 *
 * `status` is deliberately NOT filtered. By the time this runs the trigger has
 * already set it to `accepted`, so requiring `pending` would match nothing and
 * silently turn P3 off — a bug that would look exactly like "the ruling was
 * never implemented".
 */
export async function invitedCompanyFor(
  admin: SupabaseClient<Database>,
  user: AuthEmailPayload['user']
): Promise<string | null> {
  const raw = user.user_metadata?.invitation_token;
  if (typeof raw !== 'string' || raw.length === 0) return null;

  const { data } = await admin
    .from('invitations')
    .select('id, company_id, email')
    .eq('token', raw)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!data) return null;

  const inv = data as { company_id: string; email: string };
  // The address must match the one the inviter typed. Without this, a token
  // seen anywhere could confirm an address of the holder's choosing.
  if (inv.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return null;

  return inv.company_id;
}

/**
 * Handle one Send Email Hook payload: confirm-and-skip, or render, send and log.
 *
 * NEVER THROWS. GoTrue treats a non-2xx as a failed auth operation, so a thrown
 * error here does not merely lose an email — it fails the user's sign-up or
 * password reset outright. Everything is reported through the return value and
 * the caller answers 200 whenever the payload was authentic.
 */
export async function handleAuthEmail(
  admin: SupabaseClient<Database>,
  payload: AuthEmailPayload,
  supabaseUrl: string
): Promise<AuthEmailOutcome> {
  const actionRaw = payload.email_data.email_action_type;
  const action = (actionRaw in ACTIONS ? actionRaw : 'unknown') as AuthEmailAction | 'unknown';

  // ── P3 ────────────────────────────────────────────────────────────────────
  if (action === 'signup') {
    const invitedCompanyId = await invitedCompanyFor(admin, payload.user);
    if (invitedCompanyId) {
      const { error } = await admin.auth.admin.updateUserById(payload.user.id, {
        email_confirm: true,
      });
      if (error) {
        // ⚠️ FALL THROUGH TO SENDING, do not fail. A user who is neither
        // confirmed NOR sent a confirmation link cannot sign in and has no way
        // to fix it themselves — strictly worse than the behaviour this
        // replaces. The confirmation email is the safety net for P3's own
        // failure.
        console.error('auth email hook: invited auto-confirm failed; sending confirmation', {
          route: 'POST /api/auth/send-email',
          user_id: payload.user.id,
          message: error.message,
        });
      } else {
        return {
          action,
          autoConfirmedInvite: true,
          sent: false,
          logged: false,
          error: null,
        };
      }
    }
  }

  if (action === 'unknown') {
    // A GoTrue version that grows a new action type must not silently drop the
    // email — that is the S159 defect in a new place. Refused loudly instead, so
    // it surfaces as a failed auth operation rather than as nothing at all.
    console.error('auth email hook: unrecognised email_action_type', {
      route: 'POST /api/auth/send-email',
      email_action_type: actionRaw,
    });
    return {
      action,
      autoConfirmedInvite: false,
      sent: false,
      logged: false,
      error: `Unrecognised email_action_type "${actionRaw}"`,
    };
  }

  const { emailType, kind } = ACTIONS[action];
  const verifyUrl = buildVerifyUrl(
    supabaseUrl,
    payload.email_data,
    action === 'email_change_new'
  );

  const sender = await senderFor(admin, payload.user.id);
  // The platform fallback exists only for the case with no resolvable company.
  // It is a real, verified address on the same domain, so alignment holds even
  // here; what is lost is the tenant's name on the From line.
  const from = sender?.from ?? `${brand.name} <no-reply@${SENDING_DOMAIN}>`;
  const subject = subjectFor(kind);

  let messageId: string | null = null;
  let error: string | null = null;
  try {
    const result = await sendEmail({
      from,
      to: payload.user.email,
      subject,
      // ⚠️ NO `replyToCompanyId`. The S97 reply-to rule is for CLIENT-FACING
      // mail, so a client's reply reaches the contractor. These are
      // account-security messages to the account holder; pointing a reply at the
      // company owner's inbox would invite "I didn't request this" reports to
      // land somewhere that cannot act on them.
      react: AuthEmail({ kind, actionUrl: verifyUrl, token: payload.email_data.token }),
    });
    messageId = result.messageId;
    error = result.error;
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : 'Failed to send';
  }

  // ── P2 ────────────────────────────────────────────────────────────────────
  let logged = false;
  if (sender) {
    const id = await logEmail(admin, {
      company_id: sender.companyId,
      estimate_id: null,
      signing_session_id: null,
      resend_message_id: messageId,
      email_type: emailType,
      recipient_email: payload.user.email,
      sender_email: from,
      subject,
      status: error ? 'failed' : 'sent',
      metadata: { email_action_type: actionRaw, user_id: payload.user.id },
    });
    logged = id !== null;
  } else {
    // Named, because "no row appeared" must never be the only symptom again.
    console.error('auth email hook: no company for user; send NOT logged', {
      route: 'POST /api/auth/send-email',
      user_id: payload.user.id,
      email_action_type: actionRaw,
    });
  }

  return { action, autoConfirmedInvite: false, sent: error === null, logged, error };
}

/** Subjects, ours rather than GoTrue's — see `mailer_subjects_*` in §4.1. */
export function subjectFor(kind: AuthEmailKind): string {
  switch (kind) {
    case 'confirm_signup':
      return `Confirm your ${brand.name} account`;
    case 'recover_password':
      return `Reset your ${brand.name} password`;
    case 'magic_link':
      return `Your ${brand.name} sign-in link`;
    case 'change_email':
      return `Confirm your new ${brand.name} email address`;
    case 'reauthenticate':
      return `Your ${brand.name} verification code`;
    case 'auth_invite':
      return `You have been invited to ${brand.name}`;
  }
}
