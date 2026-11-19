// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {MockV2Pair} from "../mocks/MockUniswapV2.sol";

/// @dev PRD §9.2 tahap 1: `graduate()` gagal sebelum ambang, hanya sekali, dan TIDAK me-renounce.
contract GraduateTest is XofNTestBase {
    XofNToken internal token;
    XofNCurve internal curve;

    function setUp() public override {
        super.setUp();
        (token, curve) = _launch(STANDARD, _eids(BASE, ARB));
    }

    function test_graduateFailsBeforeThreshold() public {
        vm.prank(keeper);
        vm.expectRevert(XofNCurve.ThresholdNotReached.selector);
        graduator.graduate(address(token));

        _buy(curve, alice, GRADUATION_THRESHOLD - 1);
        vm.prank(keeper);
        vm.expectRevert(XofNCurve.ThresholdNotReached.selector);
        graduator.graduate(address(token));

        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Bonding)
        );
    }

    function test_graduateOnlyOnce() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNGraduator.InvalidStatus.selector, address(token), XofNGraduator.Status.Graduated
            )
        );
        graduator.graduate(address(token));

        // Curve sendiri juga menolak dijalankan dua kali.
        vm.prank(address(graduator));
        vm.expectRevert(XofNCurve.AlreadyGraduated.selector);
        curve.graduate();
    }

    function test_graduateUnknownTokenReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNGraduator.InvalidStatus.selector, attacker, XofNGraduator.Status.None
            )
        );
        graduator.graduate(attacker);
    }

    /// @dev Aturan #3 guide: tidak ada renounce atau delegate = 0 di tahap 1.
    function test_afterGraduateOwnerAndDelegateAreStillGraduator() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));

        assertEq(token.owner(), address(graduator));
        assertEq(_delegateOf(HOME, address(token)), address(graduator));
        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Graduated)
        );

        (bool locked, uint8 tier, uint32[] memory eids) =
            chains[HOME].registry.verify(address(token));
        assertFalse(locked);
        assertEq(tier, STANDARD);
        assertEq(eids.length, 2);
    }

    /// @dev Siapa pun boleh memanggil; pemanggil menerima insentif tetap.
    function test_anyoneCanGraduateAndReceivesFixedReward() public {
        _reachThreshold(curve);
        uint256 before = bob.balance;
        vm.prank(bob);
        graduator.graduate(address(token));
        assertEq(bob.balance - before, CALLER_REWARD);
    }

    function test_graduateCreatesAndFillsHomePool() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));

        XofNGraduator.Launch memory l = graduator.launchOf(address(token));
        uint256 liquidityTokens = TOTAL_SUPPLY - SALE_SUPPLY;
        // PRD P51: semua ETH curve (dikurangi insentif) masuk pool home.
        uint256 poolEth = GRADUATION_THRESHOLD - CALLER_REWARD;
        uint256 poolTokens = liquidityTokens - 2 * l.tokensPerChain;
        assertEq(
            l.tokensPerChain,
            (liquidityTokens * EXPANSION_PAIR_ETH / (poolEth + 2 * EXPANSION_PAIR_ETH)) / 1e12
                * 1e12,
            "tokensPerChain formula"
        );

        MockV2Pair pair = _pair(HOME, address(token));
        assertEq(l.pool, address(pair));
        (uint256 reserveToken, uint256 reserveEth) = chains[HOME].router.reservesOf(address(token));
        assertEq(reserveToken, poolTokens);
        assertEq(reserveEth, poolEth);

        // LP tidak dipegang siapa pun yang bisa menariknya.
        assertEq(pair.balanceOf(LP_RECIPIENT), pair.totalSupply() - pair.MINIMUM_LIQUIDITY());
        assertEq(pair.balanceOf(address(graduator)), 0);

        // Porsi token ekspansi disisihkan di Graduator sampai expandAndLock. Tidak ada ETH yang
        // disisihkan: ETH pool ekspansi berasal dari saldo Remote (PRD P51).
        assertEq(l.tokensPerChain % 1e12, 0, "must be dust-free");
        assertEq(token.balanceOf(address(graduator)), 2 * l.tokensPerChain);
        assertEq(address(graduator).balance, 0);

        // Curve kosong; supply tidak berubah.
        assertEq(address(curve).balance, 0);
        assertEq(token.balanceOf(address(curve)), 0);
        assertTrue(curve.graduated());
        assertEq(token.totalSupply(), TOTAL_SUPPLY);
    }

    /// @dev Pool home dan pool ekspansi dibuka pada harga yang sama, walau semua ETH curve
    ///      masuk pool home dan ETH pool ekspansi berasal dari saldo Remote (PRD P51).
    function test_allPoolsOpenAtTheSamePrice() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));

        uint256 tokensPerChain = graduator.launchOf(address(token)).tokensPerChain;
        (uint256 reserveToken, uint256 reserveEth) = chains[HOME].router.reservesOf(address(token));
        // eth/token sama di kedua sisi → perkalian silang sama (toleransi pembulatan dust).
        assertApproxEqRel(reserveEth * tokensPerChain, EXPANSION_PAIR_ETH * reserveToken, 1e12);
    }

    /// @dev Creator yang memilih satu chain: hanya satu porsi token yang disisihkan, dan
    ///      harganya tetap sama dengan pool home.
    function test_singleChainLaunchReservesOneShare() public {
        (XofNToken one, XofNCurve oneCurve) = _launch(STANDARD, _eids(ARB));
        _reachThreshold(oneCurve);
        vm.prank(keeper);
        graduator.graduate(address(one));

        uint256 tokensPerChain = graduator.launchOf(address(one)).tokensPerChain;
        assertEq(one.balanceOf(address(graduator)), tokensPerChain);
        assertEq(address(graduator).balance, 0);
        (uint256 reserveToken, uint256 reserveEth) = chains[HOME].router.reservesOf(address(one));
        assertEq(reserveEth, GRADUATION_THRESHOLD - CALLER_REWARD);
        assertApproxEqRel(reserveEth * tokensPerChain, EXPANSION_PAIR_ETH * reserveToken, 1e12);
    }

    function test_tradingMovesToPoolAfterGraduation() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));

        vm.prank(bob);
        uint256 out =
            chains[HOME].router.swapExactETHForTokens{value: 0.1 ether}(address(token), bob);
        assertGt(out, 0);
        assertEq(token.balanceOf(bob), out);
    }

    // ───────────────────────── Front-run pool home ─────────────────────────
    // Di home, pembeli curve sudah memegang token sebelum graduation, jadi pool bisa dibuat
    // pihak lain lebih dulu. graduate() tidak boleh bisa diblokir atau dirugikan olehnya.

    function test_frontRun_emptyPairCreatedFirst() public {
        vm.prank(attacker);
        chains[HOME].factory.createPair(address(token), address(chains[HOME].weth));

        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));

        (uint256 reserveToken, uint256 reserveEth) = chains[HOME].router.reservesOf(address(token));
        assertEq(reserveEth, GRADUATION_THRESHOLD - CALLER_REWARD);
        assertGt(reserveToken, 0);
    }

    /// @dev Donasi satu sisi + `sync` membuat `addLiquidity` router revert; pengisian langsung
    ///      ke pair tidak terpengaruh, dan pendonor tidak mendapat LP.
    function test_frontRun_donationAndSyncCannotBlockGraduation() public {
        vm.startPrank(attacker);
        address pair = chains[HOME].factory.createPair(address(token), address(chains[HOME].weth));
        chains[HOME].weth.deposit{value: 0.5 ether}();
        chains[HOME].weth.transfer(pair, 0.5 ether);
        MockV2Pair(pair).sync();
        vm.stopPrank();

        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));

        assertEq(MockV2Pair(pair).balanceOf(attacker), 0);
        (, uint256 reserveEth) = chains[HOME].router.reservesOf(address(token));
        // Donasi menjadi milik pool.
        assertEq(reserveEth, GRADUATION_THRESHOLD - CALLER_REWARD + 0.5 ether);
    }

    /// @dev Penyerang membuka pool kecil lebih dulu dengan token yang terlalu MAHAL.
    function test_frontRun_overpricedPoolDoesNotProfit() public {
        _assertSkewedPoolDoesNotProfit(1_000 ether, 1 ether, 0, true);
    }

    /// @dev Penyerang membuka pool kecil lebih dulu dengan token yang terlalu MURAH.
    function test_frontRun_underpricedPoolDoesNotProfit() public {
        _assertSkewedPoolDoesNotProfit(20_000_000 ether, 0.001 ether, 0, true);
    }

    /// @dev Pool tandingan SEUKURAN likuiditas graduation, harga 2,26x target (temuan review
    ///      17 Nov 2026: versi awal PoolSeeder menyumbangkan sisa setorannya ke LP yang ada,
    ///      sehingga penyerang mendapat ~98 juta token dan ~0,7 ETH).
    function test_frontRun_largeOverpricedPoolDoesNotProfit() public {
        _assertSkewedPoolDoesNotProfit(195_000_000 ether, 8.8 ether, 0, false);
    }

    function test_frontRun_largeUnderpricedPoolDoesNotProfit() public {
        _assertSkewedPoolDoesNotProfit(250_000_000 ether, 1 ether, 0, false);
    }

    /// @dev PRD P55 (HIGH): pool tandingan ±½ harga target + 5 WETH ditransfer ke pair TANPA
    ///      `sync`. Sebelum perbaikan penyerang mengambil ±15% setoran graduation.
    function test_frontRun_unsyncedDonationDoesNotProfit() public {
        _assertSkewedPoolDoesNotProfit(30_000_000 ether, 0.3 ether, 5 ether, false);
    }

    /// @dev PRD P55 (MEDIUM): pair 1001/1001 + donasi besar tanpa `sync`. Sebelum perbaikan
    ///      `graduate()` revert `INSUFFICIENT_LIQUIDITY_MINTED`.
    function test_frontRun_unsyncedDonationCannotBlockGraduation() public {
        _assertSkewedPoolDoesNotProfit(1001, 1001, 4_000 ether, false);
        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Graduated)
        );
    }

    /// @dev Ukuran dan harga pool tandingan apa pun, dengan atau tanpa donasi yang belum
    ///      di-sync: penyerang tidak untung, likuiditas protokol tidak berkurang, dan
    ///      graduation tidak bisa diblokir.
    function testFuzz_frontRun_anyPoolDoesNotProfit(
        uint256 attackTokens,
        uint256 attackEth,
        uint256 donation
    ) public {
        attackTokens = bound(attackTokens, 1e15, 250_000_000 ether);
        attackEth = bound(attackEth, 1e12, 60 ether);
        donation = bound(donation, 0, 60 ether);
        _assertSkewedPoolDoesNotProfit(attackTokens, attackEth, donation, false);
    }

    function _assertSkewedPoolDoesNotProfit(
        uint256 attackTokens,
        uint256 attackEth,
        uint256 donation,
        bool expectTargetPrice
    ) private {
        // Penyerang membeli token di curve, lalu membuat pool dengan harga yang salah.
        uint256 bought = _buy(curve, attacker, 0.5 ether);
        assertGe(bought, attackTokens);
        vm.deal(attacker, attackEth + donation);
        vm.startPrank(attacker);
        token.approve(address(chains[HOME].router), attackTokens);
        chains[HOME].router.addLiquidityETHRaw{value: attackEth}(
            address(token), attackTokens, attacker
        );
        if (donation != 0) {
            // WETH ditransfer langsung ke pair TANPA sync (PRD P55).
            address pair = address(_pair(HOME, address(token)));
            chains[HOME].weth.deposit{value: donation}();
            chains[HOME].weth.transfer(pair, donation);
        }
        vm.stopPrank();

        vm.deal(alice, GRADUATION_THRESHOLD);
        _buy(curve, alice, GRADUATION_THRESHOLD);
        vm.prank(keeper);
        graduator.graduate(address(token));

        uint256 targetEth = GRADUATION_THRESHOLD - CALLER_REWARD;
        uint256 targetTokens =
            TOTAL_SUPPLY - SALE_SUPPLY - 2 * graduator.launchOf(address(token)).tokensPerChain;

        if (expectTargetPrice) {
            // Pool tandingan kecil: harga pembukaan kembali ke kisaran harga target, bukan harga
            // penyerang (yang ribuan kali lebih mahal atau ratusan kali lebih murah).
            (uint256 reserveToken, uint256 reserveEth) =
                chains[HOME].router.reservesOf(address(token));
            assertApproxEqRel(reserveEth * targetTokens, targetEth * reserveToken, 0.3e18);
        }

        // Likuiditas protokol (LP di LP_RECIPIENT), dinilai pada harga target, tidak lebih kecil
        // dari setoran graduation. Toleransi 1e-5: kerugian terukur dari fee swap penyeimbang
        // ±1,7e-6 (review 17 Nov 2026, temuan LOW).
        assertGe(
            _protocolLiquidityValue(targetEth, targetTokens),
            (2 * targetEth * 99_999) / 100_000,
            "protocol liquidity was diluted"
        );

        // Penyerang menarik likuiditasnya. Dinilai pada harga target, ia tidak untung.
        // Toleransi: bagian penyerang atas fee 0,3% dari swap penyeimbang, paling besar
        // f^2 / 8 dari nilai setoran (~1e-6); di sini dipakai 1e-5.
        uint256 valueIn = attackEth + donation + (attackTokens * targetEth) / targetTokens;
        uint256 valueOut = _attackerExitValue(targetEth, targetTokens);
        assertLe(valueOut, valueIn + (2 * targetEth) / 100_000, "front-runner must not profit");

        // Supply utuh dan tidak ada sisa di Graduator selain porsi token ekspansi.
        assertEq(token.totalSupply(), TOTAL_SUPPLY);
        assertEq(
            token.balanceOf(address(graduator)),
            2 * graduator.launchOf(address(token)).tokensPerChain
        );
        assertEq(chains[HOME].weth.balanceOf(address(graduator)), 0);
        assertEq(address(graduator).balance, 0);
    }

    function _protocolLiquidityValue(uint256 targetEth, uint256 targetTokens)
        private
        view
        returns (uint256)
    {
        MockV2Pair pair = _pair(HOME, address(token));
        (uint256 reserveToken, uint256 reserveEth) = chains[HOME].router.reservesOf(address(token));
        uint256 poolValue = reserveEth + (reserveToken * targetEth) / targetTokens;
        return (pair.balanceOf(LP_RECIPIENT) * poolValue) / pair.totalSupply();
    }

    /// @dev Nilai yang bisa ditarik penyerang: LP-nya, ditambah saldo pair yang belum di-sync
    ///      (bisa diambil siapa pun lewat `skim`). LP yang terlalu kecil untuk di-burn bernilai 0.
    function _attackerExitValue(uint256 targetEth, uint256 targetTokens) private returns (uint256) {
        MockV2Pair pair = _pair(HOME, address(token));
        uint256 tokensBefore = token.balanceOf(attacker);
        uint256 wethBefore = chains[HOME].weth.balanceOf(attacker);
        vm.startPrank(attacker);
        pair.skim(attacker);
        uint256 lp = pair.balanceOf(attacker);
        uint256 supply = pair.totalSupply();
        (uint256 reserveToken, uint256 reserveEth) = chains[HOME].router.reservesOf(address(token));
        if (lp * reserveToken / supply != 0 && lp * reserveEth / supply != 0) {
            pair.transfer(address(pair), lp);
            pair.burn(attacker);
        }
        vm.stopPrank();
        uint256 tokensBack = token.balanceOf(attacker) - tokensBefore;
        uint256 ethBack = chains[HOME].weth.balanceOf(attacker) - wethBefore;
        return ethBack + (tokensBack * targetEth) / targetTokens;
    }
}
