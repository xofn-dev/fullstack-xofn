# Rencana: deploy dorman XofN ke Robinhood testnet (Fase 1a)

- **Dibuat:** 19 Nov 2026, untuk dieksekusi di sesi Claude Code baru.
- **Pelaksana:** developer (manusia) + Claude (agent).
- **Batas tugas developer:** deploy kontrak ke Robinhood **testnet**, lalu **mainnet**, dalam keadaan **dorman** (tanpa CA, tanpa launch). Rencana ini hanya mencakup **testnet**. Mainnet menyusul setelah audit, dengan langkah yang sama.
- **Di luar tugas ini:** go-live (`setRegistrar`), launch token, smoke test dengan token (tugas PM), dan apa pun di Base/Arbitrum (Fase 2).

## 0. Baca dulu (sesi baru)

1. `CLAUDE.md`, terutama §5.1 (larangan Phase 6–7) dan §9.
2. Rencana ini.
3. `ARCHITECTURE.md` §5.6.1: urutan deploy dorman (Opsi A, PRD P47).
4. `test/lz/GoLive.t.sol`: simulasi urutan deploy publik yang sudah lulus lokal. Ini **templat utama** script.
5. `proof/2026-11-19-phase3-p55-p51/notes.md`: status kontrak terakhir.
6. `ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md` §1.1–1.3, §4 (fakta chain 4663/46630, Safe, EIP-7702, Blockscout), §8 (alur tanda tangan Safe lewat CLI), §12 (pelajaran).
7. Memori proyek tentang penerima LP testnet.

## 1. Gerbang sebelum agent menulis apa pun untuk jaringan publik

Agent **wajib berhenti dan bertanya** bila salah satu belum terpenuhi:

| # | Syarat | Cara cek |
|---|---|---|
| G1 | **PM sudah memberi perintah tertulis membuka Phase 6 untuk Robinhood testnet.** Tanpa ini, script publik dilarang (CLAUDE.md §5.1) | Tanyakan pengguna dan catat kutipannya di bukti |
| G2 | PM mengonfirmasi operator DVN wajib: **Horizen (slot ke-2)** dan **Paxos (slot ke-3, Fortress)** (usulan 19 Nov 2026, PRD P1) | Tanyakan pengguna |
| G3 | PM mengizinkan **angka sementara** untuk testnet | **Sudah:** acc PM 19 Nov 2026 |
| G4 | Pekerjaan P55/P51 (branch `phase-3/p55-p51`) sudah di-commit/merge, dan gerbang Phase 3 disetujui | `git status`, `git log`; tanyakan pengguna |

Setelah G1, perbarui CLAUDE.md §4 (Phase 6: "dibuka PM untuk 1a testnet, tanggal ...").

## 2. Keputusan yang dipakai

| Hal | Nilai untuk testnet | Sumber |
|---|---|---|
| Ekonomi (P8, P15, P16) | **Sementara** = konstanta tes: `saleSupply` 799.200.000e18; `startPrice` 1.500.000.000 wei/token; ambang 4 ETH; insentif 0,01 ETH | `test/helpers/XofNTestBase.sol`; acc PM |
| `expansionPairEth` (P42) | **Sementara** 0,04 ETH (batas constructor ±0,249 ETH untuk 2 chain) | idem |
| Penerima LP (P41) | **Alamat sementara buatan developer** (keystore Foundry). Agent hanya menerima alamatnya. Mainnet berbeda dan menunggu PM | Keputusan developer 19 Nov 2026 |
| DVN wajib | Labs + Horizen (Standard); + Paxos (Fortress) | G2 |
| DVN opsional | Mainnet: DT + FCAT. **Testnet: Paxos + Twinstake**, karena DT/FCAT tidak ada di testnet | Phase 0 addendum |
| Fortress di testnet | **Tidak ditawarkan** (`fortressRequired` kosong), karena hanya 4 DVN di Robinhood testnet: Labs, Paxos, Twinstake, Horizen | `proof/2026-11-17-phase0-addendum/notes.md` §2 |
| Pathway di constructor | Base Sepolia (EID **40245**) dan Arbitrum Sepolia (EID **40231**). Wajib ada walau Fase 2 belum jalan, karena Graduator menolak daftar kosong | `09-addendum-robinhood-home.md` |
| Home | Robinhood testnet, chain ID **46630**, EID **40451** | idem |
| Pola deploy | Opsi A, dorman: Registry milik Safe sejak constructor; `launch()` revert sampai Safe memanggil `setRegistrar` | PRD P47 |

## 3. Langkah

### Langkah 1 — Verifikasi on-chain Robinhood testnet (agent, read-only)
RPC dari env, tanpa kredensial di bukti. DNS Telkomsel memblokir `*.robinhood.com`, jadi pakai VPN/DNS lain.

