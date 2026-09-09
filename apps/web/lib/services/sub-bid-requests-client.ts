'use client';

// Estimates redesign 19c — the internal side of the tokenised reply surface.
// Creating a request INSERTs estimate_sub_bid_requests (RLS: manager, draft,
// PM-own); the sub then replies at /bid/[token] and it lands as an
// estimate_sub_bids row (submit_sub_bid_reply). The token is a DB default — the
// service NEVER supplies it (a client-chosen token would weaken the only guard
// on a public surface).

import { createClient } from '@/lib/supabase-browser';

export interface SubBidRequestRow {
  id: string;
  line_item_id: string;
  subcontractor_id: string;
  token: string;
  status: string;
  expires_at: string;
  sent_at: string | null;
  submitted_at: string | null;
  sub_bid_id: string | null;
}

export type SubBidReplyMode = 'link' | 'email';

export interface CreateSubBidRequestInput {
  estimateId: string;
  lineItemId: string;
  subcontractorId: string;
  scopeText?: string | null;
  message?: string | null;
  allowanceAmount?: number | null;
  bidsDueDate?: string | null;
  workStartsDate?: string | null;
  siteVisitDate?: string | null;
  /** How the sub replies (§1.6): 'link' = the tokenised page, 'email' = they
   *  email back and you enter it manually. Defaults to 'link'. */
  replyMode?: SubBidReplyMode;
  /** Days until the link expires (default 14). */
  expiresInDays?: number;
}

type Result = { success: boolean; error?: string; token?: string };

/** The public reply URL for a request token. */
export function bidReplyUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/bid/${token}`;
}

export async function createSubBidRequest(input: CreateSubBidRequestInput): Promise<Result> {
  const supabase = createClient();
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + (input.expiresInDays ?? 14));

  // company_id/created_by/updated_by and token are DB defaults. Do NOT set token.
  const { data, error } = await supabase
    .from('estimate_sub_bid_requests')
    .insert({
      estimate_id: input.estimateId,
      line_item_id: input.lineItemId,
      subcontractor_id: input.subcontractorId,
      scope_text: input.scopeText ?? null,
      message: input.message ?? null,
      allowance_amount: input.allowanceAmount ?? null,
      reply_mode: input.replyMode ?? 'link',
      bids_due_date: input.bidsDueDate ?? null,
      work_starts_date: input.workStartsDate ?? null,
      site_visit_date: input.siteVisitDate ?? null,
      expires_at: expires.toISOString(),
    })
    .select('token')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, token: data.token };
}

/** Requests already sent for an estimate (newest first), to show status chips. */
export async function listSubBidRequests(estimateId: string): Promise<SubBidRequestRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('estimate_sub_bid_requests')
    .select('id, line_item_id, subcontractor_id, token, status, expires_at, sent_at, submitted_at, sub_bid_id')
    .eq('estimate_id', estimateId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  return (data ?? []) as SubBidRequestRow[];
}

/**
 * S107 — SEND (or re-send) a bid request by email.
 *
 * ⚠️ THE TOKEN IS NOT REGENERATED. A re-send reuses it [RULED], so a link a sub
 * already has — and may be mid-upload against — never dies because the estimator
 * clicked send twice. The route enforces the same rule; this is only its caller.
 *
 * The route, not this function, owns the floor and the origin guard: it refuses
 * to send at all when `NEXT_PUBLIC_APP_URL` is unset, because a relative
 * `/bid/<token>` in an email is a dead link and an email cannot be unsent.
 */
export async function sendSubBidRequest(
  estimateId: string,
  requestId: string
): Promise<{ success: boolean; error?: string; to?: string }> {
  const res = await fetch(
    `/api/estimates/${estimateId}/bid-requests/${requestId}/send`,
    { method: 'POST' }
  );
  const body = (await res.json().catch(() => ({}))) as { error?: string; to?: string };
  if (!res.ok) return { success: false, error: body.error ?? `Send failed (${res.status})` };
  return { success: true, to: body.to };
}
