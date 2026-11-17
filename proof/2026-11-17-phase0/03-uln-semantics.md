# 03 — Semantik ULN, library, delegate, compose (P5, P3, P7)

Tanggal akses: **17 Nov 2026**.

## Sumber

Source LayerZero V2 pada commit yang dipin: `LayerZero-Labs/LayerZero-v2@9c741e7f9790639537b1710a203bcdfd73b0b9ac` (HEAD `main` saat diakses).
Pola URL: `https://github.com/LayerZero-Labs/LayerZero-v2/blob/9c741e7f9790639537b1710a203bcdfd73b0b9ac/packages/layerzero-v2/evm/<path>`

| # | File (`<path>`) |
|---|---|
| F1 | `messagelib/contracts/uln/UlnBase.sol` |
| F2 | `messagelib/contracts/uln/uln302/SendUln302.sol` |
| F3 | `messagelib/contracts/uln/uln302/ReceiveUln302.sol` |
| F4 | `messagelib/contracts/SendLibBase.sol` |
| F5 | `messagelib/contracts/uln/SendUlnBase.sol` |
| F6 | `protocol/contracts/MessageLibManager.sol` |
| F7 | `protocol/contracts/EndpointV2.sol` |
| F8 | `protocol/contracts/MessagingComposer.sol` |
| F9 | `oapp/contracts/oapp/OAppCore.sol`, `oapp/contracts/oapp/OAppSender.sol` |
| F10 | `oapp/contracts/oft/OFTCore.sol` |

