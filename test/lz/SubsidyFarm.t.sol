// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";

/// @dev ETH pool ekspansi dibayar dari saldo Remote (subsidi tim, PRD P51). Dua cara mengambil
///      subsidi itu, dari review independen 19 Nov 2026:
///      1. Pemerahan pembeli tunggal (review pertama MEDIUM #2, review kedua MEDIUM-2): beli
///         seluruh curve, graduate, ekspansi, jual semua di pool home + ekspansi. Ditutup batas
///         di constructor Graduator dengan faktor keamanan 2: penyerang harus kehilangan
///         sebagian besar subsidi yang ia picu.
///      2. Harga basi (review kedua MEDIUM-1, DITERIMA PM sebagai biaya yang diketahui): pool
///         ekspansi dibuka pada harga saat graduate. Bila harga home turun sebelum ekspansi,
///         pihak ketiga tanpa token bisa mengambil sebagian subsidi lewat arbitrase. Tes di sini
///         membuktikan batasnya: paling banyak expansionPairEth per chain.
///
///      Pool-nya Uniswap v4 asli (posisi full-range, fee 0,30%), yang berperilaku seperti x·y=k.
///      Cadangan yang dipakai di sini adalah cadangan virtual posisi itu.
abstract contract SubsidyEconomicsBase is XofNTestBase {
    /// @dev Pembeli tunggal: kembalikan selisih ETH penyerang (negatif = rugi) dan ETH yang
    ///      terpakai dari saldo Remote.
    function _soleBuyerFarm() internal returns (int256 attackerDelta, uint256 remoteSpent) {
        (XofNToken token, XofNCurve curve) = _launch(STANDARD, _eids(BASE, ARB));
        vm.deal(attacker, 100 ether);
        uint256 ethStart = attacker.balance;
        uint256 remoteStart = _remoteBalances();

        vm.prank(attacker);
        curve.buy{value: GRADUATION_THRESHOLD}(0);
        assertTrue(curve.thresholdReached());
        vm.prank(attacker);
        graduator.graduate(address(token));
        _expandAs(attacker, token);

        // Token dibagi sebanding cadangan tiap pool, lalu dijual semua.
        uint256 held = token.balanceOf(attacker);
        (uint256 homeReserve,) = _poolReserves(HOME, address(token));
        uint256 perChain = graduator.launchOf(address(token)).tokensPerChain;
        uint256 toRemote = ((held * perChain / (homeReserve + 2 * perChain)) / 1e12) * 1e12;
        _bridgeToBoth(token, toRemote);
        _sell(HOME, token, attacker, token.balanceOf(attacker));
        _sellRemotes(token);

        remoteSpent = remoteStart - _remoteBalances();
        attackerDelta = int256(attacker.balance) - int256(ethStart);
    }

    /// @dev Harga basi: pemegang jujur menjual `soldNumerator/4` tokennya di pool home setelah
    ///      graduate; lalu pihak ketiga tanpa token menjalankan ekspansi (membayar semua fee LZ)
    ///      dan mengarbitrase pool ekspansi yang masih memakai harga graduate.
    function _staleArb(uint256 soldNumerator)
        internal
        returns (int256 attackerDelta, uint256 remoteSpent)
    {
        (XofNToken token, XofNCurve curve) = _launch(STANDARD, _eids(BASE, ARB));
        _reachThreshold(curve); // alice membeli seluruh curve
        vm.prank(keeper);
        graduator.graduate(address(token));
        _sell(HOME, token, alice, (token.balanceOf(alice) * soldNumerator) / 4);

        uint256 remoteStart = _remoteBalances();
        vm.deal(attacker, 100 ether);
        uint256 ethStart = attacker.balance;
        _expandAs(attacker, token);

        // Beli token di home sebanyak yang dibutuhkan untuk menyamakan harga pool ekspansi.
        XofNToken onBase = _remoteToken(token, BASE);
        uint256 ethForTokens;
        {
            (uint256 homeTokens, uint256 homeEth) = _poolReserves(HOME, address(token));
            (uint256 rt, uint256 re) = _poolReserves(BASE, address(onBase));
            uint256 d = Math.sqrt(Math.mulDiv(rt * re, homeTokens, homeEth)) - rt;
            ethForTokens = (Math.mulDiv(2 * d, homeEth, homeTokens) * 103) / 100;
        }
        _poolBuy(HOME, address(token), attacker, ethForTokens);
        _bridgeToBoth(token, (token.balanceOf(attacker) / 2e12) * 1e12);
        _sellRemotes(token);
        if (token.balanceOf(attacker) > 0) {
            _sell(HOME, token, attacker, token.balanceOf(attacker));
        }

        remoteSpent = remoteStart - _remoteBalances();
        attackerDelta = int256(attacker.balance) - int256(ethStart);
    }

    function _expandAs(address who, XofNToken token) private {
        (uint256 deployFees, uint256 liquidityFees) = graduator.quoteExpandAndLock(address(token));
        vm.prank(who);
        graduator.expandAndLock{value: deployFees + liquidityFees}(address(token));
        _runChain(token, BASE);
        _runChain(token, ARB);
        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Locked)
        );
    }

    function _bridgeToBoth(XofNToken token, uint256 amount) private {
        _bridge(address(token), attacker, BASE, attacker, amount, "", "");
        _mustDeliver(BASE, address(_remoteToken(token, BASE)));
        _bridge(address(token), attacker, ARB, attacker, amount, "", "");
        _mustDeliver(ARB, address(_remoteToken(token, ARB)));
    }

    function _sellRemotes(XofNToken token) private {
        XofNToken onBase = _remoteToken(token, BASE);
        XofNToken onArb = _remoteToken(token, ARB);
        _sell(BASE, onBase, attacker, onBase.balanceOf(attacker));
        _sell(ARB, onArb, attacker, onArb.balanceOf(attacker));
    }

    function _sell(uint32 eid, XofNToken t, address who, uint256 amount) internal {
        _poolSell(eid, address(t), who, amount);
    }

    function _remoteBalances() private view returns (uint256) {
        return address(remotes[BASE]).balance + address(remotes[ARB]).balance;
    }

    /// @dev Harga basi (biaya yang diterima PM): arbitrase memang mengambil sebagian subsidi,
    ///      tetapi untung pihak ketiga tidak pernah melebihi subsidi itu sendiri, yaitu
    ///      expansionPairEth per chain (2 chain).
    function _assertStaleLeakBounded(uint256 soldNumerator) internal {
        (int256 attackerDelta, uint256 remoteSpent) = _staleArb(soldNumerator);
        uint256 pairEth = graduator.expansionPairEth();
        assertGe(remoteSpent, 2 * pairEth, "subsidy was paid");
        assertGt(attackerDelta, 0, "known cost: stale-price arbitrage takes part of the subsidy");
        assertLe(uint256(attackerDelta), 2 * pairEth, "leak exceeds the subsidy");
    }
}

