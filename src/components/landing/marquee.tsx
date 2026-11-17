import { Fragment } from 'react';

const PRINCIPLES = [
  'CONFIGURATION IS VERIFIABLE',
  'GRADUATE ON PROOF',
  'NOT ONE OF ONE',
  'NO BACKDOOR BY DESIGN',
] as const;

const TRANSMISSION = [
  'ONE TOKEN',
  'MANY PATHWAYS',
  'ZERO SINGLE POINTS OF VERIFICATION',
  'PROOF OVER PROMISES',
] as const;

// Section 2. Strip pertama dekoratif (aria-hidden). Isi digandakan di markup supaya loop mulus
// tanpa manipulasi innerHTML seperti di HTML konsep. Fragment dipakai (bukan <span> pembungkus)
// karena CSS baseline menata setiap <span> di dalam strip.
export function Marquee() {
  const principles = [...PRINCIPLES, ...PRINCIPLES];
  return (
    <>
      <div className="marquee" aria-hidden="true">
        <div className="track">
          {principles.map((text, index) => (
            <Fragment key={index}>
              <span>{text}</span>
              <b>✳</b>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="v3-transmission" aria-label="Protocol principles">
        <div className="v3-transmission-track">
          {[0, 1].map((copy) => (
            <Fragment key={copy}>
              {TRANSMISSION.map((text) => (
                <Fragment key={text}>
                  {text} <span>✦</span>{' '}
                </Fragment>
              ))}
              &nbsp;
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
