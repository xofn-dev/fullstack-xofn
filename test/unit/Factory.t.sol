// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {XofNTestBase} from "../helpers/XofNTestBase.sol";
import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {XofNRemote} from "../../contracts/XofNRemote.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";
import {MockDVN} from "../mocks/MockDVN.sol";

/// @dev PRD §9.2 tahap 1: factory menolak tier dengan kurang dari 2 DVN wajib, DVN di luar daftar
///      putih, atau field konfigurasi 0. Resep tier dikunci di constructor Graduator dan Remote,
///      jadi penolakan terjadi di sana dan di `launch`.
contract FactoryTest is XofNTestBase {
    // ───────────────────────────── launch ─────────────────────────────

    function test_launchRegistersTierAndChains() public {
        (XofNToken token, XofNCurve curve) = _launch(FORTRESS, _eids(ARB, BASE));

        XofNGraduator.Launch memory l = graduator.launchOf(address(token));
        assertEq(l.curve, address(curve));
        assertEq(l.creator, creator);
        assertEq(l.tier, FORTRESS);
        assertEq(uint8(l.status), uint8(XofNGraduator.Status.Bonding));
        assertEq(l.eids.length, 2);
        assertEq(l.eids[0], ARB);
        assertEq(l.eids[1], BASE);
        assertEq(graduator.tokenCount(), 1);
        assertEq(graduator.tokenAt(0), address(token));

        XofNRegistry registry = chains[HOME].registry;
        assertTrue(registry.isRegistered(address(token)));
        assertEq(registry.tierOf(address(token)), FORTRESS);
        assertEq(registry.lockedAt(address(token)), 0);
        assertEq(
            registry.expectedConfigHash(address(token), BASE),
            TierLib.configHash(_pathway(HOME, BASE), FORTRESS)
        );
        assertEq(
            registry.expectedConfigHash(address(token), ARB),
            TierLib.configHash(_pathway(HOME, ARB), FORTRESS)
        );
    }

    function test_launchRejectsInvalidTier() public {
        vm.startPrank(creator);
        vm.expectRevert(abi.encodeWithSelector(TierLib.InvalidTier.selector, uint8(0)));
        graduator.launch("Proof Coin", "PROOF", 0, _eids(BASE), bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(TierLib.InvalidTier.selector, uint8(3)));
        graduator.launch("Proof Coin", "PROOF", 3, _eids(BASE), bytes32(0));
        vm.stopPrank();
    }

    function test_launchRejectsInvalidChains() public {
        vm.startPrank(creator);
        vm.expectRevert(XofNGraduator.InvalidExpansionChains.selector);
        graduator.launch("Proof Coin", "PROOF", STANDARD, new uint32[](0), bytes32(0));

        vm.expectRevert(abi.encodeWithSelector(XofNGraduator.DuplicateEid.selector, BASE));
        graduator.launch("Proof Coin", "PROOF", STANDARD, _eids(BASE, BASE), bytes32(0));

        vm.expectRevert(abi.encodeWithSelector(XofNGraduator.UnsupportedEid.selector, uint32(99)));
        graduator.launch("Proof Coin", "PROOF", STANDARD, _eids(99), bytes32(0));

        // Home chain bukan chain ekspansi.
        vm.expectRevert(abi.encodeWithSelector(XofNGraduator.UnsupportedEid.selector, HOME));
        graduator.launch("Proof Coin", "PROOF", STANDARD, _eids(HOME), bytes32(0));
        vm.stopPrank();
    }

    function test_launchRejectsBadNameOrSymbol() public {
        vm.startPrank(creator);
        vm.expectRevert(XofNGraduator.InvalidName.selector);
        graduator.launch("", "PROOF", STANDARD, _eids(BASE), bytes32(0));
        vm.expectRevert(XofNGraduator.InvalidName.selector);
        graduator.launch(
            "123456789012345678901234567890123", "PROOF", STANDARD, _eids(BASE), bytes32(0)
        );
        vm.expectRevert(XofNGraduator.InvalidSymbol.selector);
        graduator.launch("Proof Coin", "P", STANDARD, _eids(BASE), bytes32(0));
        vm.expectRevert(XofNGraduator.InvalidSymbol.selector);
        graduator.launch("Proof Coin", "PROOFPROOFPRO", STANDARD, _eids(BASE), bytes32(0));
        vm.stopPrank();
    }

    /// @dev Tier tidak bisa diubah setelah launch: Registry menolak pendaftaran kedua, dan tidak
    ///      ada fungsi lain yang menulis tier.
    function test_tierCannotBeChangedAfterLaunch() public {
        (XofNToken token,) = _launch(STANDARD, _eids(BASE));
        XofNRegistry registry = chains[HOME].registry;

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = bytes32(uint256(1));
        vm.prank(address(graduator));
        vm.expectRevert(
            abi.encodeWithSelector(XofNRegistry.AlreadyRegistered.selector, address(token))
        );
        registry.register(address(token), FORTRESS, _eids(BASE), hashes);

        vm.prank(safe);
        vm.expectRevert(XofNRegistry.OnlyRegistrar.selector);
        registry.register(address(token), FORTRESS, _eids(BASE), hashes);

        assertEq(registry.tierOf(address(token)), STANDARD);
    }

    // ───────────────────────────── Daftar putih DVN ─────────────────────────────

    /// @dev Mencabut DVN dari daftar putih menghentikan launch BARU, tetapi token yang sudah ada
    ///      tetap diekspansi dan dikunci dengan resep yang sama (deployguide §5.4).
    function test_whitelistChangeAffectsOnlyNewTokens() public {
        (XofNToken existing, XofNCurve curve) = _launch(STANDARD, _eids(BASE));
        bytes32 hashBefore = chains[HOME].registry.expectedConfigHash(address(existing), BASE);

        address revoked = chains[HOME].dvns[0];
        vm.prank(safe);
        chains[HOME].registry.setDvnAllowed(revoked, false);

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(TierLib.DvnNotAllowed.selector, revoked));
        graduator.launch("New Coin", "NEW", STANDARD, _eids(BASE), bytes32(0));

        assertEq(chains[HOME].registry.expectedConfigHash(address(existing), BASE), hashBefore);
        _reachThreshold(curve);
        vm.prank(keeper);
        graduator.graduate(address(existing));
        _expand(existing);
        _runChain(existing, BASE);
        (bool locked,,) = chains[HOME].registry.verify(address(existing));
        assertTrue(locked);
    }

    function test_onlyOwnerManagesWhitelist() public {
        XofNRegistry registry = chains[HOME].registry;
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker)
        );
        registry.setDvnAllowed(attacker, true);

        vm.prank(safe);
        vm.expectRevert(XofNRegistry.ZeroAddress.selector);
        registry.setDvnAllowed(address(0), true);
    }

    // ───────────────────────────── Fortress per pathway ─────────────────────────────

    /// @dev Bila sebuah pathway tidak punya 3 DVN wajib, Fortress tidak ditawarkan untuk chain
    ///      itu dan tidak pernah diturunkan diam-diam ke Standard.
    function test_fortressUnavailablePathwayIsRejectedNotDowngraded() public {
        TierLib.Pathway[] memory pathways = _homePathways();
        pathways[1].fortressRequired = new address[](0); // Arbitrum: hanya Standard
        XofNGraduator limited = _deployGraduator(pathways, _economics());

        assertTrue(limited.tierAvailable(STANDARD, ARB));
        assertFalse(limited.tierAvailable(FORTRESS, ARB));
        assertTrue(limited.tierAvailable(FORTRESS, BASE));
        assertFalse(limited.tierAvailable(STANDARD, 99));

        vm.startPrank(creator);
        vm.expectRevert(abi.encodeWithSelector(TierLib.TierUnavailable.selector, FORTRESS, ARB));
        limited.launch("Proof Coin", "PROOF", FORTRESS, _eids(ARB), bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(TierLib.TierUnavailable.selector, FORTRESS, ARB));
        limited.launch("Proof Coin", "PROOF", FORTRESS, _eids(BASE, ARB), bytes32(0));
        vm.stopPrank();
    }

    // ───────────────────────────── Resep tier di constructor ─────────────────────────────

    function test_rejectsFewerThanTwoRequiredDvns() public {
        TierLib.Pathway[] memory pathways = _homePathways();
        address[] memory one = new address[](1);
        one[0] = chains[HOME].dvns[0];
        pathways[0].standardRequired = one;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.InvalidRequiredDvnCount.selector, uint256(1))
        );

        pathways[0].standardRequired = new address[](0);
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.InvalidRequiredDvnCount.selector, uint256(0))
        );
    }

    /// @dev 1-of-1: satu DVN wajib tanpa opsional. Ditolak oleh dua aturan sekaligus.
    function test_rejectsOneOfOne() public {
        TierLib.Pathway[] memory pathways = _homePathways();
        address[] memory one = new address[](1);
        one[0] = chains[HOME].dvns[0];
        pathways[0].standardRequired = one;
        pathways[0].fortressRequired = new address[](0);
        pathways[0].optionalDvns = new address[](0);
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.InvalidRequiredDvnCount.selector, uint256(1))
        );

        // Dua wajib tetapi tanpa opsional juga bukan tier XofN.
        pathways = _homePathways();
        pathways[0].optionalDvns = new address[](0);
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.InvalidOptionalDvnCount.selector, uint256(0))
        );
    }

    function test_rejectsWrongFortressOrOptionalCount() public {
        TierLib.Pathway[] memory pathways = _homePathways();
        address[] memory two = new address[](2);
        two[0] = chains[HOME].dvns[0];
        two[1] = chains[HOME].dvns[2];
        pathways[0].fortressRequired = two;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.InvalidRequiredDvnCount.selector, uint256(2))
        );

        pathways = _homePathways();
        address[] memory oneOptional = new address[](1);
        oneOptional[0] = chains[HOME].dvns[1];
        pathways[0].optionalDvns = oneOptional;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.InvalidOptionalDvnCount.selector, uint256(1))
        );
    }

    function test_rejectsDvnOutsideWhitelist() public {
        address outsider = address(new MockDVN(1));
        TierLib.Pathway[] memory pathways = _homePathways();
        address[] memory required = new address[](2);
        required[0] = chains[HOME].dvns[0];
        required[1] = outsider;
        _sort(required);
        pathways[1].standardRequired = required;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.DvnNotAllowed.selector, outsider)
        );

        pathways = _homePathways();
        address[] memory optional = new address[](2);
        optional[0] = chains[HOME].dvns[1];
        optional[1] = outsider;
        _sort(optional);
        pathways[0].optionalDvns = optional;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.DvnNotAllowed.selector, outsider)
        );
    }

    /// @dev Nilai 0 di ULN/executor berarti "pakai default" (PRD P5), jadi setiap field 0 ditolak.
    function test_rejectsZeroConfigFields() public {
        bytes memory zero = abi.encodeWithSelector(TierLib.ZeroConfigField.selector);
        TierLib.Pathway[] memory pathways;

        pathways = _homePathways();
        pathways[0].sendLib = address(0);
        _expectGraduatorRevert(pathways, zero);

        pathways = _homePathways();
        pathways[0].receiveLib = address(0);
        _expectGraduatorRevert(pathways, zero);

        pathways = _homePathways();
        pathways[0].executor = address(0);
        _expectGraduatorRevert(pathways, zero);

        pathways = _homePathways();
        pathways[0].maxMessageSize = 0;
        _expectGraduatorRevert(pathways, zero);

        pathways = _homePathways();
        pathways[0].confirmations = 0;
        _expectGraduatorRevert(pathways, zero);

        pathways = _homePathways();
        pathways[0].receiveGas = 0;
        _expectGraduatorRevert(pathways, zero);

        pathways = _homePathways();
        pathways[0].composeGas = 0;
        _expectGraduatorRevert(pathways, zero);
    }

    /// @dev Library yang tidak terdaftar di endpoint tidak akan pernah bisa dipasang.
    function test_rejectsUnregisteredLibraryOrUnsupportedEid() public {
        TierLib.Pathway[] memory pathways = _homePathways();
        pathways[0].sendLib = attacker;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.LibraryNotRegistered.selector, attacker)
        );

        pathways = _homePathways();
        pathways[1].receiveLib = attacker;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.LibraryNotRegistered.selector, attacker)
        );

        // Library kirim dan terima tertukar.
        pathways = _homePathways();
        (pathways[0].sendLib, pathways[0].receiveLib) =
        (pathways[0].receiveLib, pathways[0].sendLib);
        _expectGraduatorRevert(
            pathways,
            abi.encodeWithSelector(TierLib.WrongLibraryType.selector, chains[HOME].receiveLib)
        );

        pathways = _homePathways();
        pathways[0].eid = 77; // endpoint tidak punya library default untuk EID ini
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.EidNotSupported.selector, uint32(77))
        );
    }

    /// @dev ULN mewajibkan alamat DVN terurut naik dan unik.
    function test_rejectsUnsortedOrDuplicateDvns() public {
        bytes memory unsorted = abi.encodeWithSelector(TierLib.DvnsNotSortedUnique.selector);
        TierLib.Pathway[] memory pathways = _homePathways();
        (pathways[0].standardRequired[0], pathways[0].standardRequired[1]) =
        (pathways[0].standardRequired[1], pathways[0].standardRequired[0]);
        _expectGraduatorRevert(pathways, unsorted);

        pathways = _homePathways();
        pathways[0].standardRequired[1] = pathways[0].standardRequired[0];
        _expectGraduatorRevert(pathways, unsorted);

        pathways = _homePathways();
        pathways[0].optionalDvns[0] = address(0);
        _expectGraduatorRevert(pathways, unsorted);
    }

    /// @dev DVN wajib yang juga opsional membuat "+1 dari 2" tidak menambah verifikator.
    function test_rejectsDvnInBothRequiredAndOptional() public {
        TierLib.Pathway[] memory pathways = _homePathways();
        address[] memory optional = new address[](2);
        optional[0] = chains[HOME].dvns[0]; // juga DVN wajib
        optional[1] = chains[HOME].dvns[1];
        pathways[0].optionalDvns = optional;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.DvnOverlap.selector, chains[HOME].dvns[0])
        );
    }

    function test_rejectsInvalidOrDuplicatePathwayEid() public {
        TierLib.Pathway[] memory pathways = _homePathways();
        pathways[0].eid = 0;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(TierLib.InvalidEid.selector, uint32(0))
        );

        pathways = _homePathways();
        pathways[0].eid = HOME;
        _expectGraduatorRevert(pathways, abi.encodeWithSelector(TierLib.InvalidEid.selector, HOME));

        pathways = _homePathways();
        pathways[1].eid = BASE;
        _expectGraduatorRevert(
            pathways, abi.encodeWithSelector(XofNGraduator.DuplicateEid.selector, BASE)
        );
    }

    function test_rejectsInvalidEconomics() public {
        bytes memory invalid = abi.encodeWithSelector(XofNGraduator.InvalidEconomics.selector);
        XofNGraduator.Economics memory e;

        e = _economics();
        e.saleSupply = TOTAL_SUPPLY; // tidak ada sisa untuk pool
        _expectEconomicsRevert(e, invalid);

        e = _economics();
        e.saleSupply = 0;
        _expectEconomicsRevert(e, invalid);

        e = _economics();
        e.startPrice = 0;
        _expectEconomicsRevert(e, invalid);

        e = _economics();
        e.expansionPairEth = 0;
        _expectEconomicsRevert(e, invalid);

        // Ambang habis untuk insentif + porsi ekspansi: pool home tidak akan punya ETH.
        e = _economics();
        e.graduationThreshold = e.callerReward + 2 * e.expansionPairEth;
        _expectEconomicsRevert(e, invalid);
    }

    /// @dev Remote memakai aturan yang sama untuk resep pathway ke home.
    function test_remoteConstructorAppliesSameRules() public {
        TierLib.Pathway memory p = _pathway(BASE, HOME);
        address[] memory one = new address[](1);
        one[0] = chains[BASE].dvns[0];
        p.standardRequired = one;
        vm.expectRevert(
            abi.encodeWithSelector(TierLib.InvalidRequiredDvnCount.selector, uint256(1))
        );
        new XofNRemote(chains[BASE].endpoint, safe, _remoteInfra(BASE), p);

        p = _pathway(BASE, HOME);
        p.confirmations = 0;
        vm.expectRevert(TierLib.ZeroConfigField.selector);
        new XofNRemote(chains[BASE].endpoint, safe, _remoteInfra(BASE), p);

        // DVN chain lain tidak ada di daftar putih chain ini.
        p = _pathway(BASE, HOME);
        address[] memory foreign = new address[](2);
        foreign[0] = chains[ARB].dvns[0];
        foreign[1] = chains[ARB].dvns[1];
        p.optionalDvns = foreign;
        vm.expectRevert(abi.encodeWithSelector(TierLib.DvnNotAllowed.selector, foreign[0]));
        new XofNRemote(chains[BASE].endpoint, safe, _remoteInfra(BASE), p);

        // Pathway harus menuju home EID.
        p = _pathway(BASE, ARB);
        vm.expectRevert(abi.encodeWithSelector(XofNRemote.UnsupportedEid.selector, ARB));
        new XofNRemote(chains[BASE].endpoint, safe, _remoteInfra(BASE), p);
    }

    function _expectGraduatorRevert(TierLib.Pathway[] memory pathways, bytes memory err) private {
        XofNGraduator.ExpansionGas[] memory gas = new XofNGraduator.ExpansionGas[](pathways.length);
        for (uint256 i = 0; i < gas.length; i++) {
            gas[i] = _expansionGas();
        }
        XofNGraduator.Infra memory infra = _graduatorInfra();
        XofNGraduator.Economics memory economics = _economics();
        address endpoint = chains[HOME].endpoint;
        vm.expectRevert(err);
        new XofNGraduator(endpoint, safe, infra, economics, pathways, gas);
    }

    function _expectEconomicsRevert(XofNGraduator.Economics memory economics, bytes memory err)
        private
    {
        TierLib.Pathway[] memory pathways = _homePathways();
        XofNGraduator.ExpansionGas[] memory gas = new XofNGraduator.ExpansionGas[](pathways.length);
        for (uint256 i = 0; i < gas.length; i++) {
            gas[i] = _expansionGas();
        }
        XofNGraduator.Infra memory infra = _graduatorInfra();
        address endpoint = chains[HOME].endpoint;
        vm.expectRevert(err);
        new XofNGraduator(endpoint, safe, infra, economics, pathways, gas);
    }
}
