import { SplitHeading } from '@/components/landing/split-heading';

// Section 4 — dial "1/1 DENIED".
export function Thesis() {
  return (
    <section className="v3-thesis" aria-labelledby="v3ThesisHeading">
      <div className="v3-thesis-ambience" />
      <div className="container v3-thesis-layout">
        <div className="v3-thesis-side">
          <span className="section-label">TRUST IS THE PRODUCT / 001</span>
          <p>
            Every chain is another question.
            <br />
            Every verifier is part of the answer.
          </p>
        </div>
        <div className="v3-thesis-core">
          <span className="v3-dial-caption">
            MINIMUM
            <br />
            SECURITY POLICY
          </span>
          <div className="v3-dial-rings">
            <span />
            <span />
            <span />
            <strong>1/1</strong>
            <b>DENIED</b>
          </div>
        </div>
        <div className="v3-thesis-copy">
          <SplitHeading id="v3ThesisHeading" lines={['ONE OF ONE', <em key="e">IS NOT ENOUGH.</em>]} />
          <p>
            Token contracts can look identical. Their verifier assumptions are not. XofN makes the
            difference visible, inspectable, and designed to lock after expansion.
          </p>
          <a href="#security" className="v3-text-link">
            EXPLORE THE SECURITY MODEL <span>↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
