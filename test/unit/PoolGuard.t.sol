// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {XofNPoolGuard} from "../../contracts/XofNPoolGuard.sol";
import {PoolSeeder} from "../../contracts/libraries/PoolSeeder.sol";
import {V4Env} from "../helpers/V4Env.sol";

/// @dev Kontrak yang memvalidasi infrastruktur pool di constructor, seperti Graduator dan Remote.
contract GuardedSeeder {
    constructor(address positionManager, address poolGuard) {
        PoolSeeder.validate(positionManager, poolGuard, address(0xdead));
    }
}

/// @dev Hook penjaga: predikat murni atas `sender`. Perilakunya terhadap PoolManager asli diuji
///      di test/unit/PoolSeeder.t.sol.
contract PoolGuardTest is Test, V4Env {
    address internal seeder = makeAddr("seeder");
    XofNPoolGuard internal guard;
    PoolKey internal key;

    function setUp() public {
        guard = XofNPoolGuard(_deployGuard(seeder));
    }

    function test_addressCarriesOnlyBeforeInitializeFlag() public view {
        assertEq(uint160(address(guard)) & Hooks.ALL_HOOK_MASK, Hooks.BEFORE_INITIALIZE_FLAG);
        assertEq(guard.seeder(), seeder);
    }

    function test_seederPasses_andSelectorIsReturned() public view {
        assertEq(guard.beforeInitialize(seeder, key, 1), IHooks.beforeInitialize.selector);
    }

    function testFuzz_anyOtherSenderIsRejected(address sender) public {
        vm.assume(sender != seeder);
        vm.expectRevert(abi.encodeWithSelector(XofNPoolGuard.OnlySeeder.selector, sender));
        guard.beforeInitialize(sender, key, 1);
    }

    function test_rejectsZeroSeeder() public {
        vm.expectRevert(XofNPoolGuard.ZeroAddress.selector);
        new XofNPoolGuard(address(0));
    }

    /// @dev Alamat CREATE biasa hampir pasti tidak ber-flag tepat; yang ini tidak (dicek).
    function test_rejectsAddressWithoutTheFlag() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        assertTrue(uint160(predicted) & Hooks.ALL_HOOK_MASK != Hooks.BEFORE_INITIALIZE_FLAG);
        vm.expectRevert(
            abi.encodeWithSelector(XofNPoolGuard.InvalidHookAddress.selector, predicted)
        );
        new XofNPoolGuard(seeder);
    }

    /// @dev Setiap kombinasi flag selain tepat `beforeInitialize` ditolak constructor.
    function testFuzz_rejectsAnyOtherFlagCombination(uint16 flags) public {
        uint160 low = uint160(flags) & Hooks.ALL_HOOK_MASK;
        vm.assume(low != Hooks.BEFORE_INITIALIZE_FLAG);
        address where = address((uint160(0xBEEF) << 100) | low);
        // `deployCodeTo` menjalankan constructor di alamat tujuan; constructor revert
        // `InvalidHookAddress`, dan cheat itu melaporkannya dengan pesan ini.
        vm.expectRevert(
            "StdCheats deployCodeTo(string,bytes,uint256,address): Failed to create runtime bytecode."
        );
        this.deployGuardAt(where);
    }

    /// @dev Jalur deploy yang SEBENARNYA, tanpa cheat penempatan: salt CREATE2 ditambang sampai
    ///      alamatnya hanya ber-flag `beforeInitialize`, hook di-deploy LEBIH DULU untuk alamat
    ///      seeder yang diprediksi, baru seeder dibuat di alamat itu dan memvalidasi hook-nya
    ///      (review 19 Nov 2026, LOW-4). Di jaringan publik alamat seeder diprediksi lewat CREATE3
    ///      (CreateX); di sini lewat nonce CREATE kontrak tes. Penambangannya sama.
    function test_minedCreate2GuardBindsToSeederDeployedAfterIt() public {
        V4 memory v4 = _deployV4(makeAddr("v4-owner"));
        // Seeder dibuat SETELAH hook. CREATE2 hook juga menaikkan nonce kontrak tes, jadi seeder
        // jatuh di nonce saat ini + 1.
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(XofNPoolGuard).creationCode, abi.encode(predicted)));
        bytes32 salt;
        address expected;
        uint256 tries;
        for (;; tries++) {
            salt = bytes32(tries);
            expected = vm.computeCreate2Address(salt, initCodeHash, address(this));
            if (uint160(expected) & Hooks.ALL_HOOK_MASK == Hooks.BEFORE_INITIALIZE_FLAG) break;
        }
        emit log_named_uint("salts tried", tries + 1);

        XofNPoolGuard mined = new XofNPoolGuard{salt: salt}(predicted);
        assertEq(address(mined), expected, "CREATE2 address");
        assertEq(mined.seeder(), predicted);

        GuardedSeeder seederContract = new GuardedSeeder(address(v4.positionManager), address(mined));
        assertEq(address(seederContract), predicted, "seeder must land on the predicted address");

        // Seeder yang sama di alamat LAIN tidak diterima hook itu: constructor-nya revert.
        vm.expectRevert(
            abi.encodeWithSelector(PoolSeeder.InvalidPoolGuard.selector, address(mined))
        );
        new GuardedSeeder(address(v4.positionManager), address(mined));
    }

    function deployGuardAt(address where) external {
        deployCodeTo("XofNPoolGuard.sol:XofNPoolGuard", abi.encode(seeder), where);
    }

    /// @dev Tidak ada fungsi pengubah state sama sekali: tidak ada owner, setter, atau jalan keluar.
    function test_hasNoStateChangingFunction() public view {
        string memory artifact = vm.readFile("out/XofNPoolGuard.sol/XofNPoolGuard.json");
        string[] memory names = vm.parseJsonKeys(artifact, ".methodIdentifiers");
        assertEq(names.length, 2);
        for (uint256 i = 0; i < names.length; i++) {
            bytes32 h = keccak256(bytes(names[i]));
            assertTrue(
                h == keccak256("seeder()")
                    || h
                        == keccak256(
                            "beforeInitialize(address,(address,address,uint24,int24,address),uint160)"
                        ),
                names[i]
            );
        }
    }
}
