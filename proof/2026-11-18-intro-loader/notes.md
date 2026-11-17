# 18 Nov 2026 — Perbaikan kilasan hero + intro loader landing (D19)

Permintaan owner: (1) kolom kanan hero menampilkan "tampilan lain" saat pertama dibuka; (2) loading screen yang "wow" (koin → pecah jadi lapisan → zoom masuk ke landing). Lingkup UI saja; kontrak, script, deployments, dan dependency tidak disentuh.

## Akar masalah bug
- Markup `.coin-fallback` (koin X + track + gate CSS) di-SSR dan selalu terlihat sampai `mountHero()` memasang `.hero.webgl-on`. Itu baru terjadi setelah chunk three.js diunduh, PMREM dibuat, dan 420 langkah pre-warm selesai. Chip `.hero-float` juga tampil di posisi CSS statis lalu melompat ke anchor 3D.
- Perbaikan (`src/app/styles/baseline.css`, `src/components/three/hero-coinfall.tsx`): status *pending* menyembunyikan fallback dan chip; `.webgl-off` dipasang hanya bila WebGL gagal; failsafe CSS 8 dtk untuk chunk yang tidak pernah datang.

## Bukti
| Item | Konteks |
|---|---|
| [shots/1-boot-1280.jpg](shots/1-boot-1280.jpg) | Build produksi mode preview: fase boot, progres 100% setelah frame pertama scene hero |
| [shots/2-split-1680.jpg](shots/2-split-1680.jpg) | Fase split di 1680px: pelat DVN 2 wajib + 1 opsional menyala, pelat 1/1 diblok |
| [shots/5-split-390.jpg](shots/5-split-390.jpg) | Fase split di 390px (emulasi CDP), label pelat muat, `scrollWidth = clientWidth` |
| [shots/3-iris-1280.jpg](shots/3-iris-1280.jpg) | Dive: iris mint membuka landing sementara pelat melewati kamera |
| [shots/4-hero-1280.jpg](shots/4-hero-1280.jpg) | Setelah loader: hero langsung coinfall WebGL, tanpa kilasan fallback |
| [shots/6-webgl-off-fallback-1280.jpg](shots/6-webgl-off-fallback-1280.jpg) | Chrome `--disable-webgl`: hero `webgl-off`, fallback statis tampil, loader tetap selesai |

## Hasil pemeriksaan
| Cek | Hasil |
|---|---|
| `npm run lint` | Lulus |
| `npm run typecheck` | Lulus |
| `npm run test` | Lulus, 117 tes |
| `npm run build` | Lulus untuk `NEXT_PUBLIC_XOFN_NETWORK=local` dan `testnet` |
| Lebar 390 / 768 / 1280 / 1680 | Tanpa overflow horizontal (emulasi CDP) |
| Reduced motion | Koin diam, fade 300 ms, hero tampil statis |
| `/#check` | Varian singkat; halaman mendarat di `#check` (sebelumnya di `main` meleset ±2400px karena layout tumbuh setelah load) |
| Navigasi `/` → `/check` → `/` | Loader tidak muncul lagi, intro hero tetap jalan, jumlah canvas tetap 4 (tidak bocor) |
| Konsol | Bersih di jalur normal; dengan WebGL dimatikan hanya error three.js yang memang diharapkan |

## Catatan
- Temuan saat uji: `lockScroll()` (overflow body) selama loader membuat `ScrollTrigger.refresh` gagal pada URL ber-hash. Diganti dengan penahan input (wheel/touch/tombol scroll) di overlay, tanpa mengubah layout.
- Uji di headless Chrome; kehalusan animasi di GPU nyata belum diukur.
