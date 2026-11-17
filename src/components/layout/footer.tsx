import Link from 'next/link';
import type { AppMode } from '@/types/enums';

// Disclaimer LayerZero wajib ada di setiap halaman (CLAUDE.md §3, PRD §4.3).
// Kalimat kedua dan seterusnya hanya berlaku selama belum live (DESIGN_SYSTEM §10.3).
export function Footer({ mode }: { mode: AppMode }) {
  return (
    <footer>
      <div className="container footer-bottom">
        <div>
          <div className="footer-symbol">XofN.</div>
          <div className="disclaimer">
            XofN is an independent project built on LayerZero. Not affiliated with or endorsed by
            LayerZero Labs.{' '}
            {mode === 'simulation'
              ? 'This build runs against a local test node with mock LayerZero endpoints, mock DVNs and a mock AMM. No real funds, token sale, public deployment or audit are represented here.'
              : 'No live verification, token sale, contract deployment, audit or wallet transactions are represented here.'}{' '}
            $XOFN itself is out of MVP scope until mainnet is live and audited. On-chain security
            badges do not guarantee investment returns or eliminate risk.
          </div>
        </div>
        <div className="footer-links">
          <Link href="/#top">TOP ↑</Link>
          <Link href="/contracts">CONTRACTS</Link>
          <Link href="/proof">PROOF</Link>
        </div>
      </div>
    </footer>
  );
}
