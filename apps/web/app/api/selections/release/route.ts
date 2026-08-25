import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { releaseSelections } from '@/lib/services/selection-lifecycle-service';
import { sendSelectionsReleasedEmail } from '@/lib/services/selection-email';

// S173 Job 3 — Release Selections: N pending selections out in ONE action.
// The batch is a DELIVERY mechanism, not a signing unit — one signature per
// selection, partial batches supported (see releaseSelections). Each release
// is individually gated by the caller's RLS UPDATE inside offerSelection; a
// refusal on one id does not un-release the others, and the per-id results go
// back so the UI can say exactly which ones did not go.
//
// [S174 #1] AND IT NOW ACTUALLY DELIVERS. Josh: *"I have not received the
// selections."* He hadn't: this route flipped the rows and mailed nobody. The
// send is `sendSelectionsReleasedEmail` — ONE message covering the whole
// released set, because the batch IS the delivery unit (the same ruling that
// keeps the signature per-selection). Only the ids that actually released are
// mailed; a refused one must not appear in a list the client is asked to act on.

const BodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });

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

  const { results } = await releaseSelections(supabase, parsed.data.ids);
  const failed = results.filter((r) => !r.success);
  if (failed.length) {
    console.error('[selections/release] partial refusal', failed.map((f) => `${f.id}: ${f.error}`).join('; '));
  }

  const released = results.filter((r) => r.success).map((r) => r.id);
  if (!released.length) return NextResponse.json({ results, emailed: false, emailError: null });

  // The project is read from the released rows, not taken from the request —
  // a batch spanning two projects would otherwise mail one client about the
  // other's selections. It cannot span two today (the tab posts one project's
  // ids), and this route must not be the place that assumption is load-bearing.
  const { data: rows } = await supabase
    .from('selections')
    .select('id, project_id')
    .in('id', released);
  const byProject = new Map<string, string[]>();
  for (const r of rows ?? []) {
    byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r.id]);
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const sends = await Promise.all(
    [...byProject.entries()].map(([projectId, ids]) =>
      sendSelectionsReleasedEmail(supabase, { projectId, selectionIds: ids, origin })
    )
  );
  const emailError = sends.find((s) => !s.emailed)?.error ?? null;
  if (emailError) {
    console.error('[selections/release] email not delivered', { released, message: emailError });
  }

  // 200 either way, and for the same reason the CO send route does it: the
  // selections ARE released and the portal WILL show them. `emailed` is what
  // the screen must reflect — see selection-email.ts's header.
  return NextResponse.json({ results, emailed: sends.every((s) => s.emailed), emailError });
}
