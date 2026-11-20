import { Architecture } from '@/components/landing/architecture';
import { BridgeDemo } from '@/components/landing/bridge-demo';
import { CheckDemo } from '@/components/landing/check-demo';
import { Explore } from '@/components/landing/explore';
import { Graduation } from '@/components/landing/graduation';
import { Hero } from '@/components/landing/hero';
import { InsideCoin } from '@/components/landing/inside-coin';
import { IntroLoader } from '@/components/landing/intro-loader';
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
import { getModeCopy } from '@/lib/mode';
import { publicEnv } from '@/lib/public-env';
import { getHomeOnlyDeployment } from '@/lib/web3/addresses';
import { currentAppMode } from '@/lib/web3/app-mode';

// "/" — landing + discovery. Explore menampilkan token nyata di mode simulation. Urutan section mengikuti DESIGN_SYSTEM §6.1.
// Nama chain selalu diambil dari registry, tidak ditulis langsung di komponen.
export default function LandingPage() {
  const home = getHomeChain(publicEnv.network);
  const expansions = getExpansionChains(publicEnv.network);
  const chains = { home, expansions };
  const mode = currentAppMode();
  const copy = getModeCopy(mode, publicEnv.network);
  const status = { label: copy.statusLabel, flag: copy.statusFlag };
  // Launchpad home terbuka di jaringan publik (testnet, Fase 1a). Dorman tidak dihitung (P52).
  const homeOnly = getHomeOnlyDeployment(publicEnv.network);
  const testnetLive = mode === 'live' && homeOnly?.status === 'live';

  return (
    <TierProvider>
      {/* D19: intro loader hanya di landing; halaman aplikasi tidak ditunda. */}
      <IntroLoader status={status} />
      <GalaxyBackdrop />
      <main id="top">
        <Hero {...chains} status={status} />
        <Marquee />
        <Vision {...chains} />
        <Thesis />
        <Architecture
          {...chains}
          illustrationLabel={
            mode === 'preview'
              ? 'INTERACTIVE PROTOCOL PREVIEW\u00a0 / \u00a0NOT LIVE'
              : 'INTERACTIVE PROTOCOL MODEL\u00a0 / \u00a0ILLUSTRATION'
          }
        />
        <Manifesto />
        <Explore home={home} mode={mode} />
        <CheckDemo {...chains} />
        <InsideCoin />
        <Security />
        <Graduation {...chains} />
        <LaunchDemo {...chains} mode={mode} actionTag={copy.actionTag} />
        <BridgeDemo {...chains} />
        <Proof testnetLive={testnetLive} />
        <Contracts {...chains} homeOnly={testnetLive ? homeOnly : null} />
        <ClosingCta />
      </main>
      <LandingMotion />
    </TierProvider>
  );
}
