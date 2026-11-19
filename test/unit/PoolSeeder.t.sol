// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {PoolSeeder} from "../../contracts/libraries/PoolSeeder.sol";
import {MockWETH, MockV2Factory, MockV2Pair} from "../mocks/MockUniswapV2.sol";

contract SeedToken is ERC20 {
    constructor() ERC20("Seed Proof", "SPROOF") {
        _mint(msg.sender, 999_000_000 ether);
    }
}

/// @dev Meniru pemanggil PoolSeeder (Graduator/Remote): memegang token + ETH lalu memanggil
///      library terhubung lewat delegatecall.
contract LocalSeedHarness {
    function seed(address factory, address weth, address token, uint256 tokenAmount, address lp)
        external
        payable
        returns (address pair, uint256 liquidity)
    {
        return PoolSeeder.seed(factory, weth, token, tokenAmount, msg.value, lp);
    }
}

/// @dev PoolSeeder terhadap pool tandingan, termasuk donasi tanpa `sync` (PRD P55, temuan
///      `proof/2026-11-17-phase3/11-poolseeder-rereview.md`). Metrik sama dengan
///      `Graduate.t.sol` dan `ForkUniV2.t.sol`, dinilai pada harga target setoran:
///      - likuiditas protokol berkurang paling banyak 1e-5 setoran (fee swap penyeimbang);
///      - penyerang tidak untung lebih dari 1e-5 setoran.
contract PoolSeederTest is Test {
    address internal constant LP_RECIPIENT = address(0xdEaD);

    // Setoran graduation home dan chain ekspansi dengan konstanta tes lokal.
    uint256 internal constant HOME_TOKENS = 190_000_000 ether;
    uint256 internal constant HOME_ETH = 3.91 ether;
    uint256 internal constant REMOTE_TOKENS = 4_000_000 ether;
    uint256 internal constant REMOTE_ETH = 0.04 ether;

    address internal attacker = makeAddr("seed-attacker");

    MockWETH internal weth;
    MockV2Factory internal factory;
    SeedToken internal token;
    LocalSeedHarness internal harness;

    struct Attack {
        uint256 tokens; // token di pool tandingan
        uint256 eth; // ETH di pool tandingan
        uint256 donatedEth; // WETH yang ditransfer ke pair tanpa sync
        uint256 donatedTokens; // token yang ditransfer ke pair tanpa sync
        bool sync; // donasi di-sync atau tidak
    }

    function setUp() public {
        weth = new MockWETH();
        factory = new MockV2Factory();
        token = new SeedToken();
        harness = new LocalSeedHarness();
    }

    // ───────────────────────────── Donasi tanpa sync (P55 HIGH) ─────────────────────────────

    /// @dev Skenario PoC review: pool tandingan ±½ harga target + donasi 5 WETH tanpa sync.
    function test_unsyncedWethDonation_home_doesNotProfit() public {
        _assertAttack(HOME_TOKENS, HOME_ETH, Attack(30_000_000 ether, 0.3 ether, 5 ether, 0, false));
    }

    function test_unsyncedWethDonation_remote_doesNotProfit() public {
        _assertAttack(
            REMOTE_TOKENS, REMOTE_ETH, Attack(600_000 ether, 0.003 ether, 0.05 ether, 0, false)
        );
    }

    /// @dev Varian sisi token: donasi token tanpa sync ke pool yang token-nya mahal.
    function test_unsyncedTokenDonation_home_doesNotProfit() public {
        _assertAttack(
            HOME_TOKENS, HOME_ETH, Attack(1_000 ether, 1 ether, 0, 50_000_000 ether, false)
        );
    }

    /// @dev Pembanding: donasi yang sama tetapi sudah di-sync.
    function test_syncedWethDonation_home_doesNotProfit() public {
        _assertAttack(HOME_TOKENS, HOME_ETH, Attack(30_000_000 ether, 0.3 ether, 5 ether, 0, true));
    }

    /// @dev Donasi ke pair yang belum pernah di-mint menjadi milik setoran pertama.
    function test_unsyncedDonationIntoEmptyPairGoesToProtocol() public {
        address pair = factory.createPair(address(token), address(weth));
        vm.deal(attacker, 1 ether);
        vm.startPrank(attacker);
        weth.deposit{value: 1 ether}();
        weth.transfer(pair, 1 ether);
        vm.stopPrank();

        _seed(HOME_TOKENS, HOME_ETH);
        MockV2Pair p = MockV2Pair(pair);
        assertEq(p.balanceOf(attacker), 0);
        assertEq(p.balanceOf(LP_RECIPIENT), p.totalSupply() - p.MINIMUM_LIQUIDITY());
        (, uint256 reserveEth) = _reserves(p);
        assertEq(reserveEth, HOME_ETH + 1 ether);
    }

    // ───────────────────────────── Blokir lewat donasi (P55 MEDIUM) ─────────────────────────────

    /// @dev Pair 1001/1001 (total LP 1001) + donasi besar tanpa sync. Versi lama: bagian
    ///      protokol dibulatkan ke 0 dan `mint` revert. Sekarang setoran berhasil, dan donasi
    ///      menjadi milik pool.
    function test_unsyncedDonationCannotBlockSeed_home() public {
        _assertAttack(HOME_TOKENS, HOME_ETH, Attack(1001, 1001, 4_000 ether, 0, false));
    }

    function test_unsyncedDonationCannotBlockSeed_remote() public {
        _assertAttack(REMOTE_TOKENS, REMOTE_ETH, Attack(1001, 1001, 50 ether, 0, false));
    }

    // ─────────────── Pembulatan LP ke 0 (review ulang 19 Nov 2026, MEDIUM #1) ───────────────

    /// @dev Skenario review: pair dengan total LP 1001, lalu donasi DUA sisi pada harga target
    ///      + sync. Bagian LP setoran kecil (pe = 0,01 ETH) dibulatkan ke 0. Versi sebelumnya:
    ///      `mint` revert selamanya dan ekspansi macet. Sekarang setoran tetap masuk pool (lewat
    ///      `sync`), tidak ada sisa di pemanggil, dan penyerang rugi.
    function test_lpRoundingToZero_doesNotBlockSeed() public {
        uint256 tokens = 490_000 ether;
        uint256 eth = 0.01 ether;
        Attack memory a = Attack(1_002_001, 1, 10.2 ether, 500_000_000 ether, true);
        MockV2Pair pair = _rivalPool(a);
        assertEq(pair.totalSupply(), 1001);

        (address seeded, uint256 liquidity) = _seed(tokens, eth);
        assertEq(seeded, address(pair));
        assertEq(liquidity, 0, "no LP: share rounds to zero");
        assertEq(pair.balanceOf(LP_RECIPIENT), 0);
        // Setoran menjadi cadangan pool (milik LP yang ada, mayoritas LP terkunci permanen).
        (uint256 reserveToken, uint256 reserveEth) = _reserves(pair);
        assertEq(reserveToken, a.tokens + a.donatedTokens + tokens);
        assertEq(reserveEth, a.eth + a.donatedEth + eth);

        uint256 valueIn = a.eth + a.donatedEth + ((a.tokens + a.donatedTokens) * eth) / tokens;
        assertLt(_attackerExit(pair, tokens, eth), valueIn, "griefing must cost the attacker");
    }

    /// @dev Total LP kecil dan donasi dua sisi sebesar apa pun, dengan atau tanpa sync:
    ///      setoran tidak pernah revert dan penyerang tidak untung. Kerugian protokol di sini
    ///      bisa melebihi 1e-5 (pembulatan LP pool dengan total LP kecil; review LOW #3), tetapi
    ///      selalu lebih kecil dari biaya penyerang.
    function testFuzz_tinyLpTwoSidedDonation_neverBlocksNorProfits(
        uint256 lpSqrt,
        uint256 dEth,
        uint256 dTokens,
        bool syncIt,
        bool remoteSized
    ) public {
        (uint256 tokens, uint256 eth) = remoteSized
            ? (uint256(490_000 ether), uint256(0.01 ether))
            : (HOME_TOKENS, HOME_ETH);
        lpSqrt = bound(lpSqrt, 1001, 20_000);
        Attack memory a = Attack(
            lpSqrt * lpSqrt,
            1,
            bound(dEth, 0, 50 ether),
            bound(dTokens, 0, 500_000_000 ether),
            syncIt
        );
        MockV2Pair pair = _rivalPool(a);
        (address seeded,) = _seed(tokens, eth);
        assertEq(seeded, address(pair));

        uint256 valueIn = a.eth + a.donatedEth + ((a.tokens + a.donatedTokens) * eth) / tokens;
        assertLe(
            _attackerExit(pair, tokens, eth),
            valueIn + (2 * eth) / 100_000,
            "front-runner must not profit"
        );
    }

    // ───────────────────────────── Fuzz (P55 LOW) ─────────────────────────────

    /// @dev Pool tandingan sampai ±500 jt token / 10 ETH (titik terburuk tanpa donasi menurut
    ///      review), plus donasi WETH dan token, dengan atau tanpa sync.
    function testFuzz_anyRivalPool_home(
        uint256 aTokens,
        uint256 aEth,
        uint256 dEth,
        uint256 dTokens,
        bool syncIt
    ) public {
        _assertAttack(
            HOME_TOKENS,
            HOME_ETH,
            Attack(
                bound(aTokens, 1001, 500_000_000 ether),
                bound(aEth, 1001, 10 ether),
                bound(dEth, 0, 10 ether),
                bound(dTokens, 0, 300_000_000 ether),
                syncIt
            )
        );
    }

    function testFuzz_anyRivalPool_remote(
        uint256 aTokens,
        uint256 aEth,
        uint256 dEth,
        uint256 dTokens,
        bool syncIt
    ) public {
        _assertAttack(
            REMOTE_TOKENS,
            REMOTE_ETH,
            Attack(
                bound(aTokens, 1001, 20_000_000 ether),
                bound(aEth, 1001, 1 ether),
                bound(dEth, 0, 1 ether),
                bound(dTokens, 0, 20_000_000 ether),
                syncIt
            )
        );
    }

    /// @dev Pool dengan total LP mendekati MINIMUM_LIQUIDITY: pembulatan bagian protokol.
    function testFuzz_rivalPoolNearMinimumLiquidity(
        uint256 aTokens,
        uint256 aEth,
        uint256 dEth,
        bool syncIt
    ) public {
        _assertAttack(
            HOME_TOKENS,
            HOME_ETH,
            Attack(
                bound(aTokens, 1001, 5000),
                bound(aEth, 1001, 5000),
                bound(dEth, 0, 5_000 ether),
                0,
                syncIt
            )
        );
    }

    // ───────────────────────────── Helper ─────────────────────────────

    function _assertAttack(uint256 tokens, uint256 eth, Attack memory a) private {
        MockV2Pair pair = _rivalPool(a);
        (address seeded,) = _seed(tokens, eth);
        assertEq(seeded, address(pair));

        // Likuiditas protokol berkurang paling banyak 1e-5 setoran (fee swap penyeimbang)
        // ditambah nilai SATU unit LP pool (pembulatan `mint`). Pada pool biasa satu unit LP
        // bernilai sangat kecil; pada pool tandingan dengan total LP ±1000 dan cadangan besar
        // nilainya bisa ±1% setoran (review LOW #3, ditemukan juga oleh fuzz profil CI).
        (uint256 reserveToken, uint256 reserveEth) = _reserves(pair);
        uint256 lpUnitValue = (reserveEth + (reserveToken * eth) / tokens) / pair.totalSupply() + 1;
        assertGe(
            _protocolValue(pair, tokens, eth) + lpUnitValue,
            (2 * eth * 99_999) / 100_000,
            "protocol liquidity diluted"
        );

        // Penyerang tidak untung (toleransi 1e-5 setoran).
        uint256 valueIn = a.eth + a.donatedEth + ((a.tokens + a.donatedTokens) * eth) / tokens;
        assertLe(
            _attackerExit(pair, tokens, eth),
            valueIn + (2 * eth) / 100_000,
            "front-runner must not profit"
        );
    }

    function _rivalPool(Attack memory a) private returns (MockV2Pair pair) {
        token.transfer(attacker, a.tokens + a.donatedTokens);
        vm.deal(attacker, a.eth + a.donatedEth);
        vm.startPrank(attacker);
        pair = MockV2Pair(factory.createPair(address(token), address(weth)));
        weth.deposit{value: a.eth + a.donatedEth}();
        weth.transfer(address(pair), a.eth);
        token.transfer(address(pair), a.tokens);
        pair.mint(attacker);
        if (a.donatedEth != 0) weth.transfer(address(pair), a.donatedEth);
        if (a.donatedTokens != 0) token.transfer(address(pair), a.donatedTokens);
        if (a.sync) pair.sync();
        vm.stopPrank();
    }

    function _seed(uint256 tokens, uint256 eth) private returns (address pair, uint256 liquidity) {
        token.transfer(address(harness), tokens);
        vm.deal(address(this), address(this).balance + eth);
        (pair, liquidity) = harness.seed{value: eth}(
            address(factory), address(weth), address(token), tokens, LP_RECIPIENT
        );
        // Tidak ada sisa di pemanggil (PRD §5.5).
        assertEq(token.balanceOf(address(harness)), 0, "token left in caller");
        assertEq(weth.balanceOf(address(harness)), 0, "weth left in caller");
        assertEq(address(harness).balance, 0, "eth left in caller");
    }

    function _protocolValue(MockV2Pair pair, uint256 tokens, uint256 eth)
        private
        view
        returns (uint256)
    {
        (uint256 reserveToken, uint256 reserveEth) = _reserves(pair);
        uint256 poolValue = reserveEth + (reserveToken * eth) / tokens;
        return (pair.balanceOf(LP_RECIPIENT) * poolValue) / pair.totalSupply();
    }

    /// @dev Nilai yang bisa ditarik penyerang: LP-nya ditambah sisa saldo yang belum di-sync
    ///      (bisa diambil siapa pun lewat `skim`).
    function _attackerExit(MockV2Pair pair, uint256 tokens, uint256 eth) private returns (uint256) {
        vm.startPrank(attacker);
        pair.skim(attacker);
        uint256 lp = pair.balanceOf(attacker);
        uint256 supply = pair.totalSupply();
        (uint256 reserveToken, uint256 reserveEth) = _reserves(pair);
        // LP yang terlalu kecil untuk ditarik (pembulatan ke 0) bernilai 0.
        if (lp * reserveToken / supply != 0 && lp * reserveEth / supply != 0) {
            pair.transfer(address(pair), lp);
            pair.burn(attacker);
        }
        vm.stopPrank();
        return weth.balanceOf(attacker) + (token.balanceOf(attacker) * eth) / tokens;
    }

    function _reserves(MockV2Pair pair)
        private
        view
        returns (uint256 reserveToken, uint256 reserveEth)
    {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (reserveToken, reserveEth) = pair.token0() == address(token) ? (r0, r1) : (r1, r0);
    }

    receive() external payable {}
}
