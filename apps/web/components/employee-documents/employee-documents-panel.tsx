'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadBatchList } from '@/components/uploads/upload-batch-list';
import { hasUnfinished, useUploadBatches } from '@/lib/uploads/use-upload-batches';
import {
  employeeDocumentUrl,
  softDeleteEmployeeDocument,
  uploadEmployeeDocument,
  type EmployeeDocument,
} from '@/lib/services/employee-documents-client';
import { useConfirm, useAlert } from '@/components/confirm/confirm-provider';

// S118 item 16 — a person's documents, for Owner/Admin (the page gates the
// route; the database gates every read and write, 20262060000000).
// Uploads go through the shared queue (runUploadBatch + UploadBatchList,
// #2-s180u) — not a bespoke upload path.

export function EmployeeDocumentsPanel({
  companyId,
  memberId,
  personName,
  documents,
}: {
  companyId: string;
  memberId: string;
  personName: string;
  documents: EmployeeDocument[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const input = useRef<HTMLInputElement>(null);
  const batches = useUploadBatches();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const out = await batches.start('docs', files, (f) =>
      uploadEmployeeDocument(f, { companyId, memberId })
    );
    if (!hasUnfinished(out)) batches.clear('docs');
    router.refresh();
  }

  async function retry() {
    const out = await batches.retry('docs');
    if (!hasUnfinished(out)) batches.clear('docs');
    router.refresh();
  }

  async function open(doc: EmployeeDocument) {
    const url = await employeeDocumentUrl(doc.file_path);
    if (!url) {
      void alert('This document could not be opened.');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  async function remove(doc: EmployeeDocument) {
    const ok = await confirm(`Move "${doc.file_name}" to trash? It is kept, not destroyed.`);
    if (!ok) return;
    setBusyId(doc.id);
    const r = await softDeleteEmployeeDocument(doc.id);
    setBusyId(null);
    if (!r.success) void alert(`Could not remove it: ${r.error}`);
    router.refresh();
  }

  return (
    <section
      className="mt-6 rounded-lg border border-gray-200 bg-white p-4"
      data-testid="employee-docs"
    >
      {/* ⚠️ RULED [Josh, 2026-09-29]: at the TOP of the upload area, NOT dismissible,
          so nobody files a disciplinary note believing it is private. */}
      <div
        role="note"
        data-testid="employee-docs-notice"
        className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
      >
        {personName} can see everything filed here. Do not file anything you would not show them.
      </div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Documents</h2>
        <button
          type="button"
          data-testid="employee-docs-add"
          disabled={batches.anyBusy}
          onClick={() => input.current?.click()}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {batches.anyBusy ? 'Uploading…' : 'Add documents'}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          data-testid="employee-docs-input"
          className="hidden"
          onChange={(e) => void onPick(e)}
        />
      </div>
      <UploadBatchList
        items={batches.items('docs')}
        busy={batches.busy('docs')}
        onRetry={() => void retry()}
        testId="employee-docs-batch"
      />
      {documents.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="employee-docs-empty">
          Nothing filed yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between py-2 text-sm"
              data-testid="employee-doc"
            >
              <span className="truncate">{d.file_name}</span>
              <span className="flex gap-3">
                <button
                  type="button"
                  className="text-blue-700 hover:underline"
                  onClick={() => void open(d)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="text-red-700 hover:underline disabled:opacity-50"
                  disabled={busyId === d.id}
                  onClick={() => void remove(d)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
