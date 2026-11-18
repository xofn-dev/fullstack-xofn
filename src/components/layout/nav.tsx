'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { XLink } from '@/components/ui/x-link';
import { ConnectButton } from '@/components/wallet/connect-button';
import type { AppMode } from '@/types/enums';

// D12: urutan nav aplikasi. Explore tetap section di "/" (discovery ada di landing, PRD §6.1);
// sisanya halaman sendiri sejak Phase 4.
const LINKS = [
  { href: '/#explore', label: 'Explore' },
  { href: '/check', label: 'XofN Check' },
  { href: '/launch', label: 'Launch' },
  { href: '/bridge', label: 'Bridge' },
  { href: '/proof', label: 'Proof' },
  { href: '/contracts', label: 'Contracts' },
] as const;

export function Nav({ tag, mode }: { tag: string; mode: AppMode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="nav-wrap">
      <header className="nav container">
        <Link className="logo" href="/#top" aria-label="XofN home">
          <Image className="logo-mark" src="/logo.jpeg" alt="" width={33} height={33} priority />
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
          <span className="nav-connect-mobile">
            <ConnectButton mode={mode} className="nav-connect-link" onDone={() => setOpen(false)} />
          </span>
        </nav>
        <div className="nav-right">
          <span className="nav-tag">◉ {tag}</span>
          <XLink className="btn secondary iconOnly nav-x" />
          {/* Anak langsung .nav-right: aturan CSS ≤640px menyembunyikan tombol ini di bar. */}
          <ConnectButton mode={mode} />
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
