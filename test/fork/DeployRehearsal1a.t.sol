// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {IV4PositionManager} from "../../contracts/interfaces/IUniswapV4.sol";
import {PoolSeeder} from "../../contracts/libraries/PoolSeeder.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";
import {XofNTokenDeployer} from "../../contracts/libraries/XofNTokenDeployer.sol";
import {Deploy1a, ISafe} from "../../script/lib/Deploy1a.sol";
import {V4Env} from "../helpers/V4Env.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

/// @title DeployRehearsal1aTest — gladi deploy dorman Fase 1a di FORK Robinhood testnet
/// @dev Fork READ-ONLY: tidak ada broadcast, tidak ada key sungguhan. Dilewati bila
///      `FORK_RPC_ROBINHOOD_TESTNET` kosong. Yang dijalankan adalah fungsi `Deploy1a` yang SAMA
///      dengan yang dipakai script `script/0*.s.sol`, terhadap kontrak yang hidup di chain itu:
///      CreateX, factory CREATE2, Safe v1.4.1, endpoint LayerZero, dan Uniswap v4.
///
///      Yang berbeda dari broadcast sungguhan:
///      - Safe uji 2-of-3 dibuat di fork lewat SafeProxyFactory resmi, dengan kunci uji forge.
///      - Kode Graduator di sini ter-link ke library yang di-deploy forge, bukan ke library hasil
///        CreateX (di script itu diatur `--libraries` dan dijaga `_assertLinked`).
///      - Setelah keadaan dorman terbukti, `setRegistrar` dipanggil DI FORK SAJA untuk
///        membuktikan launch → beli → graduate berjalan di Uniswap v4 testnet. Di jaringan
///        publik itu aksi Safe atas perintah PM, dan fungsi produk tidak dipanggil agent.
contract DeployRehearsal1aTest is Test, V4Env, Deploy1a {
    using StateLibrary for IPoolManager;

    address private constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address private constant SAFE_FALLBACK_HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;

    // Alamat DVN dari tabel yang disetujui (proof/2026-11-19-phase6-1a/03-parameters.md). Ditulis
    // ulang di sini supaya perubahan `config/*.json` yang tidak sengaja ketahuan.
    address private constant DVN_HORIZEN = 0x52F615eCbcbf40e47A315c2D84D14fA2851E55b7;
    address private constant DVN_LABS = 0xa78A78a13074eD93aD447a26Ec57121f29E8feC2;
    address private constant DVN_PAXOS = 0x771d83E953cA8f113f02F18206ECF8BB93da3F0A;
    address private constant DVN_TWINSTAKE = 0xcDE82F74624525e24853B1f59c8B20A162A3d297;

    Config private cfg;
    Addresses private deployed;
    uint256[3] private ownerKeys;
    address private executor = makeAddr("safe-executor");
    address private creator = makeAddr("creator");
    address private buyer = makeAddr("buyer");
    address private keeper = makeAddr("keeper");
    address private outsider = makeAddr("outsider");

    function test_fork_rehearsal_dormantDeploy_thenForkOnlyGoLive() public {
        string memory rpc = vm.envOr("FORK_RPC_ROBINHOOD_TESTNET", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        // Library terhubung di-deploy forge sebelum fork; jaga kodenya tetap ada di fork.
        vm.makePersistent(address(TierLib));
        vm.makePersistent(address(PoolSeeder));
        vm.makePersistent(address(XofNTokenDeployer));
        vm.createSelectFork(rpc);

        _setUpActors();
        _preflight(cfg);
        _assertConfigMatchesApprovedTable();
        _assertPreflightRejectsBadSetups();

        _stage1();
        _stage2();
        _stage3();
        _stage4();
        _forkOnlyGoLive();
    }

    // ───────────────────────────── Persiapan ─────────────────────────────

    function _setUpActors() private {
        address[] memory owners = new address[](3);
        for (uint256 i = 0; i < 3; i++) {
            (owners[i], ownerKeys[i]) = makeAddrAndKey(string.concat("safe-owner-", vm.toString(i)));
        }
        cfg.deployer = makeAddr("xofn-deployer-rehearsal");
        cfg.lpRecipient = makeAddr("lp-recipient-rehearsal");
        cfg.deploySalt = "xofn-rehearsal";
        cfg.safe = _createSafe(owners, 2, 1);

        vm.deal(cfg.deployer, 10 ether);
        vm.deal(executor, 10 ether);
        vm.deal(creator, 10 ether);
        vm.deal(buyer, 100 ether);
        vm.deal(keeper, 10 ether);
        vm.deal(outsider, 10 ether);
    }

    function _createSafe(address[] memory owners, uint256 threshold, uint256 saltNonce)
        private
        returns (address)
    {
        bytes memory setup = abi.encodeWithSignature(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)",
            owners,
            threshold,
            address(0),
            "",
            SAFE_FALLBACK_HANDLER,
            address(0),
            0,
            address(0)
        );
        return ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(
            SAFE_L2_SINGLETON, setup, saltNonce
        );
    }

    function _assertConfigMatchesApprovedTable() private view {
        address[] memory required = _requiredDvns();
        address[] memory optional = _optionalDvns();
        assertEq(required.length, 2);
        assertEq(optional.length, 2);
        // Terurut naik, seperti yang dituntut TierLib.
        assertEq(required[0], DVN_HORIZEN, "required[0]");
        assertEq(required[1], DVN_LABS, "required[1]");
        assertEq(optional[0], DVN_PAXOS, "optional[0]");
        assertEq(optional[1], DVN_TWINSTAKE, "optional[1]");
    }

    function _assertPreflightRejectsBadSetups() private {
        // Deployer yang punya kode (mis. EOA dengan delegasi EIP-7702) ditolak.
        Config memory bad = cfg;
        bad.deployer = makeAddr("delegated-eoa");
        vm.etch(bad.deployer, hex"ef0100000000000000000000000000000000000000dead");
        vm.expectRevert(abi.encodeWithSelector(DeployerNotPlainEoa.selector, bad.deployer));
        this.preflight(bad);

        // Safe 1-of-1 ditolak.
        address[] memory single = new address[](1);
        single[0] = vm.addr(ownerKeys[0]);
        bad = cfg;
        bad.safe = _createSafe(single, 1, 2);
        vm.expectRevert(
            abi.encodeWithSelector(SafeNotAccepted.selector, bad.safe, "threshold below 2")
        );
        this.preflight(bad);

        // Kontrak yang bukan Safe ditolak.
        bad = cfg;
        bad.safe = ENDPOINT;
        vm.expectRevert(abi.encodeWithSelector(SafeNotAccepted.selector, ENDPOINT, "not a Safe proxy"));
        this.preflight(bad);
    }

    function preflight(Config memory config) external view {
        _preflight(config);
    }

    // ───────────────────────────── 01 ─────────────────────────────

    function _stage1() private {
        Addresses memory predicted = _predict(cfg);
        uint256 gasBefore = gasleft();
        vm.startPrank(cfg.deployer);
        deployed = _deployStage1(cfg);
        vm.stopPrank();
        emit log_named_uint("gas 01 (libraries + Registry + Curve)", gasBefore - gasleft());

        // Alamat = prediksi CreateX, sebelum deploy.
        assertEq(deployed.registry, predicted.registry);
        assertEq(deployed.graduator, predicted.graduator);
        assertGt(deployed.tierLib.code.length, 0);
        assertGt(deployed.poolSeeder.code.length, 0);
        assertGt(deployed.tokenDeployer.code.length, 0);
        assertGt(deployed.curve.code.length, 0);

        // Registry milik Safe sejak constructor; EOA deployer tidak bisa membuka launchpad.
        XofNRegistry registry = XofNRegistry(deployed.registry);
        assertEq(registry.owner(), cfg.safe);
        assertEq(registry.registrar(), address(0));
        vm.prank(cfg.deployer);
        vm.expectRevert();
        registry.setRegistrar(cfg.deployer);

        // Salt terikat deployer: pihak lain yang memakai salt yang sama TIDAK ditolak CreateX,
        // tetapi kontraknya mendarat di alamat lain. Alamat Graduator tetap kosong dan hanya
        // bisa ditempati deployer.
        address elsewhere = _create3AsOutsider("core");
        assertTrue(elsewhere != predicted.graduator, "outsider landed on the Graduator address");
        assertGt(elsewhere.code.length, 0);
        assertEq(predicted.graduator.code.length, 0, "Graduator address must still be empty");

        // Sebelum Safe mengisi daftar putih, script 03 berhenti dengan alasan yang jelas.
        vm.expectRevert(abi.encodeWithSelector(DvnNotYetAllowed.selector, DVN_HORIZEN));
        this.stage3();
    }

    /// @dev Memanggil CreateX dengan salt milik deployer dari pengirim lain.
    function _create3AsOutsider(string memory label) private returns (address deployedTo) {
        bytes memory call = abi.encodeWithSignature(
            "deployCreate3(bytes32,bytes)", _salt(cfg, label), type(XofNCurve).creationCode
        );
        vm.prank(outsider);
        (bool ok, bytes memory result) = CREATEX.call(call);
        require(ok, "CreateX call failed");
        deployedTo = abi.decode(result, (address));
    }

    function stage3() external {
        vm.startPrank(cfg.deployer);
        deployed = _deployStage3(cfg, type(XofNGraduator).creationCode);
        vm.stopPrank();
    }

    // ───────────────────────────── 02 ─────────────────────────────

    function _stage2() private {
        SafeTx[] memory pending = _pendingSafeTxs(cfg, deployed.registry);
        assertEq(pending.length, DVN_COUNT);
        uint256 nonce = ISafe(cfg.safe).nonce();

        // Seperti alur nyata: keempat hash ditandatangani di awal, lalu dieksekusi berurutan.
        bytes32[] memory signedHashes = new bytes32[](pending.length);
        for (uint256 i = 0; i < pending.length; i++) {
            assertEq(pending[i].to, deployed.registry);
            assertEq(pending[i].nonce, nonce + i, "nonces must be consecutive");
            signedHashes[i] = pending[i].safeTxHash;
        }

        _assertBadSignaturesRejected(pending[0]);

        uint256 gasBefore = gasleft();
        for (uint256 i = 0; i < signedHashes.length; i++) {
            SafeTx[] memory left = _pendingSafeTxs(cfg, deployed.registry);
            // Hash yang ditandatangani di awal tetap hash transaksi berikutnya.
            assertEq(left[0].safeTxHash, signedHashes[i], "safeTxHash changed between executions");
            vm.startPrank(executor);
            _execSafeTx(cfg, left[0], _sign(signedHashes[i], 0, 2));
            vm.stopPrank();
            assertTrue(XofNRegistry(deployed.registry).dvnAllowed(left[0].dvn));
        }
        emit log_named_uint("gas 02 (4 Safe transactions)", gasBefore - gasleft());
        assertEq(_pendingSafeTxs(cfg, deployed.registry).length, 0);
        assertEq(ISafe(cfg.safe).nonce(), nonce + DVN_COUNT);
    }

    function _assertBadSignaturesRejected(SafeTx memory safeTx) private {
        // Satu tanda tangan untuk Safe 2-of-3.
        bytes[] memory one = new bytes[](1);
        one[0] = _signature(ownerKeys[0], safeTx.safeTxHash);
        vm.expectRevert(
            abi.encodeWithSelector(BadSignatures.selector, "fewer signatures than threshold")
        );
        this.execSafeTx(safeTx, one);

        // Penanda tangan yang bukan owner.
        (, uint256 strangerKey) = makeAddrAndKey("not-an-owner");
        bytes[] memory mixed = new bytes[](2);
        mixed[0] = _signature(ownerKeys[0], safeTx.safeTxHash);
        mixed[1] = _signature(strangerKey, safeTx.safeTxHash);
        vm.expectRevert(
            abi.encodeWithSelector(
                BadSignatures.selector, "signer is not a Safe owner for this safeTxHash"
            )
        );
        this.execSafeTx(safeTx, mixed);

        // Owner yang sama dua kali.
        mixed[1] = mixed[0];
        vm.expectRevert(abi.encodeWithSelector(BadSignatures.selector, "duplicate signer"));
        this.execSafeTx(safeTx, mixed);
    }

    function execSafeTx(SafeTx memory safeTx, bytes[] memory signatures) external {
        vm.startPrank(executor);
        _execSafeTx(cfg, safeTx, signatures);
        vm.stopPrank();
    }

    function _signature(uint256 key, bytes32 hash) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Dua owner menandatangani, urutannya sengaja tidak diurutkan: pengurutan tugas script.
    function _sign(bytes32 hash, uint256 first, uint256 second) private view returns (bytes[] memory s) {
        s = new bytes[](2);
        s[0] = _signature(ownerKeys[second], hash);
        s[1] = _signature(ownerKeys[first], hash);
    }

    // ───────────────────────────── 03 ─────────────────────────────

    function _stage3() private {
        uint256 gasBefore = gasleft();
        this.stage3();
        emit log_named_uint("gas 03 (guard + Graduator + handover)", gasBefore - gasleft());

        XofNGraduator graduator = XofNGraduator(payable(deployed.graduator));
        assertEq(graduator.owner(), cfg.safe);
        // Deployer tidak punya kewenangan apa pun lagi.
        vm.prank(cfg.deployer);
        vm.expectRevert();
        graduator.setDelegate(cfg.deployer);
        // Menjalankan 03 lagi gagal: alamatnya sudah terisi.
        vm.expectRevert();
        this.stage3();
    }

    // ───────────────────────────── 04 ─────────────────────────────

    function _stage4() private {
        // Di tes ini kode Graduator ter-link ke library yang di-deploy forge.
        _verifyDormant(cfg, [address(TierLib), address(PoolSeeder), address(XofNTokenDeployer)]);

        // Dorman: siapa pun yang mencoba launch ditolak Registry.
        uint32[] memory eids = new uint32[](1);
        eids[0] = EID_BASE_SEPOLIA;
        XofNGraduator graduator = XofNGraduator(payable(deployed.graduator));
        address[3] memory callers = [creator, cfg.deployer, cfg.safe];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            vm.expectRevert(XofNRegistry.OnlyRegistrar.selector);
            graduator.launch("Proof Coin", "PROOF", TierLib.TIER_STANDARD, eids, bytes32(0));
        }
        assertEq(graduator.tokenCount(), 0);
    }

    // ───────────────────────────── Go-live, DI FORK SAJA ─────────────────────────────

    function _forkOnlyGoLive() private {
        XofNGraduator graduator = XofNGraduator(payable(deployed.graduator));
        _safeExec(
            deployed.registry, abi.encodeCall(XofNRegistry.setRegistrar, (deployed.graduator))
        );
        assertEq(XofNRegistry(deployed.registry).registrar(), deployed.graduator);
        // Setelah live, verifikasi dorman HARUS menolak.
        vm.expectRevert(
            abi.encodeWithSelector(NotDormant.selector, "Registry registrar is set (live)")
        );
        this.verifyDormant();

        uint32[] memory eids = new uint32[](1);
        eids[0] = EID_BASE_SEPOLIA;
        // Fortress tidak ditawarkan di testnet.
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                TierLib.TierUnavailable.selector, TierLib.TIER_FORTRESS, EID_BASE_SEPOLIA
            )
        );
        graduator.launch("Proof Coin", "PROOF", TierLib.TIER_FORTRESS, eids, bytes32(0));

        vm.prank(creator);
        (address token, address curve) =
            graduator.launch("Proof Coin", "PROOF", TierLib.TIER_STANDARD, eids, bytes32(0));

        // Pool belum ada, dan pihak lain tidak bisa membuatnya lebih dulu di PoolManager asli.
        PoolKey memory key = graduator.poolKeyOf(token);
        vm.prank(outsider);
        _expectGuardRejects(deployed.poolGuard, outsider);
        IPoolManager(POOL_MANAGER).initialize(key, 2 ** 96);

        vm.prank(buyer);
        XofNCurve(curve).buy{value: GRADUATION_THRESHOLD}(0);
        assertTrue(XofNCurve(curve).thresholdReached());

        uint256 keeperBefore = keeper.balance;
        uint256 gasBefore = gasleft();
        vm.prank(keeper);
        graduator.graduate(token);
        emit log_named_uint("gas graduate() on live Uniswap v4", gasBefore - gasleft());
        assertEq(keeper.balance - keeperBefore, CALLER_REWARD);

        XofNGraduator.Launch memory l = graduator.launchOf(token);
        assertEq(uint8(l.status), uint8(XofNGraduator.Status.Graduated));
        assertEq(l.poolId, keccak256(abi.encode(key)));
        (uint160 sqrtPrice,,, uint24 lpFee) = IPoolManager(POOL_MANAGER).getSlot0(PoolId.wrap(l.poolId));
        assertEq(
            sqrtPrice,
            PoolSeeder.sqrtPriceX96(
                GRADUATION_THRESHOLD - CALLER_REWARD,
                999_000_000 ether - SALE_SUPPLY - l.tokensPerChain
            )
        );
        assertEq(lpFee, 3000);
        assertEq(IV4PositionManager(POSITION_MANAGER).ownerOf(l.positionId), cfg.lpRecipient);
        assertEq(address(graduator).balance, 0);

        // Fase 2 belum di-wire: ekspansi tertutup, token tetap "Graduated · awaiting expansion".
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(XofNGraduator.InfraPathwayNotPinned.selector, EID_BASE_SEPOLIA)
        );
        graduator.expandAndLock{value: 1 ether}(token);
    }

    function verifyDormant() external {
        _verifyDormant(cfg, [address(TierLib), address(PoolSeeder), address(XofNTokenDeployer)]);
    }

    function _safeExec(address to, bytes memory data) private {
        uint256 nonce = ISafe(cfg.safe).nonce();
        bytes32 hash = _safeTxHash(cfg.safe, to, data, nonce);
        SafeTx memory safeTx =
            SafeTx({to: to, data: data, nonce: nonce, safeTxHash: hash, dvn: address(0)});
        vm.startPrank(executor);
        _execSafeTx(cfg, safeTx, _sign(hash, 1, 2));
        vm.stopPrank();
    }
}
