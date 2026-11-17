# 02 — Ketersediaan DVN per pathway (P1, P18)

Tanggal akses: **17 Nov 2026** (UTC 08:36–08:42).

## Sumber

| # | Sumber | Dipakai untuk |
|---|---|---|
| S1 | https://metadata.layerzero-api.com/v1/metadata — bagian `dvns` per chain (data di balik halaman https://docs.layerzero.network/v2/deployments/dvn-addresses) | Alamat DVN, nama operator, flag `deprecated` |
| S2 | On-chain: `cast code`, `DVN.dstConfig(uint32)`, `DVN.getFee(...)` | Apakah DVN melayani EID tujuan |
| S3 | On-chain: `SendUln302/ReceiveUln302.getUlnConfig(address(0), eid)` | Konfigurasi default per pathway |
| S4 | https://docs.layerzero.network/v2/deployments/dvn-addresses.md | Aturan: "that DVN must be deployed on both chains" |
| S5 | https://docs.layerzero.network/v2/concepts/modular-security/production-dvn-configuration.md | Pola tier yang dirujuk brief |

Ekstrak S1: [`raw/lz-metadata-dvns.txt`](raw/lz-metadata-dvns.txt). Keluaran S2: [`raw/dvn-five-operators.txt`](raw/dvn-five-operators.txt), [`raw/dvn-candidates.txt`](raw/dvn-candidates.txt). Keluaran S3: [`raw/chains-defaults.txt`](raw/chains-defaults.txt).

Cara membaca S2: `dstConfig(eid)` mengembalikan `(gas, multiplierBps, floorMarginUSD)`. `gas > 0` berarti DVN di chain itu dikonfigurasi untuk EID tujuan. `getFee` **tidak** bisa dipakai sebagai penanda: ia tetap mengembalikan angka untuk tujuan yang tidak dikonfigurasi.

## Hasil — lima operator di brief

| Operator (id metadata) | Base | Arbitrum One | Robinhood Chain |
|---|---|---|---|
| LayerZero Labs (`layerzero-labs`) | `0x9e059a54699a285714207b43b055483e78faac25` | `0x2f55c492897526677c5b68fb199ea31e2c126416` | `0xd01ae6905d48315f7be10c7330aecf8360ef5b12` |
| Google Cloud (`google-cloud`) | `0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc` | `0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc` | **tidak ada** |
| Polyhedra (`polyhedra-network`) | `0x8ddf05f9a5c488b4973897e278b58895bf87cb24` — **deprecated** | `0x8ddf05f9a5c488b4973897e278b58895bf87cb24` — **deprecated** | **tidak ada** |
| Deutsche Telekom (`deutsche-telekom`) | `0xc2a0c36f5939a14966705c7cec813163faeea1f0` | `0xeae839784e5f6c79bbaf34b6023a2f62e134ab39` | `0x70f5a195f6da203e839bb5f15e53d3a0fc796925` |
| Fidelity FCAT (`fidelity`) | `0xeae72c81f3fce1313eeee26717f42af91e178516` | `0x40a341b4d69d7b2981cb5029f14701a5d3886964` | `0xd03910e24e65d14de0c7b0a52b068f53ca59a4af` |

Labs juga punya DVN kedua khusus lzRead di Base dan Arbitrum (`lzReadCompatible: true`); itu bukan DVN pesan biasa dan tidak dicantumkan di sini.

### `dstConfig.gas` per arah (S2; blok Base 58571990, Arbitrum 524986200, Robinhood 116445390)

| Operator | Base→Arb | Arb→Base | Base→Robinhood | Robinhood→Base | Arb→Robinhood | Robinhood→Arb |
|---|---|---|---|---|---|---|
| LayerZero Labs | 180000 | 77000 | 77000 | 77000 | 77000 | 180000 |
| Google Cloud | 180000 | 77000 | **0** | tidak ada kontrak | **0** | tidak ada kontrak |
| Polyhedra (deprecated) | kontrak lain (2206 byte), `dstConfig` revert | sama | fee 0 | tidak ada kontrak | fee 0 | tidak ada kontrak |
| Deutsche Telekom | 180000 | 77000 | 77000 | 77000 | 77000 | 180000 |
| Fidelity FCAT | 180000 | 77000 | 77000 | 77000 | 77000 | 180000 |

## Kesimpulan terhadap tier di brief

Tier memakai DVN wajib **dan** dua DVN opsional, jadi Standard butuh **4** operator berbeda di pathway dan Fortress butuh **5** (brief menulis "3 operator").

| Pathway | Standard seperti di brief (Labs + Google/Polyhedra · 1 dari DT/FCAT) | Fortress seperti di brief (Labs + Google + Polyhedra · 1 dari DT/FCAT) |
|---|---|---|
| Base ↔ Arbitrum | **Terpenuhi** dengan Google sebagai DVN wajib kedua | **Tidak terpenuhi tanpa DVN deprecated**: Polyhedra berstatus deprecated di kedua chain |
| Base ↔ Robinhood | **Tidak terpenuhi**: Google dan Polyhedra tidak ada di Robinhood. Labs, DT, dan FCAT tersedia | **Tidak terpenuhi** |
| Arbitrum ↔ Robinhood | Sama seperti Base ↔ Robinhood | Sama |

