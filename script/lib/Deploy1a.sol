// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {XofNCurve} from "../../contracts/XofNCurve.sol";
import {XofNGraduator} from "../../contracts/XofNGraduator.sol";
import {XofNPoolGuard} from "../../contracts/XofNPoolGuard.sol";
import {XofNRegistry} from "../../contracts/XofNRegistry.sol";
import {TierLib} from "../../contracts/libraries/TierLib.sol";

interface ICreateX {
    function deployCreate3(bytes32 salt, bytes memory initCode) external payable returns (address);
    function computeCreate3Address(bytes32 salt) external view returns (address);
}

interface ISafe {
    function VERSION() external view returns (string memory);
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function isOwner(address owner) external view returns (bool);
    function nonce() external view returns (uint256);
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external payable returns (bool);
}

interface IEndpointFacts {
    function eid() external view returns (uint32);
    function delegates(address oapp) external view returns (address);
    function defaultSendLibrary(uint32 eid) external view returns (address);
    function defaultReceiveLibrary(uint32 eid) external view returns (address);
    function isSupportedEid(uint32 eid) external view returns (bool);
    function isDefaultSendLibrary(address sender, uint32 eid) external view returns (bool);
}

interface ISendLibFacts {
    struct ExecutorConfig {
        uint32 maxMessageSize;
        address executor;
    }

    struct UlnConfig {
        uint64 confirmations;
        uint8 requiredDVNCount;
        uint8 optionalDVNCount;
        uint8 optionalDVNThreshold;
        address[] requiredDVNs;
        address[] optionalDVNs;
    }

    function getExecutorConfig(address oapp, uint32 remoteEid)
        external
        view
        returns (ExecutorConfig memory);
    function getUlnConfig(address oapp, uint32 remoteEid) external view returns (UlnConfig memory);
}

interface IPositionManagerFacts {
    function poolManager() external view returns (address);
}

