# Phase 0 — Verifikasi riset (read-only)

- **Tanggal:** 17 Nov 2026 (semua sumber diakses UTC 08:36–08:56)
- **Branch:** `phase-0/research`
- **Sifat pekerjaan:** membaca docs, API publik, source, dan chain. Tidak ada transaksi, tidak ada key, tidak ada kode produksi.
- **Status gerbang:** menunggu persetujuan owner.

## Indeks bukti

| File | Satu kalimat konteks |
|---|---|
| [01-chains-eid.md](01-chains-eid.md) | Chain ID dan EID keenam chain cocok antara metadata LayerZero dan pembacaan `EndpointV2.eid()`; Robinhood = 4663 / EID 30416, testnet 46630 / EID 40451. |
| [02-dvn-pathways.md](02-dvn-pathways.md) | Tabel lima operator brief per chain dan arah: Google dan Polyhedra tidak ada di Robinhood, Polyhedra deprecated di Base dan Arbitrum, 13 operator alternatif tersedia. |
| [03-uln-semantics.md](03-uln-semantics.md) | Nilai 0 di ULN berarti default, `getConfig` mengembalikan konfigurasi efektif, `CONFIG_TYPE_EXECUTOR = 1` / `CONFIG_TYPE_ULN = 2`, dan perilaku compose saat gagal, semuanya dari source yang dipin. |
| [04-amm-pair-asset.md](04-amm-pair-asset.md) | Uniswap v2/v3/v4 ada di ketiga chain; batas native drop 0,24 / 0,301 ETH; perbandingan tiga opsi aset pasangan. |
| [05-packages.md](05-packages.md) | Versi paket `@layerzerolabs/*` terbaru terkompilasi dengan solc 0.8.24 + cancun + OZ 5.6.1 dan lulus 4 tes TestHelperOz5. |
| [06-robinhood-chain.md](06-robinhood-chain.md) | CreateX ada di Robinhood dengan bytecode identik; opcode cancun didukung kecuali `BLOBBASEFEE`. |
| [07-oft-api-rpc.md](07-oft-api-rpc.md) | OFT API `/list` gratis tanpa key tetapi tidak mencakup Robinhood; RPC publik Robinhood dibatasi rate. |
| [08-recommendations.md](08-recommendations.md) | Rekomendasi P1–P9 dan P13, plus dua temuan yang butuh keputusan owner (urutan graduation, topologi pathway). |

### Keluaran mentah (`raw/`)

| File | Isi |
|---|---|
| [raw/chains-defaults.txt](raw/chains-defaults.txt) | `chain-id`, `eid()`, default library, dan default ULN per pathway |
| [raw/lz-metadata-chains.json](raw/lz-metadata-chains.json) | Ekstrak metadata LayerZero untuk enam chain |
| [raw/lz-metadata-dvns.txt](raw/lz-metadata-dvns.txt) | Semua DVN V2 di Base, Arbitrum, Robinhood, Robinhood testnet |
| [raw/dvn-five-operators.txt](raw/dvn-five-operators.txt) | `dstConfig` dan `getFee` lima operator brief di semua arah |
| [raw/dvn-candidates.txt](raw/dvn-candidates.txt) | Hal yang sama untuk 13 operator alternatif |
| [raw/oft-samples.txt](raw/oft-samples.txt) | Pembacaan lengkap tiga OFT nyata di Base |
| [raw/executor.txt](raw/executor.txt) | `Executor.dstConfig` (termasuk `nativeCap`) dan default executor config |
| [raw/amm.txt](raw/amm.txt) | Keberadaan kontrak Uniswap di tiga chain |
| [raw/createx-cancun.txt](raw/createx-cancun.txt) | Bytecode CreateX dan probe opcode |
| [raw/smoke-build.txt](raw/smoke-build.txt), [raw/smoke-source.sol.txt](raw/smoke-source.sol.txt) | Hasil dan kode smoke build (dijalankan di luar repo) |

## Gerbang Phase 0 (`PRD.md` §9.1)

| Kriteria | Status | Bukti |
|---|---|---|
| Tabel DVN per pathway untuk Labs, Google Cloud, Polyhedra, DT MMS, FCAT, dengan alamat | **Terpenuhi** | 02 |
| EID mainnet/testnet ketiga chain terkonfirmasi | **Terpenuhi** | 01 |
| Rekomendasi P1–P9 dan P13 | **Terpenuhi**, dengan catatan: P4 dan P7 baru bisa diukur di Phase 3, P6 hanya estimasi, P8 milik owner | 08 |

Gerbang brief P0 ("tier Standard tersedia di Base ↔ Arbitrum dan Base ↔ Robinhood"): **belum lolos untuk Robinhood** dengan daftar operator di brief. Lolos setelah owner memilih operator wajib kedua untuk pathway itu (P1).

## Yang gagal, dilewati, atau tetap `[Belum]`

| Hal | Keterangan |
|---|---|
| Pola URL LayerZero Scan | `layerzeroscan.com` merespons 429; diperiksa di Phase 2 |
| Rate limit OFT API | Tidak didokumentasikan; tidak ada header rate limit |
| `robin.etherscan.io` | Merespons 403 terhadap `curl`; explorer resmi menurut docs Robinhood adalah Blockscout |
| Fee native drop (apakah kena multiplier executor) | `ExecutorFeeLib` belum dibaca |
| Gas `lzReceive` deploy, gas compose, gas `verify()` | Butuh kontrak; Phase 3 |
| Biaya per pesan sebagai quote nyata | Butuh `quoteSend` pada token terkonfigurasi; yang ada hanya estimasi fee DVN |
| AMM lain di Robinhood (mis. Rialto) | Hanya dari sumber pihak ketiga; tidak diverifikasi |
| BlockedMessageLib, ReadLib1002 | Alamat dari metadata; tidak dibaca on-chain |
| Syarat pakai OFT API | Belum ditinjau |
| Blokir DNS Telkomsel untuk `*.robinhood.com` | Tidak muncul selama sesi ini; tidak ada item yang dilewati |

## Label `[Belum]` yang tersisa di dokumen setelah Phase 0

| Dokumen | Yang tersisa | Alasan |
|---|---|---|
| `ARCHITECTURE.md` §7, §15 | Rate limit OFT API | Tidak didokumentasikan LayerZero |
| `PRD.md` §5.5 | Pembuktian perilaku compose gagal (P3) | Butuh tes multi-endpoint Phase 3 |
| `PRD.md` §6.2 | Penyimpanan gambar/metadata (P26) | Keputusan owner; relevan di Phase 4 |
| `DESIGN_SYSTEM.md` §3, §14 | D2 (mekanisme buka koin), D3 (font) | Keputusan desain owner; bukan lingkup Phase 0 |

Label lain yang memuat `[Belum]` hanyalah legenda di kepala dokumen dan kalimat aturan di `CLAUDE.md`.

## Catatan lingkungan

- Foundry v1.8.3 sudah terpasang di `~/.foundry` sebelum sesi ini (tidak ada di PATH). Installer `foundryup` yang dijalankan hanya memperbarui binary `foundryup`; versi forge/cast tidak berubah.
- Smoke build dijalankan di direktori sementara di luar repo dan dihapus setelahnya. Tidak ada `package.json`, `contracts/`, atau `src/` yang dibuat di repo.
- Hanya RPC publik tanpa kredensial yang dipakai. Tidak ada `.env` yang dibaca atau dibuat.
