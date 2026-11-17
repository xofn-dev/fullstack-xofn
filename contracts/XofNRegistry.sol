// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ILayerZeroEndpointV2
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";

import {IXofNRegistry} from "./interfaces/IXofNRegistry.sol";
import {TierLib} from "./libraries/TierLib.sol";

/// @dev `ILayerZeroEndpointV2` di paket tidak memuat `delegates(address)`.
interface IEndpointDelegates {
    function delegates(address oapp) external view returns (address);
}

/// @dev Getter mapping `enforcedOptions` di OAppOptionsType3; tidak ada di interface paket.
interface IEnforcedOptions {
    function enforcedOptions(uint32 eid, uint16 msgType) external view returns (bytes memory);
}

/// @title XofNRegistry
/// @notice Menyimpan tier tiap token XofN dan membuktikan status kuncinya lewat `verify(token)`.
///         Ada satu Registry di SETIAP chain (deployguide §7.1).
/// @dev Yang dibuktikan `verify` adalah keadaan chain INI saja, dibaca langsung dari endpoint dan
///      token saat dipanggil; tidak ada nilai yang disimpan lalu dipercaya. Registry tidak bisa
///      membaca chain lain. Status global "Locked" = `verify` true di Registry setiap chain token,
///      dan itu digabungkan oleh pembaca (indexer/UI), bukan oleh kontrak ini (PRD P13).
///
///      Owner (Safe) hanya mengelola daftar putih DVN, dan daftar itu hanya dibaca saat token
///      BARU di-launch. Owner tidak punya fungsi yang menyentuh token yang sudah terdaftar:
///      tier dan hash konfigurasinya tidak bisa diubah siapa pun setelah `register`.
contract XofNRegistry is IXofNRegistry, Ownable {
    struct Record {
        uint8 tier;
        uint64 lockedAt;
        uint32[] eids;
    }

    ILayerZeroEndpointV2 public immutable endpoint;

    /// @notice Kontrak yang boleh mendaftarkan token: Graduator di home, Remote di chain ekspansi.
    address public registrar;

    /// @inheritdoc IXofNRegistry
    mapping(address dvn => bool allowed) public dvnAllowed;

    /// @notice Hash konfigurasi yang diharapkan per token per EID (lihat `TierLib.configHash`).
    mapping(address token => mapping(uint32 eid => bytes32 hash)) public expectedConfigHash;

    mapping(address token => Record) private _records;

    event RegistrarSet(address indexed registrar);
    event DvnAllowedSet(address indexed dvn, bool allowed);
    event TokenRegistered(address indexed token, uint8 tier, uint32[] eids);
    event TokenLocked(address indexed token, uint8 tier, uint32[] eids);

    error ZeroAddress();
    error RegistrarAlreadySet();
    error OnlyRegistrar();
    error AlreadyRegistered(address token);
    error NotRegistered(address token);
    error InvalidRegistration();
    error NotLockable(address token);
    error AlreadyLocked(address token);

    constructor(address _endpoint, address _owner) Ownable(_owner) {
        if (_endpoint == address(0)) revert ZeroAddress();
        endpoint = ILayerZeroEndpointV2(_endpoint);
    }

    // ───────────────────────────── Owner (Safe) ─────────────────────────────

    /// @notice Menetapkan registrar. Hanya sekali: Registry di-deploy sebelum Graduator/Remote
    ///         (deployguide §5.2), jadi alamatnya baru diketahui setelah itu.
    function setRegistrar(address _registrar) external onlyOwner {
        if (_registrar == address(0)) revert ZeroAddress();
        if (registrar != address(0)) revert RegistrarAlreadySet();
        registrar = _registrar;
        emit RegistrarSet(_registrar);
    }

    /// @notice Menambah atau mencabut DVN dari daftar putih untuk token BARU.
    /// @dev Tidak memengaruhi token yang sudah terdaftar: resep mereka sudah dikunci.
    function setDvnAllowed(address dvn, bool allowed) external onlyOwner {
        if (dvn == address(0)) revert ZeroAddress();
        dvnAllowed[dvn] = allowed;
        emit DvnAllowedSet(dvn, allowed);
    }

    // ───────────────────────────── Registrar ─────────────────────────────

    /// @inheritdoc IXofNRegistry
    /// @dev Tier dan hash tidak bisa diubah setelah ini: tidak ada fungsi untuk itu.
    function register(
        address token,
        uint8 tier,
        uint32[] calldata eids,
        bytes32[] calldata configHashes
    ) external {
        if (msg.sender != registrar) revert OnlyRegistrar();
        if (_records[token].tier != 0) revert AlreadyRegistered(token);
        if (
            token == address(0) || !TierLib.isValidTier(tier) || eids.length == 0
                || eids.length != configHashes.length
        ) revert InvalidRegistration();

        for (uint256 i = 0; i < eids.length; i++) {
            if (eids[i] == 0 || configHashes[i] == bytes32(0)) revert InvalidRegistration();
            if (expectedConfigHash[token][eids[i]] != bytes32(0)) revert InvalidRegistration();
            expectedConfigHash[token][eids[i]] = configHashes[i];
        }

        Record storage record = _records[token];
        record.tier = tier;
        record.eids = eids;
        emit TokenRegistered(token, tier, eids);
    }

    /// @inheritdoc IXofNRegistry
    /// @dev Mencatat waktu kunci. Revert bila `verify` belum true, jadi catatan ini tidak bisa
    ///      mendahului keadaan on-chain.
    function recordLock(address token) external {
        if (msg.sender != registrar) revert OnlyRegistrar();
        Record storage record = _records[token];
        if (record.tier == 0) revert NotRegistered(token);
        if (record.lockedAt != 0) revert AlreadyLocked(token);
        if (!_verify(token, record)) revert NotLockable(token);
        record.lockedAt = uint64(block.timestamp);
        emit TokenLocked(token, record.tier, record.eids);
    }

    // ───────────────────────────── View ─────────────────────────────

    /// @inheritdoc IXofNRegistry
    /// @notice `locked` true hanya bila, di chain ini, untuk SETIAP EID terdaftar:
    ///         owner token = 0, delegate di endpoint = 0, library kirim dan terima bukan default,
    ///         tidak ada receive library lama yang masih sah, peer terpasang, dan konfigurasi ULN,
    ///         executor, serta enforced options sama dengan resep tier.
    function verify(address token)
        external
        view
        returns (bool locked, uint8 tier, uint32[] memory eids)
    {
        Record storage record = _records[token];
        tier = record.tier;
        eids = record.eids;
        locked = tier != 0 && _verify(token, record);
    }

    /// @inheritdoc IXofNRegistry
    /// @notice Sama dengan `verify`, untuk satu pathway. Lebih murah untuk dipanggil kontrak lain.
    function verifyEid(address token, uint32 eid) external view returns (bool) {
        if (_records[token].tier == 0) return false;
        return _isReleased(token) && _configMatches(token, eid);
    }

    /// @inheritdoc IXofNRegistry
    /// @notice Verifikasi pra-kunci: konfigurasi setiap EID sudah sesuai tier, tanpa memeriksa
    ///         owner/delegate. Dipakai tepat sebelum `renounceOwnership()`.
    function checkConfig(address token) external view returns (bool) {
        Record storage record = _records[token];
        if (record.tier == 0) return false;
        uint256 n = record.eids.length;
        for (uint256 i = 0; i < n; i++) {
            if (!_configMatches(token, record.eids[i])) return false;
        }
        return true;
    }

    function isRegistered(address token) external view returns (bool) {
        return _records[token].tier != 0;
    }

    function tierOf(address token) external view returns (uint8) {
        return _records[token].tier;
    }

    /// @notice Waktu `recordLock` (0 bila belum pernah tercatat terkunci).
    /// @dev Bila nilai ini bukan 0 tetapi `verify` false, konfigurasi sudah berubah ("Changed").
    function lockedAt(address token) external view returns (uint64) {
        return _records[token].lockedAt;
    }

    // ───────────────────────────── Internal ─────────────────────────────

    function _verify(address token, Record storage record) private view returns (bool) {
        // Owner/delegate dicek lebih dulu: selama belum dilepas, hasilnya false tanpa perlu
        // membaca konfigurasi.
        if (!_isReleased(token)) return false;
        uint256 n = record.eids.length;
        for (uint256 i = 0; i < n; i++) {
            if (!_configMatches(token, record.eids[i])) return false;
        }
        return true;
    }

    function _isReleased(address token) private view returns (bool) {
        return Ownable(token).owner() == address(0)
            && IEndpointDelegates(address(endpoint)).delegates(token) == address(0);
    }

    function _configMatches(address token, uint32 eid) private view returns (bool) {
        bytes32 expected = expectedConfigHash[token][eid];
        if (expected == bytes32(0)) return false;
        if (IOAppCore(token).peers(eid) == bytes32(0)) return false;

        if (endpoint.isDefaultSendLibrary(token, eid)) return false;
        (address receiveLib, bool isDefaultReceive) = endpoint.getReceiveLibrary(token, eid);
        if (isDefaultReceive) return false;
        // Receive library lama yang masih dalam masa tenggang berarti belum di-pin.
        (address timeoutLib, uint256 expiry) = endpoint.receiveLibraryTimeout(token, eid);
        if (timeoutLib != address(0) || expiry != 0) return false;

        bytes32 actual = TierLib.combineHashes(
            _endpointHash(token, eid, endpoint.getSendLibrary(token, eid), receiveLib),
            TierLib.hashOptions(
                IEnforcedOptions(token).enforcedOptions(eid, TierLib.MSG_SEND),
                IEnforcedOptions(token).enforcedOptions(eid, TierLib.MSG_SEND_AND_CALL)
            )
        );
        return actual == expected;
    }

    /// @dev `endpoint.getConfig` mengembalikan konfigurasi EFEKTIF (custom + default). Resep XofN
    ///      mengisi semua field dengan nilai bukan nol, jadi hasilnya sama dengan resep hanya bila
    ///      tidak ada field yang bergantung pada default.
    function _endpointHash(address token, uint32 eid, address sendLib, address receiveLib)
        private
        view
        returns (bytes32)
    {
        return TierLib.hashEndpointConfig(
            sendLib,
            receiveLib,
            endpoint.getConfig(token, sendLib, eid, TierLib.CONFIG_TYPE_ULN),
            endpoint.getConfig(token, receiveLib, eid, TierLib.CONFIG_TYPE_ULN),
            endpoint.getConfig(token, sendLib, eid, TierLib.CONFIG_TYPE_EXECUTOR)
        );
    }
}
