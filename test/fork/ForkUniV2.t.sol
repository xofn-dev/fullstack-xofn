// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {PoolSeeder} from "../../contracts/libraries/PoolSeeder.sol";

interface IRouterV2 {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external
        pure
        returns (uint256);
}

interface IFactoryV2 {
    function feeTo() external view returns (address);
    function getPair(address a, address b) external view returns (address);
    function createPair(address a, address b) external returns (address);
}

interface IPairV2 {
    function token0() external view returns (address);
    function totalSupply() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function getReserves() external view returns (uint112, uint112, uint32);
    function mint(address to) external returns (uint256);
    function burn(address to) external returns (uint256, uint256);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function skim(address to) external;
    function sync() external;
    function kLast() external view returns (uint256);
}

interface IWeth9 {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

contract ForkToken is ERC20 {
    constructor() ERC20("Fork Proof", "FPROOF") {
        _mint(msg.sender, 999_000_000 ether);
    }
}

/// @dev Meniru pemanggil PoolSeeder (Graduator/Remote): memegang token + ETH lalu memanggil
///      library terhubung lewat delegatecall.
contract SeedHarness {
    function seed(address factory, address weth, address token, uint256 tokenAmount, address lp)
        external
        payable
        returns (address pair, uint256 liquidity)
    {
        return PoolSeeder.seed(factory, weth, token, tokenAmount, msg.value, lp);
    }
}

/// @dev Fork test READ-ONLY terhadap Uniswap v2 yang sebenarnya di Robinhood, Base, dan
///      Arbitrum. Tidak ada broadcast: token, pair baru, dan semua swap hanya hidup di fork lokal
///      milik forge. Yang dibuktikan:
///      1. Pair asli memakai fee 0,3%: `getAmountOut` rumus 997/1000 lulus pemeriksaan K, +1 wei
///         revert `UniswapV2: K`.
///      2. `PoolSeeder.seed` bekerja di factory asli (yang `feeTo`-nya aktif di ketiga chain),
///         baik pada pair baru maupun pair tandingan yang sudah diisi pihak lain, tanpa revert,
///         tanpa kebocoran ke LP lama melebihi fee swap penyeimbang.
///      Dilewati bila `FORK_RPC_<CHAIN>` kosong. Alamat dari proof/2026-11-17-phase0/04-amm-pair-asset.md.
contract ForkUniV2Test is Test {
    address internal constant ROUTER_ROBINHOOD = 0x89e5DB8B5aA49aA85AC63f691524311AEB649eba;
    address internal constant ROUTER_BASE_ARBITRUM = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address internal constant LP_RECIPIENT = address(0xdEaD);

    // Setoran graduation home dengan konstanta tes lokal (bukan keputusan P8/P16).
    uint256 internal constant HOME_TOKENS = 190_000_000 ether;
    uint256 internal constant HOME_ETH = 3.91 ether;
    // Setoran chain ekspansi (expansionPairEth tes).
    uint256 internal constant REMOTE_TOKENS = 4_000_000 ether;
    uint256 internal constant REMOTE_ETH = 0.04 ether;

    address internal attacker = makeAddr("fork-attacker");

    IRouterV2 internal router;
    IFactoryV2 internal factory;
    address internal weth;
    ForkToken internal token;
    SeedHarness internal harness;

    function test_fork_robinhood_univ2() public {
        _run("FORK_RPC_ROBINHOOD", ROUTER_ROBINHOOD, 4663);
    }

    function test_fork_base_univ2() public {
        _run("FORK_RPC_BASE", ROUTER_BASE_ARBITRUM, 8453);
    }

    function test_fork_arbitrum_univ2() public {
        _run("FORK_RPC_ARBITRUM", ROUTER_BASE_ARBITRUM, 42161);
    }

    function _run(string memory envKey, address routerAddress, uint256 chainId) private {
        string memory rpc = vm.envOr(envKey, string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        // Library terhubung di-deploy forge sebelum fork; jaga kodenya tetap ada di fork.
        vm.makePersistent(address(PoolSeeder));
        vm.createSelectFork(rpc);
        assertEq(block.chainid, chainId, "unexpected chain");

        router = IRouterV2(routerAddress);
        factory = IFactoryV2(router.factory());
        weth = router.WETH();
        assertTrue(factory.feeTo() != address(0), "feeTo expected on (proof raw/univ2-fee.txt)");

        uint256 snap = vm.snapshotState();

        // 1. Pair baru, lalu bukti fee 0,3% di pemeriksaan K pair asli.
        _fresh();
        (address pair,) = _seed(HOME_TOKENS, HOME_ETH);
        _assertFeeIs30Bps(IPairV2(pair));
        vm.revertToState(snap);

        // 2. Pool tandingan: kecil/besar, kemahalan/kemurahan; home dan ekspansi.
        _attackCase(HOME_TOKENS, HOME_ETH, 1_000 ether, 1 ether, 0);
        vm.revertToState(snap);
        _attackCase(HOME_TOKENS, HOME_ETH, 20_000_000 ether, 0.001 ether, 0);
        vm.revertToState(snap);
        _attackCase(HOME_TOKENS, HOME_ETH, 195_000_000 ether, 8.8 ether, 0);
        vm.revertToState(snap);
        _attackCase(HOME_TOKENS, HOME_ETH, 250_000_000 ether, 1 ether, 0);
        vm.revertToState(snap);
        _attackCase(REMOTE_TOKENS, REMOTE_ETH, 8_000_000 ether, 0.2 ether, 0);
        vm.revertToState(snap);
        _attackCase(REMOTE_TOKENS, REMOTE_ETH, 100 ether, 0.5 ether, 0);
        vm.revertToState(snap);

        // 3. Donasi WETH tanpa sync (PRD P55). Angka dari PoC review: sebelum perbaikan
        //    penyerang untung ±15% setoran di pair asli (Robinhood +1,19 ETH, Base +0,012 ETH).
        _attackCase(HOME_TOKENS, HOME_ETH, 30_000_000 ether, 0.3 ether, 5 ether);
        vm.revertToState(snap);
        _attackCase(REMOTE_TOKENS, REMOTE_ETH, 600_000 ether, 0.003 ether, 0.05 ether);
        vm.revertToState(snap);
        // Varian blokir (MEDIUM): total LP 1001 + donasi besar. Ambang dengan feeTo aktif
        // ±4 696 ETH di home dan ±48 ETH di ekspansi.
        _attackCase(HOME_TOKENS, HOME_ETH, 1001, 1001, 5_000 ether);
        vm.revertToState(snap);
        _attackCase(REMOTE_TOKENS, REMOTE_ETH, 1001, 1001, 60 ether);
        vm.revertToState(snap);

        // 4. Total LP 1001 + donasi DUA sisi yang di-sync (review ulang 19 Nov 2026, MEDIUM #1):
        //    bagian LP setoran kecil dibulatkan ke 0. Setoran tidak boleh revert dan penyerang
        //    tidak boleh untung.
        _tinyLpCase(490_000 ether, 0.01 ether);
    }

    function _tinyLpCase(uint256 tokens, uint256 eth) private {
        _fresh();
        uint256 donatedTokens = 500_000_000 ether;
        uint256 donatedEth = 10.2 ether;
        token.transfer(attacker, 1_002_001 + donatedTokens);
        vm.deal(attacker, 1 + donatedEth);
        vm.startPrank(attacker);
        IPairV2 pair = IPairV2(factory.createPair(address(token), weth));
        IWeth9(weth).deposit{value: 1 + donatedEth}();
        IWeth9(weth).transfer(address(pair), 1);
        token.transfer(address(pair), 1_002_001);
        pair.mint(attacker);
        IWeth9(weth).transfer(address(pair), donatedEth);
        token.transfer(address(pair), donatedTokens);
        pair.sync();
        vm.stopPrank();

        (address seeded, uint256 liquidity) = _seed(tokens, eth);
        assertEq(seeded, address(pair));
        assertEq(liquidity, 0, "share rounds to zero: deposit becomes reserves");

        uint256 valueIn = 1 + donatedEth + ((1_002_001 + donatedTokens) * eth) / tokens;
        assertLt(_attackerExit(pair, tokens, eth), valueIn, "griefing must cost the attacker");
    }

    function _fresh() private {
        token = new ForkToken();
        harness = new SeedHarness();
    }

    function _seed(uint256 tokens, uint256 eth) private returns (address pair, uint256 liquidity) {
        token.transfer(address(harness), tokens);
        vm.deal(address(this), address(this).balance + eth);
        (pair, liquidity) =
            harness.seed{value: eth}(address(factory), weth, address(token), tokens, LP_RECIPIENT);
        // Tidak ada sisa di pemanggil (PRD §5.5: supply utuh, tidak ada yang tertinggal).
        assertEq(token.balanceOf(address(harness)), 0, "token left in caller");
        assertEq(IWeth9(weth).balanceOf(address(harness)), 0, "weth left in caller");
        assertEq(address(harness).balance, 0, "eth left in caller");
    }

    function _assertFeeIs30Bps(IPairV2 pair) private {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        bool wethIsZero = pair.token0() == weth;
        (uint256 reserveIn, uint256 reserveOut) = wethIsZero ? (r0, r1) : (r1, r0);
        uint256 amountIn = 0.01 ether;
        uint256 out997 = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997);
        assertEq(router.getAmountOut(amountIn, reserveIn, reserveOut), out997, "router formula");

        vm.deal(address(this), address(this).balance + amountIn);
        IWeth9(weth).deposit{value: amountIn}();
        IWeth9(weth).transfer(address(pair), amountIn);

        uint256 snap = vm.snapshotState();
        vm.expectRevert(bytes("UniswapV2: K"));
        pair.swap(wethIsZero ? 0 : out997 + 1, wethIsZero ? out997 + 1 : 0, address(this), "");
        vm.revertToState(snap);

        pair.swap(wethIsZero ? 0 : out997, wethIsZero ? out997 : 0, address(this), "");
        assertEq(token.balanceOf(address(this)), 999_000_000 ether - HOME_TOKENS + out997);
    }

    /// @dev Metrik sama dengan `Graduate.t.sol::_assertSkewedPoolDoesNotProfit`, di pair asli.
    /// @param donation WETH yang ditransfer penyerang ke pair TANPA sync setelah mint (PRD P55).
    function _attackCase(
        uint256 tokens,
        uint256 eth,
        uint256 attackTokens,
        uint256 attackEth,
        uint256 donation
    ) private {
        _fresh();
        // Penyerang membuat pair lebih dulu dan mengisinya dengan harga salah.
        token.transfer(attacker, attackTokens);
        vm.deal(attacker, attackEth + donation);
        vm.startPrank(attacker);
        IPairV2 pair = IPairV2(factory.createPair(address(token), weth));
        IWeth9(weth).deposit{value: attackEth + donation}();
        IWeth9(weth).transfer(address(pair), attackEth);
        token.transfer(address(pair), attackTokens);
        pair.mint(attacker);
        if (donation != 0) IWeth9(weth).transfer(address(pair), donation);
        vm.stopPrank();

        (address seeded,) = _seed(tokens, eth);
        assertEq(seeded, address(pair));

        // Nilai LP protokol (dinilai pada harga target) berkurang paling banyak 1e-5 setoran
        // (fee swap penyeimbang; terukur ±1,7e-6, temuan LOW review 17 Nov 2026).
        assertGe(
            _protocolValue(pair, tokens, eth),
            (2 * eth * 99_999) / 100_000,
            "protocol liquidity diluted"
        );

        // Penyerang keluar; dinilai pada harga target ia tidak untung (toleransi sama: 1e-5).
        uint256 valueIn = attackEth + donation + (attackTokens * eth) / tokens;
        assertLe(
            _attackerExit(pair, tokens, eth),
            valueIn + (2 * eth) / 100_000,
            "front-runner must not profit"
        );
    }

    function _protocolValue(IPairV2 pair, uint256 tokens, uint256 eth)
        private
        view
        returns (uint256)
    {
        (uint256 reserveToken, uint256 reserveEth) = _reserves(pair);
        uint256 poolValue = reserveEth + (reserveToken * eth) / tokens;
        return (pair.balanceOf(LP_RECIPIENT) * poolValue) / pair.totalSupply();
    }

    /// @dev LP penyerang ditambah saldo pair yang belum di-sync (bisa di-`skim` siapa pun).
    ///      LP yang terlalu kecil untuk di-burn bernilai 0.
    function _attackerExit(IPairV2 pair, uint256 tokens, uint256 eth) private returns (uint256) {
        uint256 tokensBefore = token.balanceOf(attacker);
        uint256 wethBefore = IWeth9(weth).balanceOf(attacker);
        vm.startPrank(attacker);
        pair.skim(attacker);
        uint256 lp = pair.balanceOf(attacker);
        uint256 supply = pair.totalSupply();
        (uint256 reserveToken, uint256 reserveEth) = _reserves(pair);
        if (lp * reserveToken / supply != 0 && lp * reserveEth / supply != 0) {
            pair.transfer(address(pair), lp);
            pair.burn(attacker);
        }
        vm.stopPrank();
        uint256 outToken = token.balanceOf(attacker) - tokensBefore;
        uint256 outEth = IWeth9(weth).balanceOf(attacker) - wethBefore;
        return outEth + (outToken * eth) / tokens;
    }

    function _reserves(IPairV2 pair)
        private
        view
        returns (uint256 reserveToken, uint256 reserveEth)
    {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (reserveToken, reserveEth) = pair.token0() == address(token) ? (r0, r1) : (r1, r0);
    }

    receive() external payable {}
}
