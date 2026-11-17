import { Architecture } from '@/components/landing/architecture';
import { BridgeDemo } from '@/components/landing/bridge-demo';
import { CheckDemo } from '@/components/landing/check-demo';
import { Explore } from '@/components/landing/explore';
import { Graduation } from '@/components/landing/graduation';
import { Hero } from '@/components/landing/hero';
import { InsideCoin } from '@/components/landing/inside-coin';
import { LandingMotion } from '@/components/landing/landing-motion';
import { LaunchDemo } from '@/components/landing/launch-demo';
import { Manifesto } from '@/components/landing/manifesto';
import { Marquee } from '@/components/landing/marquee';
import { ClosingCta, Contracts, Proof } from '@/components/landing/proof-contracts';
import { GalaxyBackdrop } from '@/components/landing/scene-loaders';
import { Security } from '@/components/landing/security';
import { Thesis } from '@/components/landing/thesis';
import { TierProvider } from '@/components/landing/tier-context';
import { Vision } from '@/components/landing/vision';
import { getExpansionChains, getHomeChain } from '@/lib/chains';
import { resolveMode } from '@/lib/mode';
import { publicEnv } from '@/lib/public-env';
import { getManifestState } from '@/lib/web3/addresses';

// "/" — landing + discovery. Explore menampilkan token nyata di mode simulation. Urutan section mengikuti DESIGN_SYSTEM §6.1.
// Nama chain selalu diambil dari registry, tidak ditulis langsung di komponen.
export default function LandingPage() {
  const home = getHomeChain(publicEnv.network);
  const expansions = getExpansionChains(publicEnv.network);
  const chains = { home, expansions };
  const mode = resolveMode({ network: publicEnv.network, manifest: getManifestState(publicEnv.network) });

  return (
    <TierProvider>
      <GalaxyBackdrop />
      <main id="top">
        <Hero {...chains} />
        <Marquee />
        <Vision {...chains} />
        <Thesis />
        <Architecture {...chains} />
        <Manifesto />
        <Explore home={home} mode={mode} />
        <CheckDemo {...chains} />
        <InsideCoin />
        <Security />
        <Graduation {...chains} />
        <LaunchDemo {...chains} />
        <BridgeDemo {...chains} />
        <Proof />
        <Contracts {...chains} />
        <ClosingCta />
      </main>
      <LandingMotion />
    </TierProvider>
  );
}
