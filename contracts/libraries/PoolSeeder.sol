// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IUniswapV2Factory, IUniswapV2Pair, IWETH} from "../interfaces/IUniswapV2.sol";

/// @title PoolSeeder
/// @notice Membuat DAN mengisi pool Uniswap v2 token/WETH dalam satu panggilan (PRD §5.5).
/// @dev Dipakai `XofNGraduator.graduate()` di home dan `XofNRemote.lzCompose()` di chain ekspansi.
///
///      Kenapa tidak lewat router: `addLiquidity` di router revert bila pair sudah punya cadangan
///      satu sisi (cukup dengan donasi + `sync`), sehingga siapa pun bisa memblokir pengisian.
///      Di sini aset dikirim langsung ke pair lalu `mint` dipanggil.
///
///      Ketahanan terhadap front-run:
///      1. Pair sudah dibuat pihak lain tetapi kosong → dipakai apa adanya; harga ditentukan
///         setoran pertama (setoran ini).
///      2. Pair diberi donasi:
///         - pair belum pernah di-mint → donasi ikut terhitung di `mint` setoran ini, jadi
///           menjadi milik pool; pendonor tidak mendapat LP;
///         - pair sudah berisi likuiditas → `sync` dipanggil lebih dulu, jadi donasi menjadi
///           cadangan milik LP yang ada (termasuk pendonor bila ia LP) SEBELUM setoran ini
///           dihitung. Tanpa `sync`, saldo yang belum tercatat ikut dihitung sebagai input
///           swap penyeimbang, rasionya meleset, dan pendonor mengambil sebagian setoran
///           (PRD P55, `proof/2026-11-17-phase3/11-poolseeder-rereview.md`).
///      3. Pair sudah berisi likuiditas pihak lain → setoran ini lebih dulu ditukar sebagian di
///         pool itu sampai RASIO ASET YANG DIPEGANG SAMA DENGAN RASIO POOL, baru seluruhnya
///         disetor. Dengan begitu tidak ada sisi berlebih yang jatuh ke LP lama.
///
///         Kenapa bukan "geser pool ke harga target lalu setor sisanya": setelah swap itu aset
///         yang dipegang tidak lagi seimbang, `mint` hanya menghargai sisi yang lebih kecil, dan
///         kelebihannya menjadi milik semua LP secara pro rata. Pool tandingan yang cukup besar
///         bisa mengambil hampir separuh likuiditas dengan cara itu (temuan review 17 Nov 2026).
///
///         Akibat pilihan ini: bila pihak lain menaruh likuiditas besar pada harga berbeda, harga
///         pembukaan pool adalah harga gabungan, bukan harga target. Itu modal mereka sendiri
///         yang dipertaruhkan: swap di sini selalu searah arbitrase, jadi setiap unit yang
///         ditukar diperoleh pada harga yang lebih baik dari target, dan pembuat harga lain
///         itulah yang menanggung selisihnya.
///      4. Pool tandingan dengan total LP kecil + cadangan sangat besar → bagian LP setoran ini
///         dibulatkan ke 0; setoran dijadikan cadangan lewat `sync` alih-alih `mint` (lihat
///         `seed`). Setoran tidak revert dan pool tetap terisi.
///
///      Kerugian pembulatan: setoran mendapat floor(jumlah x total LP / cadangan) LP, jadi
///      kerugiannya paling besar nilai satu unit LP pool itu (ditambah fee swap penyeimbang).
///      Pada pool baru atau pool biasa ini sangat kecil (terukur ±1,7e-6 setoran). Pada pool
///      tandingan dengan total LP kecil dan cadangan besar bisa mencapai ±1% atau seluruh
///      setoran (cabang 4), tetapi penyerang selalu membayar lebih dari yang ia ambil
///      (`test/unit/PoolSeeder.t.sol`). Batas yang tersisa ada di pair itu sendiri, mis.
///      cadangan di atas uint112.
///
///      Asumsi: fee swap 0,3% (Uniswap v2 kanonik) dan token tanpa pajak transfer. Di AMM dengan
///      fee lebih tinggi, swap penyeimbang bisa gagal di pemeriksaan K; fee lebih rendah aman.
library PoolSeeder {
    using SafeERC20 for IERC20;

    uint256 private constant FEE_NUMERATOR = 997;
    uint256 private constant FEE_DENOMINATOR = 1000;

    error ZeroSeedAmount();

    /// @dev `external`: library terhubung, dijalankan lewat delegatecall. Aset dan `address(this)`
    ///      tetap milik kontrak pemanggil.
    /// @param factory   UniswapV2Factory chain ini.
    /// @param weth      WETH chain ini.
    /// @param token     Token yang dipasangkan dengan WETH.
    /// @param tokenAmount Jumlah token; harus sudah dipegang kontrak pemanggil.
    /// @param ethAmount Jumlah ETH native; harus sudah dipegang kontrak pemanggil.
    /// @param lpRecipient Penerima token LP.
    function seed(
        address factory,
        address weth,
        address token,
        uint256 tokenAmount,
        uint256 ethAmount,
        address lpRecipient
    ) external returns (address pair, uint256 liquidity) {
        if (tokenAmount == 0 || ethAmount == 0) revert ZeroSeedAmount();

        pair = IUniswapV2Factory(factory).getPair(token, weth);
        if (pair == address(0)) pair = IUniswapV2Factory(factory).createPair(token, weth);

        IWETH(weth).deposit{value: ethAmount}();

        // totalSupply == 0 berarti belum pernah ada mint: harga belum ditentukan siapa pun.
        if (IUniswapV2Pair(pair).totalSupply() != 0) {
            // Saldo yang belum di-sync dihitung pair sebagai input `swap`, sedangkan ukuran swap
            // dihitung dari cadangan. Tanpa sync, rasio sesudah swap meleset dan penyerang
            // mengambil sebagian setoran (PRD P55). Setelah sync, donasi menjadi cadangan milik
            // LP yang ada, sebelum setoran ini masuk.
            IUniswapV2Pair(pair).sync();
            (tokenAmount, ethAmount) = _rebalance(pair, token, weth, tokenAmount, ethAmount);
        }

        // Dihitung sebelum transfer: transfer tidak mengubah cadangan.
        bool mintsNothing = _mintsNothing(pair, token, tokenAmount, ethAmount);

        // `mint` memakai seluruh saldo yang masuk: tidak ada yang tertinggal di pemanggil dan
        // tidak ada yang dibakar (total supply harus tetap 999M). Setelah `_rebalance`, rasio
        // setoran sudah sama dengan rasio pool, kecuali selisih sebesar fee swap.
        IERC20(token).safeTransfer(pair, tokenAmount);
        IERC20(weth).safeTransfer(pair, ethAmount);

        // Pool tandingan dengan total LP kecil dan cadangan sangat besar membuat bagian LP
        // setoran ini dibulatkan ke 0, dan `mint` akan revert selamanya (review 19 Nov 2026,
        // MEDIUM #1). Setoran lalu dijadikan cadangan lewat `sync`: pool tetap terisi, langkah
        // ekspansi tetap selesai. Nilainya jatuh ke LP yang ada, yang mayoritas terkunci permanen
        // (MINIMUM_LIQUIDITY). Untuk memaksa cabang ini penyerang harus menaruh cadangan bernilai
        // lebih dari setoran x total LP, dan sebagian besar ikut terkunci; bagiannya atas setoran
        // ini jauh lebih kecil dari biayanya.
        if (mintsNothing) {
            IUniswapV2Pair(pair).sync();
            return (pair, 0);
        }
        liquidity = IUniswapV2Pair(pair).mint(lpRecipient);
    }

    /// @dev True bila `mint` untuk setoran ini akan menghasilkan 0 LP. Memakai total LP sebelum
    ///      `_mintFee`; fee protokol pair hanya menambah total LP, jadi hasil `mint` sebenarnya
    ///      tidak pernah lebih kecil dari perkiraan ini.
    function _mintsNothing(address pair, address token, uint256 tokenAmount, uint256 ethAmount)
        private
        view
        returns (bool)
    {
        uint256 supply = IUniswapV2Pair(pair).totalSupply();
        if (supply == 0) return false;
        (uint256 reserveToken, uint256 reserveEth,) = _reserves(pair, token);
        return Math.min(tokenAmount * supply / reserveToken, ethAmount * supply / reserveEth) == 0;
    }

    /// @dev Satu swap yang membuat rasio aset yang dipegang sama dengan rasio pool.
    ///      Tanpa fee, kedua rasio bertemu di rasio gabungan (y + E) / (x + T), karena total token
    ///      dan total WETH tidak berubah oleh swap. Cadangan token pool yang dituju adalah
    ///      sqrt(k * (x + T) / (y + E)); cadangan WETH-nya sqrt(k * (y + E) / (x + T)).
    ///      Fee 0,3% membuat hasilnya meleset sedikit; selisih sekecil itu ikut tersetor.
    ///      Jumlah yang ditukar tidak pernah melebihi separuh setoran; batas itu dipasang juga
    ///      secara eksplisit sebagai pengaman.
    function _rebalance(
        address pair,
        address token,
        address weth,
        uint256 tokenAmount,
        uint256 ethAmount
    ) private returns (uint256, uint256) {
        (uint256 reserveToken, uint256 reserveEth, bool tokenIsZero) = _reserves(pair, token);
        if (reserveToken == 0 || reserveEth == 0) return (tokenAmount, ethAmount);

        if (reserveEth * tokenAmount > reserveToken * ethAmount) {
            // Token lebih mahal di pool daripada di setoran ini: jual token ke pool.
            uint256 tokenIn = _swapSize(reserveToken, reserveEth, tokenAmount, ethAmount);
            uint256 ethOut = _swap(pair, token, tokenIn, reserveToken, reserveEth, !tokenIsZero);
            if (ethOut == 0) return (tokenAmount, ethAmount);
            return (tokenAmount - tokenIn, ethAmount + ethOut);
        }
        if (reserveEth * tokenAmount < reserveToken * ethAmount) {
            // Token lebih murah di pool: beli token dari pool.
            uint256 ethIn = _swapSize(reserveEth, reserveToken, ethAmount, tokenAmount);
            uint256 tokenOut = _swap(pair, weth, ethIn, reserveEth, reserveToken, tokenIsZero);
            if (tokenOut == 0) return (tokenAmount, ethAmount);
            return (tokenAmount + tokenOut, ethAmount - ethIn);
        }
        return (tokenAmount, ethAmount);
    }

    /// @dev Jumlah aset masuk supaya cadangan aset itu menjadi
    ///      sqrt(k * (reserveIn + amountIn) / (reserveOut + amountOut)), paling banyak separuh
    ///      dari yang dipegang. Hasil `mulDiv` tidak bisa overflow: nilainya paling besar
    ///      reserveIn * (reserveIn + amountIn).
    function _swapSize(uint256 reserveIn, uint256 reserveOut, uint256 heldIn, uint256 heldOut)
        private
        pure
        returns (uint256)
    {
        uint256 target = Math.sqrt(
            Math.mulDiv(reserveIn * reserveOut, reserveIn + heldIn, reserveOut + heldOut)
        );
        if (target <= reserveIn) return 0;
        return Math.min(target - reserveIn, heldIn / 2);
    }

    /// @dev Mengembalikan 0 tanpa memindahkan apa pun bila jumlahnya terlalu kecil untuk ditukar.
    function _swap(
        address pair,
        address assetIn,
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        bool outIsToken0
    ) private returns (uint256 amountOut) {
        if (amountIn == 0) return 0;
        amountOut = _amountOut(amountIn, reserveIn, reserveOut);
        if (amountOut == 0) return 0;
        IERC20(assetIn).safeTransfer(pair, amountIn);
        IUniswapV2Pair(pair)
            .swap(outIsToken0 ? amountOut : 0, outIsToken0 ? 0 : amountOut, address(this), "");
    }

    function _reserves(address pair, address token)
        private
        view
        returns (uint256 reserveToken, uint256 reserveEth, bool tokenIsZero)
    {
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pair).getReserves();
        tokenIsZero = IUniswapV2Pair(pair).token0() == token;
        (reserveToken, reserveEth) = tokenIsZero ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function _amountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        private
        pure
        returns (uint256)
    {
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        return (amountInWithFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }
}
