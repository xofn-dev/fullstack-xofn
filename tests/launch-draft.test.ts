import { describe, expect, it } from 'vitest';
import { launchDraftQuery, parseLaunchDraft } from '@/lib/launch-draft';

const ALLOWED = ['base', 'arbitrum'] as const;

describe('launch draft (landing → /launch)', () => {
  it('round-trips the values typed in the landing form', () => {
    const query = launchDraftQuery({ name: 'XofN Test One', ticker: 'XTEST1', tier: 'standard', chains: ['base', 'arbitrum'] });
    const params = Object.fromEntries(new URLSearchParams(query));
    expect(parseLaunchDraft(params, ALLOWED)).toEqual({
      name: 'XofN Test One',
      ticker: 'XTEST1',
      tier: 'standard',
      chains: ['base', 'arbitrum'],
    });
  });

  it('returns an empty draft when nothing is passed (form defaults apply)', () => {
    expect(parseLaunchDraft({}, ALLOWED)).toEqual({});
  });

  it('drops unknown tiers and chains instead of guessing', () => {
    const draft = parseLaunchDraft({ tier: 'one-of-one', chains: 'base,solana,robinhood,base' }, ALLOWED);
    expect(draft.tier).toBeUndefined();
    // robinhood adalah home, bukan chain ekspansi; duplikat dibuang.
    expect(draft.chains).toEqual(['base']);
  });

  it('keeps an explicit empty chain list so the form reports it', () => {
    expect(parseLaunchDraft({ chains: '' }, ALLOWED).chains).toEqual([]);
  });

  it('caps hand-made values and takes the first of repeated params', () => {
    const draft = parseLaunchDraft({ name: 'x'.repeat(200), ticker: ['ABCDEFGHIJKLMNOP', 'ZZ'] }, ALLOWED);
    expect(draft.name).toHaveLength(64);
    expect(draft.ticker).toBe('ABCDEFGHIJKL');
  });
});
