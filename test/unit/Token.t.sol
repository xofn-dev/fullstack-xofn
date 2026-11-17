// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    SetConfigParam
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {Errors} from "@layerzerolabs/lz-evm-protocol-v2/contracts/libs/Errors.sol";
import {
    EndpointV2Mock as EndpointV2
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import {OAppReceiver} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";

/// @dev PRD §9.2 tahap 1: supply 999M di curve, tidak ada mint selain `_credit`, dan
///      `renounceOwnership` menolkan delegate lebih dulu.
contract TokenTest is XofNTestBase {
    XofNToken internal token;
    XofNCurve internal curve;

    function setUp() public override {
        super.setUp();
        (token, curve) = _launch(STANDARD, _eids(BASE, ARB));
    }

    function test_supplyIs999MAndHeldByCurve() public view {
        assertEq(token.TOTAL_SUPPLY(), 999_000_000 ether);
        assertEq(token.totalSupply(), 999_000_000 ether);
        assertEq(token.balanceOf(address(curve)), 999_000_000 ether);
        assertEq(token.decimals(), 18);
        assertEq(token.sharedDecimals(), 6);
        assertEq(token.decimalConversionRate(), 1e12);
    }

    function test_isOftFromStageOne() public view {
        assertEq(address(token.endpoint()), chains[HOME].endpoint);
        assertEq(token.token(), address(token));
        (, uint64 version) = token.oftVersion();
        assertEq(version, 1);
    }

    function test_ownerAndDelegateAreGraduator() public view {
        assertEq(token.owner(), address(graduator));
        assertEq(_delegateOf(HOME, address(token)), address(graduator));
    }

    /// @dev Token di chain ekspansi lahir dengan supply 0: tidak ada mint kedua.
    function test_remoteInstanceStartsWithZeroSupply() public {
        XofNToken remoteInstance =
            new XofNToken("Proof Coin", "PROOF", chains[BASE].endpoint, address(this), address(0));
        assertEq(remoteInstance.totalSupply(), 0);
    }

    /// @dev ABI tidak memuat mint/burn/pause/fee/blacklist/upgrade dalam bentuk apa pun.
    function test_abiHasNoForbiddenFunctions() public view {
        string memory json = vm.readFile("out/XofNToken.sol/XofNToken.json");
        string[] memory signatures = vm.parseJsonKeys(json, ".methodIdentifiers");
        string[9] memory forbidden =
            ["mint", "burn", "pause", "fee", "tax", "blacklist", "blocklist", "upgrade", "freeze"];
        for (uint256 i = 0; i < signatures.length; i++) {
            string memory lower = vm.toLowercase(signatures[i]);
            for (uint256 j = 0; j < forbidden.length; j++) {
                assertEq(vm.indexOf(lower, forbidden[j]), type(uint256).max, signatures[i]);
            }
        }
    }

    /// @dev `lzReceive` (satu-satunya jalur ke `_credit`) menolak pemanggil selain endpoint.
    function test_lzReceiveRejectsNonEndpoint() public {
        Origin memory origin = Origin(BASE, _b32(attacker), 1);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OAppReceiver.OnlyEndpoint.selector, attacker));
        token.lzReceive(origin, bytes32(0), _creditMessage(attacker, 1_000_000), address(0), "");
    }

    /// @dev Bahkan endpoint tidak bisa mengkreditkan token dari pathway tanpa peer.
    function test_lzReceiveRejectsUnknownPathway() public {
        Origin memory origin = Origin(BASE, _b32(attacker), 1);
        vm.prank(chains[HOME].endpoint);
        vm.expectRevert(abi.encodeWithSelector(IOAppCore.NoPeer.selector, BASE));
        token.lzReceive(origin, bytes32(0), _creditMessage(attacker, 1_000_000), address(0), "");
    }

    /// @dev Setelah ekspansi, pesan dari pengirim yang bukan peer tetap ditolak.
    function test_lzReceiveRejectsWrongPeerAfterExpansion() public {
        (XofNToken locked,) = _launchGraduateExpand(STANDARD, _eids(BASE, ARB));
        uint256 supplyBefore = locked.totalSupply();

        Origin memory origin = Origin(BASE, _b32(attacker), 1);
        vm.prank(chains[HOME].endpoint);
        vm.expectRevert(abi.encodeWithSelector(IOAppCore.OnlyPeer.selector, BASE, _b32(attacker)));
        locked.lzReceive(origin, bytes32(0), _creditMessage(attacker, 1_000_000), address(0), "");

        assertEq(locked.totalSupply(), supplyBefore);
    }

    /// @dev QUIP-25: delegate dinolkan SEBELUM owner dilepas, dalam panggilan yang sama.
    function test_renounceOwnershipNullsDelegateFirst() public {
        XofNToken standalone =
            new XofNToken("Solo", "SOLO", chains[HOME].endpoint, address(this), address(this));
        assertEq(_delegateOf(HOME, address(standalone)), address(this));

        vm.recordLogs();
        standalone.renounceOwnership();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 delegateIndex = type(uint256).max;
        uint256 ownershipIndex = type(uint256).max;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("DelegateSet(address,address)")) delegateIndex = i;
            if (logs[i].topics[0] == keccak256("OwnershipTransferred(address,address)")) {
                ownershipIndex = i;
            }
        }
        assertLt(delegateIndex, ownershipIndex, "delegate must be cleared before owner");
        assertEq(standalone.owner(), address(0));
        assertEq(_delegateOf(HOME, address(standalone)), address(0));

        // Bekas owner/delegate tidak bisa lagi menyentuh konfigurasi.
        SetConfigParam[] memory params = new SetConfigParam[](0);
        vm.expectRevert(Errors.LZ_Unauthorized.selector);
        EndpointV2(chains[HOME].endpoint)
            .setConfig(address(standalone), chains[HOME].sendLib, params);
        vm.expectRevert(Errors.LZ_Unauthorized.selector);
        EndpointV2(chains[HOME].endpoint)
            .setSendLibrary(address(standalone), BASE, chains[HOME].sendLib);
    }

    function test_renounceOwnershipOnlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker)
        );
        token.renounceOwnership();
    }

    function test_transferOwnershipIsDisabledEvenForOwner() public {
        vm.prank(address(graduator));
        vm.expectRevert(XofNToken.OwnershipTransferDisabled.selector);
        token.transferOwnership(attacker);
        assertEq(token.owner(), address(graduator));
    }

    /// @dev Pesan OFT tanpa compose: to (32 byte) + amountSD (8 byte).
    function _creditMessage(address to, uint64 amountSD) private pure returns (bytes memory) {
        return abi.encodePacked(_b32(to), amountSD);
    }
}
