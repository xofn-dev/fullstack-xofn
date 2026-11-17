# 01 — Chain, EID, dan kontrak LayerZero V2

Tanggal akses semua sumber: **17 Nov 2026** (UTC 08:36–08:56).

## Sumber

| # | Sumber | Dipakai untuk |
|---|---|---|
| S1 | https://metadata.layerzero-api.com/v1/metadata (API metadata LayerZero; halaman deployment di docs dirender dari data ini) | Chain ID, EID, alamat kontrak |
| S2 | https://docs.layerzero.network/v2/deployments/deployed-contracts.md | Aturan `30xxx` mainnet / `40xxx` testnet, definisi Dead DVN |
| S3 | Pembacaan on-chain `cast chain-id` dan `EndpointV2.eid()` lewat RPC publik | Konfirmasi independen |
| S4 | https://docs.robinhood.com/chain/connecting | Chain ID, RPC, explorer resmi Robinhood Chain |

Catatan: halaman `docs.layerzero.network/v2/deployments/chains/<chain>` hanya berisi judul bila diambil sebagai markdown; tabelnya dimuat dari S1. Karena itu S1 dipakai sebagai sumber docs, dan S3 sebagai pembanding.

Ekstrak S1: [`raw/lz-metadata-chains.json`](raw/lz-metadata-chains.json). Keluaran S3: [`raw/chains-defaults.txt`](raw/chains-defaults.txt).

## Hasil — chain ID dan EID (S1 = S3 untuk keenam chain)

| Chain | Chain ID | EID | Blok saat dibaca | RPC publik yang dipakai |
|---|---|---|---|---|
| Base | 8453 | **30184** | 58576737 | `https://mainnet.base.org` |
| Arbitrum One | 42161 | **30110** | 524989316 | `https://arb1.arbitrum.io/rpc` |
| Robinhood Chain | **4663** | **30416** | 116454375 | `https://rpc.mainnet.chain.robinhood.com` |
| Base Sepolia | 84532 | 40245 | 59919317 | `https://sepolia.base.org` |
| Arbitrum Sepolia | 421614 | 40231 | 330047883 | `https://sepolia-rollup.arbitrum.io/rpc` |
| Robinhood testnet | **46630** | **40451** | 154440617 | `https://rpc.testnet.chain.robinhood.com` |

Chain ID Robinhood (4663 / 46630) juga cocok dengan S4.

## Hasil — alamat kontrak LayerZero V2 (S1)

| Kontrak | Base | Arbitrum One | Robinhood Chain |
|---|---|---|---|
| EndpointV2 | `0x1a44076050125825900e736c501f859c50fe728c` | `0x1a44076050125825900e736c501f859c50fe728c` | `0x6f475642a6e85809b1c36fa62763669b1b48dd5b` |
| SendUln302 | `0xb5320b0b3a13cc860893e2bd79fcd7e13484dda2` | `0x975bcd720be66659e3eb3c0e4f1866a3020e493a` | `0xc39161c743d0307eb9bcc9fef03eeb9dc4802de7` |
| ReceiveUln302 | `0xc70ab6f32772f59fbfc23889caf4ba3376c84baf` | `0x7b9e184e07a6ee1ac23eae0fe8d6be2f663f05e6` | `0xe1844c5d63a9543023008d332bd3d2e6f1fe1043` |
| Executor | `0x2cca08ae69e0c44b18a57ab2a87644234daebae4` | `0x31cae3b7fb82d847621859fb1585353c5720660d` | `0x4208d6e27538189bb48e603d6123a94b8abe0a0b` |
| LZ Dead DVN | `0x6498b0632f3834d7647367334838111c8c889703` | `0x758c419533ad64ce9d3413bc8d3a97b026098ec1` | `0x6788f52439aca6bff597d3eec2dc9a44b8fee842` |
| BlockedMessageLib | `0x1ccbf0db9c192d969de57e25b3ff09a25bb1d862` | `0x1ccbf0db9c192d969de57e25b3ff09a25bb1d862` | `0xc1ce56b2099ca68720592583c7984cab4b6d7e7a` |
| ReadLib1002 | `0x1273141a3f7923aa2d9eddfa402440ce075ed8ff` | `0xbcd4cadcac3f767c57c4f402932c4705df62beff` | **tidak ada** |

| Kontrak | Base Sepolia | Arbitrum Sepolia | Robinhood testnet |
|---|---|---|---|
| EndpointV2 | `0x6edce65403992e310a62460808c4b910d972f10f` | `0x6edce65403992e310a62460808c4b910d972f10f` | `0x3acaaf60502791d199a5a5f0b173d78229ebfe32` |
| SendUln302 | `0xc1868e054425d378095a003ecba3823a5d0135c9` | `0x4f7cd4da19abb31b0ec98b9066b9e857b1bf9c0e` | `0x45841dd1ca50265da7614fc43a361e526c0e6160` |
| ReceiveUln302 | `0x12523de19dc41c91f7d2093e0cfbb76b17012c8d` | `0x75db67cdab2824970131d5aa9cecfc9f69c69636` | `0xd682ecf100f6f4284138aa925348633b0611ae21` |
| Executor | `0x8a3d588d9f6ac041476b094f97ff94ec30169d3d` | `0x5df3a1cebbd9c8ba7f8df51fd632a9aef8308897` | `0x701f3927871efcea1235db722f9e608ae120d243` |
| ReadLib1002 | `0x29270f0cfc54432181c853cd25e2fb60a68e03f2` | `0x54320b901fde49ba98de821ccf374ba4358a8bf6` | **tidak ada** |

Alamat di tabel ini berasal dari S1. Yang dikonfirmasi on-chain hanya EndpointV2 (lewat `eid()`), SendUln302/ReceiveUln302 (lewat `defaultSendLibrary`/`defaultReceiveLibrary` dan `getUlnConfig`), Executor (lewat `dstConfig`), dan Dead DVN (muncul sebagai DVN default pathway Robinhood). BlockedMessageLib dan ReadLib1002 belum dibaca on-chain.

## Hal yang perlu diperhatikan

1. **Alamat EndpointV2 di Robinhood berbeda** dari Base/Arbitrum. Constructor OFT menerima alamat endpoint, jadi creation code berbeda antar-chain. Alamat seragam hanya mungkin dengan CREATE3 (salt saja), bukan CREATE2.
2. **Robinhood tidak punya ReadLib1002** di mainnet maupun testnet (S1). lzRead belum bisa dipakai di sana (fakta untuk P10 dan P13).
3. **Explorer Robinhood:** docs resmi (S4) menyebut `https://robinhoodchain.blockscout.com` (merespons 200). Metadata LayerZero menyebut `https://robin.etherscan.io` (merespons 403 terhadap `curl`; tidak bisa dipastikan dari mesin ini). Explorer testnet: `https://explorer.testnet.chain.robinhood.com` (200).
4. **RPC publik Robinhood dibatasi rate** dan tidak disarankan untuk produksi (S4). Provider yang disebut docs: Alchemy (rekomendasi), Chainstack, QuickNode, Blockdaemon, dRPC, Validation Cloud, GlobalStake, Pinax.
5. Native currency Robinhood Chain adalah ETH; stack-nya Arbitrum (S1 `chainStack: ARB_STACK`, S4).

## Tidak terverifikasi

- Pola URL LayerZero Scan untuk pesan/GUID: `https://layerzeroscan.com` merespons 429 saat dicoba. Tetap `[Belum]`; diperiksa saat `src/lib/lz/scan.ts` dibuat (Phase 2).
