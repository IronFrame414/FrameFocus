'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { FileRecord } from '@/lib/services/files';
import type { TagOption } from '@/lib/services/tag-options';
import FileRow from './file-row';
import {
  FilterChips,
  ListPageHeader,
  ListSearchInput,
  MetricStrip,
} from '@/components/list-screen/list-screen';
import type { Metric } from '@/components/list-screen/list-screen';
import { cardStyle, color, microLabelStyle, primaryButtonStyle } from '@/lib/theme';

// 14-anatomy [S105b item 5]. Project Files was a bespoke server-rendered table;
// this client wrapper gives it the shared anatomy (header → metric strip →
// filter chips + search → table card) so it matches the other list screens.
// FILL-5.3: this screen renders NO money — size (KB), date, category, tags only —
// so there is no financial floor to apply here.
export default function FilesList({
  files,
  projectId,
  activeTags,
  categoryLabels,
}: {
  files: FileRecord[];
  projectId: string;
  activeTags: TagOption[];
  categoryLabels: Record<string, string>;
}) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categoryOptions = useMemo(() => {
    const present = new Set<string>();
    for (const f of files) present.add(f.category);
    const chips = [...present].map((c) => ({ value: c, label: categoryLabels[c] ?? c }));
    return [{ value: 'all', label: 'All' }, ...chips];
  }, [files, categoryLabels]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (!q) return true;
      return f.file_name.toLowerCase().includes(q);
    });
  }, [files, categoryFilter, search]);

  const stripMetrics: Metric[] = [
    { label: 'Files', value: files.length },
    { label: 'Favorites', value: files.filter((f) => f.is_favorite).length },
    { label: 'Shared with client', value: files.filter((f) => f.client_visible).length },
  ];

  return (
    <div>
      <ListPageHeader
        title="Project Files"
        subtitle={`${files.length} file${files.length === 1 ? '' : 's'}`}
      >
        <ListSearchInput value={search} onChange={setSearch} placeholder="Search files…" />
        <Link
          href={`/dashboard/projects/${projectId}/files/trash`}
          style={{
            padding: '9px 14px',
            background: '#fff',
            border: `1px solid ${color.inputBorder}`,
            color: color.body,
            borderRadius: '9px',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Trash
        </Link>
        <Link href={`/dashboard/projects/${projectId}/files/upload`} style={primaryButtonStyle}>
          + Upload
        </Link>
      </ListPageHeader>

      <MetricStrip metrics={stripMetrics} />

      {categoryOptions.length > 2 && (
        <FilterChips
          options={categoryOptions}
          selected={categoryFilter}
          onSelect={setCategoryFilter}
        />
      )}

      {filteredFiles.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}>
          {files.length === 0
            ? 'No files uploaded yet.'
            : `No files${categoryFilter !== 'all' ? ` in "${categoryLabels[categoryFilter] ?? categoryFilter}"` : ''}${search.trim() ? ` matching "${search.trim()}"` : ''}.`}
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr
                style={{
                  backgroundColor: color.tableHeadBg,
                  borderBottom: `1px solid ${color.neutralBadgeBg}`,
                  textAlign: 'left',
                }}
              >
                <th style={{ ...microLabelStyle, padding: '10px 12px', width: '2rem' }}></th>
                <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Name</th>
                <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Category</th>
                <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Tags</th>
                <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Size</th>
                <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Uploaded</th>
                <th style={{ ...microLabelStyle, padding: '10px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  projectId={projectId}
                  activeTags={activeTags}
                  categoryLabel={categoryLabels[f.category] ?? f.category}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
