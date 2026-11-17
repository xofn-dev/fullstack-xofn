import Link from 'next/link';

// Disclaimer LayerZero wajib ada di setiap halaman (CLAUDE.md §3, PRD §4.3).
// Kalimat kedua dan seterusnya hanya berlaku selama belum live (DESIGN_SYSTEM §10.3).
export function Footer() {
  return (
    <footer>
      <div className="container footer-bottom">
        <div>
          <div className="footer-symbol">XofN.</div>
          <div className="disclaimer">
            XofN is an independent project built on LayerZero. Not affiliated with or endorsed by
            LayerZero Labs. No live verification, token sale, contract deployment, audit or wallet
            transactions are represented here. $XOFN itself is out of MVP scope until mainnet is
            live and audited. On-chain security badges do not guarantee investment returns or
            eliminate risk.
          </div>
        </div>
        <div className="footer-links">
          <Link href="/#top">TOP ↑</Link>
          <Link href="/#contracts">CONTRACTS</Link>
          <Link href="/#proof">ROADMAP</Link>
        </div>
      </div>
    </footer>
  );
}
