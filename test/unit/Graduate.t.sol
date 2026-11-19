// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {PoolSeeder} from "../../contracts/libraries/PoolSeeder.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

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
        assertFalse(_poolExists(HOME, address(token)), "pool must not exist before graduation");
        uint256 expectedPositionId = chains[HOME].positionManager.nextTokenId();
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

        // Pool Uniswap v4 ber-hook XofN, dibuka tepat pada rasio setoran.
        PoolKey memory key = graduator.poolKeyOf(address(token));
        assertEq(l.poolId, keccak256(abi.encode(key)), "poolId");
        assertEq(address(key.hooks), graduator.poolGuard());
        assertEq(
            chains[HOME].router.sqrtPriceOf(key),
            PoolSeeder.sqrtPriceX96(poolEth, poolTokens),
            "opening price"
        );
        (uint256 reserveToken, uint256 reserveEth) = _poolReserves(HOME, address(token));
        assertApproxEqRel(reserveToken, poolTokens, 1e9, "pool tokens");
        assertApproxEqRel(reserveEth, poolEth, 1e9, "pool ETH");

        // Seluruh setoran ada di PoolManager; tidak ada yang tertinggal di PositionManager.
        assertEq(token.balanceOf(address(chains[HOME].poolManager)), poolTokens);
        assertEq(address(chains[HOME].poolManager).balance, poolEth);
        assertEq(token.balanceOf(address(chains[HOME].positionManager)), 0);

        // NFT posisi dipegang penerima LP, bukan Graduator; seluruh likuiditas pool posisi itu.
        assertEq(l.positionId, expectedPositionId);
        assertEq(chains[HOME].positionManager.ownerOf(l.positionId), LP_RECIPIENT);
        assertEq(
            chains[HOME].positionManager.getPositionLiquidity(l.positionId),
            chains[HOME].router.liquidityOf(key)
        );

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
        // Selisihnya hanya pembulatan `tokensPerChain` ke kelipatan dust: di bawah 1e-12.
        assertApproxEqRel(
            chains[HOME].router.sqrtPriceOf(graduator.poolKeyOf(address(token))),
            PoolSeeder.sqrtPriceX96(EXPANSION_PAIR_ETH, tokensPerChain),
            1e6
        );
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
        (, uint256 reserveEth) = _poolReserves(HOME, address(one));
        assertApproxEqRel(reserveEth, GRADUATION_THRESHOLD - CALLER_REWARD, 1e9);
        assertApproxEqRel(
            chains[HOME].router.sqrtPriceOf(graduator.poolKeyOf(address(one))),
            PoolSeeder.sqrtPriceX96(EXPANSION_PAIR_ETH, tokensPerChain),
            1e6
        );
    }

    function test_tradingMovesToPoolAfterGraduation() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));

        uint256 out = _poolBuy(HOME, address(token), bob, 0.1 ether);
        assertGt(out, 0);
        assertEq(token.balanceOf(bob), out);
        assertGt(_poolSell(HOME, address(token), bob, out / 2), 0);
    }

    // ───────────────────────── Front-run pool home ─────────────────────────
    // Di home, pembeli curve sudah memegang token sebelum graduation. Di v2 mereka bisa membuat
    // pair lebih dulu, memasang harga, atau mendonasikan aset (PRD P55). Di v4 PoolKey XofN
    // dijaga hook: pool itu tidak bisa ada sebelum graduate(). Yang tersisa bagi pihak lain
    // hanyalah pool di PoolKey LAIN, dan itu tidak boleh memblokir atau memengaruhi graduation.

    /// @dev v2: "pair kosong dibuat lebih dulu". v4: ditolak hook, pada harga berapa pun.
    function test_frontRun_thirdPartyCannotInitializeHomePool() public {
        _buy(curve, attacker, 0.5 ether);
        PoolKey memory key = graduator.poolKeyOf(address(token));
        uint160 skewed = PoolSeeder.sqrtPriceX96(1 ether, 1_000 ether);

        vm.prank(attacker);
        _expectGuardRejects(address(key.hooks), attacker);
        chains[HOME].poolManager.initialize(key, skewed);
        // Graduator sendiri hanya menginisialisasi lewat graduate(); tidak ada jalan lain.
        assertFalse(_poolExists(HOME, address(token)));

        vm.deal(alice, GRADUATION_THRESHOLD);
        _buy(curve, alice, GRADUATION_THRESHOLD);
        vm.prank(keeper);
        graduator.graduate(address(token));
        _assertHomePoolAtTarget();
    }

    /// @dev v2: donasi satu sisi + `sync`, dan donasi TANPA `sync` (PRD P55, HIGH). v4: pool belum
    ///      ada, jadi tidak bisa didonasikan; aset yang dikirim langsung ke PoolManager atau
    ///      PositionManager tidak ikut terhitung.
    function test_frontRun_donationsCannotBlockOrSkewGraduation() public {
        uint256 bought = _buy(curve, attacker, 0.5 ether);
        PoolKey memory key = graduator.poolKeyOf(address(token));
        vm.deal(attacker, 10 ether);
        vm.startPrank(attacker);
        token.approve(address(chains[HOME].router), bought);
        vm.expectRevert(POOL_NOT_INITIALIZED);
        chains[HOME].router.donate{value: 0.5 ether}(key, 0.5 ether, bought / 2);
        token.transfer(address(chains[HOME].poolManager), bought / 4);
        token.transfer(address(chains[HOME].positionManager), bought / 4);
        vm.stopPrank();

        vm.deal(alice, GRADUATION_THRESHOLD);
        _buy(curve, alice, GRADUATION_THRESHOLD);
        vm.prank(keeper);
        graduator.graduate(address(token));
        _assertHomePoolAtTarget();
    }

    /// @dev Penyerang membuka pool tandingan kecil dengan token yang terlalu MAHAL.
    function test_frontRun_overpricedRivalPoolHasNoEffect() public {
        _assertRivalPoolHasNoEffect(1_000 ether, 1 ether);
    }

    /// @dev Penyerang membuka pool tandingan kecil dengan token yang terlalu MURAH.
    function test_frontRun_underpricedRivalPoolHasNoEffect() public {
        _assertRivalPoolHasNoEffect(20_000_000 ether, 0.001 ether);
    }

    /// @dev Pool tandingan SEUKURAN likuiditas graduation, harga 2,26x target. Di v2 versi awal
    ///      PoolSeeder menyumbangkan sisa setorannya ke LP yang ada (review 17 Nov 2026).
    function test_frontRun_largeOverpricedRivalPoolHasNoEffect() public {
        _assertRivalPoolHasNoEffect(195_000_000 ether, 8.8 ether);
    }

    function test_frontRun_largeUnderpricedRivalPoolHasNoEffect() public {
        _assertRivalPoolHasNoEffect(250_000_000 ether, 1 ether);
    }

    /// @dev Ukuran dan harga pool tandingan apa pun: graduation tidak bisa diblokir, pool XofN
    ///      dibuka tepat pada harga target, dan penyerang tidak mengambil apa pun dari setoran.
    function testFuzz_frontRun_anyRivalPoolHasNoEffect(uint256 attackTokens, uint256 attackEth)
        public
    {
        attackTokens = bound(attackTokens, 1e15, 250_000_000 ether);
        attackEth = bound(attackEth, 1e12, 60 ether);
        _assertRivalPoolHasNoEffect(attackTokens, attackEth);
    }

    function _assertRivalPoolHasNoEffect(uint256 attackTokens, uint256 attackEth) private {
        // Penyerang membeli token di curve, lalu membuat pool tandingan dengan harga yang salah.
        uint256 bought = _buy(curve, attacker, 0.5 ether);
        assertGe(bought, attackTokens);
        (PoolKey memory rival, uint256 liquidity) =
            _openRivalPool(HOME, address(token), attacker, attackTokens, attackEth);
        uint256 tokensAfterOpen = token.balanceOf(attacker);
        uint256 ethAfterOpen = attacker.balance;

        vm.deal(alice, GRADUATION_THRESHOLD);
        _buy(curve, alice, GRADUATION_THRESHOLD);
        vm.prank(keeper);
        graduator.graduate(address(token));

        _assertHomePoolAtTarget();

        // Penyerang menarik likuiditasnya: paling banyak yang ia setor (dikurangi pembulatan).
        _closeRivalPool(HOME, rival, attacker, liquidity);
        assertLe(token.balanceOf(attacker) - tokensAfterOpen, attackTokens, "attacker tokens");
        assertLe(attacker.balance - ethAfterOpen, attackEth, "attacker ETH");
    }

    /// @dev Pool XofN dibuka tepat pada rasio setoran graduation, berisi seluruh setoran, dan
    ///      Graduator tidak menyisakan apa pun selain porsi token ekspansi.
    function _assertHomePoolAtTarget() private view {
        XofNGraduator.Launch memory l = graduator.launchOf(address(token));
        uint256 targetEth = GRADUATION_THRESHOLD - CALLER_REWARD;
        uint256 targetTokens = TOTAL_SUPPLY - SALE_SUPPLY - 2 * l.tokensPerChain;
        PoolKey memory key = graduator.poolKeyOf(address(token));

        assertEq(
            uint8(l.status), uint8(XofNGraduator.Status.Graduated), "graduation must not be blocked"
        );
        assertEq(
            chains[HOME].router.sqrtPriceOf(key),
            PoolSeeder.sqrtPriceX96(targetEth, targetTokens),
            "pool must open at the target price"
        );
        (uint256 reserveToken, uint256 reserveEth) = _poolReserves(HOME, address(token));
        assertApproxEqRel(reserveToken, targetTokens, 1e9, "protocol liquidity was diluted");
        assertApproxEqRel(reserveEth, targetEth, 1e9, "protocol liquidity was diluted");
        assertEq(chains[HOME].positionManager.ownerOf(l.positionId), LP_RECIPIENT);
        assertEq(
            chains[HOME].positionManager.getPositionLiquidity(l.positionId),
            chains[HOME].router.liquidityOf(key),
            "all pool liquidity is the protocol position"
        );

        // Supply utuh dan tidak ada sisa di Graduator selain porsi token ekspansi.
        assertEq(token.totalSupply(), TOTAL_SUPPLY);
        assertEq(token.balanceOf(address(graduator)), 2 * l.tokensPerChain);
        assertEq(address(graduator).balance, 0);
    }
}
