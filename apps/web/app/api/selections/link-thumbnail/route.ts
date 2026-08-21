import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { brand } from '@/lib/brand';

// ============================================================================
// Option image path 2 of 4 — "paste a link that renders a thumbnail". [S171 s3]
//
// The browser cannot fetch an arbitrary third-party page (CORS), so this route
// does: GET the URL, take `og:image` (or the URL itself if it IS an image),
// download that image, store it under project-files and write a `files` row.
// The caller then sets `link_thumbnail_file_id` on the option.
//
// ⚠️ SSRF GUARD, deliberately crude and fail-closed: http(s) only; no literal
// loopback / link-local / RFC1918 hosts; 6s timeout; 4 MB cap; the final
// response must be an image. This does NOT resolve DNS to check for a name that
// points at a private address — a determined attacker with a DNS record could
// still reach an internal host. The route is owner/admin/PM only and the
// Codespace/Vercel network has nothing listening that a GET could harm; if
// that ever changes, resolve-and-check before fetching.
// ============================================================================

const BUCKET = 'project-files';
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 6000;
const MANAGER = new Set(['owner', 'admin', 'project_manager']);

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h === '::1' || h.startsWith('[::1]') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

async function fetchWithLimit(url: string, accept: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      // brand.name, never a literal — S136's brand-literals guard.
      headers: { accept, 'user-agent': `${brand.name}-link-preview/1.0` },
    });
  } finally {
    clearTimeout(t);
  }
}

function ogImageFrom(html: string, base: URL): string | null {
  const m =
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i.exec(html) ??
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (!m) return null;
  try {
    return new URL(m[1], base).toString();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!profile || !MANAGER.has(profile.role)) {
    console.error('[link-thumbnail] 403: role', profile?.role, 'is not owner/admin/PM');
    return NextResponse.json({ error: 'Only an owner, admin or project manager can add option links.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { url?: string; projectId?: string } | null;
  const raw = body?.url?.trim();
  const projectId = body?.projectId;
  if (!raw || !projectId) return NextResponse.json({ error: 'url and projectId are required.' }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'That is not a valid link.' }, { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:' || isBlockedHost(target.hostname)) {
    console.error('[link-thumbnail] 400: refused host', target.hostname);
    return NextResponse.json({ error: 'That link cannot be previewed.' }, { status: 400 });
  }
  // The caller must be able to see the project (RLS on projects decides).
  const { data: project } = await supabase.from('projects').select('id, company_id').eq('id', projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 403 });

  let imageUrl: string | null = null;
  try {
    const first = await fetchWithLimit(target.toString(), 'text/html,image/*;q=0.9,*/*;q=0.5');
    const ct = first.headers.get('content-type') ?? '';
    if (ct.startsWith('image/')) {
      imageUrl = target.toString();
    } else if (ct.includes('text/html')) {
      const html = (await first.text()).slice(0, 512 * 1024);
      imageUrl = ogImageFrom(html, target);
    }
  } catch (e) {
    console.error('[link-thumbnail] fetch failed', target.hostname, (e as Error).message);
    return NextResponse.json({ error: 'Could not reach that link.' }, { status: 502 });
  }
  if (!imageUrl) return NextResponse.json({ error: 'No preview image was found at that link.', noImage: true }, { status: 200 });

  let imgUrlObj: URL;
  try {
    imgUrlObj = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'No preview image was found at that link.', noImage: true }, { status: 200 });
  }
  if (isBlockedHost(imgUrlObj.hostname)) return NextResponse.json({ error: 'That link cannot be previewed.' }, { status: 400 });

  let bytes: Buffer;
  let mime: string;
  try {
    const res = await fetchWithLimit(imageUrl, 'image/*');
    mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!res.ok || !mime.startsWith('image/')) {
      return NextResponse.json({ error: 'The preview at that link is not an image.', noImage: true }, { status: 200 });
    }
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) return NextResponse.json({ error: 'The preview image is too large.' }, { status: 413 });
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) return NextResponse.json({ error: 'The preview image is too large.' }, { status: 413 });
    bytes = Buffer.from(ab);
  } catch (e) {
    console.error('[link-thumbnail] image fetch failed', imgUrlObj.hostname, (e as Error).message);
    return NextResponse.json({ error: 'Could not download the preview image.' }, { status: 502 });
  }

  // Stored with the SERVICE ROLE: the caller passed the role gate and the
  // project read above. client_visible=true is what lets the portal show it
  // (stage 7); a PM could not set that under files_insert_non_client, which is
  // the reason this write is not done with the user's session.
  const admin = getSupabaseAdmin();
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
  const fileName = `link-preview-${imgUrlObj.hostname}.${ext}`;
  const path = `${project.company_id}/${projectId}/${randomUUID()}-${fileName}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    console.error('[link-thumbnail] storage upload failed', upErr.message);
    return NextResponse.json({ error: 'Could not store the preview image.' }, { status: 500 });
  }
  const { data: row, error: insErr } = await admin
    .from('files')
    .insert({
      company_id: project.company_id,
      project_id: projectId,
      category: 'photos',
      file_name: fileName,
      file_path: path,
      file_size: bytes.byteLength,
      mime_type: mime,
      client_visible: true,
      created_by: user.id,
      updated_by: user.id,
      tags: ['selection-link-preview'],
    })
    .select('id')
    .single();
  if (insErr) {
    await admin.storage.from(BUCKET).remove([path]);
    console.error('[link-thumbnail] files insert failed', insErr.message);
    return NextResponse.json({ error: 'Could not record the preview image.' }, { status: 500 });
  }
  return NextResponse.json({ fileId: row.id, sourceImageUrl: imageUrl });
}
