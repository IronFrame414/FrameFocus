import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateProposalPDF } from '@/lib/services/proposal-service';

// Spec 2 (4E) — POST { estimateId } → PDF buffer. Authenticated;
// the caller's RLS context decides which estimates are reachable
// (Owner/Admin company-wide, PM own only). Used by the preview
// page's Download button. E3: nothing is stored.

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { estimateId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.estimateId) {
    return NextResponse.json({ error: 'estimateId is required' }, { status: 400 });
  }

  const generated = await generateProposalPDF(supabase, body.estimateId);
  if (!generated) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(generated.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${generated.data.estimate.number}-proposal.pdf"`,
    },
  });
}
