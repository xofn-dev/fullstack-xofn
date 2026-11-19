// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {StdCheats} from "forge-std/StdCheats.sol";
import {Vm} from "forge-std/Vm.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {XofNPoolGuard} from "../../contracts/XofNPoolGuard.sol";
import {IV4PositionManager} from "../../contracts/interfaces/IUniswapV4.sol";
import {V4TestRouter} from "./V4TestRouter.sol";

/// @title V4Env
/// @notice Men-deploy Uniswap v4 ASLI untuk tes: PoolManager dan PositionManager dari artefak
///         bawaan paket npm resmi (dikompilasi Uniswap dengan solc 0.8.26; repo ini dipin 0.8.24
///         dan tidak bisa mengompilasinya sendiri).
/// @dev Di-deploy lewat constructor, bukan `vm.etch`: PoolManager menyimpan `address(this)`
///      sebagai immutable (NoDelegateCall), jadi runtime hasil salin tidak akan jalan.
abstract contract V4Env is StdCheats {
    string internal constant POOL_MANAGER_ARTIFACT =
        "node_modules/@uniswap/v4-core/out/PoolManager.sol/PoolManager.json";
    string internal constant POSITION_MANAGER_ARTIFACT =
        "node_modules/@uniswap/v4-periphery/foundry-out/PositionManager.sol/PositionManager.json";

    /// @dev Alamat kanonik Permit2. Tidak di-deploy: jalur XofN tidak memakai Permit2.
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    /// @dev Nilai yang dipakai tes Uniswap sendiri.
    uint256 internal constant UNSUBSCRIBE_GAS_LIMIT = 100_000;

    Vm private constant CHEATS = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev Selector error PoolManager yang dipakai tes (library `Pool` berlisensi BUSL, tidak diimpor).
    bytes4 internal constant POOL_ALREADY_INITIALIZED = bytes4(keccak256("PoolAlreadyInitialized()"));
    bytes4 internal constant POOL_NOT_INITIALIZED = bytes4(keccak256("PoolNotInitialized()"));

    struct V4 {
        IPoolManager poolManager;
        IV4PositionManager positionManager;
        V4TestRouter router;
    }

    function _deployV4(address owner) internal returns (V4 memory v) {
        v.poolManager = IPoolManager(deployCode(POOL_MANAGER_ARTIFACT, abi.encode(owner)));
        v.positionManager = IV4PositionManager(
            deployCode(
                POSITION_MANAGER_ARTIFACT,
                abi.encode(
                    address(v.poolManager),
                    PERMIT2,
                    UNSUBSCRIBE_GAS_LIMIT,
                    address(0), // tokenDescriptor: hanya untuk tokenURI
                    address(0xE770) // weth9: hanya untuk aksi WRAP/UNWRAP, tidak dipakai
                )
            )
        );
        v.router = new V4TestRouter(v.poolManager);
    }

    /// @notice Alamat ber-flag `beforeInitialize` (dan hanya itu) yang unik per `seeder`.
    function _guardAddressFor(address seeder) internal pure returns (address) {
        uint160 base = uint160(uint256(keccak256(abi.encode("xofn.test.guard", seeder))));
        return address((base & ~Hooks.ALL_HOOK_MASK) | Hooks.BEFORE_INITIALIZE_FLAG);
    }

    /// @notice Menaruh XofNPoolGuard di alamat ber-flag. Di jaringan publik alamat seperti itu
    ///         didapat dengan menambang salt CREATE2; di tes cukup `deployCodeTo`. Constructor
    ///         tetap berjalan di alamat tujuan, jadi pemeriksaan flag-nya ikut teruji.
    function _deployGuard(address seeder) internal returns (address guard) {
        guard = _guardAddressFor(seeder);
        deployCodeTo("XofNPoolGuard.sol:XofNPoolGuard", abi.encode(seeder), guard);
    }

    /// @notice `PoolManager.initialize` berikutnya harus gagal KARENA hook penjaga menolak
    ///         `sender`, bukan karena alasan lain. PoolManager membungkus error hook sebagai
    ///         `WrappedError(hook, selector, alasan, HookCallFailed)`.
    function _expectGuardRejects(address guard, address sender) internal {
        CHEATS.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                guard,
                IHooks.beforeInitialize.selector,
                abi.encodeWithSelector(XofNPoolGuard.OnlySeeder.selector, sender),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
    }
}
