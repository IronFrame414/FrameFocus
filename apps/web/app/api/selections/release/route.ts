import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { releaseSelections } from '@/lib/services/selection-lifecycle-service';

// S173 Job 3 — Release Selections: N pending selections out in ONE action.
// The batch is a DELIVERY mechanism, not a signing unit — one signature per
// selection, partial batches supported (see releaseSelections). Each release
// is individually gated by the caller's RLS UPDATE inside offerSelection; a
// refusal on one id does not un-release the others, and the per-id results go
// back so the UI can say exactly which ones did not go.

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
  return NextResponse.json({ results });
}
