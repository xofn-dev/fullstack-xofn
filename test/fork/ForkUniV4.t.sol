// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {IV4PositionManager} from "../../contracts/interfaces/IUniswapV4.sol";
import {PoolSeeder} from "../../contracts/libraries/PoolSeeder.sol";
import {V4Env} from "../helpers/V4Env.sol";
import {V4TestRouter} from "../helpers/V4TestRouter.sol";

interface IPoolManagerAdmin {
    function owner() external view returns (address);
    function protocolFeeController() external view returns (address);
}

contract ForkV4Token is ERC20 {
    constructor() ERC20("Fork Proof", "FPROOF") {
        _mint(msg.sender, 999_000_000 ether);
    }
}

/// @dev Meniru pemanggil PoolSeeder (Graduator/Remote).
contract ForkSeedHarness {
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

/// @title ForkUniV4Test — PoolSeeder terhadap Uniswap v4 yang HIDUP di tiap chain
/// @dev Fork READ-ONLY (tidak ada broadcast). Dilewati bila env RPC kosong. Membuktikan:
///      1. PoolManager dan PositionManager di alamat yang dipakai adalah build resmi: runtime
///         bytecode-nya sama dengan artefak paket npm setelah bagian immutable dinolkan;
///      2. urutan aksi PoolSeeder (termasuk `MINT_POSITION_FROM_DELTAS`) diterima PositionManager
///         yang hidup, pool dibuka pada harga setoran, dan pemanggil tidak menyisakan apa pun;
///      3. hook penjaga menolak inisialisasi oleh pihak lain di PoolManager asli;
///      4. swap pertama setara rumus 997/1000.
///      Pemilik dan pengendali fee protokol tiap PoolManager dicatat di log sebagai bukti.
contract ForkUniV4Test is Test, V4Env {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    uint256 private constant HOME_TOKENS = 195_872_727_272_728 * 1e12;
    uint256 private constant HOME_ETH = 3.99 ether;
    uint256 private constant REMOTE_TOKENS = 1_963_636_363_636 * 1e12;
    uint256 private constant REMOTE_ETH = 0.04 ether;
    address private constant LP = address(0xdead);

    // Alamat dari proof/2026-11-17-phase0/04-amm-pair-asset.md (mainnet) dan
    // proof/2026-11-19-phase6-1a/raw/univ4-base-arbitrum.txt (testnet).
    address private constant PM_ROBINHOOD = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address private constant POSM_ROBINHOOD = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address private constant PM_BASE = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address private constant POSM_BASE = 0x7C5f5A4bBd8fD63184577525326123B519429bDc;
    address private constant PM_ARBITRUM = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address private constant POSM_ARBITRUM = 0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869;
    address private constant PM_BASE_SEPOLIA = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    address private constant POSM_BASE_SEPOLIA = 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;
    address private constant PM_ARBITRUM_SEPOLIA = 0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317;
    address private constant POSM_ARBITRUM_SEPOLIA = 0xAc631556d3d4019C95769033B5E719dD77124BAc;

    IPoolManager private manager;
    IV4PositionManager private posm;
    V4TestRouter private router;
    ForkV4Token private token;
    ForkSeedHarness private harness;
    address private guard;
    PoolKey private key;
    address private attacker = makeAddr("attacker");
    address private trader = makeAddr("trader");

    function test_fork_robinhood_univ4() public {
        _run("FORK_RPC_ROBINHOOD", 4663, PM_ROBINHOOD, POSM_ROBINHOOD);
    }

    function test_fork_base_univ4() public {
        _run("FORK_RPC_BASE", 8453, PM_BASE, POSM_BASE);
    }

    function test_fork_arbitrum_univ4() public {
        _run("FORK_RPC_ARBITRUM", 42161, PM_ARBITRUM, POSM_ARBITRUM);
    }

    function test_fork_robinhoodTestnet_univ4() public {
        _run("FORK_RPC_ROBINHOOD_TESTNET", 46630, PM_ROBINHOOD, POSM_ROBINHOOD);
    }

    function test_fork_baseSepolia_univ4() public {
        _run("FORK_RPC_BASE_SEPOLIA", 84532, PM_BASE_SEPOLIA, POSM_BASE_SEPOLIA);
    }

    function test_fork_arbitrumSepolia_univ4() public {
        _run("FORK_RPC_ARBITRUM_SEPOLIA", 421614, PM_ARBITRUM_SEPOLIA, POSM_ARBITRUM_SEPOLIA);
    }

    function _run(string memory envKey, uint256 chainId, address pm, address positionManager)
        private
    {
        string memory rpc = vm.envOr(envKey, string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        // Library terhubung di-deploy forge sebelum fork; jaga kodenya tetap ada di fork.
        vm.makePersistent(address(PoolSeeder));
        vm.createSelectFork(rpc);
        assertEq(block.chainid, chainId, "unexpected chain");

        manager = IPoolManager(pm);
        posm = IV4PositionManager(positionManager);

        // 1. Build resmi.
        assertEq(address(posm.poolManager()), pm, "PositionManager points elsewhere");
        _assertMatchesArtifact(pm, POOL_MANAGER_ARTIFACT);
        _assertMatchesArtifact(positionManager, POSITION_MANAGER_ARTIFACT);
        emit log_named_uint("chainId", chainId);
        emit log_named_address("PoolManager.owner", IPoolManagerAdmin(pm).owner());
        emit log_named_address(
            "PoolManager.protocolFeeController", IPoolManagerAdmin(pm).protocolFeeController()
        );

        router = new V4TestRouter(manager);
        token = new ForkV4Token();
        harness = new ForkSeedHarness();
        guard = _deployGuard(address(harness));
        key = harness.poolKey(guard, address(token));
        harness.validate(positionManager, guard, LP);
        token.transfer(address(harness), 400_000_000 ether);
        token.transfer(attacker, 100_000_000 ether);
        vm.deal(address(harness), 100 ether);
        vm.deal(attacker, 100 ether);
        vm.deal(trader, 100 ether);

        uint256 snap = vm.snapshotState();

        // 2 + 3. Ukuran home: pihak lain ditolak, lalu setoran membuat dan mengisi pool.
        _assertOutsidersRejected(HOME_ETH, HOME_TOKENS);
        emit log_named_uint("seed gas (home size)", _seedAndCheck(HOME_TOKENS, HOME_ETH));
        // 4. Paritas swap.
        _assertSwapParity(HOME_ETH, HOME_TOKENS);
        vm.revertToState(snap);

        // Ukuran pool ekspansi.
        _assertOutsidersRejected(REMOTE_ETH, REMOTE_TOKENS);
        emit log_named_uint("seed gas (remote size)", _seedAndCheck(REMOTE_TOKENS, REMOTE_ETH));
    }

    function _assertOutsidersRejected(uint256 eth, uint256 tokens) private {
        // Harga dihitung lebih dulu: `expectRevert` berlaku untuk panggilan berikutnya.
        uint160 target = harness.sqrtPriceX96(eth, tokens);
        uint160 skewed = harness.sqrtPriceX96(eth, tokens / 100);
        vm.prank(attacker);
        _expectGuardRejects(address(key.hooks), attacker);
        manager.initialize(key, target);
        vm.prank(attacker);
        _expectGuardRejects(address(key.hooks), attacker);
        manager.initialize(key, skewed);
        vm.prank(address(posm));
        _expectGuardRejects(address(key.hooks), address(posm));
        manager.initialize(key, target);
        (uint160 sqrtPrice,,,) = manager.getSlot0(key.toId());
        assertEq(sqrtPrice, 0, "pool must not exist yet");
    }

    struct Before {
        uint256 callerTokens;
        uint256 callerEth;
        uint256 managerTokens;
        uint256 managerEth;
    }

    function _seedAndCheck(uint256 tokens, uint256 eth) private returns (uint256 gasUsed) {
        Before memory b = Before({
            callerTokens: token.balanceOf(address(harness)),
            callerEth: address(harness).balance,
            managerTokens: token.balanceOf(address(manager)),
            managerEth: address(manager).balance
        });

        uint256 gasBefore = gasleft();
        (bytes32 poolId, uint256 positionId) =
            harness.seed(address(posm), guard, address(token), tokens, eth, LP);
        gasUsed = gasBefore - gasleft();

        assertEq(poolId, PoolId.unwrap(key.toId()), "poolId");
        _checkPool(positionId, tokens, eth);

        // Pemanggil mengeluarkan tepat jumlah setoran; semuanya ada di PoolManager.
        assertEq(token.balanceOf(address(harness)), b.callerTokens - tokens, "caller tokens");
        assertEq(address(harness).balance, b.callerEth - eth, "caller ETH");
        assertEq(token.balanceOf(address(manager)), b.managerTokens + tokens);
        assertEq(address(manager).balance, b.managerEth + eth);
    }

    function _checkPool(uint256 positionId, uint256 tokens, uint256 eth) private view {
        (uint160 sqrtPrice,,, uint24 lpFee) = manager.getSlot0(key.toId());
        assertEq(sqrtPrice, harness.sqrtPriceX96(eth, tokens), "opening price");
        assertEq(lpFee, 3000);
        assertEq(posm.ownerOf(positionId), LP, "position owner");
        uint128 liquidity = manager.getLiquidity(key.toId());
        assertGt(liquidity, 0);
        assertEq(posm.getPositionLiquidity(positionId), liquidity);
    }

    function _assertSwapParity(uint256 reserveEth, uint256 reserveTokens) private {
        uint256 snap = vm.snapshotState();
        vm.prank(trader);
        uint256 out = router.buy{value: 1 ether}(key, trader);
        assertApproxEqRel(out, _v2Out(1 ether, reserveEth, reserveTokens), 1e6, "buy parity");
        vm.revertToState(snap);

        vm.startPrank(attacker);
        token.approve(address(router), type(uint256).max);
        uint256 ethOut = router.sell(key, 1_000_000 ether, attacker);
        vm.stopPrank();
        assertApproxEqRel(
            ethOut, _v2Out(1_000_000 ether, reserveTokens, reserveEth), 1e6, "sell parity"
        );
    }

    /// @dev Runtime on-chain == artefak paket, setelah bagian immutable dinolkan di keduanya.
    function _assertMatchesArtifact(address target, string memory artifactPath) private view {
        string memory json = vm.readFile(artifactPath);
        bytes memory expected = vm.parseJsonBytes(json, ".deployedBytecode.object");
        bytes memory actual = target.code;
        assertEq(actual.length, expected.length, "runtime size differs from the official build");

        string[] memory ids = vm.parseJsonKeys(json, ".deployedBytecode.immutableReferences");
        for (uint256 i = 0; i < ids.length; i++) {
            string memory base =
                string.concat(".deployedBytecode.immutableReferences['", ids[i], "']");
            for (uint256 j = 0;; j++) {
                string memory ref = string.concat(base, "[", vm.toString(j), "]");
                if (!vm.keyExistsJson(json, ref)) break;
                uint256 start = vm.parseJsonUint(json, string.concat(ref, ".start"));
                uint256 length = vm.parseJsonUint(json, string.concat(ref, ".length"));
                for (uint256 k = start; k < start + length; k++) {
                    expected[k] = 0;
                    actual[k] = 0;
                }
            }
        }
        assertEq(keccak256(actual), keccak256(expected), "runtime differs from the official build");
    }

    function _v2Out(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        private
        pure
        returns (uint256)
    {
        uint256 withFee = amountIn * 997;
        return (withFee * reserveOut) / (reserveIn * 1000 + withFee);
    }
}
