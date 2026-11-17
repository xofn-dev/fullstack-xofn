'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useOverlay } from '@/components/ui/overlay-provider';
import type { ChainKey } from '@/types/enums';

interface ApiError {
  error?: { code?: string; message?: string };
}

// Aksi hasil Check: Re-check (melewati cache, dibatasi laju di server), salin tautan, Post on X.
export function CheckActions({
  chain,
  address,
  shareUrl,
  shareText,
}: {
  chain: ChainKey;
  address: string;
  shareUrl: string;
  shareText: string;
}) {
  const router = useRouter();
  const { toast } = useOverlay();
  const [busy, setBusy] = useState(false);

  const recheck = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/check/${chain}/${address}?fresh=1`, { cache: 'no-store' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        toast(body.error?.message ?? 'Re-check failed. No result was changed.');
        return;
      }
      // Halaman RSC dibaca ulang; cache sudah berisi hasil baru.
      router.refresh();
      toast('Re-checked. Showing the latest on-chain read.');
    } catch {
      toast('Re-check failed. No result was changed.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied.');
    } catch {
      toast('Could not copy. Copy the address bar instead.');
    }
  };

  const intent = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="check-actions">
      <button className="btn secondary small" type="button" onClick={recheck} disabled={busy}>
        {busy ? 'Reading chain…' : 'Re-check'} <span className="arr">↻</span>
      </button>
      <button className="btn secondary small" type="button" onClick={copyLink}>
        Share · copy link <span className="arr">↗</span>
      </button>
      <a className="btn secondary small" href={intent} target="_blank" rel="noreferrer noopener">
        Post on X <span className="arr">↗</span>
      </a>
    </div>
  );
}
