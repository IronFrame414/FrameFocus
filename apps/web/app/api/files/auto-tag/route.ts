import { NextResponse } from 'next/server';
import { autoTagFile } from '@/lib/services/ai-tagging';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const fileId = body?.fileId;

  if (!fileId || typeof fileId !== 'string') {
    return NextResponse.json({ success: false, reason: 'missing_file_id' }, { status: 400 });
  }

  const result = await autoTagFile(fileId);
  return NextResponse.json(result);
}
