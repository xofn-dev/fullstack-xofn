# 07 — OFT API LayerZero dan RPC (P21)

Tanggal akses: **17 Nov 2026** (UTC 08:43–08:45).

## Sumber

| # | Sumber |
|---|---|
| S1 | https://docs.layerzero.network/v2/tools/api/oft-reference.md |
| S2 | Spesifikasi OpenAPI: https://docs.layerzero.network/openapi/oft-mainnet.json |
| S3 | Panggilan GET nyata ke `https://metadata.layerzero-api.com/v1/metadata/experiment/ofts/list` |
| S4 | https://metadata.layerzero-api.com/v1/metadata (bagian `tokens`, `addressToOApp`, `rpcs`) |
| S5 | https://docs.robinhood.com/chain/connecting |

## OFT API

| Hal | Fakta |
|---|---|
| Base URL | `https://metadata.layerzero-api.com/v1/metadata/experiment/ofts` (S2). Path memuat kata `experiment` |
| Endpoint | `GET /list` (discovery), `GET /transfer` (membuat calldata `send`), `GET /openapi` |
| Auth | `/list` **gratis tanpa key** (S1, S3). `/transfer` butuh header `x-layerzero-api-key` (S1, S2) |
| Parameter `/list` | `chainNames`, `symbols`, `protocols`, `contractAddresses` (semua opsional) |
| Bentuk respons | Objek ber-key simbol → array entri `{ name, sharedDecimals, endpointVersion, deployments: { <chainKey>: { address, localDecimals, type } } }` |
| Rate limit | **Tidak didokumentasikan**; respons tidak membawa header rate limit. Tetap `[Belum]` |
| Syarat pakai | Ada "OFT API Terms of Use" (S1); belum ditinjau |

Cakupan saat diakses (S3):
- 358 simbol, 369 entri (303 endpoint V2, 66 V1).
- 172 entri punya deployment Base, 125 Arbitrum, **0 Robinhood**.
- 59 entri V2 punya deployment di Base dan Arbitrum sekaligus (cukup untuk gerbang "20 OFT" Phase 2).

Arti untuk XofN Check:
1. `LZ_OFT_API_KEY` **tidak dibutuhkan**. XofN hanya memakai `/list`; `/transfer` tidak dipakai karena transaksi disusun di browser.
2. OFT API tidak bisa menjadi satu-satunya sumber discovery: Robinhood tidak tercakup, dan daftar deployment bukan daftar peer. Pada contoh di `03-uln-semantics.md`, dua OFT punya deployment di Base dan Arbitrum tetapi `peers(30110)` di Base kosong.
3. Jalur discovery yang selalu tersedia: pindai `peers(eid)` untuk EID di registry chain. OFT API menjadi pelengkap.
4. OFT nyata di Robinhood tetap ada untuk bahan uji: metadata LayerZero (S4) mencatat 136 token dan 84 OApp di Robinhood, termasuk beberapa bertipe `NativeOFT`.

## RPC (P21)

- Base dan Arbitrum: banyak RPC publik tercatat di S4 (mis. `https://mainnet.base.org`, `https://arb1.arbitrum.io/rpc`). Keduanya dipakai sepanjang Phase 0 tanpa key.
- Robinhood: satu RPC publik resmi, dibatasi rate dan tidak disarankan untuk produksi (S5). Provider yang disebut docs: Alchemy (rekomendasi), Chainstack, QuickNode, Blockdaemon, dRPC, Validation Cloud, GlobalStake, Pinax.
- Selama Phase 0, RPC publik Robinhood melayani lebih dari 100 panggilan baca berurutan tanpa error rate limit. Ini bukan jaminan untuk beban Check.

Rekomendasi ada di `08-recommendations.md` (P21).