Gerbang brief P0 ("tier Standard tersedia di Base ↔ Arbitrum dan Base ↔ Robinhood") **tidak lolos untuk Robinhood** bila daftar operator di brief dipakai apa adanya. Pathway itu butuh operator wajib kedua yang lain. Ini keputusan owner (P1, P18).

## Operator alternatif (untuk keputusan owner)

Tiga belas operator lain ada di Base, Arbitrum, **dan** Robinhood, tidak deprecated, dan `dstConfig.gas > 0` di keenam arah (S1 + S2):

| Operator (nama di metadata) | id | Fee DVN Base→Robinhood (wei, estimasi `getFee`) | Catatan |
|---|---|---|---|
| Twinstake | `nethermind` | 2 035 921 132 800 | id metadata masih `nethermind`; ada di default LZ Base↔Arbitrum |
| Superform | `superform` | 2 035 921 132 800 | |
| Horizen | `horizen-labs` | 2 060 671 622 400 | ada di default LZ Base↔Arbitrum |
| Paxos | `paxos` | 2 122 547 846 400 | |
| P2P | `p2p` | 2 122 547 846 400 | |
| Luganodes | `luganodes` | 2 122 547 846 400 | |
| Nansen | `nansen` | 2 122 547 846 400 | |
| StablecoinX | `stablecoinx` | 2 122 547 846 400 | |
| ApeDVN | `apedvn` | 2 122 547 846 400 | |
| FurtherFP | `FurtherFP` | 2 122 547 846 400 | |
| Blockaid | `blockaid` | 2 147 298 336 000 | |
| Frax | `frax` | 2 147 298 336 000 | |
| Canary | `canary` | 543 089 273 743 873 | ±250× lebih mahal; ada di default LZ Base↔Arbitrum |

Sebagai pembanding, fee Labs di arah yang sama 2 060 671 622 400 wei, DT dan FCAT 2 122 547 846 400 wei. Angka fee adalah estimasi (lihat `08-recommendations.md` P6).

Dokumen ini tidak menilai reputasi atau independensi operator; itu bagian dari keputusan owner.

## Konfigurasi default pathway (S3)

| Arah | Default send ULN (konfirmasi · DVN wajib) | Default receive ULN |
|---|---|---|
| Base → Arbitrum | 10 · 4 wajib: Canary, Labs, Horizen, Twinstake | Base menerima dari Arbitrum: 20 · 4 wajib yang sama |
| Arbitrum → Base | 20 · 4 wajib: Horizen, Labs, Twinstake, Canary | Arbitrum menerima dari Base: 10 · sama |
| Base → Robinhood | 10 · **1 wajib: LZ Dead DVN** | Base menerima dari Robinhood: 5 · Dead DVN |
| Robinhood → Base | 5 · **Dead DVN** | Robinhood menerima dari Base: 10 · Dead DVN |
| Arbitrum → Robinhood | 20 · **Dead DVN** | Arbitrum menerima dari Robinhood: 5 · Dead DVN |
| Robinhood → Arbitrum | 5 · **Dead DVN** | Robinhood menerima dari Arbitrum: 20 · Dead DVN |

Default library di semua arah adalah SendUln302 / ReceiveUln302 chain setempat (bukan BlockedMessageLib).

Arti untuk XofN:
- Default pathway ke dan dari Robinhood adalah **Dead DVN**. Menurut docs LayerZero, Dead DVN adalah placeholder ketika default tidak aktif, dan OApp wajib memasang konfigurasi sendiri; pesan dengan Dead DVN tidak akan pernah terkirim. Token XofN tidak bisa mengirim apa pun ke Robinhood sebelum konfigurasi ULN eksplisit terpasang di kedua sisi.
- Default Base ↔ Arbitrum saat ini 4 DVN wajib. Default bisa berubah; XofN tetap memasang konfigurasi eksplisit.

## Hal lain yang ditemukan

1. **Alamat yang sama bisa berarti operator berbeda di chain berbeda.** `0xa7b5189bca84cd304d8553977c7c614329750d99` adalah Horizen di Base dan Twinstake di Arbitrum. Label operator wajib dikunci pada pasangan (chain, alamat).
2. Urutan naik alamat DVN berbeda di tiap chain, jadi array DVN harus diurutkan per chain, tidak disalin dari chain lain.
3. Beberapa DVN di Robinhood berstatus deprecated (mis. BitGo). Flag `deprecated` perlu ikut disimpan di tabel `dvn_labels`.
4. **Testnet (Phase 6, FROZEN — fakta saja):** dari lima operator brief, hanya LayerZero Labs yang ada di Base Sepolia, Arbitrum Sepolia, dan Robinhood testnet. Robinhood testnet punya 4 DVN: Labs, Paxos, Twinstake, Horizen. Tier dengan DT/FCAT tidak bisa direplikasi persis di testnet.
5. Semua DVN wajib dan opsional ditugaskan dan dibayar pada setiap pesan (`SendUlnBase._assignJobs`, lihat `03-uln-semantics.md`), bukan hanya sejumlah threshold.
