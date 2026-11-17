// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ILayerZeroEndpointV2
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    SetConfigParam
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {
    EndpointV2Mock as EndpointV2
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {
    EnforcedOptionParam
} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";
import {MockLooseOFT} from "../mocks/MockLooseOFT.sol";

/// @dev PRD §9.2: `verify()` false selama token belum terkunci, false bila owner != 0,
///      delegate != 0, atau konfigurasi satu pathway berbeda dari tier; true hanya bila semuanya
///      sesuai.
///
///      Token XofN yang sudah terkunci tidak bisa diubah lagi, jadi kasus negatif diuji pada
///      Registry kedua yang registrar-nya kontrak tes ini. Kontrak tes menjadi owner + delegate
///      token dan memasang konfigurasi sendiri, benar maupun sengaja salah.
contract RegistryTest is XofNTestBase {
    XofNRegistry internal registry; // registrar = kontrak tes ini
    EndpointV2 internal endpoint;
    TierLib.Pathway internal stored; // resep sementara untuk TierLib.applyRecipe (butuh storage)

    function setUp() public override {
        super.setUp();
        endpoint = EndpointV2(chains[HOME].endpoint);
        registry = new XofNRegistry(address(endpoint), safe);
        vm.prank(safe);
        registry.setRegistrar(address(this));
    }

    // ───────────────────────────── Lifecycle nyata ─────────────────────────────

    function test_verifyIsFalseForUnregisteredToken() public view {
        (bool locked, uint8 tier, uint32[] memory eids) = chains[HOME].registry.verify(attacker);
        assertFalse(locked);
        assertEq(tier, 0);
        assertEq(eids.length, 0);
        assertFalse(chains[HOME].registry.verifyEid(attacker, BASE));
        assertFalse(chains[HOME].registry.checkConfig(attacker));
    }

    /// @dev Bonding → Graduated → Expanding: `verify` false di setiap tahap sebelum terkunci.
    function test_verifyIsFalseUntilLocked() public {
        XofNRegistry home = chains[HOME].registry;
        (XofNToken token, XofNCurve curve) = _launch(STANDARD, _eids(BASE, ARB));
        _assertNotLocked(home, address(token), "bonding");

        _reachThreshold(curve);
        _assertNotLocked(home, address(token), "threshold reached");

        vm.prank(keeper);
        graduator.graduate(address(token));
        _assertNotLocked(home, address(token), "graduated");

        _expand(token);
        _assertNotLocked(home, address(token), "expanding: deploy sent");

        _runChain(token, BASE);
        _assertNotLocked(home, address(token), "expanding: one chain locked");

        _runChain(token, ARB);
        (bool locked, uint8 tier, uint32[] memory eids) = home.verify(address(token));
        assertTrue(locked, "locked after full expansion");
        assertEq(tier, STANDARD);
        assertEq(eids.length, 2);
        assertEq(eids[0], BASE);
        assertEq(eids[1], ARB);
        assertTrue(home.verifyEid(address(token), BASE));
        assertTrue(home.verifyEid(address(token), ARB));
        assertFalse(home.verifyEid(address(token), 99));
        assertEq(home.lockedAt(address(token)), block.timestamp);
    }

    function _assertNotLocked(XofNRegistry r, address token, string memory stage) private view {
        (bool locked,,) = r.verify(token);
        assertFalse(locked, stage);
        assertFalse(r.verifyEid(token, BASE), stage);
        assertFalse(r.verifyEid(token, ARB), stage);
        assertEq(r.lockedAt(token), 0, stage);
    }

    // ───────────────────────────── Kasus negatif `verify` ─────────────────────────────

    function test_verifyTrueOnlyAfterOwnerAndDelegateAreZero() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        _applyRecipe(address(token), ARB, STANDARD);

        // Konfigurasi benar tetapi owner dan delegate masih ada.
        assertTrue(registry.checkConfig(address(token)), "pre-lock check");
        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked, "owner != 0");
        assertFalse(registry.verifyEid(address(token), BASE));

        token.renounceOwnership();
        (locked,,) = registry.verify(address(token));
        assertTrue(locked);
        assertTrue(registry.verifyEid(address(token), BASE));
        assertTrue(registry.verifyEid(address(token), ARB));
    }

    /// @dev Owner 0 tetapi delegate masih ada (renounce tanpa menolkan delegate, QUIP-25).
    function test_verifyFalseWhenDelegateNotZero() public {
        MockLooseOFT token = new MockLooseOFT(address(endpoint), address(this));
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        _applyRecipe(address(token), ARB, STANDARD);

        token.renounceOwnership();
        assertEq(token.owner(), address(0));
        assertEq(_delegateOf(HOME, address(token)), address(this));

        assertTrue(registry.checkConfig(address(token)));
        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked, "delegate != 0");
        assertFalse(registry.verifyEid(address(token), BASE));
    }

    /// @dev Delegate 0 tetapi owner masih ada.
    function test_verifyFalseWhenOwnerNotZero() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        _applyRecipe(address(token), ARB, STANDARD);

        token.setDelegate(address(0));
        assertEq(_delegateOf(HOME, address(token)), address(0));
        assertEq(token.owner(), address(this));

        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked, "owner != 0");
    }

    /// @dev Satu pathway memakai DVN lain: pathway itu gagal, pathway lain tetap lulus,
    ///      `verify` keseluruhan false.
    function test_verifyFalseWhenOnePathwayHasDifferentDvns() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);

        stored = _pathway(HOME, ARB);
        stored.standardRequired[1] = chains[HOME].dvns[4]; // {a0, a4} bukan {a0, a2}
        TierLib.applyRecipe(
            ILayerZeroEndpointV2(address(endpoint)), address(token), stored, STANDARD
        );
        token.setPeer(ARB, bytes32(uint256(1)));

        assertFalse(registry.checkConfig(address(token)));
        token.renounceOwnership();
        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked);
        assertTrue(registry.verifyEid(address(token), BASE), "untouched pathway still verifies");
        assertFalse(registry.verifyEid(address(token), ARB));
    }

    /// @dev Pathway yang diturunkan menjadi 1-of-1 tidak pernah lulus.
    function test_verifyFalseWhenPathwayIsOneOfOne() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        _applyRecipe(address(token), ARB, STANDARD);
        assertTrue(registry.checkConfig(address(token)));

        address[] memory single = new address[](1);
        single[0] = chains[HOME].dvns[0];
        SetConfigParam[] memory params = new SetConfigParam[](1);
        // 255 = benar-benar tanpa DVN opsional (0 berarti "pakai default").
        params[0] = SetConfigParam(
            ARB,
            TierLib.CONFIG_TYPE_ULN,
            abi.encode(UlnConfig(CONFIRMATIONS, 1, 255, 0, single, new address[](0)))
        );
        endpoint.setConfig(address(token), chains[HOME].receiveLib, params);

        assertFalse(registry.checkConfig(address(token)));
        token.renounceOwnership();
        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked);
        assertFalse(registry.verifyEid(address(token), ARB));
    }

    /// @dev Tier yang terdaftar Fortress tidak lulus dengan konfigurasi Standard.
    function test_verifyFalseWhenTierIsLowerThanRegistered() public {
        XofNToken token = _token();
        _registerBoth(address(token), FORTRESS);
        _applyRecipe(address(token), BASE, FORTRESS);
        _applyRecipe(address(token), ARB, STANDARD);

        token.renounceOwnership();
        (bool locked, uint8 tier,) = registry.verify(address(token));
        assertFalse(locked);
        assertEq(tier, FORTRESS);
        assertTrue(registry.verifyEid(address(token), BASE));
        assertFalse(registry.verifyEid(address(token), ARB));
    }

    /// @dev Library default tidak pernah dianggap terkunci: default LayerZero bisa berubah.
    function test_verifyFalseWhenLibraryIsDefault() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        token.setPeer(ARB, bytes32(uint256(1))); // ARB: peer ada, library dan ULN masih default

        assertFalse(registry.checkConfig(address(token)));
        token.renounceOwnership();
        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked);
        assertFalse(registry.verifyEid(address(token), ARB));
    }

    function test_verifyFalseWhenPeerMissing() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        _applyRecipe(address(token), ARB, STANDARD);
        token.setPeer(ARB, bytes32(0));

        assertFalse(registry.checkConfig(address(token)));
        token.renounceOwnership();
        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked);
    }

    /// @dev Receive library lama yang masih dalam masa tenggang berarti belum di-pin.
    function test_verifyFalseWhenReceiveLibraryTimeoutIsSet() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        _applyRecipe(address(token), ARB, STANDARD);
        endpoint.setReceiveLibraryTimeout(
            address(token), ARB, chains[HOME].receiveLib, block.number + 100
        );

        assertFalse(registry.checkConfig(address(token)));
        token.renounceOwnership();
        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked);
    }

    function test_verifyFalseWhenEnforcedOptionsDiffer() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        _applyRecipe(address(token), ARB, STANDARD);

        TierLib.Pathway memory p = _pathway(HOME, ARB);
        p.receiveGas = 1; // gas lzReceive yang dipaksakan jauh di bawah resep
        EnforcedOptionParam[] memory options = new EnforcedOptionParam[](1);
        options[0] = EnforcedOptionParam(ARB, TierLib.MSG_SEND, TierLib.sendOptions(p));
        token.setEnforcedOptions(options);

        assertFalse(registry.checkConfig(address(token)));
        token.renounceOwnership();
        (bool locked,,) = registry.verify(address(token));
        assertFalse(locked);
    }

    // ───────────────────────────── Pencatatan kunci ─────────────────────────────

    function test_recordLockRequiresVerify() public {
        XofNToken token = _token();
        _registerBoth(address(token), STANDARD);
        _applyRecipe(address(token), BASE, STANDARD);
        _applyRecipe(address(token), ARB, STANDARD);

        vm.expectRevert(abi.encodeWithSelector(XofNRegistry.NotLockable.selector, address(token)));
        registry.recordLock(address(token));
        assertEq(registry.lockedAt(address(token)), 0);

        token.renounceOwnership();
        registry.recordLock(address(token));
        assertEq(registry.lockedAt(address(token)), block.timestamp);

        vm.expectRevert(abi.encodeWithSelector(XofNRegistry.AlreadyLocked.selector, address(token)));
        registry.recordLock(address(token));
    }

    function test_recordLockOnlyRegistrar() public {
        vm.prank(attacker);
        vm.expectRevert(XofNRegistry.OnlyRegistrar.selector);
        registry.recordLock(address(1));

        vm.expectRevert(abi.encodeWithSelector(XofNRegistry.NotRegistered.selector, address(1)));
        registry.recordLock(address(1));
    }

    function test_registerValidation() public {
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = bytes32(uint256(1));

        vm.prank(attacker);
        vm.expectRevert(XofNRegistry.OnlyRegistrar.selector);
        registry.register(address(1), STANDARD, _eids(BASE), hashes);

        vm.expectRevert(XofNRegistry.InvalidRegistration.selector);
        registry.register(address(1), 0, _eids(BASE), hashes);
        vm.expectRevert(XofNRegistry.InvalidRegistration.selector);
        registry.register(address(1), 3, _eids(BASE), hashes);
        vm.expectRevert(XofNRegistry.InvalidRegistration.selector);
        registry.register(address(0), STANDARD, _eids(BASE), hashes);
        vm.expectRevert(XofNRegistry.InvalidRegistration.selector);
        registry.register(address(1), STANDARD, _eids(BASE, ARB), hashes);
        vm.expectRevert(XofNRegistry.InvalidRegistration.selector);
        registry.register(address(1), STANDARD, new uint32[](0), new bytes32[](0));
        vm.expectRevert(XofNRegistry.InvalidRegistration.selector);
        registry.register(address(1), STANDARD, _eids(0), hashes);
        hashes[0] = bytes32(0);
        vm.expectRevert(XofNRegistry.InvalidRegistration.selector);
        registry.register(address(1), STANDARD, _eids(BASE), hashes);
    }

    function test_registrarIsSetOnceByOwner() public {
        XofNRegistry fresh = new XofNRegistry(address(endpoint), safe);

        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker)
        );
        fresh.setRegistrar(attacker);

        vm.startPrank(safe);
        vm.expectRevert(XofNRegistry.ZeroAddress.selector);
        fresh.setRegistrar(address(0));
        fresh.setRegistrar(address(graduator));
        vm.expectRevert(XofNRegistry.RegistrarAlreadySet.selector);
        fresh.setRegistrar(attacker);
        vm.stopPrank();
        assertEq(fresh.registrar(), address(graduator));
    }

    /// @dev Safe (owner Registry) tidak punya fungsi yang menyentuh token terdaftar.
    function test_registryOwnerSurface() public view {
        string[6] memory allowed = [
            "setRegistrar",
            "setDvnAllowed",
            "register", // hanya registrar
            "recordLock", // hanya registrar
            "transferOwnership",
            "renounceOwnership"
        ];
        string memory json = vm.readFile("out/XofNRegistry.sol/XofNRegistry.json");
        uint256 mutableCount;
        for (uint256 i = 0;; i++) {
            string memory base = string.concat(".abi[", vm.toString(i), "]");
            if (!vm.keyExistsJson(json, base)) break;
            if (
                keccak256(bytes(vm.parseJsonString(json, string.concat(base, ".type"))))
                    != keccak256("function")
            ) {
                continue;
            }
            bytes32 mutability =
                keccak256(bytes(vm.parseJsonString(json, string.concat(base, ".stateMutability"))));
            if (mutability == keccak256("view") || mutability == keccak256("pure")) continue;
            bytes32 name = keccak256(bytes(vm.parseJsonString(json, string.concat(base, ".name"))));
            bool found;
            for (uint256 j = 0; j < allowed.length; j++) {
                if (name == keccak256(bytes(allowed[j]))) found = true;
            }
            assertTrue(found, "unexpected state-changing function on registry");
            mutableCount++;
        }
        assertEq(mutableCount, allowed.length);
    }

    // ───────────────────────────── Helper ─────────────────────────────

    function _token() private returns (XofNToken) {
        return new XofNToken("Proof Coin", "PROOF", address(endpoint), address(this), address(this));
    }

    function _registerBoth(address token, uint8 tier) private {
        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = TierLib.configHash(_pathway(HOME, BASE), tier);
        hashes[1] = TierLib.configHash(_pathway(HOME, ARB), tier);
        registry.register(token, tier, _eids(BASE, ARB), hashes);
    }

    function _applyRecipe(address token, uint32 eid, uint8 tier) private {
        stored = _pathway(HOME, eid);
        TierLib.applyRecipe(ILayerZeroEndpointV2(address(endpoint)), token, stored, tier);
        OFT(token).setPeer(eid, bytes32(uint256(1)));
    }
}
