import { NextResponse } from 'next/server';
import { getSignedUrl } from '@/lib/services/files';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  const url = await getSignedUrl(path, 3600);

  if (!url) {
    return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 });
  }

  return NextResponse.json({ url });
}