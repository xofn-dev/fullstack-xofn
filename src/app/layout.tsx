import type { Metadata, Viewport } from 'next';
import { Inter_Tight, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Ambient } from '@/components/layout/ambient';
import { Footer } from '@/components/layout/footer';
import { Nav } from '@/components/layout/nav';
import { NoticeBar } from '@/components/layout/notice-bar';
import { OverlayProvider } from '@/components/ui/overlay-provider';
import { getModeCopy, resolveMode } from '@/lib/mode';
import { publicEnv } from '@/lib/public-env';
import './globals.css';

// D3 (rekomendasi, menunggu keputusan owner): Inter Tight + JetBrains Mono, fallback Arial/mono sistem.
const display = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-face',
  display: 'swap',
});

// Klaim mengikuti PRD §4.3: hanya "Building the launchpad where 1-of-1 is never allowed" yang boleh sekarang.
export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: 'XofN — Never one of one.',
    template: '%s · XofN',
  },
  description:
    'Building the launchpad where 1-of-1 is never allowed. Preview build: no token sale, deployment or live verification.',
  openGraph: {
    title: 'XofN — Never one of one.',
    description:
      'Building the launchpad where 1-of-1 is never allowed. Preview build: no token sale, deployment or live verification.',
    type: 'website',
    siteName: 'XofN',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Phase 1: belum ada manifest deployment, jadi mode selalu `preview` (ARCHITECTURE §10.4).
  const mode = resolveMode({ network: publicEnv.network, hasManifest: false });
  const copy = getModeCopy(mode);

  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      {/* Kelas v2…v8 mengaktifkan lapisan CSS baseline (lihat src/app/styles/baseline.css). */}
      <body className="v2 v3 v4 v5 v6-galaxy v7 v8">
        <OverlayProvider>
          <NoticeBar mode={mode} />
          <Nav tag={`PROTOCOL ${copy.actionTag}`} />
          {children}
          <Footer />
          <Ambient />
        </OverlayProvider>
      </body>
    </html>
  );
}
