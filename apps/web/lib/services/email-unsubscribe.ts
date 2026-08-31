import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

// ============================================================================
// Email §3 — class-scoped unsubscribe (migration 20261060000000).
//
// Exactly three of the 25 email types are in scope — reminder, co_reminder,
// invoice_reminder — the recurring class. The 21 transactional types get
// nothing (a recipient cannot opt out of being told their contract was
// signed), and retention_warning is RULED out of scope: it is the only channel
// warning of permanent deletion, and it is finite — three messages, then the
// account is resubscribed or deleted.
//
// THE TOKEN IS STATELESS: HMAC-SHA256 over (scope, companyId, email) under
// UNSUBSCRIBE_TOKEN_SECRET. No row exists until the recipient acts, so there
// is nothing to store at send time and nothing that expires — an unsubscribe
// link in a months-old reminder must still work. The secret is its own env
// var, NOT CRON_SECRET, precisely because CRON_SECRET rotates (it did in the
// deletion sweep) and rotation must not invalidate links already in inboxes.
//
// MISSING SECRET DEGRADES SOFTLY AND LOUDLY: senders omit the headers (mail
// still goes; console.error names the gap); the endpoint refuses every token.
// Compare the send gate, which fails CLOSED — consent plumbing being
// unconfigured must not stop an invoice going out, but it must never pass a
// token it cannot verify.
// ============================================================================

export type UnsubscribeScope = 'reminders';

export interface UnsubscribeClaim {
  companyId: string;
  email: string;
  scope: UnsubscribeScope;
}

const TOKEN_VERSION = 'v1';

function secret(): string | null {
  const s = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  return s && s.trim() !== '' ? s : null;
}

function mac(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

/** Null when UNSUBSCRIBE_TOKEN_SECRET is unset — callers omit headers, loudly. */
export function mintUnsubscribeToken(claim: UnsubscribeClaim): string | null {
  const key = secret();
  if (!key) {
    console.error(
      '[email-unsubscribe] UNSUBSCRIBE_TOKEN_SECRET is not set — sending WITHOUT List-Unsubscribe headers'
    );
    return null;
  }
  const payload = `${TOKEN_VERSION}:${claim.scope}:${claim.companyId}:${claim.email.toLowerCase()}`;
  return `${Buffer.from(payload).toString('base64url')}.${mac(payload, key)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeClaim | null {
  const key = secret();
  if (!key) return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  let payload: string;
  try {
    payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const given = token.slice(dot + 1);
  const expected = mac(payload, key);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [version, scope, companyId, ...emailParts] = payload.split(':');
  const email = emailParts.join(':'); // an email may not contain ':' but never truncate
  if (version !== TOKEN_VERSION || scope !== 'reminders' || !companyId || !email) return null;
  return { companyId, email, scope };
}

/**
 * The RFC 8058 pair. `List-Unsubscribe-Post: List-Unsubscribe=One-Click` is
 * what lets Gmail unsubscribe with a session-free POST to the same URL.
 */
export function buildUnsubscribeHeaders(claim: UnsubscribeClaim): Record<string, string> | null {
  const token = mintUnsubscribeToken(claim);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!token || !appUrl) {
    if (!appUrl) {
      console.error(
        '[email-unsubscribe] NEXT_PUBLIC_APP_URL is not set — sending WITHOUT List-Unsubscribe headers'
      );
    }
    return null;
  }
  return {
    'List-Unsubscribe': `<${appUrl}/api/email/unsubscribe/${token}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Idempotent — a second click upserts onto the unique key and changes nothing. */
export async function recordEmailUnsubscribe(
  admin: SupabaseClient<Database>,
  claim: UnsubscribeClaim,
  source: string
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await admin.from('email_unsubscribes').upsert(
    {
      company_id: claim.companyId,
      email: claim.email.toLowerCase(),
      scope: claim.scope,
      source,
    },
    { onConflict: 'company_id,email,scope', ignoreDuplicates: true }
  );
  return { success: !error, error: error?.message ?? null };
}

export async function isEmailUnsubscribed(
  admin: SupabaseClient<Database>,
  companyId: string,
  email: string,
  scope: UnsubscribeScope
): Promise<boolean> {
  // Existence probe — any matching row answers it, no ordering needed (S165 §3).
  const { data } = await admin
    .from('email_unsubscribes')
    .select('id')
    .eq('company_id', companyId)
    .eq('email', email.toLowerCase())
    .eq('scope', scope)
    .limit(1);
  return (data ?? []).length > 0;
}