/// @title Deploy1a
/// @notice Logika deploy DORMAN XofN ke Robinhood testnet (Fase 1a, PRD P47 Opsi A), dipakai
///         bersama oleh script `script/0*.s.sol` dan tes gladi `test/fork/DeployRehearsal1a.t.sol`,
///         supaya yang digladi adalah kode yang sama dengan yang di-broadcast.
/// @dev HANYA chain 46630. Fungsi di sini tidak membaca env dan tidak memulai broadcast: pemanggil
///      (script atau tes) yang menentukan siapa pengirim transaksinya.
///
///      Urutan (ARCHITECTURE §5.6.1, diuji di test/lz/GoLive.t.sol):
///        01  library → Registry(owner = Safe sejak constructor) → Curve implementation
///        02  Safe mengizinkan DVN resep di Registry (4 transaksi Safe)
///        03  hook penjaga → Graduator(owner = deployer) → setDelegate(Safe) → transferOwnership(Safe)
///        04  verifikasi: dorman, parameter = tabel yang disetujui
///      Go-live (`Registry.setRegistrar`) BUKAN bagian ini: itu aksi Safe atas perintah PM.
///
///      Semua kontrak dibuat lewat CreateX CREATE3 dengan salt yang terikat alamat deployer, jadi
///      alamatnya hanya bergantung pada (deployer, DEPLOY_SALT, label) dan bisa diulang di chain
///      lain. Label `core` sengaja dipakai Graduator di home dan nanti Remote di chain ekspansi:
///      alamat token seragam hanya bila keduanya sama
///      (proof/2026-11-19-phase6-1a/02-uniform-address.md).
abstract contract Deploy1a is CommonBase {
    // ───────────────────────────── Fakta chain (terverifikasi read-only) ─────────────────────────
    // Sumber: proof/2026-11-19-phase6-1a/raw/onchain-check.txt dan
    // proof/2026-11-19-phase3-uniswap-v4/raw/fork-univ4.txt. `_assertChainFacts` mencocokkannya lagi
    // dengan chain setiap kali script berjalan.

    uint256 internal constant CHAIN_ID = 46_630;
    uint32 internal constant HOME_EID = 40_451;
    uint32 internal constant EID_BASE_SEPOLIA = 40_245;
    uint32 internal constant EID_ARBITRUM_SEPOLIA = 40_231;

    address internal constant ENDPOINT = 0x3aCAAf60502791D199a5a5F0B173D78229eBFe32;
    address internal constant SEND_LIB = 0x45841dd1ca50265Da7614fC43A361e526c0e6160;
    address internal constant RECEIVE_LIB = 0xd682ECF100f6F4284138AA925348633B0611Ae21;
    address internal constant EXECUTOR = 0x701f3927871EfcEa1235dB722f9E608aE120d243;

    address internal constant POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address internal constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    address internal constant CREATEX = 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed;
    bytes32 internal constant CREATEX_CODEHASH =
        0xbd8a7ea8cfca7b4e5f5041d7d4b17bc317c5ce42cfbc42066a00cf26b43eb53f;

    // Safe v1.4.1 (playbook §4, §9.3).
    address internal constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    bytes32 internal constant SAFE_PROXY_CODEHASH =
        0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c;
    uint256 internal constant SAFE_MIN_THRESHOLD = 2;

    // ───────────────────────────── Parameter yang disetujui ─────────────────────────────
    // proof/2026-11-19-phase6-1a/03-parameters.md (disetujui pengguna 19 Nov 2026). Angka ekonomi
    // SEMENTARA untuk testnet (acc PM); angka mainnet menunggu PRD P8/P15/P16/P42/P43.

    uint256 internal constant SALE_SUPPLY = 799_200_000 ether;
    uint256 internal constant START_PRICE = 1_500_000_000;
    uint256 internal constant GRADUATION_THRESHOLD = 4 ether;
    uint256 internal constant CALLER_REWARD = 0.01 ether;
    uint256 internal constant EXPANSION_PAIR_ETH = 0.04 ether;

    uint32 internal constant MAX_MESSAGE_SIZE = 10_000;
    // Satu nilai per pathway dipakai untuk arah kirim dan terima: yang terbesar dari dua default
    // LayerZero (kirim 1; terima 2 dari Base Sepolia, 5 dari Arbitrum Sepolia).
    uint64 internal constant CONFIRMATIONS_BASE_SEPOLIA = 2;
    uint64 internal constant CONFIRMATIONS_ARBITRUM_SEPOLIA = 5;
    uint128 internal constant RECEIVE_GAS = 300_000;
    uint128 internal constant COMPOSE_GAS = 100_000;
    uint128 internal constant DEPLOY_GAS = 7_000_000;
    uint128 internal constant SEED_GAS = 2_500_000;

    uint256 internal constant DVN_COUNT = 4;

    // ───────────────────────────── Tipe ─────────────────────────────

    struct Config {
        address deployer;
        address safe;
        address lpRecipient;
        /// @dev Isi env `DEPLOY_SALT`. Harus sama di Fase 2 supaya alamat Remote = alamat Graduator.
        string deploySalt;
    }

    struct Addresses {
        address tierLib;
        address poolSeeder;
        address tokenDeployer;
        address registry;
        address curve;
        address graduator;
        address poolGuard;
        bytes32 poolGuardSalt;
    }

    struct SafeTx {
        address to;
        bytes data;
        uint256 nonce;
        bytes32 safeTxHash;
        address dvn;
    }

    error WrongChain(uint256 chainId);
    error ChainFactMismatch(string what);
    error DeployerNotPlainEoa(address deployer);
    error SafeNotAccepted(address safe, string reason);
    error AddressMismatch(string label, address expected, address actual);
    error NotDeployed(string label, address where);
    error DvnNotYetAllowed(address dvn);
    error LibrariesNotLinked(string label, address expected);
    error NotDormant(string what);
    error BadSignatures(string reason);
    error GuardSaltNotFound();

    // ───────────────────────────── Pemeriksaan awal ─────────────────────────────

    function _assertChain() internal view {
        if (block.chainid != CHAIN_ID) revert WrongChain(block.chainid);
    }

    /// @notice Konstanta di atas harus masih cocok dengan chain. Tidak ada nilai yang ditebak.
    function _assertChainFacts() internal view {
        _assertChain();
        if (CREATEX.codehash != CREATEX_CODEHASH) revert ChainFactMismatch("CreateX");
        if (CREATE2_FACTORY.code.length == 0) revert ChainFactMismatch("CREATE2 factory");
        if (IEndpointFacts(ENDPOINT).eid() != HOME_EID) revert ChainFactMismatch("endpoint eid");
        if (IPositionManagerFacts(POSITION_MANAGER).poolManager() != POOL_MANAGER) {
            revert ChainFactMismatch("PositionManager.poolManager");
        }
        _assertPathwayFacts(EID_BASE_SEPOLIA, CONFIRMATIONS_BASE_SEPOLIA);
        _assertPathwayFacts(EID_ARBITRUM_SEPOLIA, CONFIRMATIONS_ARBITRUM_SEPOLIA);
    }

    function _assertPathwayFacts(uint32 eid, uint64 confirmations) private view {
        IEndpointFacts endpoint = IEndpointFacts(ENDPOINT);
        if (!endpoint.isSupportedEid(eid)) revert ChainFactMismatch("eid not supported");
        if (endpoint.defaultSendLibrary(eid) != SEND_LIB) revert ChainFactMismatch("send library");
        if (endpoint.defaultReceiveLibrary(eid) != RECEIVE_LIB) {
            revert ChainFactMismatch("receive library");
        }
        ISendLibFacts.ExecutorConfig memory executor =
            ISendLibFacts(SEND_LIB).getExecutorConfig(address(0), eid);
        if (executor.executor != EXECUTOR) revert ChainFactMismatch("executor");
        if (executor.maxMessageSize != MAX_MESSAGE_SIZE) revert ChainFactMismatch("maxMessageSize");
        // Konfirmasi resep tidak boleh lebih longgar dari default LayerZero di kedua arah.
        if (
            ISendLibFacts(SEND_LIB).getUlnConfig(address(0), eid).confirmations > confirmations
                || ISendLibFacts(RECEIVE_LIB).getUlnConfig(address(0), eid).confirmations
                    > confirmations
        ) revert ChainFactMismatch("confirmations below LayerZero default");
    }

    /// @notice Deployer harus EOA polos. Di chain ini EIP-7702 aktif: EOA yang didelegasikan punya
    ///         kode, dan kode itu bisa bertindak atas namanya (playbook §4, §12).
    function _assertPlainEoa(address deployer) internal view {
        if (deployer == address(0) || deployer.code.length != 0) revert DeployerNotPlainEoa(deployer);
    }

    /// @notice Safe v1.4.1 (proxy + singleton L2 kanonik), threshold >= 2, semua owner EOA polos.
    function _assertSafe(address safe) internal view {
        if (safe.codehash != SAFE_PROXY_CODEHASH) revert SafeNotAccepted(safe, "not a Safe proxy");
        // Slot 0 proxy Safe = alamat singleton.
        address singleton = address(uint160(uint256(vm.load(safe, bytes32(0)))));
        if (singleton != SAFE_L2_SINGLETON) revert SafeNotAccepted(safe, "singleton is not SafeL2 1.4.1");
        if (keccak256(bytes(ISafe(safe).VERSION())) != keccak256("1.4.1")) {
            revert SafeNotAccepted(safe, "version is not 1.4.1");
        }
        if (ISafe(safe).getThreshold() < SAFE_MIN_THRESHOLD) {
            revert SafeNotAccepted(safe, "threshold below 2");
        }
        address[] memory owners = ISafe(safe).getOwners();
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i].code.length != 0) revert SafeNotAccepted(safe, "an owner has code");
        }
    }

    function _preflight(Config memory cfg) internal view {
        _assertChainFacts();
        _assertPlainEoa(cfg.deployer);
        _assertSafe(cfg.safe);
        if (uint160(cfg.lpRecipient) <= 2) revert ChainFactMismatch("lpRecipient");
        if (bytes(cfg.deploySalt).length == 0) revert ChainFactMismatch("DEPLOY_SALT empty");
    }

    // ───────────────────────────── Alamat (CreateX CREATE3) ─────────────────────────────

    /// @dev 20 byte pertama = deployer → CreateX mencampur alamat pengirim ke dalam salt, jadi
    ///      alamat hasilnya hanya bisa ditempati deployer itu (pengirim lain dengan salt yang sama
    ///      mendarat di alamat lain). Byte ke-21 = 0x00 → tanpa proteksi redeploy lintas chain,
    ///      jadi alamatnya sama di chain lain.
    function _salt(Config memory cfg, string memory label) internal pure returns (bytes32) {
        bytes11 tail = bytes11(keccak256(abi.encodePacked(cfg.deploySalt, ":", label)));
        return bytes32(abi.encodePacked(cfg.deployer, bytes1(0x00), tail));
    }

    /// @dev CreateX mengganti salt terikat-pengirim dengan keccak256(pengirim, salt).
    function _predictCreate3(Config memory cfg, string memory label) internal view returns (address) {
        bytes32 guarded = keccak256(abi.encode(cfg.deployer, _salt(cfg, label)));
        return ICreateX(CREATEX).computeCreate3Address(guarded);
    }

    function _predict(Config memory cfg) internal view returns (Addresses memory a) {
        a.tierLib = _predictCreate3(cfg, "lib:TierLib");
        a.poolSeeder = _predictCreate3(cfg, "lib:PoolSeeder");
        a.tokenDeployer = _predictCreate3(cfg, "lib:XofNTokenDeployer");
        a.registry = _predictCreate3(cfg, "registry");
        a.curve = _predictCreate3(cfg, "curve");
        a.graduator = _predictCreate3(cfg, "core");
        (a.poolGuardSalt, a.poolGuard) = _mineGuard(a.graduator);
    }

    function _create3(Config memory cfg, string memory label, bytes memory initCode, address expected)
        private
        returns (address deployed)
    {
        deployed = ICreateX(CREATEX).deployCreate3(_salt(cfg, label), initCode);
        if (deployed != expected) revert AddressMismatch(label, expected, deployed);
    }

    // ───────────────────────────── Hook penjaga ─────────────────────────────

    function _guardInitCode(address seeder) internal pure returns (bytes memory) {
        return abi.encodePacked(type(XofNPoolGuard).creationCode, abi.encode(seeder));
    }

    /// @notice Salt CREATE2 (lewat factory kanonik 0x4e59…956C) yang menaruh hook di alamat
    ///         ber-flag `beforeInitialize` saja. Deterministik: salt terkecil yang memenuhi.
    function _mineGuard(address seeder) internal pure returns (bytes32 salt, address guard) {
        bytes32 initCodeHash = keccak256(_guardInitCode(seeder));
        for (uint256 i = 0; i < 2_000_000; i++) {
            salt = bytes32(i);
            guard = address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(bytes1(0xff), CREATE2_FACTORY, salt, initCodeHash)
                        )
                    )
                )
            );
            if (uint160(guard) & Hooks.ALL_HOOK_MASK == Hooks.BEFORE_INITIALIZE_FLAG) {
                return (salt, guard);
            }
        }
        revert GuardSaltNotFound();
    }

    /// @dev Alamat CREATE2 ditentukan initcode (termasuk `seeder`), jadi kode di alamat itu pasti
    ///      hook yang sama. Bila pihak lain men-deploy-nya lebih dulu, itu hook yang identik dan
    ///      dipakai apa adanya; men-deploy ulang akan revert.
    function _deployGuard(address seeder, bytes32 salt, address expected) private {
        if (expected.code.length == 0) {
            (bool ok,) = CREATE2_FACTORY.call(abi.encodePacked(salt, _guardInitCode(seeder)));
            if (!ok || expected.code.length == 0) revert NotDeployed("poolGuard", expected);
        }
        if (XofNPoolGuard(expected).seeder() != seeder) {
            revert AddressMismatch("poolGuard.seeder", seeder, XofNPoolGuard(expected).seeder());
        }
    }

    // ───────────────────────────── Resep DVN dari config/ ─────────────────────────────

    /// @notice Alamat DVN Robinhood testnet untuk alias di profil `$testnet` (`config/tiers.json`),
    ///         di-resolve lewat `config/dvn-labels.json`. Sumber alamat hanya dua file itu.
    function _dvn(string memory aliasKey) internal view returns (address) {
        string memory labels = vm.readFile("config/dvn-labels.json");
        string memory operatorId = vm.parseJsonString(labels, string.concat(".aliases.", aliasKey));
        for (uint256 i = 0;; i++) {
            string memory row = string.concat(".testnet.robinhood[", vm.toString(i), "]");
            if (!vm.keyExistsJson(labels, row)) break;
            if (
                keccak256(bytes(vm.parseJsonString(labels, string.concat(row, ".operatorId"))))
                        == keccak256(bytes(operatorId))
                    && !vm.parseJsonBool(labels, string.concat(row, ".deprecated"))
            ) return vm.parseJsonAddress(labels, string.concat(row, ".address"));
        }
        revert ChainFactMismatch(string.concat("DVN not in config: ", aliasKey));
    }

    function _dvnSet(string memory path) private view returns (address[] memory dvns) {
        string memory tiers = vm.readFile("config/tiers.json");
        string[] memory aliases = vm.parseJsonStringArray(tiers, string.concat("$['$testnet']", path));
        dvns = new address[](aliases.length);
        for (uint256 i = 0; i < aliases.length; i++) {
            dvns[i] = _dvn(aliases[i]);
        }
        // TierLib menuntut array terurut naik dan unik.
        for (uint256 i = 1; i < dvns.length; i++) {
            address value = dvns[i];
            uint256 j = i;
            while (j > 0 && dvns[j - 1] > value) {
                dvns[j] = dvns[j - 1];
                j--;
            }
            dvns[j] = value;
        }
    }

    function _requiredDvns() internal view returns (address[] memory) {
        return _dvnSet(".standard.required");
    }

    function _optionalDvns() internal view returns (address[] memory) {
        return _dvnSet(".standard.optional");
    }

    /// @notice Semua DVN yang harus diizinkan Safe di Registry sebelum Graduator dibuat.
    function _allDvns() internal view returns (address[] memory all) {
        address[] memory required = _requiredDvns();
        address[] memory optional = _optionalDvns();
        all = new address[](required.length + optional.length);
        for (uint256 i = 0; i < required.length; i++) {
            all[i] = required[i];
        }
        for (uint256 i = 0; i < optional.length; i++) {
            all[required.length + i] = optional[i];
        }
        if (all.length != DVN_COUNT) revert ChainFactMismatch("DVN count");
    }

    // ───────────────────────────── Parameter constructor Graduator ─────────────────────────────

    function _economics() internal pure returns (XofNGraduator.Economics memory) {
        return XofNGraduator.Economics({
            saleSupply: SALE_SUPPLY,
            startPrice: START_PRICE,
            graduationThreshold: GRADUATION_THRESHOLD,
            callerReward: CALLER_REWARD,
            expansionPairEth: EXPANSION_PAIR_ETH
        });
    }

    function _pathway(uint32 eid, uint64 confirmations)
        private
        view
        returns (TierLib.Pathway memory p)
    {
        p.eid = eid;
        p.sendLib = SEND_LIB;
        p.receiveLib = RECEIVE_LIB;
        p.executor = EXECUTOR;
        p.maxMessageSize = MAX_MESSAGE_SIZE;
        p.confirmations = confirmations;
        p.receiveGas = RECEIVE_GAS;
        p.composeGas = COMPOSE_GAS;
        p.standardRequired = _requiredDvns();
        // Robinhood testnet hanya punya 4 DVN aktif: Fortress (butuh 5 operator) tidak ditawarkan.
        p.fortressRequired = new address[](0);
        p.optionalDvns = _optionalDvns();
    }

    /// @dev Graduator menolak daftar kosong, jadi kedua pathway ada sejak 1a walau Fase 2 belum
    ///      jalan. Ekspansi ke EID yang belum di-wire revert `InfraPathwayNotPinned`.
    function _pathways() internal view returns (TierLib.Pathway[] memory list) {
        list = new TierLib.Pathway[](2);
        list[0] = _pathway(EID_BASE_SEPOLIA, CONFIRMATIONS_BASE_SEPOLIA);
        list[1] = _pathway(EID_ARBITRUM_SEPOLIA, CONFIRMATIONS_ARBITRUM_SEPOLIA);
    }

    function _gasList() internal pure returns (XofNGraduator.ExpansionGas[] memory gas) {
        gas = new XofNGraduator.ExpansionGas[](2);
        gas[0] = XofNGraduator.ExpansionGas({deployGas: DEPLOY_GAS, seedGas: SEED_GAS});
        gas[1] = gas[0];
    }

    // ───────────────────────────── 01: library, Registry, Curve ─────────────────────────────

    /// @notice Pengirim transaksi harus `cfg.deployer` (broadcast atau prank oleh pemanggil).
    function _deployStage1(Config memory cfg) internal returns (Addresses memory a) {
        a = _predict(cfg);
        _create3(cfg, "lib:TierLib", vm.getCode("TierLib.sol:TierLib"), a.tierLib);
        _create3(cfg, "lib:PoolSeeder", vm.getCode("PoolSeeder.sol:PoolSeeder"), a.poolSeeder);
        _create3(
            cfg,
            "lib:XofNTokenDeployer",
            vm.getCode("XofNTokenDeployer.sol:XofNTokenDeployer"),
            a.tokenDeployer
        );
        // Owner Registry = Safe SEJAK constructor: EOA deployer tidak pernah memegangnya, jadi
        // tidak ada saat di mana EOA bisa membuka launchpad (PRD P47 syarat c).
        _create3(
            cfg,
            "registry",
            abi.encodePacked(type(XofNRegistry).creationCode, abi.encode(ENDPOINT, cfg.safe)),
            a.registry
        );
        _create3(cfg, "curve", type(XofNCurve).creationCode, a.curve);
    }

    // ───────────────────────────── 02: transaksi Safe ─────────────────────────────

    /// @notice Transaksi Safe berikutnya yang masih perlu: `setDvnAllowed(dvn, true)` untuk DVN
    ///         pertama yang belum diizinkan. `found = false` bila semuanya sudah.
    /// @dev DVN diproses menurut urutan `_allDvns()`. Nonce tiap transaksi = nonce Safe saat ini +
    ///      jumlah DVN tertunda sebelum DVN itu, jadi hash yang ditandatangani di awal tetap
    ///      berlaku selama transaksi dieksekusi berurutan dan Safe tidak dipakai untuk hal lain.
    function _pendingSafeTxs(Config memory cfg, address registry)
        internal
        view
        returns (SafeTx[] memory pending)
    {
        address[] memory dvns = _allDvns();
        uint256 count;
        for (uint256 i = 0; i < dvns.length; i++) {
            if (!XofNRegistry(registry).dvnAllowed(dvns[i])) count++;
        }
        pending = new SafeTx[](count);
        uint256 nonce = ISafe(cfg.safe).nonce();
        uint256 k;
        for (uint256 i = 0; i < dvns.length; i++) {
            if (XofNRegistry(registry).dvnAllowed(dvns[i])) continue;
            bytes memory data = abi.encodeCall(XofNRegistry.setDvnAllowed, (dvns[i], true));
            pending[k] = SafeTx({
                to: registry,
                data: data,
                nonce: nonce + k,
                safeTxHash: _safeTxHash(cfg.safe, registry, data, nonce + k),
                dvn: dvns[i]
            });
            k++;
        }
    }

    /// @dev Hash EIP-712 transaksi Safe, dihitung Safe itu sendiri: value 0, operation 0 (CALL),
    ///      tanpa refund gas (safeTxGas, baseGas, gasPrice = 0). Terikat ke chain, Safe, nonce, dan
    ///      calldata.
    function _safeTxHash(address safe, address to, bytes memory data, uint256 nonce)
        internal
        view
        returns (bytes32)
    {
        return ISafe(safe).getTransactionHash(
            to, 0, data, 0, 0, 0, 0, address(0), address(0), nonce
        );
    }

    /// @notice Menyusun tanda tangan untuk `execTransaction`: tiap tanda tangan 65 byte (r, s, v
    ///         dengan v = 27/28, hasil `cast wallet sign --no-hash <safeTxHash>`), dari owner,
    ///         tanpa duplikat, diurutkan menurut alamat penanda tangan seperti yang dituntut Safe.
    function _packSignatures(address safe, bytes32 safeTxHash, bytes[] memory signatures)
        internal
        view
        returns (bytes memory packed)
    {
        uint256 n = signatures.length;
        if (n < ISafe(safe).getThreshold()) revert BadSignatures("fewer signatures than threshold");
        address[] memory signers = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            bytes memory sig = signatures[i];
            if (sig.length != 65) revert BadSignatures("signature is not 65 bytes");
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly ("memory-safe") {
                r := mload(add(sig, 0x20))
                s := mload(add(sig, 0x40))
                v := byte(0, mload(add(sig, 0x60)))
            }
            if (v != 27 && v != 28) revert BadSignatures("v must be 27 or 28");
            address signer = ecrecover(safeTxHash, v, r, s);
            if (signer == address(0) || !ISafe(safe).isOwner(signer)) {
                revert BadSignatures("signer is not a Safe owner for this safeTxHash");
            }
            signers[i] = signer;
        }
        for (uint256 i = 1; i < n; i++) {
            address signer = signers[i];
            bytes memory sig = signatures[i];
            uint256 j = i;
            while (j > 0 && signers[j - 1] > signer) {
                signers[j] = signers[j - 1];
                signatures[j] = signatures[j - 1];
                j--;
            }
            signers[j] = signer;
            signatures[j] = sig;
        }
        for (uint256 i = 0; i < n; i++) {
            if (i > 0 && signers[i] == signers[i - 1]) revert BadSignatures("duplicate signer");
            packed = abi.encodePacked(packed, signatures[i]);
        }
    }

    /// @notice Mengeksekusi satu transaksi Safe yang sudah ditandatangani. Pengirimnya siapa saja
    ///         yang punya ETH (executor); kewenangan berasal dari tanda tangan owner.
    function _execSafeTx(Config memory cfg, SafeTx memory safeTx, bytes[] memory signatures) internal {
        bytes memory packed = _packSignatures(cfg.safe, safeTx.safeTxHash, signatures);
        bool ok = ISafe(cfg.safe).execTransaction(
            safeTx.to, 0, safeTx.data, 0, 0, 0, 0, address(0), payable(address(0)), packed
        );
        if (!ok) revert BadSignatures("execTransaction returned false");
    }

    // ───────────────────────────── 03: hook + Graduator + serah-terima ─────────────────────────

    /// @param graduatorCreationCode `type(XofNGraduator).creationCode` milik pemanggil. Di script
    ///        ini HARUS sudah ter-link ke library hasil 01 (`--libraries`); lihat
    ///        `_assertLinked`. Di tes gladi kodenya ter-link ke library yang di-deploy forge.
    function _deployStage3(Config memory cfg, bytes memory graduatorCreationCode)
        internal
        returns (Addresses memory a)
    {
        a = _predict(cfg);
        if (a.registry.code.length == 0) revert NotDeployed("registry", a.registry);
        if (a.curve.code.length == 0) revert NotDeployed("curve", a.curve);
        // Constructor Graduator memvalidasi resep terhadap daftar putih Registry.
        address[] memory dvns = _allDvns();
        for (uint256 i = 0; i < dvns.length; i++) {
            if (!XofNRegistry(a.registry).dvnAllowed(dvns[i])) revert DvnNotYetAllowed(dvns[i]);
        }

        // Hook lebih dulu: constructor Graduator memvalidasinya (PoolSeeder.validate).
        _deployGuard(a.graduator, a.poolGuardSalt, a.poolGuard);

        // Owner awal = EOA deployer; lewat CreateX `msg.sender` constructor adalah proxy CREATE3,
        // jadi owner diberikan eksplisit.
        _create3(
            cfg,
            "core",
            abi.encodePacked(graduatorCreationCode, _graduatorArgs(cfg, a)),
            a.graduator
        );

        // Urutan wajib: delegate dulu, baru owner. `transferOwnership` saja meninggalkan EOA
        // sebagai delegate pathway infrastruktur di endpoint (PRD P47 syarat d).
        XofNGraduator(payable(a.graduator)).setDelegate(cfg.safe);
        XofNGraduator(payable(a.graduator)).transferOwnership(cfg.safe);
    }

    /// @notice Argumen constructor Graduator, ter-encode. Dipakai juga saat verifikasi source.
    function _graduatorArgs(Config memory cfg, Addresses memory a)
        internal
        view
        returns (bytes memory)
    {
        XofNGraduator.Infra memory infra = XofNGraduator.Infra({
            registry: a.registry,
            curveImplementation: a.curve,
            positionManager: POSITION_MANAGER,
            poolGuard: a.poolGuard,
            lpRecipient: cfg.lpRecipient
        });
        return abi.encode(ENDPOINT, cfg.deployer, infra, _economics(), _pathways(), _gasList());
    }

    /// @notice Kode pembuatan Graduator harus memuat alamat ketiga library hasil 01. Tanpa
    ///         `--libraries`, forge men-deploy salinan library sendiri dan Graduator ter-link ke
    ///         alamat yang tidak dicatat di mana pun.
    function _assertLinked(bytes memory code, Addresses memory a) internal pure {
        if (!_contains(code, a.tierLib)) revert LibrariesNotLinked("TierLib", a.tierLib);
        if (!_contains(code, a.poolSeeder)) revert LibrariesNotLinked("PoolSeeder", a.poolSeeder);
        if (!_contains(code, a.tokenDeployer)) {
            revert LibrariesNotLinked("XofNTokenDeployer", a.tokenDeployer);
        }
    }

    function _contains(bytes memory haystack, address needle) internal pure returns (bool found) {
        bytes20 target = bytes20(needle);
        uint256 length = haystack.length;
        if (length < 20) return false;
        assembly ("memory-safe") {
            let start := add(haystack, 0x20)
            let end := add(start, sub(length, 19))
            for { let ptr := start } lt(ptr, end) { ptr := add(ptr, 1) } {
                // 20 byte teratas dari word yang dimuat.
                if eq(and(mload(ptr), not(0xffffffffffffffffffffffff)), target) {
                    found := 1
                    break
                }
            }
        }
    }

    // ───────────────────────────── 04: verifikasi dorman ─────────────────────────────

    /// @notice Membaca chain dan menolak apa pun yang menyimpang dari keadaan "Deployed (dorman)"
    ///         dengan parameter yang disetujui. `libraries` = alamat library yang seharusnya
    ///         tertanam di kode Graduator.
    function _verifyDormant(Config memory cfg, address[3] memory libraries)
        internal
        returns (Addresses memory a)
    {
        _assertChainFacts();
        _assertSafe(cfg.safe);
        a = _predict(cfg);

        if (a.registry.code.length == 0) revert NotDeployed("registry", a.registry);
        if (a.curve.code.length == 0) revert NotDeployed("curve", a.curve);
        if (a.graduator.code.length == 0) revert NotDeployed("graduator", a.graduator);
        // Alamat hook (CREATE2) bergantung pada bytecode-nya, dan bytecode itu ikut berubah
        // bila kompilasinya memakai `--libraries` (metadata compiler berbeda). Script 03 dijalankan
        // dengan flag itu, script ini tidak, jadi prediksinya bisa beda. Yang dipakai adalah hook
        // yang benar-benar terpasang di Graduator; `_verifyGraduator` memeriksa flag dan seeder-nya.
        a.poolGuard = XofNGraduator(payable(a.graduator)).poolGuard();
        a.poolGuardSalt = bytes32(0);
        if (a.poolGuard.code.length == 0) revert NotDeployed("poolGuard", a.poolGuard);

        _verifyRegistry(cfg, a);
        _verifyGraduator(cfg, a);
        _verifyPathways(a);
        for (uint256 i = 0; i < 3; i++) {
            if (libraries[i].code.length == 0) revert NotDeployed("library", libraries[i]);
            if (!_contains(a.graduator.code, libraries[i])) {
                revert LibrariesNotLinked("graduator runtime", libraries[i]);
            }
        }
        _verifyLaunchClosed(a);
    }

    function _verifyRegistry(Config memory cfg, Addresses memory a) private view {
        XofNRegistry registry = XofNRegistry(a.registry);
        if (registry.owner() != cfg.safe) revert NotDormant("Registry owner is not the Safe");
        // Dorman = registrar kosong: `launch()` revert sampai Safe memanggil `setRegistrar`.
        if (registry.registrar() != address(0)) revert NotDormant("Registry registrar is set (live)");
        if (address(registry.endpoint()) != ENDPOINT) revert NotDormant("Registry endpoint");
        address[] memory dvns = _allDvns();
        for (uint256 i = 0; i < dvns.length; i++) {
            if (!registry.dvnAllowed(dvns[i])) revert DvnNotYetAllowed(dvns[i]);
        }
    }

    function _verifyGraduator(Config memory cfg, Addresses memory a) private view {
        XofNGraduator g = XofNGraduator(payable(a.graduator));
        if (g.owner() != cfg.safe) revert NotDormant("Graduator owner is not the Safe");
        if (IEndpointFacts(ENDPOINT).delegates(a.graduator) != cfg.safe) {
            revert NotDormant("Graduator endpoint delegate is not the Safe");
        }
        if (address(g.endpoint()) != ENDPOINT) revert NotDormant("Graduator endpoint");
        if (g.homeEid() != HOME_EID) revert NotDormant("homeEid");
        if (address(g.registry()) != a.registry) revert NotDormant("registry");
        if (g.curveImplementation() != a.curve) revert NotDormant("curveImplementation");
        if (g.positionManager() != POSITION_MANAGER) revert NotDormant("positionManager");
        if (g.poolGuard() != a.poolGuard) revert NotDormant("poolGuard");
        if (XofNPoolGuard(a.poolGuard).seeder() != a.graduator) revert NotDormant("poolGuard.seeder");
        if (uint160(a.poolGuard) & Hooks.ALL_HOOK_MASK != Hooks.BEFORE_INITIALIZE_FLAG) {
            revert NotDormant("poolGuard flags");
        }
        if (g.lpRecipient() != cfg.lpRecipient) revert NotDormant("lpRecipient");
        if (
            g.saleSupply() != SALE_SUPPLY || g.startPrice() != START_PRICE
                || g.graduationThreshold() != GRADUATION_THRESHOLD
                || g.callerReward() != CALLER_REWARD || g.expansionPairEth() != EXPANSION_PAIR_ETH
        ) revert NotDormant("economics");
        if (g.tokenCount() != 0 || g.launchCount() != 0) revert NotDormant("a token already exists");
    }

    function _verifyPathways(Addresses memory a) private view {
        XofNGraduator g = XofNGraduator(payable(a.graduator));
        TierLib.Pathway[] memory expected = _pathways();
        uint32[] memory eids = g.expansionEids();
        if (eids.length != expected.length) revert NotDormant("expansion EID count");
        for (uint256 i = 0; i < expected.length; i++) {
            if (eids[i] != expected[i].eid) revert NotDormant("expansion EID order");
            // Struct yang sama, di-encode sama: setiap field dan setiap alamat DVN ikut dibandingkan.
            if (
                keccak256(abi.encode(g.pathwayOf(expected[i].eid)))
                    != keccak256(abi.encode(expected[i]))
            ) revert NotDormant("pathway recipe");
            XofNGraduator.ExpansionGas memory gas = g.expansionGasOf(expected[i].eid);
            if (gas.deployGas != DEPLOY_GAS || gas.seedGas != SEED_GAS) {
                revert NotDormant("expansion gas");
            }
            if (!g.tierAvailable(TierLib.TIER_STANDARD, expected[i].eid)) {
                revert NotDormant("Standard unavailable");
            }
            if (g.tierAvailable(TierLib.TIER_FORTRESS, expected[i].eid)) {
                revert NotDormant("Fortress must not be offered on testnet");
            }
            // Fase 2 belum jalan: belum ada peer, dan library pathway infrastruktur masih default.
            if (g.peers(expected[i].eid) != bytes32(0)) revert NotDormant("a peer is already set");
            if (!IEndpointFacts(ENDPOINT).isDefaultSendLibrary(a.graduator, expected[i].eid)) {
                revert NotDormant("infra pathway is already wired");
            }
        }
    }

    /// @dev SIMULASI lokal (eth_call/forge script tanpa broadcast), bukan transaksi: `launch()`
    ///      harus revert `OnlyRegistrar`.
    function _verifyLaunchClosed(Addresses memory a) private {
        uint32[] memory eids = new uint32[](1);
        eids[0] = EID_BASE_SEPOLIA;
        try XofNGraduator(payable(a.graduator)).launch(
            "Dormant Check", "DORMANT", TierLib.TIER_STANDARD, eids, bytes32(0)
        ) {
            revert NotDormant("launch() succeeded");
        } catch (bytes memory reason) {
            if (reason.length < 4 || bytes4(reason) != XofNRegistry.OnlyRegistrar.selector) {
                revert NotDormant("launch() reverted for another reason");
            }
        }
    }
}
