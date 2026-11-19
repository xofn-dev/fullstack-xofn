# Jawaban sementara untuk lembar keputusan PM

- **Tanggal:** 19 Nov 2026
- **Untuk:** PM XofN
- **Melengkapi:** `lembar-keputusan.md` (folder yang sama). File itu tidak diubah.
- **Status:** **sementara.** Atas arahan PM (19 Nov 2026), P51, P1, dan P47 mengikuti rekomendasi developer. Yang masih perlu jawaban PM hanya **P43 + P8, P15, P16**, **P41**, dan **P42**. Tidak ada kode atau parameter yang diubah.
- **Sumber:**
  - `lembar-keputusan.md` (folder yang sama).
  - `PRD.md` (xofn) untuk P41 dan P47.
  - Playbook Fademan: `fullstack-fademan/ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md` (v1.0, 13 Nov 2026), untuk pola deploy dan aktivasi lewat Safe.

## Yang masih perlu dijawab PM

1. **P43 + P8, P15, P16:** angka ekonomi.
2. **P41:** alamat mati atau Safe.
3. **P42:** jumlah ETH pasangan.

Selain itu semuanya mengikuti rekomendasi (lihat tabel).

## Batas jawaban ini

- Playbook membahas pola factory sekali-pakai untuk Escrow dan Splitter. Ia **tidak** membahas Registry, Graduator, LayerZero, atau Uniswap v2. Jadi ia hanya menjawab sebagian P47 dan P41.
- Riwayat deploy Cognita dan Fademan diketahui dari pernyataan playbook ("sudah pernah dijalankan"), belum diperiksa ulang ke laporan atau chain mereka.
- Untuk Assize: reservasi mainnet (P1) selesai 13 Nov 2026, rehearsal testnet dilewati, aktivasi (P2) belum karena CA belum ada.
- Tidak ada angka ekonomi yang diisi di sini. Angka itu keputusan PM.

## Lembar jawaban (versi sementara)

| # | Keputusan | Jawaban sementara | Dasar | Masih butuh dari PM |
|---|---|---|---|---|
| 1 | P51 ETH pasangan testnet | **Opsi 1** (Remote memakai ETH di saldonya, didanai langsung). **Mengikuti rekomendasi, PM setuju.** | Rekomendasi developer di lembar. **Bukan** dari playbook, yang tidak membahas LayerZero. Opsi 5 sudah gugur menurut brief/guide | Tidak ada. Perubahan kontrak digabung dengan perbaikan P55 dalam satu putaran |
| 2 | P1 operator DVN | Tier didefinisikan lewat **jumlah**. Opsional tetap DT + FCAT. Polyhedra tidak dipakai. Operator seragam di kedua pathway. **Mengikuti rekomendasi, PM setuju.** | Rekomendasi developer di lembar | Tidak ada. Kriteria jumlah sudah terpenuhi di mainnet. Nama operator wajib X dan Y belum ditetapkan karena rekomendasinya berbasis jumlah |
| 3 | P43 + P8, P15, P16 | **Belum dijawab.** Arah: samakan harga lewat parameter, bukan lewat perubahan kontrak | Rekomendasi developer di lembar | **Semua angka:** `CURVE_START_PRICE`, `GRADUATION_THRESHOLD_ETH`, `GRADUATE_CALLER_REWARD`, pembagian 999M |
| 4 | P41 penerima LP | **Alamat mati** (`0x...dEaD`) | Rekomendasi developer di lembar. Playbook §3.2 mendukung arahnya: admin permanen yang bisa menguras dana ditolak, dan pola ini memakai nilai immutable | Konfirmasi. Copy "locked liquidity" harus menyebut `feeTo` aktif (sekitar 1/6 pertumbuhan fee pool terkunci) |
| 5 | P42 batas ETH pasangan | **Belum dijawab.** Mengikuti jawaban #1 | Lembar | Jumlah ETH pasangan, dipilih bersama P16 dan jauh di bawah cap 0,05 ETH ke Base |
| 6 | P47 deploy dorman dan `setRegistrar` | **Opsi A.** **Mengikuti rekomendasi, PM setuju.** Detail mekanisme di bawah | Usulan developer di `PRD.md` (xofn). Pola aktivasi Safe diambil dari playbook `fullstack-fademan/ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md` §8 Phase I | Tidak ada untuk konfirmasi Opsi A. Tanggal go-live dan Fase 1 atau setelah Remote siap belum ditetapkan, dan tetap diputuskan saat PM siap memanggil `setRegistrar` |