- [ ] Endpoint V2 ada (`cast code`), `eid()` = 40451.
- [ ] SendUln302/ReceiveUln302 dan executor untuk EID 40245 dan 40231.
- [ ] Alamat DVN Labs, Horizen, Paxos, Twinstake di Robinhood testnet: cocokkan dengan `proof/2026-11-17-phase0-addendum/raw/dvn-testnet.txt` dan metadata LayerZero. Periksa `dstConfig(eid).gas > 0` untuk kedua tujuan. **Label dikunci per (chain, alamat)**; alamat yang sama bisa milik operator berbeda di chain lain.
- [ ] **Uniswap v2 (router + factory + WETH) di Robinhood testnet.** Belum pernah diverifikasi di Phase 0. Bila tidak ada, berhenti dan tanyakan pengguna/PM: deploy Uniswap v2 sendiri di testnet (gladi berbeda dari mainnet), atau opsi lain.
- [ ] CreateX `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` ada di testnet atau tidak.
- [ ] Default `confirmations` pathway Robinhood testnet → Base Sepolia/Arbitrum Sepolia (`getUlnConfig(address(0), eid)`), sebagai dasar nilai resep.
- **Output:** `proof/<tanggal>-phase6-1a/01-onchain-check.md` + `raw/`.

### Langkah 2 — Keputusan alamat seragam (agent, baca kode; jawab sebelum script)
Guide §7.1: alamat Remote di Base/Arbitrum harus sama dengan di Robinhood. Periksa `contracts/libraries/XofNTokenDeployer.sol` dan `contracts/libraries/Create3.sol`. Apakah alamat token remote = alamat token home bergantung pada alamat Graduator = alamat Remote (deployer CREATE3 yang sama)?
- Bila **ya**: Graduator (testnet) harus di-deploy lewat CreateX dengan salt yang bisa diulang untuk Remote di Fase 2. Tulis analisisnya dan minta konfirmasi pengguna sebelum langkah 4.
- Bila **tidak**: catat alasannya. Deploy biasa cukup.

### Langkah 3 — Data konfigurasi (agent; scope Phase 3 data)
- [ ] `config/tiers.json`: Horizen/Paxos untuk mainnet; profil testnet (wajib Labs + Horizen, opsional Paxos + Twinstake, Fortress kosong).
- [ ] `config/dvn-labels.json`: alamat testnet per chain.
- [ ] Nilai resep pathway (`confirmations`, `maxMessageSize`, `receiveGas`, `composeGas`) dan `ExpansionGas` (`deployGas`, `seedGas`): ambil dari langkah 1 dan `test/lz/GasMeasure.t.sol` dengan margin yang dicatat. **Jangan menebak.**
- [ ] Jalankan `forge test` (harus tetap 184 lulus) dan tes `TiersConfig`.

### Langkah 4 — Script deploy dorman (agent; hanya setelah G1)
Mengikuti `ARCHITECTURE.md` §5.6.1 dan `GoLive.t.sol`. Usulan file (nama guide disesuaikan dengan Opsi A; catat perbedaannya di bukti):

| File | Isi | Ditandatangani |
|---|---|---|
| `script/01_DeployRegistry.s.sol` | Library terhubung (`TierLib`, `PoolSeeder`, `XofNTokenDeployer`) → `new XofNRegistry(endpoint, SAFE)` → `new XofNCurve()` | Deployer EOA |
| `script/02_SafeAllowDvns.s.sol` | Menyusun calldata + `safeTxHash` untuk `Registry.setDvnAllowed(dvn, true)` semua DVN resep. **Tidak** menandatangani | Safe 2-of-3 (CLI, playbook §8) |
| `script/03_DeployGraduator.s.sol` | `new XofNGraduator(endpoint, deployer, Infra, Economics, pathways, gas)` → `setDelegate(SAFE)` **lalu** `transferOwnership(SAFE)` → tulis `deployments/robinhood-testnet.json` dengan `status: "deployed-dormant"` | Deployer EOA |
| `script/04_VerifyDormant.s.sol` | Read-only: owner/delegate = Safe, `registrar()` = 0, `launch()` revert `OnlyRegistrar`, parameter constructor = rencana, codehash | Tidak ada (view) |

Aturan:
- Script menolak berjalan bila `block.chainid != 46630`.
- Alamat Safe, deployer, dan LP dibaca dari **env**, bukan hard-code.
- Deployer harus EOA polos (`code.length == 0`, tanpa delegasi EIP-7702).
- Safe harus kontrak Safe v1.4.1 dengan threshold ≥ 2 (playbook §4/§12).
- `deployBlock` diambil dari receipt (blok L2), bukan `block.number`.
- `foundry.toml`: jangan menambah `[etherscan]` atau profil deploy; RPC lewat `--rpc-url` dari env.

