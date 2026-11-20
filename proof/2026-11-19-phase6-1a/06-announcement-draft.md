# Draf pengumuman alamat testnet (untuk publik)

Ditulis untuk publik/komunitas. Semua alamat, tx hash, dan nomor blok diambil dari catatan
broadcast (`raw/tx/`) dan pembacaan on-chain. Sengaja tanpa klaim "omnichain" (PRD §4.3): baru satu chain. "Open on testnet" dipakai, bukan "live" tanpa keterangan. Perbarui baris "Source verification" setelah
verifikasi Blockscout selesai.

```
XofN on Robinhood Chain Testnet — Phase 1a: launchpad open on testnet

XofN is a token launchpad on LayerZero V2 where every token carries a measured DVN security tier.
The home-chain contracts are deployed on Robinhood Chain Testnet and the 2-of-3 Safe has opened
launching. Anyone can launch a token, trade it on its bonding curve and graduate it into a Uniswap v4
pool on Robinhood Chain Testnet. Expansion chains are not deployed yet, so tokens stay
"Graduated · awaiting expansion". Testnet only, no real funds. Contracts are unaudited.
Source verification on the explorer is pending.

Chain ID: 46630 (LayerZero EID 40451)
Explorer: explorer.testnet.chain.robinhood.com
Governance Safe Block: 155,510,363
Deployment Blocks: 155,512,843 – 155,910,674
Go-live Block: 155,929,990

CORE CONTRACTS

XofNGraduator — runs launch and graduation; owner and delegate of every token until expansion locks it.
Owned by the Safe. Deployed at a reserved CREATE3 address that only the deployer could fill.
explorer.testnet.chain.robinhood.com/address/0x46E39010AFA7eE6FfBFEcc981400051e1d8929FF
Deploy Tx · Block 155,910,627
explorer.testnet.chain.robinhood.com/tx/0x6c34988c15e276b29ce5fe2d7be97389aca8cf8fa177c6a9dcd3c36109e0c7a5

XofNRegistry — records each token's tier and proves its lock state on-chain via verify().
Owned by the Safe from construction. Its registrar is the Graduator (set once by the Safe).
explorer.testnet.chain.robinhood.com/address/0xba1c8dFC2aBc6Ae85ac968B4F5A4afa9BE5c3006
Deploy Tx · Block 155,512,881
explorer.testnet.chain.robinhood.com/tx/0x4033399343dba245586a1d97fed1197683601ac3a996429430231ffb1e6da7bb

XofNCurve (implementation) — bonding-curve template, cloned once per launch; cannot be initialized itself
explorer.testnet.chain.robinhood.com/address/0x9E2d5326eA545ac81941Eec9C0405379F7Be5B6F
Deploy Tx · Block 155,512,898
explorer.testnet.chain.robinhood.com/tx/0xd83ad0d7d0b2cc2db8b4d45a0c389d089dedd84211636498f3e9a46492a7cee8

XofNPoolGuard — Uniswap v4 hook: only the Graduator can create an XofN pool, so no one can open it
first at a manipulated price. Stateless, no owner.
explorer.testnet.chain.robinhood.com/address/0x3D245de80BaEDBF59A47209cED57FA2F059FA000
Deploy Tx · Block 155,910,603
explorer.testnet.chain.robinhood.com/tx/0x42c6c6332cfaab5255118232727bc620f30bd4a470d1daf83f17459cf664dff5

LINKED LIBRARIES

TierLib — DVN tier recipes and checks (no 1-of-1 configuration is accepted)
explorer.testnet.chain.robinhood.com/address/0x15b3B5908db0EB9646123fe9e062144047C9ac8c
Deploy Tx · Block 155,512,843
explorer.testnet.chain.robinhood.com/tx/0xfda16d9ec0d59f3e0628a1cc86223d4952e1ae07bf040ec45488a3bc5ac3c97d

PoolSeeder — creates and funds the Uniswap v4 pool in a single call
explorer.testnet.chain.robinhood.com/address/0xE741ea6F114b61111D795394d0917DE5107d3B1c
Deploy Tx · Block 155,512,862
explorer.testnet.chain.robinhood.com/tx/0x21974d18b535a215340e6fbe51f7e783305cd5a65287e5b9c847a6d29be0708d

XofNTokenDeployer — deploys each token (OFT) at a deterministic address
explorer.testnet.chain.robinhood.com/address/0x381e1125c8835F16d632E762891d2A6A6c49f092
Deploy Tx · Block 155,512,871
explorer.testnet.chain.robinhood.com/tx/0x9611ccce008ad2968d4da3430400fc12352866bbeb3b11317572ad92dadec490

GOVERNANCE & TRUST BOUNDARIES

XofN Testnet Safe — 2-of-3 Safe v1.4.1 multisig; owner of the Registry and the Graduator, and the
Graduator's LayerZero delegate. Testnet only; mainnet will use a separate Safe.
explorer.testnet.chain.robinhood.com/address/0x5Bf81326c6D8C7a2d7632cD9050A660c3a088BfC
Creation Tx · Block 155,510,363
explorer.testnet.chain.robinhood.com/tx/0x7bdf1a6fc3a0ffa65341133cc095958fd222de1ca2edadc0774a936282821c3f

DVN allowlist — the Safe approved the four DVNs of the testnet recipe (2 signatures each):
Horizen, LayerZero Labs (required) · Paxos, Twinstake (optional, 1 of 2)
Block 155,907,584 – 155,908,429

Ownership handover — the deployer handed the Graduator's delegate and then its ownership to the Safe
Blocks 155,910,650 and 155,910,674. The deployer holds no admin rights.

Go-live — the Safe (2 signatures) set the Registry's registrar to the Graduator. This can be done only
once and cannot be changed or undone by anyone, including the Safe. Check registrar() on the Registry.
Go-live Tx · Block 155,929,990
explorer.testnet.chain.robinhood.com/tx/0x156cf57b715fd1e109ec7e8b059404069be0d942ce096a9b578c9288f336a11b

CANONICAL / EXTERNAL DEPENDENCIES

LayerZero EndpointV2
explorer.testnet.chain.robinhood.com/address/0x3aCAAf60502791D199a5a5F0B173D78229eBFe32

Uniswap v4 PoolManager
explorer.testnet.chain.robinhood.com/address/0x8366a39CC670B4001A1121B8F6A443A643e40951

Uniswap v4 PositionManager
explorer.testnet.chain.robinhood.com/address/0x58daec3116aae6D93017bAAea7749052E8a04fA7

CreateX (CREATE3 factory)
explorer.testnet.chain.robinhood.com/address/0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed

Safe v1.4.1 SafeL2 singleton
explorer.testnet.chain.robinhood.com/address/0x29fcB43b46531BcA003ddC8FCB67FFE91900C762

Safe v1.4.1 ProxyFactory
explorer.testnet.chain.robinhood.com/address/0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67

XofN is an independent project built on LayerZero. Not affiliated with or endorsed by LayerZero Labs.
```
