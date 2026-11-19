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

    /// @dev Profil sementara Robinhood testnet (Fase 1a): Standard saja. Fortress kosong karena
    ///      testnet hanya punya 4 DVN aktif. Setiap alias harus punya alamat aktif di
    ///      `config/dvn-labels.json`, dan DVN wajib tidak boleh sama dengan DVN opsional.
    function test_testnetProfileMatchesContract() public view {
        string memory base = "$['$testnet']";
        string[] memory required =
            vm.parseJsonStringArray(json, string.concat(base, ".standard.required"));
        string[] memory optional =
            vm.parseJsonStringArray(json, string.concat(base, ".standard.optional"));
        assertEq(required.length, TierLib.STANDARD_REQUIRED);
        assertEq(optional.length, TierLib.OPTIONAL_COUNT);
        assertEq(
            vm.parseJsonUint(json, string.concat(base, ".standard.optionalThreshold")),
            TierLib.OPTIONAL_THRESHOLD
        );
        assertEq(vm.parseJsonStringArray(json, string.concat(base, ".fortress.required")).length, 0);

        string memory labels = vm.readFile("config/dvn-labels.json");
        address[4] memory dvns = [
            _testnetDvn(labels, required[0]),
            _testnetDvn(labels, required[1]),
            _testnetDvn(labels, optional[0]),
            _testnetDvn(labels, optional[1])
        ];
        for (uint256 i = 0; i < dvns.length; i++) {
            for (uint256 j = i + 1; j < dvns.length; j++) {
                assertTrue(dvns[i] != dvns[j], "DVN dipakai dua kali");
            }
        }
    }

    function _testnetDvn(string memory labels, string memory aliasKey)
        private
        view
        returns (address)
    {
        string memory operatorId =
            vm.parseJsonString(labels, string.concat(".aliases.", aliasKey));
        for (uint256 i = 0;; i++) {
            string memory row = string.concat(".testnet.robinhood[", vm.toString(i), "]");
            if (!vm.keyExistsJson(labels, row)) break;
            if (
                keccak256(bytes(vm.parseJsonString(labels, string.concat(row, ".operatorId"))))
                        == keccak256(bytes(operatorId))
                    && !vm.parseJsonBool(labels, string.concat(row, ".deprecated"))
            ) return vm.parseJsonAddress(labels, string.concat(row, ".address"));
        }
        revert(string.concat("DVN testnet tidak ditemukan: ", aliasKey));
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
