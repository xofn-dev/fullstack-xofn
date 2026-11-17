import type { ReactNode } from 'react';

// Keadaan kosong/gagal baca. Tidak pernah menampilkan data tebakan (CLAUDE.md §3 butir 8).
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
