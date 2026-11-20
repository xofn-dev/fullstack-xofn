# UI mengikuti mode testnet live (21 Nov 2026)

Konteks: go-live Robinhood testnet sudah dieksekusi lewat Safe (tx `0x156cf57b715fd1e109ec7e8b059404069be0d942ce096a9b578c9288f336a11b`, blok 155929990; `proof/2026-11-19-phase6-1a/`). Banyak bagian UI hanya punya cabang `preview` dan `simulation`, sehingga di produksi bagian itu masih menampilkan token fiktif dan copy "NOT LIVE / NOT DEPLOYED". Lingkup: Phase 4 (halaman aplikasi). Kontrak, script, dan manifest tidak disentuh.

## Temuan dari produksi (https://xofnprotocol.com, read-only)

- Launch pertama dari wallet pengguna berhasil: tx `0x200437739a7fe43d370541e57e9ca93247ce4b14b748da07a0a306dd64910cdf` (blok 155970774), token `0x97f04fe53eaa2f4bff1449a6af4e1e10a70cf77e` (`XofN Test One`, `XTEST1`). Token kedua `XTEST2` di `0xeb940338dd236a7d8fddd27ffa70f876e047a5f7`.
- Halaman token sempat menampilkan "TOKEN NOT READ" (`/api/tokens/<addr>` → `rpc_failed`). Kode yang sama di lokal (cache memori) membaca token dengan benar. Produksi memakai Supabase (`/api/check` → `backend: "supabase"`). Setelah pengguna menyiapkan tabel index token di Supabase produksi, `/api/tokens` dan `/api/tokens/<addr>` membaca kedua token. Penyebab pastinya tidak diverifikasi agent: agent tidak punya akses database produksi.
- Catatan: `toServiceError` (`src/lib/tokens/service.ts`) membungkus semua error, termasuk error database, sebagai `rpc_failed`. Rekomendasi: bedakan error store dan error RPC di log server.
- Video Head Dev: form "Create a launch" di **home** memang selalu demo dan tidak pernah bertransaksi. Launchpad asli ada di `/launch`.

## Perubahan

| Area | Sebelum (mode live testnet) | Sesudah |
|---|---|---|
| Home · Discover | token FIKTIF (`ExploreDemo`) | token asli dari `/api/tokens` (`ExploreLive`), subtitle `TESTNET`, catatan: tanpa dana nyata, belum diaudit, belum ada token yang bisa Locked |
| Home · form launch | modal "LAUNCH DRAFT / NO TRANSACTION" | tombol "Continue to launch ↗": nama/ticker/tier/chain dibawa ke `/launch?…` (`src/lib/launch-draft.ts`), chip `TESTNET` |
| Home · hero, intro loader | `XOFN / PROTOCOL PREVIEW ● NOT LIVE` | `XOFN / TESTNET ● LAUNCHPAD OPEN` (`statusLabel`/`statusFlag` di `src/lib/mode.ts`) |
| Home · architecture | `INTERACTIVE PROTOCOL PREVIEW / NOT LIVE` | `INTERACTIVE PROTOCOL MODEL / ILLUSTRATION` |
| Home · Proof | Curve/Graduator/Registry `PLANNED` | `ON TESTNET`; invarian owner/delegate `NO TOKEN LOCKED YET`; audit tetap `REQUIRED` |
| Home · Contracts | semua "Not published / PLANNED / NOT DEPLOYED" | Curve (impl), Graduator, Registry: alamat manifest + tautan explorer, `ON TESTNET`; Token `PER LAUNCH`; Remote tetap `PLANNED`; tag `TESTNET · UNAUDITED` + tautan `/contracts` |
| `/contracts` | "No XofN contract is deployed on a public network yet" | copy live: Safe sudah membuka launch, ekspansi belum di-deploy |
| `/proof` | "Nothing below is deployed…", 1a `PLANNED` | 1a `● LIVE ON TESTNET · UNAUDITED`; invarian `NOT SHOWN YET · NO TOKEN HAS EXPANDED`; dua folder bukti baru |
| Metadata | "Preview build." | `buildNote` per mode ("Testnet build: no real funds, contracts unaudited.") |
| `/bridge` (simulation) | label tetap `LOCAL SIMULATION` | label dari `actionTag` |

Tidak diubah, karena memang belum ada: label `PLANNED` untuk ekspansi, omnichain, dan bridge; demo Check di home (berlabel sampel); `/bridge` di testnet tetap demo (tanpa chain ekspansi). Mode `preview` dan `simulation` tidak berubah. `live` di mainnet tetap melempar error (1b FROZEN).

Tes basi diperbaiki: `tests/web3.test.ts` masih mengharapkan manifest testnet `deployed-dormant`. Sekarang fakta `live` diuji, dan aturan "dorman tidak dibaca aplikasi" tetap diuji lewat salinan berstatus dorman.

## Hasil pemeriksaan

- `npm run lint` lulus; `npm run typecheck` lulus; `npm run test` 138/138 lulus (termasuk `tests/launch-draft.test.ts` baru); `npm run build` lulus.
- `next start` lokal, network `testnet`: HTML `/`, `/contracts`, `/proof`, `/launch`, `/check`, `/bridge` tidak lagi memuat "NOT LIVE", "Preview build", "FICTIONAL", atau "LOCAL SIMULATION". "NOT DEPLOYED" tersisa hanya untuk chain ekspansi.
- Chrome headless (CDP) di 390/768/1280/1680: overflow horizontal halaman 0. Discover menampilkan `XofN Test Two` dan `XofN Test One` dari chain. Tabel Contracts di 390px bergulir di dalam `.table-scroll`, perilaku lama.
- Klik form home: `/launch?name=XofN+Test+Three&ticker=XTEST3&tier=standard&chains=base`, dan form `/launch` terisi (Base tercentang, Arbitrum tidak).
- Regresi preview: build `NEXT_PUBLIC_XOFN_NETWORK=mainnet` masih menampilkan `PROTOCOL PREVIEW ● NOT LIVE`, token FICTIONAL, dan "Preview build".
- Tidak dijalankan: uji reduced motion, uji manual trading curve di testnet.

## Usulan (belum dikerjakan)

- Cek saldo ETH testnet dan tautan faucet sebelum sign launch/buy (alur Head Dev). URL faucet harus diverifikasi dan disimpan di registry chain.
- Halaman daftar token tersendiri (`/tokens`): fitur baru, perlu persetujuan PM (CLAUDE.md §12).
