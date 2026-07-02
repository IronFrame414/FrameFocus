import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { recordUnsubscribe } from '@/lib/services/signing-service';

// Spec 2 (4J J5/J8) — CAN-SPAM unsubscribe. GET (email links are
// GETs — locked build decision); renders a small confirmation page.
// Sets client_unsubscribed_at on the estimate so the reminder cron
// skips it.

function htmlPage(title: string, message: string): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Helvetica, Arial, sans-serif; background: #f3f4f6; margin: 0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 8px; padding: 40px; max-width: 420px;
            text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; color: #111827; margin: 0 0 12px; }
    p { font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const result = await recordUnsubscribe(admin, params.token);

  if (!result.success) {
    return htmlPage(
      'Link not recognized',
      'This unsubscribe link is not valid. No changes were made.'
    );
  }

  return htmlPage(
    'You are unsubscribed',
    `You will no longer receive reminder emails about this proposal${
      result.companyName ? ` from ${result.companyName}` : ''
    }. The proposal itself remains available through your signing link.`
  );
}
