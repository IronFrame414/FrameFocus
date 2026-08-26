import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { sendSelectionSpecificationsEmail } from '@/lib/services/selection-email';
import {
  specSheetFileName,
  storeSelectionSpecPdf,
} from '@/lib/services/selection-spec-pdf-service';

// ============================================================================
// [S175 stage 6] Generate & send the specifications sheet. Spec §7.3, §9.4.
// ============================================================================
//
// ONE ACTION, BOTH HALVES. Josh: *"Same sheet. Emailed to client and added to
// project files."* There is no "generate without sending" and no "send the last
// one" — a sheet that is filed but not sent, or sent but not filed, is the two
// copies disagreeing, which is the whole reason the artifact is replaced rather
// than versioned.
//
// ⚠️ THE ROLE GATE IS EXPLICIT AND IS NOT REDUNDANT WITH RLS. RLS decides what
// the caller may READ, and a foreman can read a project's selections perfectly
// legitimately (§4). What is being authorised here is different: filing a
// document as `client_visible` and mailing it to the client. §7.3 puts that at
// Owner/Admin/PM, and §9.2 shows the button to the same three.
//
// ⚠️ AND A SHEET WITH NOTHING ON IT IS REFUSED — in the SERVICE, before
// anything is written, not here after the fact. Q4.3 makes this approved-only,
// so a project with nothing approved renders a document listing nothing, and
// filing that would put an empty `client_visible` PDF in the client's portal
// under the company's name. `storeSelectionSpecPdf()` refuses it and this
// route surfaces the sentence; the template still renders the empty case, for
// a preview.
// ============================================================================

const BodySchema = z.object({ projectId: z.string().uuid() });

const GENERATORS = ['owner', 'admin', 'project_manager'];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const { projectId } = parsed.data;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();
  // 403 with its own message, never a fall-through to "not found" — a
  // permission failure must not be reported as a missing record (CLAUDE.md).
  if (!profile || !GENERATORS.includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only an owner, admin or project manager can send a specifications sheet.' },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const stored = await storeSelectionSpecPdf(supabase, admin, projectId);
  if (stored.error || !stored.buffer || !stored.data) {
    console.error('[selections/spec-sheet] generation failed', projectId, stored.error);
    return NextResponse.json(
      { error: stored.error ?? 'The specifications sheet could not be generated.' },
      { status: 409 }
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const sent = await sendSelectionSpecificationsEmail(supabase, {
    projectId,
    data: stored.data,
    pdf: stored.buffer,
    fileName: specSheetFileName(stored.data.project.name),
    origin,
  });
  if (!sent.emailed) {
    console.error('[selections/spec-sheet] email not delivered', projectId, sent.error);
  }

  // 200 either way: the sheet IS filed and IS visible in her portal, so a
  // broken email is a warning rather than a rollback — the doctrine the CO
  // send route states in its own words. `emailed` is what the screen renders.
  return NextResponse.json({
    fileId: stored.fileId,
    selectionCount: stored.data.selectionCount,
    emailed: sent.emailed,
    emailError: sent.error,
    recipient: sent.recipient,
  });
}
