# Langkah 3 — Tabel parameter final (Fase 1a, Robinhood testnet 46630)

**Disetujui pengguna 19 Nov 2026** (kutipan: "oke lanjutkan saya setuju"). Nilai ini beku di constructor Graduator.

| Parameter | Nilai | Sumber |
|---|---|---|
| `saleSupply` | 799.200.000e18 | sementara, acc PM 19 Nov 2026 |
| `startPrice` | 1.500.000.000 wei/token | idem |
| `graduationThreshold` | 4 ETH | idem |
| `callerReward` | 0,01 ETH | idem |
| `expansionPairEth` | 0,04 ETH | idem; batas constructor ±0,249 ETH |
| `positionManager` | `0x58daec3116aae6D93017bAAea7749052E8a04fA7` | `test/fork/ForkUniV4.t.sol`: runtime identik build resmi |
| `poolGuard` | ditambang saat deploy | terikat ke alamat Graduator (CreateX CREATE3) |
| `lpRecipient` | dari env `LP_RECIPIENT` | alamat sementara developer |

| Pathway | Base Sepolia (40245) | Arbitrum Sepolia (40231) | Sumber |
|---|---|---|---|
| `sendLib` | `0x45841dd1ca50265Da7614fC43A361e526c0e6160` | sama | `raw/onchain-check.txt` |
| `receiveLib` | `0xd682ECF100f6F4284138AA925348633B0611Ae21` | sama | idem |
| `executor` | `0x701f3927871EfcEa1235dB722f9E608aE120d243` | sama | default executor config |
| `maxMessageSize` | 10.000 | 10.000 | default on-chain |
| `confirmations` | 2 | 5 | maks(default kirim 1, default terima 2 / 5); dipilih agent, dikonfirmasi pengguna |
| `receiveGas` | 300.000 | 300.000 | terukur 195.320 (1,54x) |
| `composeGas` | 100.000 | 100.000 | konstanta tes |
| `deployGas` | 7.000.000 | 7.000.000 | terukur 4.264.459 (1,64x) |
| `seedGas` | 2.500.000 | 2.500.000 | terukur 1.274.155 (2,04x bersama `composeGas`) |

| DVN | Operator | Alamat (Robinhood testnet) |
|---|---|---|
| Wajib | Horizen | `0x52f615ecbcbf40e47a315c2d84d14fa2851e55b7` |
| Wajib | LayerZero Labs | `0xa78a78a13074ed93ad447a26ec57121f29e8fec2` |
| Opsional | Paxos | `0x771d83e953ca8f113f02f18206ecf8bb93da3f0a` |
| Opsional | Twinstake | `0xcde82f74624525e24853b1f59c8b20a162a3d297` |

Fortress kosong di testnet. Gas diukur di endpoint tiruan (`proof/2026-11-19-phase3-uniswap-v4/raw/gas-measure.txt`); validasi di chain tujuan baru di Fase 2a.
