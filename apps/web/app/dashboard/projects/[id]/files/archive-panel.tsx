'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteProject } from '@/lib/services/projects-client';

// The project archive flow [storage-archive-ai-spec §4, RULED]:
// request → background build (⚠️ ~5 minutes worst case before it STARTS —
// §S6 — so honest waiting copy, never a spinner implying request-scale
// progress) → download links (24h, Q6) → ⚠️ ONLY THEN the delete prompt,
// which warns to CHECK THE ZIP FIRST and says irreversible. Nothing is
// automatic; the archive never deletes anything.

type ArchiveState =
  | { state: 'none' }
  | { state: 'pending' | 'running' | 'failed' | 'expired'; id?: string; error?: string | null }
  | {
      state: 'complete';
      id: string;
      expiresAt: string | null;
      parts: Array<{ name: string; url: string }>;
    };

export function ArchivePanel({
  projectId,
  canArchive,
  role,
}: {
  projectId: string;
  canArchive: boolean;
  /** deleteProject's service-layer check wants the role (the #82 precedent). */
  role: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ArchiveState>({ state: 'none' });
  const [requested, setRequested] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [armDelete, setArmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/archive`);
    if (res.ok) setStatus((await res.json()) as ArchiveState);
  }, [projectId]);

  useEffect(() => {
    refresh();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  useEffect(() => {
    const building = status.state === 'pending' || status.state === 'running';
    if (building && !timer.current) {
      timer.current = setInterval(refresh, 20_000);
    } else if (!building && timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, [status.state, refresh]);

  if (!canArchive) return null;

  async function request() {
    setError(null);
    setRequested(true);
    const res = await fetch(`/api/projects/${projectId}/archive`, { method: 'POST' });
    if (!res.ok) {
      setError('Could not start the archive. Try again.');
      setRequested(false);
      return;
    }
    await refresh();
  }

  async function runDelete() {
    setDeleting(true);
    const result = await deleteProject(projectId, role);
    if (!result.success) {
      setError(result.error ?? 'Delete failed.');
      setDeleting(false);
      return;
    }
    router.push('/dashboard/projects');
  }

  const building = status.state === 'pending' || status.state === 'running';

  return (
    <div className="mt-8 rounded-xl border border-gray-200 p-5 text-sm">
      <p className="font-semibold text-gray-900">Project archive</p>
      <p className="mt-1 text-gray-600">
        A ZIP of every file in this project — including Trash, in its own folder — organised the
        way your categories are.
      </p>

      {error && <p className="mt-2 text-red-700">{error}</p>}

      {status.state === 'none' && !requested && (
        <button
          onClick={request}
          className="mt-3 rounded-lg bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-800"
        >
          Build archive
        </button>
      )}

      {building && (
        <p className="mt-3 text-gray-700">
          <strong>Building your archive.</strong> This runs in the background and can take a few
          minutes to start — the download links will appear here. You can leave this page.
        </p>
      )}

      {status.state === 'failed' && (
        <p className="mt-3 text-red-700">
          The archive failed{'error' in status && status.error ? `: ${status.error}` : ''}. You
          can try again.
          <button onClick={request} className="ml-2 underline">
            Rebuild
          </button>
        </p>
      )}

      {(status.state === 'expired' ||
        (status.state === 'complete' && status.parts.length === 0)) && (
        <p className="mt-3 text-gray-700">
          The last archive&apos;s links have expired (they last 24 hours).
          <button onClick={request} className="ml-2 underline">
            Build a fresh one
          </button>
        </p>
      )}

      {status.state === 'complete' && status.parts.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-gray-700">
            Ready. Links are valid for <strong>24 hours</strong> — after that, rebuild.
            {status.parts.length > 1 &&
              ' The archive is split into parts; download all of them — each opens on its own.'}
          </p>
          <ul className="list-disc pl-5">
            {status.parts.map((p) => (
              <li key={p.name}>
                <a
                  href={p.url}
                  className="underline text-blue-700"
                  onClick={() => setDownloaded(true)}
                >
                  {p.name}
                </a>
              </li>
            ))}
          </ul>

          {downloaded && !armDelete && (
            <div className="mt-4 border-t border-gray-200 pt-3">
              <p className="text-gray-700">
                Downloaded it? If you archived this project to free storage space, you can now
                delete the project.
              </p>
              <button
                onClick={() => setArmDelete(true)}
                className="mt-2 rounded-lg border border-red-300 px-4 py-2 font-medium text-red-700 hover:bg-red-50"
              >
                Delete this project…
              </button>
            </div>
          )}

          {armDelete && (
            <div className="mt-4 rounded-lg border-2 border-red-300 bg-red-50 p-4">
              <p className="font-semibold text-red-800">
                ⚠️ Check the ZIP first. Open it and make sure everything you need is inside.
              </p>
              <p className="mt-1 text-red-800">
                Deleting the project is <strong>irreversible</strong> — its files, records and
                history go with it, and there is no way back after the archive links expire.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => setArmDelete(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2"
                >
                  Keep the project
                </button>
                <button
                  onClick={runDelete}
                  disabled={deleting}
                  className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'I checked the ZIP — delete the project'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