/// @dev Konstanta tes: expansionPairEth = 0,04 ETH (±16% batas constructor).
contract SubsidyDefaultEconomicsTest is SubsidyEconomicsBase {
    function test_soleBuyerFarmingLoses() public {
        (int256 attackerDelta, uint256 remoteSpent) = _soleBuyerFarm();
        assertLt(attackerDelta, 0, "farming the subsidy must not pay");
        assertGt(uint256(-attackerDelta), remoteSpent, "attacker loses more than the subsidy");
    }

    function test_stalePrice_quarterSold_leakBoundedBySubsidy() public {
        _assertStaleLeakBounded(1);
    }

    function test_stalePrice_allSold_leakBoundedBySubsidy() public {
        _assertStaleLeakBounded(4);
    }

    /// @dev Arah sebaliknya (review 19 Nov 2026, INFO-2): harga home NAIK sebelum ekspansi, jadi
    ///      pool ekspansi dibuka di bawah harga pasar dan pembeli pertama mendapat token murah.
    ///      Itu juga biaya harga basi (PRD P60), tetapi bentuknya lain: yang keluar adalah TOKEN
    ///      dari posisi likuiditas, bukan ETH subsidi. Saldo Remote tidak tersentuh oleh trade,
    ///      dan ETH di pool ekspansi justru bertambah. Untung arbitrase di arah ini TIDAK dibatasi
    ///      expansionPairEth; ia dibatasi nilai `tokensPerChain`.
    function test_stalePrice_homePriceRose_subsidyEthIsNotDrained() public {
        (XofNToken token, XofNCurve curve) = _launch(STANDARD, _eids(BASE, ARB));
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));
        uint256 pairEth = graduator.expansionPairEth();
        uint256 perChain = graduator.launchOf(address(token)).tokensPerChain;

        // Pembeli menaikkan harga home ±2,25x sebelum siapa pun mengekspansi.
        vm.deal(bob, 10 ether);
        _poolBuy(HOME, address(token), bob, 2 ether);

        (uint256 deployFees, uint256 liquidityFees) = graduator.quoteExpandAndLock(address(token));
        vm.deal(attacker, 100 ether);
        vm.prank(attacker);
        graduator.expandAndLock{value: deployFees + liquidityFees}(address(token));
        _runChain(token, BASE);
        _runChain(token, ARB);

        uint256 remoteAfterExpansion = address(remotes[BASE]).balance + address(remotes[ARB]).balance;
        XofNToken onBase = _remoteToken(token, BASE);
        XofNToken onArb = _remoteToken(token, ARB);
        // Arbitrase: beli token murah di kedua pool ekspansi.
        uint256 boughtBase = _poolBuy(BASE, address(onBase), attacker, pairEth);
        uint256 boughtArb = _poolBuy(ARB, address(onArb), attacker, pairEth);
        assertGt(boughtBase + boughtArb, 0);
        assertLt(boughtBase, perChain, "cannot buy the whole position");
        assertLt(boughtArb, perChain, "cannot buy the whole position");

        // Subsidi ETH tidak terkuras: saldo Remote tidak berubah, dan ETH pool bertambah.
        assertEq(
            address(remotes[BASE]).balance + address(remotes[ARB]).balance,
            remoteAfterExpansion,
            "trading must not touch the Remote balance"
        );
        (, uint256 baseEth) = _poolReserves(BASE, address(onBase));
        (, uint256 arbEth) = _poolReserves(ARB, address(onArb));
        assertGt(baseEth, pairEth, "pool ETH grows when tokens are bought");
        assertGt(arbEth, pairEth, "pool ETH grows when tokens are bought");
    }
}

