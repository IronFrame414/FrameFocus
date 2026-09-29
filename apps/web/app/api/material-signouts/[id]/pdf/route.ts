import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { regenerateSignoutPdf } from '@/lib/services/material-signout-pdf-service';

// S118 item 11 — generate/regenerate a material sign-out's record PDF, called
// after the receiver signs and after the close. Mechanics mirror
// /api/deliveries/[id]/pdf. Authority: anyone who can READ the record (the six
// staff roles on a project they can view — RLS decides, below). The PDF is a
// rendering of what the record already says, so seeing the record is enough to
// render it; it changes nothing on the record except which file is current.
// Auth failures are 401 with their own message; "not found" means auth passed
// and RLS does not show the record (CLAUDE.md error rules).

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // RLS-scoped — cross-tenant, non-staff and not-on-project callers see nothing.
  const { data: record } = await supabase
    .from('material_signouts')
    .select('id, is_deleted')
    .eq('id', params.id)
    .maybeSingle();
  if (!record || record.is_deleted) {
    console.error(`[material-signouts/pdf] record ${params.id} not visible to user ${user.id}`);
    return NextResponse.json({ error: 'Sign-out not found' }, { status: 404 });
  }

  const { fileId, error } = await regenerateSignoutPdf(supabase, getSupabaseAdmin(), params.id);
  if (error) {
    console.error(`[material-signouts/pdf] generation failed for ${params.id}: ${error}`);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
  return NextResponse.json({ fileId });
}
