// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

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
import {
    EnforcedOptionParam
} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import {OAppReceiver} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {ExpansionMsg} from "../../contracts/libraries/ExpansionMsg.sol";

/// @dev PRD §9.2 tahap 1: selama bonding dan sampai ekspansi, tidak ada pihak selain Graduator
///      yang bisa memanggil fungsi owner/delegate token, dan Graduator tidak punya fungsi di luar
///      jalur graduation dan ekspansi.
contract AuthorityTest is XofNTestBase {
    XofNToken internal token;
    XofNCurve internal curve;

    function setUp() public override {
        super.setUp();
        (token, curve) = _launch(STANDARD, _eids(BASE, ARB));
    }

    function test_nobodyButGraduatorControlsToken_bonding() public {
        _assertOutsidersLockedOut();
    }

    function test_nobodyButGraduatorControlsToken_graduated() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));
        _assertOutsidersLockedOut();
    }

    /// @dev Di tengah ekspansi (satu chain selesai, satu belum) aturannya tetap sama.
    function test_nobodyButGraduatorControlsToken_expanding() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));
        _expand(token);
        _runChain(token, BASE);
        assertEq(
            uint8(graduator.launchOf(address(token)).status), uint8(XofNGraduator.Status.Expanding)
        );
        _assertOutsidersLockedOut();
    }

    /// @dev Setelah terkunci tidak ada lagi yang berwenang, termasuk Graduator.
    function test_afterLockEvenGraduatorIsLockedOut() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));
        _expand(token);
        _runChain(token, BASE);
        _runChain(token, ARB);

        assertEq(token.owner(), address(0));
        assertEq(_delegateOf(HOME, address(token)), address(0));
        _assertLockedOut(address(graduator));
        _assertLockedOut(safe);
    }

    function _assertOutsidersLockedOut() private {
        assertEq(token.owner(), address(graduator), "owner");
        assertEq(_delegateOf(HOME, address(token)), address(graduator), "delegate");
        _assertLockedOut(attacker);
        _assertLockedOut(creator); // creator bukan owner
        _assertLockedOut(safe); // owner infrastruktur tidak bisa menyentuh token
        _assertLockedOut(address(curve));
    }

    /// @dev Semua fungsi owner di token dan semua fungsi delegate di endpoint.
    function _assertLockedOut(address who) private {
        EndpointV2 ep = EndpointV2(chains[HOME].endpoint);
        bytes memory unauthorized =
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, who);
        EnforcedOptionParam[] memory options = new EnforcedOptionParam[](0);
        SetConfigParam[] memory params = new SetConfigParam[](0);

        vm.startPrank(who);

        vm.expectRevert(unauthorized);
        token.setPeer(BASE, _b32(who));
        vm.expectRevert(unauthorized);
        token.setDelegate(who);
        vm.expectRevert(unauthorized);
        token.setEnforcedOptions(options);
        vm.expectRevert(unauthorized);
        token.setMsgInspector(who);
        vm.expectRevert(unauthorized);
        token.setPreCrime(who);
        vm.expectRevert(unauthorized);
        token.transferOwnership(who);
        vm.expectRevert(unauthorized);
        token.renounceOwnership();

        vm.expectRevert(Errors.LZ_Unauthorized.selector);
        ep.setSendLibrary(address(token), BASE, chains[HOME].sendLib);
        vm.expectRevert(Errors.LZ_Unauthorized.selector);
        ep.setReceiveLibrary(address(token), BASE, chains[HOME].receiveLib, 0);
        vm.expectRevert(Errors.LZ_Unauthorized.selector);
        ep.setReceiveLibraryTimeout(
            address(token), BASE, chains[HOME].receiveLib, block.number + 10
        );
        vm.expectRevert(Errors.LZ_Unauthorized.selector);
        ep.setConfig(address(token), chains[HOME].sendLib, params);
        vm.expectRevert(Errors.LZ_Unauthorized.selector);
        ep.setConfig(address(token), chains[HOME].receiveLib, params);

        vm.stopPrank();
    }

    // ───────────────────────────── Permukaan Graduator ─────────────────────────────

    /// @dev Daftar lengkap fungsi Graduator yang bisa mengubah state. Fungsi baru apa pun
    ///      membuat tes ini gagal, sehingga perubahan permukaan selalu terlihat saat review.
    function test_graduatorMutableSurfaceIsExactlyTheAllowlist() public view {
        string[10] memory allowed = [
            "launch", // jalur launch
            "graduate", // tahap 1
            "expandAndLock", // tahap 2
            "retryRemote", // tahap 2
            "sendLiquidityFromSelf", // internal: hanya bisa dipanggil kontrak itu sendiri
            "lzReceive", // ack dari Remote, hanya dari endpoint + peer
            "setPeer", // OApp: pathway infrastruktur, sekali pasang
            "setDelegate", // OApp: delegate pathway infrastruktur
            "transferOwnership", // Ownable kontrak infrastruktur
            "renounceOwnership" // Ownable kontrak infrastruktur
        ];
        string memory json = vm.readFile("out/XofNGraduator.sol/XofNGraduator.json");

        uint256 mutableCount;
        for (uint256 i = 0;; i++) {
            string memory base = string.concat(".abi[", vm.toString(i), "]");
            if (!vm.keyExistsJson(json, base)) break;
            if (!_eq(vm.parseJsonString(json, string.concat(base, ".type")), "function")) continue;
            string memory mutability =
                vm.parseJsonString(json, string.concat(base, ".stateMutability"));
            if (_eq(mutability, "view") || _eq(mutability, "pure")) continue;

            string memory name = vm.parseJsonString(json, string.concat(base, ".name"));
            bool found;
            for (uint256 j = 0; j < allowed.length; j++) {
                if (_eq(name, allowed[j])) found = true;
            }
            assertTrue(found, string.concat("unexpected state-changing function: ", name));
            mutableCount++;
        }
        assertEq(mutableCount, allowed.length, "allowlist drifted");
    }

    function test_sendLiquidityFromSelfIsNotCallableFromOutside() public {
        vm.prank(attacker);
        vm.expectRevert(XofNGraduator.OnlySelf.selector);
        graduator.sendLiquidityFromSelf(address(token), BASE);
    }

    function test_graduatorLzReceiveRejectsNonEndpoint() public {
        bytes memory ack = ExpansionMsg.encodeAck(ExpansionMsg.ACK_LOCKED, address(token), attacker);
        Origin memory origin = Origin(BASE, _b32(address(remotes[BASE])), 1);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OAppReceiver.OnlyEndpoint.selector, attacker));
        graduator.lzReceive(origin, bytes32(0), ack, address(0), "");
    }

    function test_graduatorLzReceiveRejectsNonPeer() public {
        bytes memory ack = ExpansionMsg.encodeAck(ExpansionMsg.ACK_LOCKED, address(token), attacker);
        Origin memory origin = Origin(BASE, _b32(attacker), 1);
        vm.prank(chains[HOME].endpoint);
        vm.expectRevert(abi.encodeWithSelector(IOAppCore.OnlyPeer.selector, BASE, _b32(attacker)));
        graduator.lzReceive(origin, bytes32(0), ack, address(0), "");
    }

    /// @dev Ack palsu yang lolos pemeriksaan peer pun tidak bisa melompati langkah.
    function test_ackOutOfOrderIsIgnored() public {
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(token));
        _expand(token);

        // Token masih di langkah DeploySent; ack LOCKED tidak boleh mengubah apa pun.
        bytes memory ack = ExpansionMsg.encodeAck(ExpansionMsg.ACK_LOCKED, address(token), attacker);
        Origin memory origin = Origin(BASE, _b32(address(remotes[BASE])), 1);
        vm.prank(chains[HOME].endpoint);
        graduator.lzReceive(origin, bytes32(0), ack, address(0), "");

        assertEq(
            uint8(graduator.expansionOf(address(token), BASE).step),
            uint8(XofNGraduator.Step.DeploySent)
        );
        assertEq(token.owner(), address(graduator));
    }

    /// @dev Owner infrastruktur hanya bisa memasang peer sekali, dan hanya untuk EID beresep.
    function test_infraPeerIsSetOnce() public {
        vm.startPrank(safe);
        vm.expectRevert(abi.encodeWithSelector(XofNGraduator.PeerAlreadySet.selector, BASE));
        graduator.setPeer(BASE, _b32(attacker));
        vm.expectRevert(abi.encodeWithSelector(XofNGraduator.UnsupportedEid.selector, uint32(99)));
        graduator.setPeer(99, _b32(attacker));
        vm.stopPrank();

        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker)
        );
        graduator.setPeer(BASE, _b32(attacker));
    }

    function _eq(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