/// @dev expansionPairEth = 99% dari batas constructor (dengan faktor keamanan 2).
contract SubsidyNearLimitTest is SubsidyEconomicsBase {
    function _economics() internal pure override returns (XofNGraduator.Economics memory e) {
        e = XofNGraduator.Economics({
            saleSupply: SALE_SUPPLY,
            startPrice: START_PRICE,
            graduationThreshold: GRADUATION_THRESHOLD,
            callerReward: CALLER_REWARD,
            expansionPairEth: 0
        });
        uint256 limit = ((GRADUATION_THRESHOLD - CALLER_REWARD) * (TOTAL_SUPPLY - SALE_SUPPLY))
            / (4 * SALE_SUPPLY);
        e.expansionPairEth = (limit * 99) / 100;
    }

    /// @dev Sebelum faktor keamanan, pada 99% batas lama penyerang hanya rugi 0,013 ETH sambil
    ///      memicu subsidi 0,99 ETH (rasio 1:76). Sekarang ia kehilangan sebagian besar subsidi
    ///      yang ia picu (target desain ±0,8x; ditegaskan ≥ 0,7x).
    function test_soleBuyerFarmingCostsMostOfTheSubsidy() public {
        assertGt(graduator.expansionPairEth(), 0.2 ether, "near the limit");
        (int256 attackerDelta, uint256 remoteSpent) = _soleBuyerFarm();
        assertLt(attackerDelta, 0, "farming the subsidy must not pay");
        assertGe(uint256(-attackerDelta) * 10, remoteSpent * 7, "griefing must be expensive");
    }

    function test_stalePrice_quarterSold_leakBoundedBySubsidy() public {
        _assertStaleLeakBounded(1);
    }

    function test_stalePrice_allSold_leakBoundedBySubsidy() public {
        _assertStaleLeakBounded(4);
    }
}
