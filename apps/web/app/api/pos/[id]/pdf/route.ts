import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase-server';
import { loadPoPdfData } from '@/lib/po/po-pdf-data';
import { PoDocument } from '@/lib/po/po-template';

// PO module R-L4 — the PDF download half of "issue offers both". Reads ride
// the caller's session (RLS answers reach); any project-viewer who can read
// the PO can download it — a PO is cost, the broadly-visible tier (§1).

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data, error } = await loadPoPdfData(params.id);
  if (!data) {
    console.error(`[pos/pdf] ${params.id}: ${error}`);
    return NextResponse.json({ error: error ?? 'Not found' }, { status: 404 });
  }

  const buffer = await renderToBuffer(PoDocument({ data }));
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${data.poNumber.replace(/[^\w-]+/g, '_')}.pdf"`,
    },
  });
}