## Detail P47: mekanisme `setRegistrar`

Ini jawaban untuk "siapa dan bagaimana". Kapan go-live tetap PM.

Mekanisme di bawah diambil dari playbook `fullstack-fademan/ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md`: §4 (fakta chain, Safe UI), §8 Phase I (aktivasi lewat Safe, gate G4), dan §12 #12 (persetujuan tertulis). Playbook itu untuk aktivasi `deploy()` factory, bukan `setRegistrar`. Polanya dipakai sebagai acuan, bukan sudah dijalankan untuk Registry XofN.

- **Siapa memanggil:** Safe v1.4.1 dengan threshold 2-of-3. Calldata `Registry.setRegistrar(...)` ditandatangani oleh minimal dua owner. Satu EOA executor membayar gas.
- **Cara menandatangani:** script dan CLI (`cast wallet sign --no-hash <safeTxHash>`). Safe{Wallet} UI untuk chain 4663 tidak terbukti jalan (playbook §4).
- **Persetujuan tertulis:** sebelum broadcast, PM dan setiap signer menerima target, calldata, `safeTxHash`, dan Safe nonce. Setiap signer memeriksa sendiri. Persetujuan lisan sudah pernah jadi masalah (playbook §12 #12).
- **Terikat pada:** chain ID, alamat Safe, Safe nonce, dan calldata. Bila salah satu berubah, tanda tangan ulang.
- **Tidak bisa dibatalkan:** tidak ada saklar mati (P50). Gerbang tertulis sebelum broadcast wajib.
- **Celah:** playbook tidak punya script untuk `setRegistrar`. Perlu script baru, dengan pola dry-run dulu lalu broadcast, seperti `ActivateReservedDeployer`.

## Syarat Safe yang perlu dicek sebelum P47 dan P41 (dari playbook)

- Owner Safe harus EOA polos. EIP-7702 aktif di 4663, dan code delegasi bisa menyetujui tx Safe tanpa private key (playbook §12 #1–2).
- Jangan memakai alamat Safe testnet di mainnet. Alamat Safe deterministik lintas chain (§12 #15).
- Bila ketiga keystore owner ada di satu laptop, multisig tidak melindungi apa pun. Ini terjadi di Safe Assize dan perlu `swapOwner` sebelum aktivasi.
- `block.number` di script adalah blok L1. Untuk blok awal indexer pakai blok L2 dari receipt atau explorer.
- RPC publik bukan archive node dan kadang mengembalikan receipt kosong.

## Sudah ditutup di luar lembar

P55 (perbaikan `PoolSeeder.seed`) dan P17 (tanpa fee curve) tetap seperti di `lembar-keputusan.md`. PM masih bisa membatalkannya.

## Langkah berikutnya

1. PM mengisi angka untuk #3 (P43 + P8, P15, P16) dan #5 (P42), serta memilih #4 (P41).
2. #1, #2, dan #6 dicatat sebagai mengikuti rekomendasi.
3. Hasilnya dipindahkan ke tabel "Lembar jawaban" di `lembar-keputusan.md`.
4. Setelah itu perubahan kontrak dikerjakan di Phase 3, lalu diaudit di Phase 5. Deploy, launch, CA, dan `setRegistrar` tetap tugas manusia dan terkunci.
