# 06 — Robinhood Chain: akses, CreateX, cancun

Tanggal akses: **17 Nov 2026** (UTC 08:44).

## Sumber

| # | Sumber |
|---|---|
| S1 | https://docs.robinhood.com/chain/connecting dan https://docs.robinhood.com/chain/differences-from-ethereum |
| S2 | `pcaversaccio/createx@1d8f9e325e1b16d8fc5e69dd132bd7eb860ecb82`, file `deployments/deployments.json` — https://github.com/pcaversaccio/createx/blob/1d8f9e325e1b16d8fc5e69dd132bd7eb860ecb82/deployments/deployments.json |
| S3 | On-chain: `cast code`, `eth_call` pembuatan kontrak (tanpa transaksi) |

Keluaran: [`raw/createx-cancun.txt`](raw/createx-cancun.txt).

## Akses jaringan

- DNS `*.robinhood.com` ter-resolve dari mesin ini selama sesi; RPC mainnet dan testnet merespons normal. Blokir DNS Telkomsel tidak muncul (kemungkinan memakai DNS/VPN lain). Tidak ada item yang dilewati karena akses.
- RPC publik: `https://rpc.mainnet.chain.robinhood.com` (4663), `https://rpc.testnet.chain.robinhood.com` (46630). Dibatasi rate, tidak untuk produksi (S1).

## CreateX — **tersedia**

- Alamat dari S2: `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`. S2 mencantumkan Robinhood Chain (4663) dan Robinhood Chain Testnet (46630).
- On-chain (S3): bytecode 11 838 byte dengan keccak256 `0xbd8a7ea8cfca7b4e5f5041d7d4b17bc317c5ce42cfbc42066a00cf26b43eb53f`, **identik** di Base (blok 58573336), Arbitrum (524987092), Robinhood (116448017), dan Robinhood testnet (154437123).

## Opcode cancun — **didukung, kecuali `BLOBBASEFEE`**

Metode: `eth_call` tanpa `to` (simulasi pembuatan kontrak) dengan initcode yang menjalankan opcode terkait. Tidak ada transaksi.

| Probe | Base | Arbitrum One | Robinhood | Robinhood testnet |
|---|---|---|---|---|
| `PUSH0` + `TSTORE` + `TLOAD` + `MCOPY` | ok | ok | ok | ok |
| `BLOBHASH` (0x49) | ok | ok | ok | ok |
| `BLOBBASEFEE` (0x4a) | ok | error "not supported on Arbitrum" | **error yang sama** | **error yang sama** |
| Kontrol: opcode tak terdefinisi 0x0c | error | error | error | error |

Kesimpulan: bytecode hasil `evm_version = cancun` berjalan di Robinhood Chain selama kontrak tidak memakai `block.blobbasefee`. Perilakunya sama dengan Arbitrum One. Kontrak XofN tidak punya alasan memakai opcode itu.

## Perbedaan dari Ethereum yang perlu diingat di Phase 3 (S1)

- `block.number` = perkiraan blok L1.
- `block.prevrandao` konstan.
- Batas ukuran kode 96 KB.
- Biaya = gas L2 + biaya data L1.
