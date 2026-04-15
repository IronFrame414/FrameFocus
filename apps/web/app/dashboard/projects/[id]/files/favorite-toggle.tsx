'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleFavorite } from '@/lib/services/files-client';

export default function FavoriteToggle({
  fileId,
  initialIsFavorite,
}: {
  fileId: string;
  initialIsFavorite: boolean;
}) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    const next = !isFavorite;
    setIsFavorite(next); // optimistic

    const result = await toggleFavorite(fileId, next);

    if (!result.success) {
      setIsFavorite(!next); // revert on failure
      alert(`Failed to update favorite: ${result.error ?? 'Unknown error'}`);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}
      title={isFavorite ? 'Unfavorite' : 'Favorite'}
      style={{
        background: 'none',
        border: 'none',
        cursor: isPending ? 'wait' : 'pointer',
        fontSize: '1.25rem',
        padding: '0 0.25rem',
        color: isFavorite ? '#f5b301' : '#ccc',
        lineHeight: 1,
      }}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}
