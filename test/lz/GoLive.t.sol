// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {
    EndpointV2Mock as EndpointV2
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {Errors} from "@layerzerolabs/lz-evm-protocol-v2/contracts/libs/Errors.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {XofNRemote} from "../../contracts/XofNRemote.sol";
import {XofNToken} from "../../contracts/XofNToken.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";
import {PoolSeeder} from "../../contracts/libraries/PoolSeeder.sol";
import {XofNTokenDeployer} from "../../contracts/libraries/XofNTokenDeployer.sol";
import {XofNTestBase, IDelegates} from "../helpers/XofNTestBase.sol";
import {MockSafe} from "../mocks/MockSafe.sol";

/// @title GoLiveTest — Opsi A (PRD P47): deploy dorman, Safe membuka launchpad tanpa redeploy
/// @dev Membuktikan empat syarat keamanan Opsi A TANPA mengubah kontrak:
///      a. `launch()` revert selama registrar Registry home belum dipasang;
///      b. setelah `setRegistrar`, launch terbuka dan registrar tidak bisa diganti siapa pun;
///      c. owner Registry adalah Safe SEJAK constructor; EOA deployer tidak pernah memegang
///         Registry, jadi tidak ada saat di mana EOA bisa membuka launchpad;
///      d. `setDelegate(Safe)` dipanggil sebelum `transferOwnership(Safe)` untuk Graduator dan
///         Remote; urutan terbalik meninggalkan EOA sebagai delegate pathway infrastruktur.
///      Plus satu skenario yang meniru urutan deploy publik (ARCHITECTURE §5.6) sampai `verify()`
///      true di tiga chain. Semuanya di EVM tes lokal; tidak ada jaringan publik.
contract GoLiveTest is XofNTestBase {
    address internal deployer = makeAddr("deployer");
    address internal safeSigner = makeAddr("safe-signer");
    MockSafe internal safeWallet;

    /// @dev Sama dengan setUp dasar sampai Registry + daftar putih DVN; Curve, Graduator, Remote,
    ///      dan `setRegistrar` TIDAK dijalankan di sini — itu bagian yang diuji.
    function setUp() public override {
        TestHelperOz5.setUp();
        safeWallet = new MockSafe(safeSigner);
        safe = address(safeWallet);

        vm.deal(address(this), 10_000 ether);
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(keeper, 100 ether);
        vm.deal(deployer, 100 ether);

        // Batas value executor 0, seperti Robinhood testnet (PRD P51).
        setExecutorValueCap(0);
        setUpEndpoints(3, LibraryType.UltraLightNode);
        // Per chain: AMM tiruan, Registry(owner = Safe sejak constructor), Safe mengisi daftar
        // putih DVN. Daftar putih harus ada SEBELUM Graduator/Remote di-deploy, karena
        // constructor keduanya memvalidasi resep terhadap Registry (TierLib.validate).
        for (uint32 eid = HOME; eid <= ARB; eid++) {
            _setUpChain(eid);
        }
    }

    // ───────────────────────────── Skenario urutan deploy publik ─────────────────────────────

    function test_deploySequence_dormantThenSafeOpens() public {
        // 0. Library terhubung sudah ada sebelum Graduator/Remote (forge men-deploy-nya lebih dulu,
        //    seperti langkah pertama deploy publik; PRD P44).
        assertGt(address(TierLib).code.length, 0, "TierLib");
        assertGt(address(PoolSeeder).code.length, 0, "PoolSeeder");
        assertGt(address(XofNTokenDeployer).code.length, 0, "XofNTokenDeployer");
        // Deployer EOA polos, Safe berupa kontrak (playbook §4: cek EIP-7702 / code.length).
        assertEq(deployer.code.length, 0, "deployer must be a plain EOA");
        assertGt(safe.code.length, 0, "safe must be a contract");

        // 1. Registry: owner Safe, registrar kosong, di tiga chain.
        for (uint32 eid = HOME; eid <= ARB; eid++) {
            assertEq(chains[eid].registry.owner(), safe);
            assertEq(chains[eid].registry.registrar(), address(0));
        }

        // 2–5. Curve impl → Graduator → Remote → wiring → setDelegate(Safe) → transferOwnership(Safe).
        _deployDormant();
        _assertHandedToSafe();

        // 6. Dorman: launch tertutup untuk siapa pun.
        _assertLaunchClosed(creator);
        _assertLaunchClosed(deployer);
        assertEq(graduator.tokenCount(), 0);

        // 7. Safe membuka launchpad (saklar go-live). Tanpa redeploy.
        _openLaunchpad();

        // 7b. Tim mengisi saldo Remote di tiap chain ekspansi: ETH pasangan pool ekspansi dan
        //     fee ack dibayar dari sini (PRD P51). Transfer biasa; tidak butuh hak apa pun.
        vm.startPrank(deployer);
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            (bool funded,) = address(remotes[eid]).call{value: REMOTE_FUNDING}("");
            assertTrue(funded, "remote funding");
        }
        vm.stopPrank();

        // 8. Launch terbuka; siklus penuh sampai Locked di tiga chain.
        (XofNToken token,) = _launchGraduateExpand(FORTRESS, _eids(BASE, ARB));
        (bool homeLocked,,) = chains[HOME].registry.verify(address(token));
        (bool baseLocked,,) = chains[BASE].registry.verify(address(_remoteToken(token, BASE)));
        (bool arbLocked,,) = chains[ARB].registry.verify(address(_remoteToken(token, ARB)));
        assertTrue(homeLocked && baseLocked && arbLocked, "locked on every chain");
        assertEq(graduator.tokenCount(), 1);
    }

    // ───────────────────────────── a. launch tertutup ─────────────────────────────

    function test_launchRevertsUntilRegistrarSet() public {
        _deployDormant();
        assertEq(chains[HOME].registry.registrar(), address(0));

        _assertLaunchClosed(creator);
        vm.prank(creator);
        vm.expectRevert(XofNRegistry.OnlyRegistrar.selector);
        graduator.launch("Proof Coin", "PROOF", FORTRESS, _eids(BASE, ARB), bytes32(0));

        // Tidak ada state yang tertinggal dari percobaan yang gagal.
        assertEq(graduator.tokenCount(), 0);
        assertEq(graduator.launchCount(), 0);

        // Fungsi produk lain juga tidak punya apa pun untuk dikerjakan.
        vm.expectRevert(
            abi.encodeWithSelector(
                XofNGraduator.InvalidStatus.selector, address(0x1234), XofNGraduator.Status.None
            )
        );
        graduator.graduate(address(0x1234));
        vm.expectRevert();
        graduator.expandAndLock{value: 1 ether}(address(0x1234));
    }

    function testFuzz_launchClosedForAnyCallerAndTier(address caller, uint8 tier, bool both)
        public
    {
        vm.assume(caller != address(0));
        _deployDormant();
        tier = uint8(bound(tier, STANDARD, FORTRESS));
        uint32[] memory eids = both ? _eids(BASE, ARB) : _eids(BASE);
        vm.prank(caller);
        vm.expectRevert(XofNRegistry.OnlyRegistrar.selector);
        graduator.launch("Proof Coin", "PROOF", tier, eids, bytes32(0));
    }

    // ───────────────────────────── b. setelah go-live ─────────────────────────────

    function test_afterGoLive_launchOpenAndRegistrarImmutable() public {
        _deployDormant();
        _openLaunchpad();

        (XofNToken token,) = _launch(STANDARD, _eids(BASE));
        assertTrue(chains[HOME].registry.isRegistered(address(token)));

        XofNRegistry registry = chains[HOME].registry;
        // Safe sendiri tidak bisa mengganti registrar.
        vm.prank(safeSigner);
        vm.expectRevert(XofNRegistry.RegistrarAlreadySet.selector);
        safeWallet.exec(address(registry), 0, abi.encodeCall(registry.setRegistrar, (attacker)));
        // Pihak lain juga tidak.
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker)
        );
        registry.setRegistrar(attacker);

        // Pindah owner atau renounce tidak membuka jalan untuk mengganti registrar.
        address newOwner = makeAddr("new-safe");
        _safeExec(address(registry), abi.encodeCall(registry.transferOwnership, (newOwner)));
        vm.prank(newOwner);
        vm.expectRevert(XofNRegistry.RegistrarAlreadySet.selector);
        registry.setRegistrar(attacker);
        vm.prank(newOwner);
        registry.renounceOwnership();
        assertEq(registry.registrar(), address(graduator));

        // Launch tetap berjalan (tidak ada saklar mati: go-live tidak bisa dibatalkan, PRD P50).
        (XofNToken second,) = _launch(FORTRESS, _eids(BASE, ARB));
        assertTrue(registry.isRegistered(address(second)));
    }

    // ───────────────────────────── c. Registry milik Safe sejak constructor ─────────────────────

    function test_registryOwnedBySafeFromConstructor() public {
        vm.recordLogs();
        vm.prank(deployer);
        XofNRegistry registry = new XofNRegistry(chains[HOME].endpoint, safe);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Satu-satunya perpindahan kepemilikan sepanjang hidup Registry: (0 → Safe).
        bytes32 ownershipTopic = keccak256("OwnershipTransferred(address,address)");
        uint256 count;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(registry) || logs[i].topics[0] != ownershipTopic) {
                continue;
            }
            count++;
            assertEq(logs[i].topics[1], bytes32(0), "previous owner");
            assertEq(logs[i].topics[2], bytes32(uint256(uint160(safe))), "new owner");
        }
        assertEq(count, 1);
        assertEq(registry.owner(), safe);
        assertEq(registry.registrar(), address(0));

        // Deployer EOA tidak punya hak apa pun atas Registry.
        bytes memory unauthorized =
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer);
        vm.startPrank(deployer);
        vm.expectRevert(unauthorized);
        registry.setRegistrar(deployer);
        vm.expectRevert(unauthorized);
        registry.setDvnAllowed(address(0xD1), true);
        vm.expectRevert(unauthorized);
        registry.transferOwnership(deployer);
        vm.expectRevert(unauthorized);
        registry.renounceOwnership();
        vm.stopPrank();
    }

    /// @dev Tidak ada alamat selain Safe yang bisa membuka launchpad dorman.
    function testFuzz_onlySafeCanOpen(address caller) public {
        vm.assume(caller != safe);
        _deployDormant();
        XofNRegistry registry = chains[HOME].registry;
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        registry.setRegistrar(caller);
        assertEq(registry.registrar(), address(0));
    }

    /// @dev Konsekuensi Registry milik Safe: daftar putih DVN diisi Safe SEBELUM Graduator
    ///      di-deploy; tanpa itu constructor Graduator revert.
    function test_graduatorDeployNeedsSafeAllowlistFirst() public {
        XofNRegistry fresh = new XofNRegistry(chains[HOME].endpoint, safe);
        curveImpl = new XofNCurve();
        // Hook penjaga untuk alamat Graduator berikutnya milik deployer (alamat itu diketahui
        // sebelum deploy; di jaringan publik lewat CREATE3).
        XofNGraduator.Infra memory infra = _graduatorInfraFor(deployer);
        infra.registry = address(fresh);
        // Dihitung lebih dulu: `_homePathways()` memanggil kontrak lain, dan panggilan itu tidak
        // boleh menjadi target `prank`/`expectPartialRevert`.
        TierLib.Pathway[] memory pathways = _homePathways();
        address endpoint = chains[HOME].endpoint;

        vm.prank(deployer);
        vm.expectPartialRevert(TierLib.DvnNotAllowed.selector);
        new XofNGraduator(endpoint, deployer, infra, _economics(), pathways, _gasList());

        for (uint256 i = 0; i < 5; i++) {
            _safeExec(
                address(fresh), abi.encodeCall(fresh.setDvnAllowed, (chains[HOME].dvns[i], true))
            );
        }
        // Percobaan pertama memakai nonce deployer, jadi alamat berikutnya (dan hook-nya) berbeda.
        infra = _graduatorInfraFor(deployer);
        infra.registry = address(fresh);
        vm.prank(deployer);
        XofNGraduator g =
            new XofNGraduator(endpoint, deployer, infra, _economics(), pathways, _gasList());
        assertEq(g.owner(), deployer);
    }

    // ───────────────────────────── d. setDelegate sebelum transferOwnership ────────────────────

    function test_setDelegateBeforeTransferOwnership() public {
        _deployDormant();
        _assertHandedToSafe();

        // Deployer tidak lagi bisa menyentuh konfigurasi endpoint maupun OApp.
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            _assertEoaCannotConfigure(address(graduator), HOME, eid);
            _assertEoaCannotConfigure(address(remotes[eid]), eid, HOME);

            vm.prank(deployer);
            vm.expectRevert(
                abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer)
            );
            remotes[eid].setDelegate(deployer);
        }
        vm.prank(deployer);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer)
        );
        graduator.setDelegate(deployer);
    }

    /// @dev Pembanding: `transferOwnership` saja TIDAK memindah delegate di endpoint. EOA lama
    ///      tetap bisa mengubah pathway infrastruktur sampai Safe memanggil `setDelegate`.
    function test_wrongOrder_leavesEoaDelegate() public {
        curveImpl = new XofNCurve();
        XofNGraduator.Infra memory infra = _graduatorInfraFor(deployer);
        vm.startPrank(deployer);
        graduator = new XofNGraduator(
            chains[HOME].endpoint,
            deployer,
            infra,
            _economics(),
            _homePathways(),
            _gasList()
        );
        graduator.transferOwnership(safe);
        vm.stopPrank();

        address endpoint = chains[HOME].endpoint;
        assertEq(graduator.owner(), safe);
        assertEq(IDelegates(endpoint).delegates(address(graduator)), deployer, "EOA still delegate");

        // Risiko nyata: EOA masih bisa memasang library pathway infrastruktur.
        vm.prank(deployer);
        EndpointV2(endpoint).setSendLibrary(address(graduator), BASE, chains[HOME].sendLib);

        // Hanya Safe (owner baru) yang bisa memperbaikinya.
        _safeExec(address(graduator), abi.encodeCall(graduator.setDelegate, (safe)));
        _assertEoaCannotConfigure(address(graduator), HOME, BASE);
    }

    // ───────────────────────────── Helper ─────────────────────────────

    function _gasList() private pure returns (XofNGraduator.ExpansionGas[] memory gas) {
        gas = new XofNGraduator.ExpansionGas[](2);
        gas[0] = _expansionGas();
        gas[1] = _expansionGas();
    }

    /// @dev Urutan deploy publik (ARCHITECTURE §5.6) setelah Registry + daftar putih:
    ///      hook penjaga → Curve impl → Graduator → Remote → peer + pathway infrastruktur (oleh EOA
    ///      deployer; hook tiap kontrak ditaruh untuk alamat yang diprediksi lebih dulu,
    ///      selama launch masih tertutup) → setDelegate(Safe) → transferOwnership(Safe).
    function _deployDormant() private {
        vm.startPrank(deployer);
        curveImpl = new XofNCurve();
        graduator = new XofNGraduator(
            chains[HOME].endpoint,
            deployer,
            _graduatorInfraFor(deployer),
            _economics(),
            _homePathways(),
            _gasList()
        );
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            remotes[eid] = new XofNRemote(
                chains[eid].endpoint, deployer, _remoteInfraFor(eid, deployer), _pathway(eid, HOME)
            );
        }
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            graduator.setPeer(eid, _b32(address(remotes[eid])));
            remotes[eid].setPeer(HOME, _b32(address(graduator)));
        }
        vm.stopPrank();

        for (uint32 eid = BASE; eid <= ARB; eid++) {
            _wireInfraAs(deployer, address(graduator), HOME, eid);
            _wireInfraAs(deployer, address(remotes[eid]), eid, HOME);
        }

        vm.startPrank(deployer);
        graduator.setDelegate(safe);
        graduator.transferOwnership(safe);
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            remotes[eid].setDelegate(safe);
            remotes[eid].transferOwnership(safe);
        }
        vm.stopPrank();
    }

    /// @dev Saklar go-live: Safe memasang registrar di Registry home dan tiap chain ekspansi.
    function _openLaunchpad() private {
        XofNRegistry home = chains[HOME].registry;
        _safeExec(address(home), abi.encodeCall(home.setRegistrar, (address(graduator))));
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            XofNRegistry r = chains[eid].registry;
            _safeExec(address(r), abi.encodeCall(r.setRegistrar, (address(remotes[eid]))));
        }
    }

    function _safeExec(address to, bytes memory data) private {
        vm.prank(safeSigner);
        safeWallet.exec(to, 0, data);
    }

    function _assertHandedToSafe() private view {
        assertEq(graduator.owner(), safe);
        assertEq(IDelegates(chains[HOME].endpoint).delegates(address(graduator)), safe);
        for (uint32 eid = BASE; eid <= ARB; eid++) {
            assertEq(remotes[eid].owner(), safe);
            assertEq(IDelegates(chains[eid].endpoint).delegates(address(remotes[eid])), safe);
        }
    }

    function _assertLaunchClosed(address caller) private {
        vm.prank(caller);
        vm.expectRevert(XofNRegistry.OnlyRegistrar.selector);
        graduator.launch("Proof Coin", "PROOF", STANDARD, _eids(BASE), bytes32(0));
    }

    function _assertEoaCannotConfigure(address oapp, uint32 localEid, uint32 remoteEid) private {
        vm.prank(deployer);
        vm.expectRevert(Errors.LZ_Unauthorized.selector);
        EndpointV2(chains[localEid].endpoint)
            .setSendLibrary(oapp, remoteEid, chains[localEid].sendLib);
    }
}
