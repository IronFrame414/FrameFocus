'use client';

import { useState } from 'react';
import { useAssigneePicker } from '@/lib/assignee-picker';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PunchItem, PunchList } from '@/lib/services/punch-client';
import {
  completePunchItem,
  createPunchItem,
  createPunchList,
  deletePunchItem,
  deletePunchList,
  setRequirementToggles,
  updatePunchItemFields,
  verifyPunchItem,
} from '@/lib/services/punch-client';

interface PunchPanelProps {
  projectId: string;
  lists: PunchList[];
  members: { id: string; display_name: string; member_type: string }[];
  /** D-65 part 3 — `company_members.id` for this project's roster. */
  assignedMemberIds: string[];
  photos: { id: string; name: string }[];
  role: string;
}

const FOREMAN_PLUS = ['owner', 'admin', 'project_manager', 'foreman'];

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  padding: '1.25rem',
  marginBottom: '1rem',
};
const titleStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  marginBottom: '0.75rem',
};
const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};
const smallButton = (color: string, border: string): React.CSSProperties => ({
  padding: '0.25rem 0.625rem',
  fontSize: '0.75rem',
  color,
  backgroundColor: '#fff',
  border: `1px solid ${border}`,
  borderRadius: '0.375rem',
  cursor: 'pointer',
});

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#fee2e2', fg: '#991b1b' },
  in_progress: { bg: '#fef3c7', fg: '#92400e' },
  complete: { bg: '#dbeafe', fg: '#1e40af' },
  verified: { bg: '#dcfce7', fg: '#166534' },
};

