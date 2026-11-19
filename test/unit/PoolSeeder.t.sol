// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {IV4PositionManager} from "../../contracts/interfaces/IUniswapV4.sol";
import {PoolSeeder} from "../../contracts/libraries/PoolSeeder.sol";
import {V4Env} from "../helpers/V4Env.sol";

contract SeedToken is ERC20 {
    constructor() ERC20("Seed Proof", "SPROOF") {
        _mint(msg.sender, 999_000_000 ether);
    }
}

/// @dev Punya `poolManager()` seperti quoter/StateView/router v4, tetapi bukan PositionManager.
contract NotAPositionManager {
    address public immutable poolManager;

    constructor(address _poolManager) {
        poolManager = _poolManager;
    }
}

/// @dev Punya `nextTokenId()` tetapi nilainya 0; PositionManager asli mulai dari 1.
contract ZeroCounterPositionManager {
    address public immutable poolManager;
    uint256 public constant nextTokenId = 0;

    constructor(address _poolManager) {
        poolManager = _poolManager;
    }
}

/// @dev Hook yang `seeder()`-nya benar tetapi meloloskan pemanggil mana pun.
contract PermissiveGuard {
    address public immutable seeder;

    constructor(address _seeder) {
        seeder = _seeder;
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }
}

/// @dev Hook yang menolak semua pemanggil.
contract RejectAllGuard {
    address public immutable seeder;

    constructor(address _seeder) {
        seeder = _seeder;
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert("nobody");
    }
}

/// @dev Meniru pemanggil PoolSeeder (Graduator/Remote): memegang token + ETH lalu memanggil
///      library terhubung lewat delegatecall.
contract SeedHarness {
    receive() external payable {}

    function validate(address positionManager, address poolGuard, address lpRecipient)
        external
        view
    {
        PoolSeeder.validate(positionManager, poolGuard, lpRecipient);
    }

    function seed(
        address positionManager,
        address poolGuard,
        address token,
        uint256 tokenAmount,
        uint256 ethAmount,
        address lpRecipient
    ) external returns (bytes32, uint256) {
        return PoolSeeder.seed(positionManager, poolGuard, token, tokenAmount, ethAmount, lpRecipient);
    }

    function poolKey(address poolGuard, address token) external pure returns (PoolKey memory) {
        return PoolSeeder.poolKey(poolGuard, token);
    }

    function sqrtPriceX96(uint256 ethAmount, uint256 tokenAmount) external pure returns (uint160) {
        return PoolSeeder.sqrtPriceX96(ethAmount, tokenAmount);
    }
}