Sumber lain: docs [transfer-ownership](https://docs.layerzero.network/v2/developers/evm/technical-reference/transfer-ownership.md), [composer overview](https://docs.layerzero.network/v2/developers/evm/composer/overview.md), isu [QUIP-25](https://github.com/QuipNetwork/quip-token/issues/3).

Bukti empiris: [`raw/oft-samples.txt`](raw/oft-samples.txt) (3 OFT nyata di Base) dan [`raw/smoke-build.txt`](raw/smoke-build.txt) (4 tes TestHelperOz5 di direktori sementara).

## 1. Nilai 0 di konfigurasi ULN custom (P5) — **ya, 0 berarti default**

F1, struct `UlnConfig` dan `getUlnConfig` (baris 8–16, 74–118):

- `confirmations == 0` → pakai default. `type(uint64).max` (`NIL_CONFIRMATIONS`) → benar-benar 0 konfirmasi.
- `requiredDVNCount == 0` → pakai DVN wajib default. `255` (`NIL_DVN_COUNT`) → benar-benar tanpa DVN wajib.
- `optionalDVNCount == 0` → pakai DVN opsional **dan threshold** default. `255` → benar-benar tanpa DVN opsional.
- Konfigurasi default sendiri bernilai literal dan tidak boleh memakai NIL.
- Hasil gabungan wajib punya minimal satu DVN (`LZ_ULN_AtLeastOneDVN`).
- Validasi set: panjang array = count, maksimum 127, threshold di `(0, optionalDVNCount]`, alamat **terurut naik tanpa duplikat** (`LZ_ULN_Unsorted`). DVN wajib dan opsional boleh tumpang tindih.

Executor (F4, `getExecutorConfig`): `maxMessageSize == 0` → default; `executor == address(0)` → default.

Konsekuensi untuk XofN: tier yang "tanpa DVN opsional" harus memakai `255`, bukan `0`. Kedua tier XofN punya 2 opsional dengan threshold 1, jadi semua field diisi nilai bukan nol. Selama `confirmations`, `requiredDVNCount`, `optionalDVNCount`, `maxMessageSize`, dan `executor` semuanya bukan nol, konfigurasi efektif tidak bergantung pada default.

Dikonfirmasi tes: `test_ulnConfigZeroMeansDefault_andExplicit2plus1of2` (konfirmasi 0 jatuh ke default; urutan DVN terbalik revert).

## 2. `getConfig` mengembalikan konfigurasi **efektif**

- F2 baris 46–54 dan F3 baris 70–76: `getConfig` memanggil `getUlnConfig(_oapp, _eid)`, yaitu gabungan custom + default.
- Konfigurasi mentah milik aplikasi tersedia lewat `getAppUlnConfig(oapp, eid)` di library (F1 baris 121–123).
- XofN Check bisa menampilkan keduanya: efektif dari `endpoint.getConfig`, mentah dari `lib.getAppUlnConfig`. Field mentah yang 0 = bergantung pada default.

Contoh nyata (Base, pathway ke EID 30110, blok 58573665–58573905):

| OFT | `getConfig` efektif (send) | `getAppUlnConfig` mentah (send) | Library | Peer |
|---|---|---|---|---|
| `0x6985884c4392d348587b19cb9eaaf157f13271cd` | 10 · 2 wajib | 10 · 2 wajib | bukan default | ada |
| `0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34` | **10** · 2 wajib | **0** · 2 wajib | default | kosong |
| `0x1bc71130a0e39942a7658878169764bbd8a45993` | 42 · 1 wajib | 42 · 1 wajib | default | kosong |

Baris kedua memperlihatkan konfirmasi 0 (mentah) menjadi 10 (efektif, dari default). Baris kedua dan ketiga juga memperlihatkan konfigurasi bisa ada tanpa peer; pathway seperti itu tidak aktif. Ini pembacaan fakta, bukan penilaian terhadap token mana pun.

## 3. Konstanta tipe konfigurasi

- `CONFIG_TYPE_EXECUTOR = 1`, `CONFIG_TYPE_ULN = 2` (F2 baris 16–17).
- ReceiveUln302 hanya mengenal `CONFIG_TYPE_ULN = 2` (F3 baris 19–20). Tipe 1 pada receive library revert `LZ_ULN_InvalidConfigType(1)` (terlihat di `raw/oft-samples.txt`).

## 4. Library default vs eksplisit

- `getSendLibrary(sender, eid)` mengembalikan library efektif; `isDefaultSendLibrary(sender, eid)` memberi tahu apakah masih default (F6 baris 83–93).
- `getReceiveLibrary(receiver, eid)` mengembalikan `(lib, isDefault)` (F6 baris 96–103).
- Ada **grace period** receive library: `receiveLibraryTimeout(receiver, eid)` (F6). Library lama tetap sah sampai `expiry`. `verify()` perlu memastikan timeout ini kosong, selain memeriksa library aktif.

## 5. Owner, delegate, dan siapa yang boleh mengubah konfigurasi

- Delegate disimpan di endpoint: `mapping(address oapp => address delegate) public delegates` (F7 baris 40). `setDelegate` di OApp bersifat `onlyOwner` (F9).
- Otorisasi endpoint (F7 baris 355–357): `msg.sender == oapp || msg.sender == delegates[oapp]`. Artinya **kontrak OApp itu sendiri selalu berwenang**, walaupun delegate = 0.
- Akibatnya, "owner = 0 dan delegate = 0" hanya mengunci konfigurasi bila bytecode token tidak punya jalur lain untuk memanggil `setConfig` / `setSendLibrary` / `setReceiveLibrary` di endpoint. OFT standar tidak punya jalur itu. `XofNToken` tidak boleh menambahkannya, dan auditor perlu memeriksanya.
- Untuk OFT pihak lain, XofN Check tidak bisa membuktikan ketiadaan jalur itu hanya dari `owner()` dan `delegates()`. Proxy yang bisa di-upgrade adalah contoh paling jelas (admin proxy bisa mengganti logika). Rekomendasi Phase 2: baca slot EIP-1967 dan jangan beri label "locked" bila ada admin proxy.
- QUIP-25: temuan audit Quip Chain bahwa `renounceOwnership` meninggalkan delegate di endpoint yang tidak bisa dicabut lagi, karena hanya owner yang bisa memanggil `setDelegate`. Perbaikannya sama dengan aturan brief: nolkan delegate sebelum `super.renounceOwnership()`.
- Dikonfirmasi tes: `test_renounceNullsDelegateFirst_thenConfigLocked` (setelah renounce, owner = 0, delegate = 0, dan `endpoint.setConfig` dari pihak luar revert).
- Catatan implementasi: interface `ILayerZeroEndpointV2` di paket `lz-evm-protocol-v2@3.0.168` tidak memuat `delegates(address)`. Registry butuh interface kecil sendiri.

## 6. `send` butuh peer lebih dulu

- F9 `OAppSender._lzSend` memanggil `_getPeerOrRevert(_dstEid)`; tanpa peer → revert `NoPeer(eid)`.
- Dikonfirmasi tes: `test_sendWithoutPeerReverts`.
- Digabung dengan temuan `02-dvn-pathways.md` (default pathway Robinhood = Dead DVN): likuiditas tidak bisa dikirim sebelum peer **dan** konfigurasi ULN eksplisit terpasang. Urutan di brief (langkah 4 kirim likuiditas, langkah 5 pasang konfigurasi dan peer) tidak bisa dijalankan apa adanya. Lihat `08-recommendations.md` butir "Urutan graduation".

## 7. Compose: apa yang terjadi bila `lzCompose` gagal (P3 — jawaban dari source; final di Phase 3)

- `OFTCore._lzReceive` (F10 baris 240–270) mengkreditkan token ke `toAddress` lebih dulu, lalu memanggil `endpoint.sendCompose(toAddress, guid, 0, composeMsg)`. Token **sudah berada di composer** sebelum compose dijalankan.
- `endpoint.lzCompose` (F8 baris 39–59) adalah transaksi terpisah. Ia mencocokkan hash pesan, menandai `RECEIVED`, lalu memanggil composer. Bila composer revert atau kehabisan gas, seluruh transaksi itu batal, hash tetap tersimpan, dan compose **bisa dijalankan ulang**.
- `endpoint.lzCompose` bisa dipanggil **siapa saja**, dengan gas dan `msg.value` berapa pun. Tidak ada kedaluwarsa di kode endpoint.
- Setelah berhasil sekali, hash berubah menjadi `RECEIVED` dan tidak bisa dijalankan lagi.
- Arti untuk `XofNRemote`:
  - "retryCompose" pada dasarnya adalah memanggil ulang `endpoint.lzCompose` dengan pesan yang sama;
  - composer tidak boleh bergantung pada identitas executor, `msg.value`, atau `extraData`;
  - semua parameter pool harus berasal dari `composeMsg`;
  - bila compose gagal permanen (mis. pool sudah diinisialisasi pihak lain), token tertahan di Remote, jadi jalur keluar harus dirancang dan diuji di Phase 3.

## 8. Shared decimals dan dust

- `decimalConversionRate = 10 ** (localDecimals - sharedDecimals())`; `_removeDust` membulatkan ke bawah (F10 baris 56, 317–319). Dengan 18 desimal lokal dan shared decimals 6, satuan terkecil lintas chain = 10¹² wei = 0,000001 token.
- Dikonfirmasi tes: `test_sendAndDustWithSharedDecimals6` (sisa 999 999 999 999 wei tetap di wallet pengirim; total supply dua chain tetap 999M).

## 9. DVN mana yang dibayar

- F5 baris 58–71 dan 90–116: `_assignJobs` dan `_quoteDVNs` berjalan atas `requiredDVNCount + optionalDVNCount`. Semua DVN opsional ikut dibayar, bukan hanya sejumlah threshold. Standard membayar 4 DVN per pesan, Fortress 5.

## Belum terverifikasi

- Cara fee native drop dihitung (apakah multiplier executor ikut dikenakan pada nilai yang dikirim): `ExecutorFeeLib` belum dibaca.
- Gas nyata `verify()` dan gas compose: diukur di Phase 3 (P4, P7).
