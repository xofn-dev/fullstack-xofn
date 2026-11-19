# Lembar keputusan PM: parameter yang dibekukan sebelum audit

- **Tanggal:** 19 Nov 2026 (update: jawaban PM dari `jawaban-sementara.md`)
- **Untuk:** PM XofN (owner dan PM adalah orang yang sama)
- **Tujuan:** memutuskan hal-hal yang harus final **sebelum Phase 5 (audit)**. Kontrak tidak upgradeable, jadi nilai-nilai ini dibekukan saat deploy dorman (PRD P47, Opsi A).
- **Sumber:** `PRD.md` §11 (P#), `proof/2026-11-17-phase3/11-poolseeder-rereview.md`, `brief-xofn.md`, `deployguide-xofn.md`, `ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md`, dan `jawaban-sementara.md` (folder yang sama).
- **Status:** sebagian dijawab PM. Belum ada yang diubah di kode.

## Kenapa ini harus diputuskan sekarang

```
keputusan final -> perbaikan kontrak -> audit eksternal -> deploy dorman (nilai dibekukan) -> PM launch + CA
```

Launch dan CA dilakukan PM di ujung urutan (PRD P53). Tetapi semua nilai di bawah sudah terkunci di constructor sebelum itu. Mengubahnya sesudah audit membuat audit tidak berlaku.

Phase 6–7 (deploy, launch, `setRegistrar`) tetap FROZEN dan dikerjakan manusia. Lembar ini tidak membuka phase tersebut.

## Ringkasan

| # | Keputusan | Status terhadap brief/guide | Status jawaban |
|---|---|---|---|
| 1 | **P51** ETH pasangan di testnet | Dipersempit: opsi 5 gugur | **Dijawab:** opsi 1 |
| 2 | **P1** Operator DVN wajib | Dipersempit: kriteria jumlah terpenuhi | **Dijawab sebagian:** nama operator wajib X/Y masih dibutuhkan |
| 3 | **P43** Harga curve vs pool, plus P8, P15, P16 | Belum ada | **Belum dijawab** |
| 4 | **P41** Penerima LP | Belum ada | **Sementara:** alamat mati, menunggu konfirmasi |
| 5 | **P42** Batas ETH pasangan | Belum ada | **Belum dijawab** |
| 6 | **P47** Deploy dorman dan `setRegistrar` | Tidak ada di guide (usulan developer) | **Dijawab:** Opsi A |

**Masih perlu dari PM:**
- angka ekonomi untuk P43, P8, P15, P16;
- jumlah ETH pasangan (P42);
- konfirmasi penerima LP (P41), termasuk alamat persisnya;
- nama operator DVN wajib X dan Y (P1).

---

## 1. P51: ETH pasangan di testnet

**Masalah.** `nativeCap` dari Robinhood testnet ke Base Sepolia dan Arbitrum Sepolia bernilai 0, sehingga `quote` revert. `expandAndLock` dan `retryRemote` tidak bisa jalan di testnet sama sekali.

**Yang sudah ditentukan brief/guide:** opsi "lewati rehearsal omnichain di testnet" **gugur**. `deployguide-xofn.md` baris 346 mensyaratkan 7.3–7.5 lulus untuk gerbang 2a→2b, dan `brief-xofn.md` baris 243 mensyaratkan graduation penuh ke 2 chain sukses di testnet.

| Opsi | Mengubah kontrak? | Catatan |
|---|---|---|
| 1. Remote memakai ETH di saldonya sendiri, didanai langsung | Ya | Juga mengurangi ketergantungan mainnet pada cap 0,05 ETH ke Base |
| 2. Konfigurasi testnet dengan semua value 0, plus pendanaan Remote | Ya | |
| 3. Minta LayerZero menaikkan cap | Tidak | Di luar kendali tim |
| 4. Pool satu sisi | Ya | Brief menilai "paling sederhana tapi harga awalnya lemah" |

Aset pasangan memang diserahkan ke owner oleh `brief-xofn.md` baris 162 dan `deployguide-xofn.md` §4.3.

**Rekomendasi developer:** opsi 1.

> **Jawaban PM (19 Nov 2026):** **Opsi 1**, mengikuti rekomendasi. Perubahan kontraknya digabung dengan perbaikan P55 dalam satu putaran kontrak, satu review independen, dan satu deploy ulang ke Anvil. Dasar: rekomendasi developer, bukan playbook (playbook tidak membahas LayerZero).

---

## 2. P1: operator DVN wajib

**Masalah.** `config/tiers.json` di guide (§2) menyebut Google Cloud dan Polyhedra. Hasil Phase 0:
- Labs, DT, dan FCAT ada di ketiga chain.
- Google tidak ada di Robinhood.
- Polyhedra deprecated di Base dan Arbitrum, dan tidak ada di Robinhood.
- 13 operator alternatif tersedia di ketiga chain (`proof/2026-11-17-phase0/02-dvn-pathways.md`).

**Yang sudah ditentukan brief/guide:**
- Kriteria `deployguide-xofn.md` §4.2 berbasis **jumlah** (2 atau 3 DVN wajib dari operator berbeda, plus 2 Witness). Itu **terpenuhi** di mainnet untuk kedua tier.
- `deployguide-xofn.md` §9: Fortress tidak boleh diturunkan diam-diam. Bila tidak tersedia, UI menjelaskan.

**Yang belum ditentukan:** hanya **nama operator** di `tiers.json` yang tidak cocok dengan fakta on-chain. Menurut CLAUDE.md §2, fakta menang dan konfliknya diputuskan PM.

**Rekomendasi developer:**
- tier didefinisikan lewat jumlah;
- opsional tetap DT + FCAT;
- Polyhedra tidak dipakai;
- operator seragam di kedua pathway, karena keduanya lewat Robinhood.

> **Jawaban PM (19 Nov 2026):** mengikuti rekomendasi. Tier didefinisikan lewat jumlah, opsional tetap DT + FCAT, Polyhedra tidak dipakai, operator seragam di kedua pathway.
>
> **Masih terbuka:** nama operator wajib X (slot ke-2, Standard) dan Y (slot ke-3, Fortress). Alamat DVN dikunci di constructor Graduator, jadi keduanya wajib final sebelum Phase 5. Phase 0 mencatat Standard butuh 4 operator berbeda (2 wajib + 2 opsional) dan Fortress 5.

---

## 3. P43: harga akhir curve vs harga buka pool, plus parameter ekonomi

**Masalah.** Constructor tidak mengikat keduanya. Dengan konstanta tes, curve berakhir di 1,67e-8 ETH/token dan pool dibuka di 2,00e-8 (+19,6%). Pembeli terakhir di curve bisa menjual ke pool dengan selisih itu.

**Dasar di brief/guide:** hanya menyatakan parameter diputuskan owner (`brief-xofn.md` baris 322, `deployguide-xofn.md` §3 `.env`). Soal penyamaan harga tidak disebut.

**Opsi:**
- samakan lewat parameter (tanpa perubahan logika kontrak);
- atau paksa toleransi di constructor (perubahan kontrak).

**Rekomendasi developer:** samakan lewat parameter. Ini penilaian developer, bukan ketentuan brief/guide.

> **Jawaban PM (19 Nov 2026):** **belum ada angka.** Arah: samakan harga lewat parameter, bukan lewat perubahan kontrak.

**Angka yang dibutuhkan** (semuanya beku saat deploy dorman):

| Parameter | Keterangan | Angka |
|---|---|---|
| Harga awal curve | `CURVE_START_PRICE` (P8) | ______ |
| Ambang graduation (ETH) | `GRADUATION_THRESHOLD_ETH` (P8) | ______ |
| Insentif pemanggil `graduate()` | `GRADUATE_CALLER_REWARD` (P15) | ______ |
| Pembagian 999M: porsi curve, pool Robinhood, per chain ekspansi | P16 | ______ |

Angka ekonomi tidak boleh ditebak developer.

---

## 4. P41: penerima LP

**Masalah.** Siapa yang memegang token LP setelah pool dibuat. Pemegang token LP bisa menarik likuiditas pool. Nilainya satu alamat `immutable` di constructor Graduator dan Remote, berlaku untuk semua token, dan tidak bergantung pada CA. Jadi alamat ini harus final sebelum deploy dorman.

**Dasar di brief/guide:** `brief-xofn.md` baris 145 hanya menyebut "penerima LP" sebagai field `composeMsg`. Tidak ada ketentuan siapa penerimanya.

| Opsi | Efek |
|---|---|
| Alamat mati (`0x000000000000000000000000000000000000dEaD` atau `address(0)`) | LP tidak bisa ditarik siapa pun |
| Alamat Safe | Likuiditas token yang sudah Locked masih bisa ditarik, dan `verify()` tidak mencakup itu |
| Wallet pribadi (EOA) | Tidak disarankan: satu kunci bisa menarik likuiditas semua token, dan klaim "locked liquidity" tidak boleh dipakai |

**Rekomendasi developer:** alamat mati, karena paling konsisten dengan narasi "Graduate on proof, not promises". Ini penilaian developer, bukan ketentuan brief/guide.

> **Jawaban PM (19 Nov 2026):** **sementara alamat mati.** Arah ini sejalan dengan playbook §3.2, yang menolak proxy upgradeable karena admin permanen bisa mengganti logika dan menguras dana.
>
> **Masih perlu konfirmasi:**
> - final atau tidak;
> - alamat persis: `0x...dEaD` (konvensi umum) atau `address(0)` (perlu diuji dulu terhadap pair Uniswap v2);
> - apakah alamatnya diperiksa dulu di ketiga chain sebelum dibekukan.

**Catatan untuk copy:** `feeTo` aktif di ketiga factory Uniswap v2 (temuan Phase 0/3), sehingga sekitar 1/6 pertumbuhan fee pool terkunci mengalir ke `feeTo`. Copy "locked liquidity" perlu menyebut ini.

---

## 5. P42: batas ETH pasangan

**Masalah.** `expansionPairEth` dan anggaran ack dikunci di constructor Graduator. Bila LayerZero menurunkan `nativeCap` di bawah jumlah itu, `quoteSend` revert dan token yang sudah lulus tidak bisa diekspansi ke chain tersebut. Cap Robinhood ke Base 0,05 ETH sudah pas-pasan: compose value di tes 0,04 + 0,01.

**Dasar di brief/guide:** `brief-xofn.md` baris 158 hanya meminta cek "batas jumlah" native drop. Jumlahnya tidak ditentukan.

**Opsi:**
- terima dan dokumentasikan;
- pilih jumlah jauh di bawah cap;
- rancang ulang sumber ETH pasangan.

**Rekomendasi developer:** ikuti keputusan 1. Opsi 1 di sana sekaligus menjawab sebagian keputusan ini.

> **Jawaban PM (19 Nov 2026):** **belum ada angka.** Mengikuti jawaban #1 (opsi 1). Jumlah ETH pasangan dipilih bersama P16 (porsi likuiditas per chain), jauh di bawah cap 0,05 ETH ke Base.

---

## 6. P47: deploy dorman dan `setRegistrar`

Semua keputusan di atas bertumpu pada **Opsi A**: kontrak di-deploy dorman (`registrar` Registry kosong, sehingga `launch()` revert), lalu Safe memanggil `Registry.setRegistrar` saat PM siap.

**Dasar di brief/guide:** tidak ada. `deployguide-xofn.md` §5.2 dan §6 menyebut deploy lalu "launch terbatas", tanpa langkah `setRegistrar`. Opsi A adalah usulan developer di PRD.

Go-live tidak bisa dibatalkan, karena tidak ada saklar mati (P50). Pembatasan "launch terbatas" hanya bisa lewat UI dan komunikasi, bukan on-chain.

> **Jawaban PM (19 Nov 2026):** **Opsi A**, mengikuti rekomendasi. **Belum ditetapkan:** tanggal go-live, dan apakah go-live di Fase 1 atau setelah Remote siap. Keduanya diputuskan PM saat siap memanggil `setRegistrar`.

**Mekanisme `setRegistrar`** (pola diambil dari playbook `ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md` §4, §8 Phase I, §12. Playbook itu untuk aktivasi `deploy()` factory, bukan `setRegistrar`, jadi polanya dipakai sebagai acuan):
- **Siapa:** Safe v1.4.1 dengan threshold 2-of-3. Calldata `Registry.setRegistrar(...)` ditandatangani minimal dua owner. Satu EOA executor membayar gas.
- **Cara menandatangani:** script dan CLI (`cast wallet sign --no-hash <safeTxHash>`). Safe{Wallet} UI untuk chain 4663 tidak terbukti jalan.
- **Persetujuan tertulis:** sebelum broadcast, PM dan setiap signer menerima target, calldata, `safeTxHash`, dan Safe nonce. Setiap signer memeriksa sendiri.
- **Terikat pada:** chain ID, alamat Safe, Safe nonce, dan calldata. Bila salah satu berubah, tanda tangan ulang.
- **Celah:** belum ada script `setRegistrar`. Perlu script dengan pola dry-run dulu lalu broadcast. Itu pekerjaan Phase 6 (FROZEN).

**Syarat Safe yang perlu dicek sebelum P47 dan P41:**
- Owner Safe harus EOA polos. EIP-7702 aktif di 4663, dan code delegasi bisa menyetujui tx Safe tanpa private key.
- Jangan memakai alamat Safe testnet di mainnet. Alamat Safe deterministik lintas chain.
- Keystore ketiga owner jangan berada di satu laptop. Kalau iya, multisig tidak melindungi apa pun.
- `block.number` di script adalah blok L1. Untuk blok awal indexer, pakai blok L2 dari receipt atau explorer.
- RPC publik bukan archive node dan kadang mengembalikan receipt kosong.

---

## Lembar jawaban

| # | Keputusan | Jawaban | Tanggal |
|---|---|---|---|
| 1 | P51 | Opsi 1 (Remote memakai ETH di saldonya sendiri), varian "semua ETH curve masuk pool home". **Diimplementasikan** bersama perbaikan P55 | 19 Nov 2026 |
| 2 | P1 | Tier berbasis jumlah; opsional DT + FCAT; tanpa Polyhedra; seragam di kedua pathway. **Terbuka:** nama operator wajib X dan Y | 19 Nov 2026 (sebagian) |
| 3 | P43 + P8, P15, P16 | Belum ada angka. Arah: samakan harga lewat parameter | |
| 4 | P41 | Sementara alamat mati. **Terbuka:** konfirmasi dan alamat persis | 19 Nov 2026 (sementara) |
| 5 | P42 | Belum ada angka. Cap executor 0,05 ETH tidak berlaku lagi (P51). Angka wajib di bawah batas constructor `2·n·pe·saleSupply < (ambang − insentif)·(TOTAL − saleSupply)`, dipilih bersama P8/P16 | |
| 6 | P47 | Opsi A, `setRegistrar` lewat Safe 2-of-3 dengan persetujuan tertulis. **Terbuka:** tanggal go-live dan Fase 1 / setelah Remote | 19 Nov 2026 |

## Sudah ditutup di luar lembar (atas arahan PM, 19 Nov 2026)

Dua hal ini diputuskan developer dan tidak perlu jawaban. PM tetap bisa membatalkannya.

| Hal | Keputusan | Dasar |
|---|---|---|
| **P55** donasi WETH tanpa `sync` (HIGH) | Diperbaiki di `PoolSeeder.seed` (`sync()` sebelum membaca cadangan bila `totalSupply != 0`), plus tes donasi dan review independen ulang. ABI tidak berubah | `brief-xofn.md` baris 263 dan `deployguide-xofn.md` §7.5 mewajibkan hasil ini. Syarat gerbang: tidak ada temuan HIGH terbuka |
| **P17** fee trading curve | Tidak ada fee | Default tertulis di PRD P17. Brief hanya melarang pajak token dan tidak menyebut fee curve |

## Keputusan PM selama implementasi (19 Nov 2026)

Diambil lewat pertanyaan di sesi kerja, setelah review independen. Rincian: `proof/2026-11-19-phase3-p55-p51/notes.md`.

| Hal | Keputusan |
|---|---|
| Varian P51 opsi 1 | ETH curve yang dulu disisihkan untuk pool ekspansi masuk pool home. Tim mengisi saldo `XofNRemote` (subsidi `expansionPairEth` per chain per token) |
| Review pertama (MEDIUM #1, #2, LOW #3, #4) | Perbaiki semua: fallback `sync` di `PoolSeeder`, batas subsidi di constructor, koreksi NatSpec |
| Review kedua MEDIUM-1: harga basi saat ekspansi | Diterima sebagai biaya yang diketahui (PRD P60), paling banyak `expansionPairEth` per chain. Opsi TWAP dibawa ke auditor |
| Review kedua MEDIUM-2: pemerahan dekat batas | Faktor keamanan ½ pada batas subsidi |

## Batas

Lembar ini hanya berisi keputusan. Perubahan kontrak dan parameter dikerjakan di Phase 3 (gerbang dibuka kembali), lalu diaudit di Phase 5. Deploy, launch, CA, dan `setRegistrar` tetap tugas manusia/PM dan terkunci sampai ada perintah mulai.