/// @title PoolSeederTest — PoolSeeder terhadap PoolManager dan PositionManager Uniswap v4 asli
/// @dev Padanan v4 dari skenario front-run v2 (PRD P55, review 17 dan 19 Nov 2026). Di v2 pihak
///      lain bisa membuat pair, mendonasikan aset, atau memasang harga lebih dulu. Di v4 PoolKey
///      XofN dijaga hook, jadi sebagian besar skenario itu menjadi "tidak mungkin", dan tes di
///      bawah membuktikannya terhadap kontrak asli.
contract PoolSeederTest is Test, V4Env {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    // Ukuran setoran seperti di lifecycle nyata (konstanta tes): pool home dan pool ekspansi.
    uint256 internal constant HOME_TOKENS = 195_872_727_272_728 * 1e12;
    uint256 internal constant HOME_ETH = 3.99 ether;
    uint256 internal constant REMOTE_TOKENS = 1_963_636_363_636 * 1e12;
    uint256 internal constant REMOTE_ETH = 0.04 ether;

    address internal constant LP = address(0xdead);
    /// @dev Token yang dipertaruhkan penyerang di pool tandingan (ia memegang 400M).
    uint256 internal constant RIVAL_TOKEN_BUDGET = 100_000_000 ether;
    address internal attacker = makeAddr("attacker");
    address internal trader = makeAddr("trader");

    V4 internal v4;
    SeedToken internal token;
    SeedHarness internal harness;
    address internal guard;
    PoolKey internal key;

    function setUp() public {
        v4 = _deployV4(makeAddr("v4-owner"));
        token = new SeedToken();
        harness = new SeedHarness();
        guard = _deployGuard(address(harness));
        key = harness.poolKey(guard, address(token));

        token.transfer(address(harness), 400_000_000 ether);
        token.transfer(attacker, 400_000_000 ether);
        vm.deal(address(harness), 1000 ether);
        vm.deal(attacker, 1000 ether);
        vm.deal(trader, 1000 ether);
    }

    // ───────────────────────────── Bentuk pool ─────────────────────────────

    function test_poolKeyShape() public view {
        assertEq(Currency.unwrap(key.currency0), address(0), "ETH native = currency0");
        assertEq(Currency.unwrap(key.currency1), address(token));
        assertEq(key.fee, 3000);
        assertEq(key.tickSpacing, 60);
        assertEq(address(key.hooks), guard);
        assertEq(PoolSeeder.TICK_LOWER, TickMath.minUsableTick(60));
        assertEq(PoolSeeder.TICK_UPPER, TickMath.maxUsableTick(60));
    }

    function test_seedCreatesAndFillsPoolInOneCall_home() public {
        _seedAndCheck(HOME_TOKENS, HOME_ETH);
    }

    function test_seedCreatesAndFillsPoolInOneCall_remote() public {
        _seedAndCheck(REMOTE_TOKENS, REMOTE_ETH);
    }

    /// @dev Semua pool token yang sama dibuka pada harga yang sama: rasio setoran home dan
    ///      ekspansi hanya berbeda sebesar pembulatan `tokensPerChain` ke kelipatan dust.
    function test_homeAndRemoteSizesOpenAtTheSamePrice() public view {
        uint256 home = harness.sqrtPriceX96(HOME_ETH, HOME_TOKENS);
        uint256 remote = harness.sqrtPriceX96(REMOTE_ETH, REMOTE_TOKENS);
        assertApproxEqRel(home, remote, 1e6, "sqrtPrice differs by more than 1e-12");
        int24 tickHome = TickMath.getTickAtSqrtPrice(uint160(home));
        int24 tickRemote = TickMath.getTickAtSqrtPrice(uint160(remote));
        assertLe(tickHome > tickRemote ? tickHome - tickRemote : tickRemote - tickHome, 1);
    }

    function test_seedingTwiceReverts() public {
        harness.seed(address(v4.positionManager), guard, address(token), HOME_TOKENS, HOME_ETH, LP);
        vm.expectRevert(POOL_ALREADY_INITIALIZED);
        harness.seed(address(v4.positionManager), guard, address(token), HOME_TOKENS, HOME_ETH, LP);
    }

    function test_rejectsZeroAndOversizedAmounts() public {
        address posm = address(v4.positionManager);
        vm.expectRevert(PoolSeeder.ZeroSeedAmount.selector);
        harness.seed(posm, guard, address(token), 0, HOME_ETH, LP);
        vm.expectRevert(PoolSeeder.ZeroSeedAmount.selector);
        harness.seed(posm, guard, address(token), HOME_TOKENS, 0, LP);
        vm.expectRevert(PoolSeeder.SeedAmountTooLarge.selector);
        harness.seed(posm, guard, address(token), uint256(type(uint128).max) + 1, HOME_ETH, LP);
        vm.expectRevert(PoolSeeder.SeedAmountTooLarge.selector);
        harness.seed(posm, guard, address(token), HOME_TOKENS, uint256(type(uint128).max) + 1, LP);
    }

    // ───────────────────────────── Front-run: tidak mungkin ─────────────────────────────

    /// @dev v2: "pair kosong dibuat lebih dulu" dan "pool tandingan pada harga miring".
    ///      v4: siapa pun selain pemanggil library ditolak hook, pada harga berapa pun.
    function test_thirdPartyCannotInitializeXofNPoolKey() public {
        uint160[3] memory prices = [
            harness.sqrtPriceX96(HOME_ETH, HOME_TOKENS),
            harness.sqrtPriceX96(HOME_ETH, HOME_TOKENS / 100),
            harness.sqrtPriceX96(HOME_ETH, HOME_TOKENS * 2)
        ];
        for (uint256 i = 0; i < prices.length; i++) {
            vm.prank(attacker);
            _expectGuardRejects(address(key.hooks), attacker);
            v4.poolManager.initialize(key, prices[i]);
        }
        // PositionManager juga bukan seeder (jalur `initializePool` di sana menelan error).
        vm.prank(address(v4.positionManager));
        _expectGuardRejects(address(key.hooks), address(v4.positionManager));
        v4.poolManager.initialize(key, prices[0]);

        assertEq(v4.router.sqrtPriceOf(key), 0, "pool must not exist");
        _seedAndCheck(HOME_TOKENS, HOME_ETH);
    }

    /// @dev Fee atau tickSpacing lain dengan hook yang sama tetap PoolKey ber-hook XofN: ditolak.
    function testFuzz_thirdPartyCannotInitializeAnyKeyWithTheGuard(
        address caller,
        uint24 fee,
        int24 tickSpacing,
        uint160 sqrtPrice
    ) public {
        // `guard` dikecualikan: PoolManager melewati hook bila pemanggilnya hook itu sendiri
        // (lihat test_hookSelfCallIsSkipped_soTheGuardMustNotBeAbleToCallOut).
        vm.assume(caller != address(harness) && caller != guard);
        fee = uint24(bound(fee, 0, 1_000_000));
        tickSpacing = int24(bound(tickSpacing, 1, 32_767));
        sqrtPrice =
            uint160(bound(sqrtPrice, TickMath.MIN_SQRT_PRICE, TickMath.MAX_SQRT_PRICE - 1));
        PoolKey memory other = key;
        other.fee = fee;
        other.tickSpacing = tickSpacing;
        vm.prank(caller);
        _expectGuardRejects(address(other.hooks), caller);
        v4.poolManager.initialize(other, sqrtPrice);
    }

    /// @dev v2: donasi + `sync` ke pair sebelum setoran. v4: pool belum ada, jadi tidak ada yang
    ///      bisa didonasikan atau diisi.
    function test_cannotDonateOrAddLiquidityBeforeSeed() public {
        vm.startPrank(attacker);
        token.approve(address(v4.router), type(uint256).max);
        vm.expectRevert(POOL_NOT_INITIALIZED);
        v4.router.modifyLiquidity{value: 1 ether}(
            key, PoolSeeder.TICK_LOWER, PoolSeeder.TICK_UPPER, 1e18
        );
        vm.expectRevert(POOL_NOT_INITIALIZED);
        v4.router.donate{value: 1 ether}(key, 1 ether, 1000 ether);
        vm.expectRevert(POOL_NOT_INITIALIZED);
        v4.router.buy{value: 1 ether}(key, attacker);
        vm.stopPrank();
    }

    /// @dev v2: donasi WETH/token ke pair TANPA `sync` (PRD P55, HIGH). v4: akuntansi PoolManager
    ///      berbasis delta, dan PositionManager dibayar dalam jumlah eksplisit, jadi saldo yang
    ///      dikirim langsung tidak ikut terpakai dan tidak mengubah hasil.
    function test_directTransfersToManagersHaveNoEffect() public {
        uint256 snap = vm.snapshotState();
        (uint160 cleanPrice, uint128 cleanLiquidity) = _seed(HOME_TOKENS, HOME_ETH);
        vm.revertToState(snap);

        vm.startPrank(attacker);
        token.transfer(address(v4.poolManager), 50_000_000 ether);
        token.transfer(address(v4.positionManager), 50_000_000 ether);
        (bool ok,) = address(v4.poolManager).call{value: 5 ether}("");
        ok; // PoolManager boleh menolak ETH langsung; hasilnya sama.
        vm.stopPrank();

        uint256 managerTokens = token.balanceOf(address(v4.poolManager));
        (uint160 price, uint128 liquidity) = _seed(HOME_TOKENS, HOME_ETH);
        assertEq(price, cleanPrice, "price moved by a direct transfer");
        assertEq(liquidity, cleanLiquidity, "liquidity moved by a direct transfer");
        // Setoran tepat sebesar yang diminta; kiriman pihak lain tidak ikut terpakai. (Token yang
        // dikirim ke PositionManager tetap di sana dan bisa di-SWEEP siapa pun: itu token si
        // pengirim sendiri, bukan bagian setoran.)
        assertEq(token.balanceOf(address(harness)), 400_000_000 ether - HOME_TOKENS);
        assertEq(token.balanceOf(address(v4.poolManager)), managerTokens + HOME_TOKENS);
        assertEq(token.balanceOf(address(v4.positionManager)), 50_000_000 ether);
    }

    /// @dev Batas asumsi hook: bila pemanggil `initialize` adalah hook itu SENDIRI, PoolManager
    ///      tidak memanggil hook (`noSelfCall`), jadi inisialisasi lolos. Itu tidak bisa terjadi
    ///      di luar tes karena XofNPoolGuard tidak punya fungsi yang memanggil keluar
    ///      (test/unit/PoolGuard.t.sol::test_hasNoStateChangingFunction). Tes ini mengunci
    ///      perilaku itu supaya hook tidak pernah diberi kemampuan memanggil PoolManager.
    function test_hookSelfCallIsSkipped_soTheGuardMustNotBeAbleToCallOut() public {
        // Dihitung lebih dulu: `prank` berlaku untuk panggilan berikutnya.
        uint160 skewed = harness.sqrtPriceX96(HOME_ETH, HOME_TOKENS * 2);
        vm.prank(guard);
        v4.poolManager.initialize(key, skewed);
        assertGt(v4.router.sqrtPriceOf(key), 0);
    }

    /// @dev Jumlah di luar rentang wajar, termasuk ETH satuan wei: tidak pernah revert, selalu
    ///      ada likuiditas, dan tidak ada nilai yang hilang. Di sini cabang "debu di atas batas
    ///      dikembalikan ke pemanggil" ikut terlewati, jadi yang ditegaskan adalah kekekalan:
    ///      yang keluar dari pemanggil sama dengan yang masuk PoolManager, dan tidak lebih dari
    ///      setoran.
    function testFuzz_seedNeverRevertsAcrossExtremeAmounts(uint256 tokenAmount, uint256 ethAmount)
        public
    {
        tokenAmount = bound(tokenAmount, 1e12, 400_000_000 ether);
        ethAmount = bound(ethAmount, 1, 1000 ether);
        uint256 callerTokens = token.balanceOf(address(harness));
        uint256 callerEth = address(harness).balance;

        harness.seed(address(v4.positionManager), guard, address(token), tokenAmount, ethAmount, LP);

        uint256 tokensOut = callerTokens - token.balanceOf(address(harness));
        uint256 ethOut = callerEth - address(harness).balance;
        assertLe(tokensOut, tokenAmount, "caller paid more tokens than the deposit");
        assertLe(ethOut, ethAmount, "caller paid more ETH than the deposit");
        assertEq(token.balanceOf(address(v4.poolManager)), tokensOut, "tokens unaccounted for");
        assertEq(address(v4.poolManager).balance, ethOut, "ETH unaccounted for");
        assertEq(token.balanceOf(address(v4.positionManager)), 0);
        assertEq(address(v4.positionManager).balance, 0);
        assertGt(v4.router.liquidityOf(key), 0, "liquidity");
    }

    /// @dev v2: pool tandingan miring, kecil maupun besar. v4: hanya bisa di PoolKey LAIN (tanpa
    ///      hook atau fee lain). Pool itu tidak mengubah harga, likuiditas, atau sisa pemanggil.
    function test_rivalHooklessPoolHasNoEffect() public {
        uint256 snap = vm.snapshotState();
        (uint160 cleanPrice, uint128 cleanLiquidity) = _seed(HOME_TOKENS, HOME_ETH);
        vm.revertToState(snap);

        _rivalPool(3000, 60, HOME_ETH, HOME_TOKENS / 50, 50 ether);
        _rivalPool(500, 10, HOME_ETH, HOME_TOKENS * 3, 5 ether);

        (uint160 price, uint128 liquidity) = _seed(HOME_TOKENS, HOME_ETH);
        assertEq(price, cleanPrice);
        assertEq(liquidity, cleanLiquidity);
    }

    function testFuzz_rivalHooklessPoolHasNoEffect(
        uint256 rivalEth,
        uint256 rivalTokens,
        uint256 depositEth,
        bool remoteSize
    ) public {
        rivalEth = bound(rivalEth, 0.001 ether, 100 ether);
        rivalTokens = bound(rivalTokens, 1000 ether, 300_000_000 ether);
        depositEth = bound(depositEth, 0.001 ether, 50 ether);
        (uint256 tokens, uint256 eth) =
            remoteSize ? (REMOTE_TOKENS, REMOTE_ETH) : (HOME_TOKENS, HOME_ETH);

        _rivalPool(3000, 60, rivalEth, rivalTokens, depositEth);
        (uint160 price,) = _seed(tokens, eth);
        assertEq(price, harness.sqrtPriceX96(eth, tokens));
    }

    // ───────────────────────────── Likuiditas dan debu ─────────────────────────────

    /// @dev v2: "bagian LP dibulatkan ke 0" (review 19 Nov, MEDIUM #1). v4: mint pertama selalu
    ///      milik setoran ini. Untuk setiap jumlah yang wajar, likuiditas > 0, pemanggil tidak
    ///      menyisakan apa pun, dan debu yang dilepas di bawah batasnya.
    function testFuzz_seedAlwaysMintsAndLeavesNothing(uint256 tokenAmount, uint256 ethAmount)
        public
    {
        tokenAmount = bound(tokenAmount, 1 ether, 400_000_000 ether);
        ethAmount = bound(ethAmount, 0.0001 ether, 1000 ether);
        _seedAndCheck(tokenAmount, ethAmount);
    }

    /// @dev Posisi full-range dengan fee 0,30% memberi hasil swap yang sama dengan rumus v2
    ///      997/1000 atas cadangan setoran. Ini dasar batas subsidi di constructor Graduator.
    function test_firstSwapMatchesV2ConstantProductFormula() public {
        _seed(HOME_TOKENS, HOME_ETH);
        uint256[4] memory buys = [uint256(0.001 ether), 0.1 ether, 1 ether, 10 ether];
        for (uint256 i = 0; i < buys.length; i++) {
            uint256 snap = vm.snapshotState();
            vm.prank(trader);
            uint256 out = v4.router.buy{value: buys[i]}(key, trader);
            assertApproxEqRel(out, _v2Out(buys[i], HOME_ETH, HOME_TOKENS), 1e6, "buy parity");
            vm.revertToState(snap);
        }

        uint256[3] memory sells = [uint256(1000 ether), 1_000_000 ether, 100_000_000 ether];
        vm.prank(attacker);
        token.approve(address(v4.router), type(uint256).max);
        for (uint256 i = 0; i < sells.length; i++) {
            uint256 snap = vm.snapshotState();
            vm.prank(attacker);
            uint256 out = v4.router.sell(key, sells[i], attacker);
            assertApproxEqRel(out, _v2Out(sells[i], HOME_TOKENS, HOME_ETH), 1e6, "sell parity");
            vm.revertToState(snap);
        }
    }

    /// @dev Likuiditas pihak lain yang ditambahkan SETELAH pool dibuka tidak mengambil apa pun
    ///      dari posisi protokol: yang ditarik kembali tidak lebih dari yang disetor.
    function test_lateLiquidityProviderCannotTakeFromProtocolPosition() public {
        (, uint128 seeded) = _seed(HOME_TOKENS, HOME_ETH);
        vm.startPrank(attacker);
        token.approve(address(v4.router), type(uint256).max);
        uint256 ethBefore = attacker.balance;
        uint256 tokensBefore = token.balanceOf(attacker);
        v4.router.modifyLiquidity{value: 100 ether}(
            key, PoolSeeder.TICK_LOWER, PoolSeeder.TICK_UPPER, int256(uint256(seeded))
        );
        v4.router.modifyLiquidity(
            key, PoolSeeder.TICK_LOWER, PoolSeeder.TICK_UPPER, -int256(uint256(seeded))
        );
        vm.stopPrank();
        assertLe(attacker.balance, ethBefore);
        assertLe(token.balanceOf(attacker), tokensBefore);
        assertEq(v4.router.liquidityOf(key), seeded, "protocol liquidity unchanged");
    }

    // ───────────────────────────── Validasi constructor ─────────────────────────────

    function test_validateAcceptsTheRealSetup() public view {
        harness.validate(address(v4.positionManager), guard, LP);
    }

    function test_validateRejectsBadPositionManager() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(PoolSeeder.InvalidPositionManager.selector, eoa));
        harness.validate(eoa, guard, LP);
    }

    /// @dev Kontrak v4 lain (quoter, StateView, router) juga punya `poolManager()`. Tanpa
    ///      pemeriksaan ini salah tempel alamat baru ketahuan saat graduation, ketika curve sudah
    ///      tertutup dan tidak ada jalan keluar (review 19 Nov 2026, LOW-1).
    function test_validateRejectsContractThatIsNotAPositionManager() public {
        address fake = address(new NotAPositionManager(address(v4.poolManager)));
        vm.expectRevert(abi.encodeWithSelector(PoolSeeder.InvalidPositionManager.selector, fake));
        harness.validate(fake, guard, LP);

        address zeroCounter = address(new ZeroCounterPositionManager(address(v4.poolManager)));
        vm.expectRevert(
            abi.encodeWithSelector(PoolSeeder.InvalidPositionManager.selector, zeroCounter)
        );
        harness.validate(zeroCounter, guard, LP);
    }

    /// @dev Hook di alamat ber-flag benar dengan `seeder()` benar, tetapi meloloskan siapa pun:
    ///      pool bisa diinisialisasi lebih dulu pada harga sembarang (review 19 Nov 2026, LOW-2).
    function test_validateRejectsPermissiveGuard() public {
        address where = address(uint160(_guardAddressFor(makeAddr("permissive"))));
        vm.etch(where, address(new PermissiveGuard(address(harness))).code);
        assertEq(PermissiveGuard(where).seeder(), address(harness));
        vm.expectRevert(abi.encodeWithSelector(PoolSeeder.InvalidPoolGuard.selector, where));
        harness.validate(address(v4.positionManager), where, LP);
    }

    /// @dev Kebalikannya: hook yang menolak semua orang, termasuk kontrak ini.
    function test_validateRejectsGuardThatRejectsItsOwnSeeder() public {
        address where = address(uint160(_guardAddressFor(makeAddr("strict"))));
        vm.etch(where, address(new RejectAllGuard(address(harness))).code);
        vm.expectRevert(abi.encodeWithSelector(PoolSeeder.InvalidPoolGuard.selector, where));
        harness.validate(address(v4.positionManager), where, LP);
    }

    function test_validateRejectsGuardWithoutCode() public {
        address empty = _guardAddressFor(makeAddr("nobody"));
        vm.expectRevert(abi.encodeWithSelector(PoolSeeder.InvalidPoolGuard.selector, empty));
        harness.validate(address(v4.positionManager), empty, LP);
    }

    /// @dev Hook yang sah tetapi terikat ke kontrak lain: kontrak ini tidak akan bisa
    ///      menginisialisasi pool, jadi ditolak saat deploy, bukan saat graduation.
    function test_validateRejectsGuardBoundToAnotherSeeder() public {
        address other = _deployGuard(makeAddr("other-seeder"));
        vm.expectRevert(abi.encodeWithSelector(PoolSeeder.InvalidPoolGuard.selector, other));
        harness.validate(address(v4.positionManager), other, LP);
    }

    /// @dev Kontrak dengan `seeder()` yang benar tetapi di alamat tanpa flag: PoolManager tidak
    ///      akan pernah memanggilnya, jadi siapa pun bisa menginisialisasi.
    function test_validateRejectsGuardAtUnflaggedAddress() public {
        address unflagged = address(uint160(_guardAddressFor(address(harness))) ^ 0x2000);
        vm.etch(unflagged, guard.code);
        vm.expectRevert(abi.encodeWithSelector(PoolSeeder.InvalidPoolGuard.selector, unflagged));
        harness.validate(address(v4.positionManager), unflagged, LP);
    }

    function test_validateRejectsSpecialLpRecipients() public {
        for (uint160 i = 0; i <= 2; i++) {
            vm.expectRevert(
                abi.encodeWithSelector(PoolSeeder.InvalidLpRecipient.selector, address(i))
            );
            harness.validate(address(v4.positionManager), guard, address(i));
        }
        harness.validate(address(v4.positionManager), guard, address(3));
    }

    // ───────────────────────────── Helper ─────────────────────────────

    function _seed(uint256 tokenAmount, uint256 ethAmount)
        private
        returns (uint160 sqrtPrice, uint128 liquidity)
    {
        harness.seed(address(v4.positionManager), guard, address(token), tokenAmount, ethAmount, LP);
        sqrtPrice = v4.router.sqrtPriceOf(key);
        liquidity = v4.router.liquidityOf(key);
    }

    struct Before {
        uint256 callerTokens;
        uint256 callerEth;
        uint256 managerTokens;
        uint256 managerEth;
        uint256 nextId;
    }

    function _seedAndCheck(uint256 tokenAmount, uint256 ethAmount) private {
        Before memory b = Before({
            callerTokens: token.balanceOf(address(harness)),
            callerEth: address(harness).balance,
            managerTokens: token.balanceOf(address(v4.poolManager)),
            managerEth: address(v4.poolManager).balance,
            nextId: v4.positionManager.nextTokenId()
        });

        (bytes32 poolId, uint256 positionId) = harness.seed(
            address(v4.positionManager), guard, address(token), tokenAmount, ethAmount, LP
        );
        assertEq(poolId, PoolId.unwrap(key.toId()), "poolId");
        assertEq(positionId, b.nextId, "positionId");

        _checkPool(positionId, tokenAmount, ethAmount);
        _checkBalances(b, tokenAmount, ethAmount);
    }

    function _checkPool(uint256 positionId, uint256 tokenAmount, uint256 ethAmount) private view {
        // Harga pembukaan = rasio setoran. Tidak ada pihak lain yang bisa menentukannya.
        (uint160 sqrtPrice,,, uint24 lpFee) = v4.poolManager.getSlot0(key.toId());
        assertEq(sqrtPrice, harness.sqrtPriceX96(ethAmount, tokenAmount), "opening price");
        assertEq(lpFee, 3000);

        // NFT posisi milik penerima LP; seluruh likuiditas pool adalah posisi itu.
        assertEq(v4.positionManager.ownerOf(positionId), LP, "position owner");
        uint128 liquidity = v4.poolManager.getLiquidity(key.toId());
        assertGt(liquidity, 0, "liquidity");
        assertEq(v4.positionManager.getPositionLiquidity(positionId), liquidity);

        // Yang benar-benar masuk posisi: selisihnya dengan setoran di bawah batas debu.
        (uint256 reserveEth, uint256 reserveToken) = v4.router.reservesOf(key);
        assertLe(ethAmount - _min(reserveEth, ethAmount), ethAmount / 1e9 + 2, "ETH dust");
        assertLe(tokenAmount - _min(reserveToken, tokenAmount), tokenAmount / 1e9 + 2, "token dust");
    }

    function _checkBalances(Before memory b, uint256 tokenAmount, uint256 ethAmount) private view {
        // Pemanggil mengeluarkan tepat jumlah setoran dan tidak menyisakan apa pun (PRD §5.5).
        assertEq(token.balanceOf(address(harness)), b.callerTokens - tokenAmount, "caller tokens");
        assertEq(address(harness).balance, b.callerEth - ethAmount, "caller ETH");
        // Tidak ada yang tertinggal di PositionManager; semuanya di PoolManager (termasuk debu
        // pembulatan yang dilepas), jadi total supply tidak berubah.
        assertEq(token.balanceOf(address(v4.positionManager)), 0);
        assertEq(address(v4.positionManager).balance, 0);
        assertEq(token.balanceOf(address(v4.poolManager)), b.managerTokens + tokenAmount);
        assertEq(address(v4.poolManager).balance, b.managerEth + ethAmount);
    }

    /// @dev Pool milik penyerang di PoolKey tanpa hook, pada harga miliknya sendiri.
    function _rivalPool(
        uint24 fee,
        int24 tickSpacing,
        uint256 priceEth,
        uint256 priceTokens,
        uint256 depositEth
    ) private {
        PoolKey memory rival = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(token)),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(0))
        });
        uint160 sqrtPrice = harness.sqrtPriceX96(priceEth, priceTokens);
        vm.startPrank(attacker);
        v4.poolManager.initialize(rival, sqrtPrice);
        token.approve(address(v4.router), type(uint256).max);
        // Likuiditas full-range sebesar anggaran penyerang pada harga itu: sisi ETH
        // L = eth * sqrtP / 2^96, sisi token L = token * 2^96 / sqrtP; dipakai yang lebih kecil.
        uint256 liquidity = _min(
            depositEth * uint256(sqrtPrice) / (1 << 96),
            RIVAL_TOKEN_BUDGET * (1 << 96) / uint256(sqrtPrice)
        );
        if (liquidity > 0) {
            v4.router.modifyLiquidity{value: depositEth * 2}(
                rival,
                TickMath.minUsableTick(tickSpacing),
                TickMath.maxUsableTick(tickSpacing),
                int256(liquidity)
            );
        }
        vm.stopPrank();
    }

    function _v2Out(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        private
        pure
        returns (uint256)
    {
        uint256 withFee = amountIn * 997;
        return (withFee * reserveOut) / (reserveIn * 1000 + withFee);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