export function PunchPanel({
  projectId,
  lists,
  members,
  assignedMemberIds,
  photos,
  role,
}: PunchPanelProps) {
  const router = useRouter();
  const canForeman = FOREMAN_PLUS.includes(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [addingToList, setAddingToList] = useState<string | null>(null);
  // Completion photo picks per item id
  const [photoPick, setPhotoPick] = useState<Record<string, string>>({});

  // New item form state
  const [itemTitle, setItemTitle] = useState('');
  const [itemLocation, setItemLocation] = useState('');
  const [itemTrade, setItemTrade] = useState('');
  // D-65 [S121] — the two-step picker, SHARED WITH /m via lib/assignee-picker.
  // `itemAssignee` is gone: the selection now lives in the shared hook, so the
  // partition and the switch-clears-the-pick rule cannot drift from mobile's.
  const picker = useAssigneePicker(members, assignedMemberIds);
  const [itemRefPhoto, setItemRefPhoto] = useState('');
  const [itemNeedsPhoto, setItemNeedsPhoto] = useState(true);
  const [itemNeedsVerify, setItemNeedsVerify] = useState(true);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await fn();
    if (result.success) router.refresh();
    else setError(result.error || 'Action failed');
    setBusy(false);
  }

  async function handleAddList() {
    if (!newListName.trim()) return;
    await run(async () => {
      const r = await createPunchList(projectId, newListName.trim());
      if (r.success) setNewListName('');
      return r;
    });
  }

  async function handleAddItem(listId: string) {
    if (!itemTitle.trim()) {
      setError('Item title is required.');
      return;
    }
    await run(async () => {
      const r = await createPunchItem({
        punch_list_id: listId,
        project_id: projectId,
        title: itemTitle.trim(),
        location: itemLocation.trim() || null,
        trade: itemTrade.trim() || null,
        assignee_id: picker.assignee || null,
        reference_photo_file_id: itemRefPhoto || null,
        // Toggles are set at list-build; only Foreman+ may uncheck them
        requires_completion_photo: canForeman ? itemNeedsPhoto : true,
        requires_verification: canForeman ? itemNeedsVerify : true,
      });
      if (r.success) {
        setItemTitle('');
        setItemLocation('');
        setItemTrade('');
        // Both steps, not just the pick — the next item on this list is a
        // fresh question. `reset()` is on the shared hook so /m gets the same
        // semantics the day its form needs them.
        picker.reset();
        setItemRefPhoto('');
        setItemNeedsPhoto(true);
        setItemNeedsVerify(true);
        setAddingToList(null);
      }
      return r;
    });
  }

  function itemBadge(item: PunchItem) {
    const colors = STATUS_COLORS[item.status] ?? STATUS_COLORS.open;
    return (
      <span
        style={{
          padding: '0.125rem 0.5rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 500,
          backgroundColor: colors.bg,
          color: colors.fg,
        }}
      >
        {item.status.replace('_', ' ')}
      </span>
    );
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      {error && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '0.375rem',
            fontSize: '0.8125rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Any role (incl. Crew) can create lists (5C §7) */}
      <div style={cardStyle}>
        <div style={titleStyle}>New Punch List</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            placeholder='e.g. "Final walkthrough — Johnson kitchen"'
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleAddList}
            disabled={busy}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: busy ? '#93c5fd' : '#2563eb',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Create List
          </button>
        </div>
      </div>

      {lists.length === 0 && (
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          No punch lists yet. The project cannot be marked complete while any punch item is open.
        </p>
      )}

      {lists.map((list) => {
        const closed = list.items.filter((i) =>
          i.requires_verification ? i.status === 'verified' : i.status === 'complete'
        ).length;
        return (
          <div key={list.id} style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ ...titleStyle, marginBottom: 0 }}>
                {list.name} · {closed}/{list.items.length} closed
              </div>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button
                  onClick={() => setAddingToList(addingToList === list.id ? null : list.id)}
                  style={smallButton('#2563eb', '#bfdbfe')}
                >
                  + Add Item
                </button>
                {canForeman && (
                  <button
                    onClick={() => {
                      if (!confirm(`Delete punch list "${list.name}"?`)) return;
                      void run(() => deletePunchList(list.id, role));
                    }}
                    style={smallButton('#991b1b', '#fecaca')}
                  >
                    Delete List
                  </button>
                )}
              </div>
            </div>

            {addingToList === list.id && (
              <div
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.75rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.375rem',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    placeholder="Title * (e.g. Gouge in island panel)"
                    value={itemTitle}
                    onChange={(e) => setItemTitle(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    placeholder="Location (room/area)"
                    value={itemLocation}
                    onChange={(e) => setItemLocation(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    placeholder="Trade"
                    value={itemTrade}
                    onChange={(e) => setItemTrade(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {/* D-65 — TWO STEPS. Was one flat <select> over all 39
                      members (33 of them subcontractors) with no split and no
                      type label at all: worse than what /m had before D-65.
                      The logic is shared with mobile; only this markup is
                      local, because a 52px tap-target stack is right for a
                      thumb and wrong for a 33-item desktop form. */}
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    {(
                      [
                        ['crew', 'Team', picker.crew.length],
                        ['subcontractor', 'Sub / Vendor', picker.subs.length],
                      ] as const
                    ).map(([value, label, count]) => (
                      <button
                        key={value}
                        type="button"
                        data-testid={`punch-assignee-side-${value}`}
                        data-active={picker.side === value ? 'true' : 'false'}
                        aria-pressed={picker.side === value}
                        onClick={() => picker.chooseSide(value)}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          border:
                            picker.side === value ? '1px solid #2563eb' : '1px solid #d1d5db',
                          backgroundColor: picker.side === value ? '#eff6ff' : '#fff',
                          color: picker.side === value ? '#1d4ed8' : '#374151',
                        }}
                      >
                        {label} ({count})
                      </button>
                    ))}
                  </div>
                  <select
                    data-testid="punch-assignee"
                    value={picker.assignee ?? ''}
                    onChange={(e) => picker.chooseAssignee(e.target.value || null)}
                    // Disabled rather than hidden before step 1: the field keeps
                    // its place in the grid, so choosing a side does not reflow
                    // the form under the cursor.
                    disabled={picker.side === null}
                    style={{ ...inputStyle, opacity: picker.side === null ? 0.5 : 1 }}
                  >
                    <option value="">
                      {picker.side === null
                        ? 'Pick Team or Sub / Vendor first…'
                        : picker.visible.length === 0
                          ? picker.side === 'crew'
                            ? 'Nobody assigned to this project — see the Team tab'
                            : 'No subs on this project — award a subcontract or use the Team tab'
                          : 'Assignee…'}
                    </option>
                    {picker.visible.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                  <select value={itemRefPhoto} onChange={(e) => setItemRefPhoto(e.target.value)} style={inputStyle}>
                    <option value="">Reference photo (optional)…</option>
                    {photos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {canForeman && (
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <input
                        type="checkbox"
                        checked={itemNeedsPhoto}
                        onChange={(e) => setItemNeedsPhoto(e.target.checked)}
                      />
                      Completion photo required
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <input
                        type="checkbox"
                        checked={itemNeedsVerify}
                        onChange={(e) => setItemNeedsVerify(e.target.checked)}
                      />
                      Verification required
                    </label>
                  </div>
                )}
                <button
                  onClick={() => handleAddItem(list.id)}
                  disabled={busy}
                  style={{
                    padding: '0.375rem 0.875rem',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#fff',
                    backgroundColor: busy ? '#93c5fd' : '#2563eb',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  Add Item
                </button>
              </div>
            )}

            {list.items.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '0.625rem 0',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {itemBadge(item)}
                    <span style={{ fontWeight: 500 }}>{item.title}</span>
                    {item.location && <span style={{ color: '#6b7280' }}>· {item.location}</span>}
                    {item.trade && <span style={{ color: '#6b7280' }}>· {item.trade}</span>}
                    {item.assignee && (
                      <span style={{ color: '#6b7280' }}>· {item.assignee.display_name}</span>
                    )}
                    {!item.requires_verification && (
                      <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>(no sign-off)</span>
                    )}
                    {!item.requires_completion_photo && (
                      <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>(no photo)</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                    {item.status === 'open' && (
                      <button
                        onClick={() => void run(() => updatePunchItemFields(item.id, { status: 'in_progress' }))}
                        style={smallButton('#92400e', '#fde68a')}
                      >
                        Start
                      </button>
                    )}
                    {(item.status === 'open' || item.status === 'in_progress') && (
                      <button
                        onClick={() =>
                          void run(() => completePunchItem(item, photoPick[item.id] || null))
                        }
                        style={smallButton('#1e40af', '#bfdbfe')}
                      >
                        Complete
                      </button>
                    )}
                    {item.status === 'complete' && item.requires_verification && canForeman && (
                      <button
                        onClick={() => void run(() => verifyPunchItem(item, role))}
                        style={smallButton('#166534', '#bbf7d0')}
                      >
                        Verify
                      </button>
                    )}
                    {canForeman && (
                      <button
                        onClick={() => {
                          if (!confirm(`Delete item "${item.title}"?`)) return;
                          void run(() => deletePunchItem(item.id, role));
                        }}
                        style={smallButton('#6b7280', '#d1d5db')}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* Completion-photo pick (photo gate) */}
                {(item.status === 'open' || item.status === 'in_progress') &&
                  item.requires_completion_photo && (
                    <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select
                        value={photoPick[item.id] ?? ''}
                        onChange={(e) => setPhotoPick({ ...photoPick, [item.id]: e.target.value })}
                        style={{ ...inputStyle, fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}
                      >
                        <option value="">Completion photo (required to complete)…</option>
                        {photos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <Link
                        href={`/dashboard/projects/${projectId}/files/upload`}
                        style={{ fontSize: '0.75rem', color: '#2563eb' }}
                      >
                        Upload new photo →
                      </Link>
                    </div>
                  )}

                {(item.completer || item.verifier) && (
                  <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    {item.completer && <>Completed by {item.completer.display_name}</>}
                    {item.verifier && <> · Verified by {item.verifier.display_name}</>}
                  </div>
                )}
              </div>
            ))}
            {list.items.length === 0 && (
              <p style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>No items yet.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
