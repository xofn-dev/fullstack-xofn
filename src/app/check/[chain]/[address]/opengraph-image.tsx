import { ImageResponse } from 'next/og';
import { runCheck } from '@/lib/check';
import { getChain } from '@/lib/chains';
import { TOKENS, TONE_COLORS } from '@/lib/design-tokens';
import { formatUtc, shortAddress } from '@/lib/format';
import { LABEL_COPY } from '@/lib/lz/label';

// Kartu share XofN Check. Isinya fakta dari cache hasil baca chain + "checked at";
// tidak ada klaim yang dilarang (PRD §4.3). Bila Check gagal, kartu tidak menampilkan hasil.

export const alt = 'XofN Check result';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

const frame = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  background: TOKENS.bg,
  color: TOKENS.text,
  padding: 56,
  fontFamily: 'monospace',
} as const;

export default async function Image({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  const outcome = await runCheck({ chain, address });

  if (!outcome.ok) {
    return new ImageResponse(
      (
        <div style={frame}>
          <div style={{ display: 'flex', fontSize: 30, color: TOKENS.mint2, letterSpacing: 4 }}>XOFN CHECK</div>
          <div style={{ display: 'flex', fontSize: 54, lineHeight: 1.1 }}>No result to show.</div>
          <div style={{ display: 'flex', fontSize: 24, color: TOKENS.muted }}>
            No result is shown instead of a guess.
          </div>
        </div>
      ),
      size,
    );
  }

  const { result } = outcome;
  const chainInfo = getChain(result.network, result.chain);
  const overall = result.overallLabel;
  const copy = overall ? LABEL_COPY[overall] : null;
  const tone = TONE_COLORS[copy?.tone ?? 'muted'];
  const title = result.symbol ?? shortAddress(result.address);

  return new ImageResponse(
    (
      <div style={frame}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 30, color: TOKENS.mint2, letterSpacing: 4 }}>XOFN CHECK</div>
          <div style={{ display: 'flex', fontSize: 22, color: TOKENS.muted }}>
            {chainInfo.shortName} · {shortAddress(result.address)}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 34, color: TOKENS.muted }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 14 }}>
            <div
              style={{
                display: 'flex',
                fontSize: 86,
                fontWeight: 700,
                padding: '10px 30px',
                borderRadius: 14,
                border: `3px solid ${tone.line}`,
                background: tone.bg,
                color: tone.text,
              }}
            >
              {copy ? copy.text : 'NO PATHWAYS READ'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26 }}>
            {result.pathways.slice(0, 3).map((pathway) => {
              const remote = pathway.remoteChain
                ? getChain(result.network, pathway.remoteChain).shortName
                : `EID ${pathway.remoteEid}`;
              const pathwayCopy = LABEL_COPY[pathway.label];
              const pathwayTone = TONE_COLORS[pathwayCopy.tone];
              return (
                <div
                  key={pathway.remoteEid}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 26,
                    padding: '10px 0',
                    borderBottom: `1px solid ${TOKENS.line}`,
                  }}
                >
                  <div style={{ display: 'flex' }}>
                    {chainInfo.shortName} ↔ {remote}
                  </div>
                  <div style={{ display: 'flex', color: pathwayTone.text }}>{pathwayCopy.text}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: TOKENS.dim }}>
          <div style={{ display: 'flex' }}>Checked at {formatUtc(new Date(result.checkedAt))}</div>
          <div style={{ display: 'flex' }}>Configuration as read on-chain · not an assessment</div>
        </div>
      </div>
    ),
    size,
  );
}
