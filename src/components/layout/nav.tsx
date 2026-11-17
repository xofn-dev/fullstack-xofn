'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useOverlay } from '@/components/ui/overlay-provider';

// D12: urutan nav aplikasi. Route yang sudah ada dituju langsung (/check, Phase 2); sisanya masih
// menunjuk ke anchor di "/" sampai halamannya dibuat di Phase 4, tanpa mengubah label.
const LINKS = [
  { href: '/#explore', label: 'Explore' },
  { href: '/check', label: 'XofN Check' },
  { href: '/#launch', label: 'Launch' },
  { href: '/#bridge', label: 'Bridge' },
  { href: '/#proof', label: 'Proof' },
  { href: '/#contracts', label: 'Contracts' },
] as const;

export function Nav({ tag }: { tag: string }) {
  const [open, setOpen] = useState(false);
  const { openModal } = useOverlay();

  // Mode preview: tombol wallet hanya menjelaskan, tidak membuka koneksi (USER_FLOWS Flow B).
  const explainWallet = () =>
    openModal({
      title: 'Wallet connection — preview only',
      copy: 'This build is a preview. It deliberately does not request signatures, connect to wallet providers, or process transfers.',
      detail:
        'Production integration: wallet client + supported EVM chains + quote simulation + user-signed transactions. Never enter a seed phrase or private key on any website.',
    });

  return (
    <div className="nav-wrap">
      <header className="nav container">
        <Link className="logo" href="/#top" aria-label="XofN home">
          <span className="logo-mark">X</span>
          <span>
            X<span className="o">of</span>N
          </span>
        </Link>
        <nav className={cn('nav-links', open && 'open')} id="navLinks" aria-label="Main navigation">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
          {/* ≤640px tombol Connect di bar disembunyikan CSS, jadi disediakan juga di dalam menu. */}
          <a
            href="#connect"
            className="nav-connect-mobile"
            onClick={(event) => {
              event.preventDefault();
              setOpen(false);
              explainWallet();
            }}
          >
            Connect Wallet ↗
          </a>
        </nav>
        <div className="nav-right">
          <span className="nav-tag">◉ {tag}</span>
          <button className="btn secondary small" type="button" onClick={explainWallet}>
            Connect Wallet <span className="arr">↗</span>
          </button>
          <button
            className="btn secondary iconOnly mobile-menu-btn"
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="navLinks"
            onClick={() => setOpen((value) => !value)}
          >
            ☰
          </button>
        </div>
      </header>
    </div>
  );
}
