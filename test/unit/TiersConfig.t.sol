// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {TierLib} from "../../contracts/libraries/TierLib.sol";

/// @dev `config/tiers.json` (data, format deployguide §2) harus selaras dengan aturan tier di
///      kontrak. Nama operator masih menunggu PRD P1; yang dicocokkan di sini adalah jumlahnya.
contract TiersConfigTest is Test {
    string internal json;

    function setUp() public {
        json = vm.readFile("config/tiers.json");
    }

    function test_standardMatchesContract() public view {
        assertEq(vm.parseJsonString(json, ".standard.badge"), "XofN 2+1/2");
        assertEq(
            vm.parseJsonStringArray(json, ".standard.required").length, TierLib.STANDARD_REQUIRED
        );
        assertEq(vm.parseJsonStringArray(json, ".standard.optional").length, TierLib.OPTIONAL_COUNT);
        assertEq(vm.parseJsonUint(json, ".standard.optionalThreshold"), TierLib.OPTIONAL_THRESHOLD);
    }

    function test_fortressMatchesContract() public view {
        assertEq(vm.parseJsonString(json, ".fortress.badge"), "XofN 3+1/2");
        assertEq(
            vm.parseJsonStringArray(json, ".fortress.required").length, TierLib.FORTRESS_REQUIRED
        );
        assertEq(vm.parseJsonStringArray(json, ".fortress.optional").length, TierLib.OPTIONAL_COUNT);
        assertEq(vm.parseJsonUint(json, ".fortress.optionalThreshold"), TierLib.OPTIONAL_THRESHOLD);
    }

    /// @dev Hanya dua tier. Tidak ada entri 1-of-1 atau tier lain di data.
    function test_onlyTwoTiersExist() public view {
        string[] memory keys = vm.parseJsonKeys(json, "$");
        uint256 tiers;
        for (uint256 i = 0; i < keys.length; i++) {
            if (bytes(keys[i])[0] == "$") continue; // $comment, $status
            tiers++;
            assertTrue(
                keccak256(bytes(keys[i])) == keccak256("standard")
                    || keccak256(bytes(keys[i])) == keccak256("fortress"),
                keys[i]
            );
        }
        assertEq(tiers, 2);
        assertTrue(TierLib.isValidTier(TierLib.TIER_STANDARD));
        assertTrue(TierLib.isValidTier(TierLib.TIER_FORTRESS));
        assertFalse(TierLib.isValidTier(0));
        assertFalse(TierLib.isValidTier(3));
    }
}
