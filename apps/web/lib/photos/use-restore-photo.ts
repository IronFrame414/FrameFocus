'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { restoreFile } from '@/lib/services/files-client';
import { DISCARDED } from '@/lib/services/mutation-result';

/**
 * S127 item 4a — restoring a trashed photo, ONE mechanism for desktop and /m
 * (PARITY): the same `restoreFile()` the Files-tab Trash uses (it counts the
 * row it changed, so a refusal is reported, never shown as success), then a
 * refresh so the photo leaves the trash and returns to the gallery.
 * The two screens lay the button out differently; what it does is this.
 */
export function useRestorePhoto(): {
  restore: (fileId: string) => Promise<boolean>;
  busyId: string | null;
  error: string | null;
} {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(fileId: string): Promise<boolean> {
    setBusyId(fileId);
    setError(null);
    const result = await restoreFile(fileId);
    setBusyId(null);
    if (!result.success) {
      // The SCREEN words the failure (each surface's own copy, /m in t()); the
      // hook passes the cause through, or DISCARDED when there is none.
      setError(result.error ?? DISCARDED);
      return false;
    }
    router.refresh();
    return true;
  }

  return { restore, busyId, error };
}
