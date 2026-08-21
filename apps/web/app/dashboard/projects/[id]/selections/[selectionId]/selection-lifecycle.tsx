"use client";
import type { Selection } from '@/lib/services/selections-client';
import type { SheetSession } from './selection-sheet';

/** Stage 4 fills this in: offer / deny / revise controls + session history. */
export function SelectionLifecycle({ selection, sessions }: { selection: Selection; role: string; sessions: SheetSession[]; onDone: () => void }) {
  if (selection.status === 'draft' && sessions.length === 0) return null;
  return null;
}
