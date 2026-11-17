// Section 6 — tiga baris kinetik + segel. Reveal dan gerak kinetiknya diatur LandingMotion.
export function Manifesto() {
  return (
    <section className="manifesto-section" aria-label="Protocol manifesto">
      <div className="manifesto-bloom" aria-hidden="true" />
      <div className="container manifesto-inner">
        <div className="manifesto-kicker">XOFN / PRINCIPLE 001</div>
        <div className="manifesto-line">Security shouldn&apos;t be</div>
        <div className="manifesto-line manifesto-bold">
          <span>an assumption.</span>
        </div>
        <div className="manifesto-line manifesto-final">
          It should be <span>visible.</span>
        </div>
        <p>A badge isn&apos;t the proof. The configuration behind it is.</p>
        <div className="manifesto-seal" aria-hidden="true">
          X <span>≠ 1/1</span>
        </div>
      </div>
    </section>
  );
}