### Langkah 5 — Gladi tanpa kunci (agent)
- [ ] Tes fork baru (mis. `test/fork/DeployRehearsal1a.t.sol`, dilewati bila env RPC kosong): jalankan seluruh urutan langkah 4 di fork Robinhood testnet dengan `vm.prank(SAFE)` untuk langkah Safe. Lalu semua cek `04_VerifyDormant`. Tambahan pembuktian: setelah `setRegistrar` **di fork saja**, `launch` → beli → `graduate` berjalan dengan Uniswap v2 testnet.
- [ ] `forge script` setiap script **tanpa `--broadcast`** dan tanpa key (`--sender <alamat deployer>`): simulasi lulus, perkiraan gas dicatat.
- **Output:** `proof/<tanggal>-phase6-1a/02-rehearsal.md` + log.

### Langkah 6 — Persiapan manusia (developer)
- [ ] Keystore deployer (`cast wallet import ... --interactive`). EOA polos, tanpa smart-account/7702.
- [ ] Safe 2-of-3 di Robinhood testnet. Owner EOA polos, kunci di perangkat berbeda. **Bukan** Safe mainnet.
- [ ] ETH testnet untuk deployer dan executor Safe.
- [ ] Alamat LP sementara (keystore sendiri). Kirim **alamatnya saja** ke agent.
- [ ] Isi env lokal: `RH_TESTNET_RPC`, `SAFE_ADDRESS`, alamat deployer, alamat LP. **Jangan** kirim isinya ke agent; cukup konfirmasi sudah diisi.

### Langkah 7 — Broadcast (developer, bukan agent)
Urutan: `01` → transaksi Safe dari `02` (tanda tangan CLI, persetujuan tertulis berisi target, calldata, `safeTxHash`, nonce) → `03`. Selalu `--account <keystore>` atau `--ledger`, **tidak pernah** `--private-key`.

### Langkah 8 — Verifikasi pasca-deploy (agent read-only + developer)
- [ ] Agent: jalankan `04_VerifyDormant` terhadap testnet (view). Semua cek harus lulus.
- [ ] Developer: verifikasi source di **UI Blockscout** testnet. API Blockscout diblokir (playbook §4), jadi `--verify` gagal. Urutan: library, Registry, Curve, Graduator (dengan peta `libraries`).
- [ ] Agent: aplikasi dengan `NEXT_PUBLIC_XOFN_NETWORK=testnet` membaca manifest `deployed-dormant`: mode preview, tombol launch mati (P52). `npm run build` lulus.

### Langkah 9 — Bukti dan status (agent)
- `proof/<tanggal>-phase6-1a/notes.md`: alamat, tx hash, tautan explorer, output verifikasi, perbedaan dari guide (Opsi A, nama script, Fortress tidak ada di testnet, opsional testnet ≠ mainnet, penerima LP sementara), laporan gate format playbook §1.3.
- **Dilarang di bukti:** private key, seed, isi `.env`, URL RPC berkredensial.
- Perbarui CLAUDE.md §4 (Phase 6), PRD status, dan `deployments/robinhood-testnet.json` (sudah ditulis script).

### Langkah 10 — Serah ke PM
PM memutuskan go-live testnet (`setRegistrar` lewat Safe), lalu launch token uji dan smoke test guide §5.3. Agent tidak memanggil fungsi produk di jaringan publik.

## 4. Larangan yang tetap berlaku untuk agent
- Tidak membuat, mengimpor, atau meminta key, keystore, atau mnemonic. Tidak membuat Safe.
- Tidak menjalankan `--broadcast`, `cast send`, `--private-key`, atau `--verify` ke jaringan publik.
- Tidak memanggil `launch`, `buy`, `sell`, `graduate`, `expandAndLock`, `setRegistrar`, dan sejenisnya di testnet/mainnet. Hanya di fork atau Anvil.
- Tidak menyentuh Base Sepolia/Arbitrum Sepolia (Fase 2a) dan tidak membuat `deployments/` selain `robinhood-testnet.json`.
- Tidak membaca atau menyalin isi `.env*`.
- Bila ragu: berhenti dan tanyakan.

## 5. Setelah testnet (bukan bagian rencana ini)
Phase 5 (hardening + paket audit) → PM menetapkan angka final P8/P15/P16/P42/P43 dan P41 mainnet → audit eksternal tanpa temuan critical/high → deploy dorman Robinhood mainnet dengan langkah yang sama (Safe mainnet terpisah, `block.chainid == 4663`, opsional DT + FCAT, Fortress tersedia).

## 6. Risiko terbuka
| Risiko | Penanganan |
|---|---|
| Uniswap v2 tidak ada di Robinhood testnet | Langkah 1; keputusan pengguna/PM |
| Alamat seragam lintas chain (CreateX) | Langkah 2; diputuskan sebelum script |
| RPC publik Robinhood bukan archive node | Ulangi bacaan/fork yang gagal; catat di bukti |
| Safe{Wallet} UI untuk Robinhood tidak terbukti | Tanda tangan lewat CLI (playbook §8) |
| Angka sementara ≠ angka mainnet | Wajar untuk gladi; tes ulang dengan angka final sebelum audit |
