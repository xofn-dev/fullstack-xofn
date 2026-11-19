// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import {IOAppComposer} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppComposer.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {OFTComposeMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {IXofNRegistry} from "./interfaces/IXofNRegistry.sol";
import {ExpansionMsg} from "./libraries/ExpansionMsg.sol";
import {PoolSeeder} from "./libraries/PoolSeeder.sol";
import {TierLib} from "./libraries/TierLib.sol";
import {XofNTokenDeployer} from "./libraries/XofNTokenDeployer.sol";

/// @title XofNRemote
/// @notice OApp + composer di chain ekspansi. Men-deploy XofNToken, memasang resep tier, menerima
///         likuiditas lewat `lzCompose`, membuat + mengisi pool, lalu mengunci token.
/// @dev Aturan composer (PRD §5.5):
///      - `lzCompose` hanya menerima panggilan dari endpoint.
///      - Hanya untuk XofNToken yang di-deploy kontrak ini, dan hanya bila pesannya berasal dari
///        Graduator di home chain. Tanpa syarat kedua, pemegang token mana pun bisa mengirim
///        token ber-compose ke sini dan memicu logika pool.
///      - Pool dibuat DAN diisi dalam satu panggilan (`PoolSeeder`), lalu token dikunci di
///        panggilan yang sama. Hanya terjadi sekali per token.
///      - Composer tidak bergantung pada identitas pemanggil atau `extraData`. Jumlah ETH
///        pasangan ditentukan `composeMsg`. Alamat AMM dan penerima LP dikunci di constructor,
///        tidak dibawa pesan.
///
///      Dana (PRD P51): ETH pasangan dan fee ack dibayar dari SALDO kontrak ini, yang diisi tim
///      langsung (`receive`). Graduator tidak mengirim value lewat executor, jadi `nativeCap`
///      LayerZero tidak membatasi ekspansi. `msg.value` dari pemanggil `endpoint.lzCompose` ikut
///      masuk saldo. Saldo dipakai bersama oleh semua token dan tidak bisa ditarik: kontrak ini
///      tidak punya fungsi untuk mengeluarkan ETH selain membuat pool dan membayar fee ack.
///      Ack otomatis hanya dikirim saat state token berubah, sehingga pesan DEPLOY berulang
///      tidak bisa menguras saldo; ack yang tertunda dikirim lewat `reAck`, dibayar pemanggilnya.
///
///      Bila `lzCompose` gagal (gas habis, saldo kurang): token sudah dikreditkan ke kontrak ini
///      oleh `lzReceive` dan tetap di sini; pesan compose tetap tersimpan di endpoint dan bisa
///      dijalankan ulang oleh siapa pun lewat `endpoint.lzCompose(...)` ("retryCompose"), tanpa
///      kedaluwarsa, misalnya setelah saldo diisi. Setelah berhasil sekali, tidak bisa
///      dijalankan lagi. Kontrak ini sengaja TIDAK punya fungsi untuk mengeluarkan token itu
///      dengan cara lain: tidak ada pool manual.
///
///      Kontrak ini tidak punya fungsi yang mengubah konfigurasi token di luar pesan DEPLOY dari
///      Graduator dan `lzCompose`. Resep pathway ke home dikunci di constructor.
contract XofNRemote is OApp, IOAppComposer {
    using OptionsBuilder for bytes;

    enum State {
        None,
        Configured,
        Locked
    }

    struct Infra {
        address registry;
        address positionManager; // PositionManager Uniswap v4 chain ini
        address poolGuard; // hook XofNPoolGuard yang terikat ke kontrak ini
        address lpRecipient; // penerima NFT posisi likuiditas (PRD P41)
        uint32 homeEid;
        uint128 ackConfiguredGas; // gas lzReceive di Graduator untuk ack CONFIGURED
        uint128 ackLockedGas; // gas lzReceive di Graduator untuk ack LOCKED
    }

    struct Deployment {
        address remoteToken;
        State state;
        uint8 tier;
        bytes32 poolId; // PoolId Uniswap v4 pool chain ini
        uint256 positionId; // NFT posisi di PositionManager
    }

    IXofNRegistry public immutable registry;
    address public immutable positionManager;
    address public immutable poolGuard;
    address public immutable lpRecipient;
    uint32 public immutable homeEid;
    uint128 public immutable ackConfiguredGas;
    uint128 public immutable ackLockedGas;

    TierLib.Pathway private _homePathway;
    mapping(address homeToken => Deployment) private _deployments;
    /// @notice Token home untuk XofNToken yang di-deploy kontrak ini (0 bila bukan).
    mapping(address remoteToken => address homeToken) public homeTokenOf;

    event TokenDeployed(address indexed homeToken, address indexed remoteToken, uint8 tier);
    event PoolSeeded(
        address indexed homeToken,
        address indexed remoteToken,
        bytes32 indexed poolId,
        uint256 positionId,
        uint256 tokenAmount,
        uint256 ethAmount
    );
    event RemoteLocked(address indexed homeToken, address indexed remoteToken);
    event AckSent(address indexed homeToken, uint8 kind, bytes32 guid);
    event AckDeferred(address indexed homeToken, uint8 kind);

    error ZeroAddress();
    error UnsupportedEid(uint32 eid);
    error PeerAlreadySet(uint32 eid);
    error UnknownMessage(uint8 kind);
    error UnregisteredToken(address token);
    error UntrustedComposeSource(uint32 srcEid, bytes32 composeFrom);
    error AlreadySeeded(address homeToken);
    error InsufficientPairAsset(uint256 required, uint256 provided);
    error ConfigMismatch(address token);
    error NotDeployed(address homeToken);
    error InsufficientFee(uint256 required, uint256 provided);
    error OnlySelf();
    error EthTransferFailed();

    constructor(
        address _endpoint,
        address _owner,
        Infra memory _infra,
        TierLib.Pathway memory _pathwayToHome
    ) OApp(_endpoint, _owner) Ownable(_owner) {
        if (
            _infra.registry == address(0) || _infra.positionManager == address(0)
                || _infra.poolGuard == address(0) || _infra.lpRecipient == address(0)
        ) revert ZeroAddress();
        // Infrastruktur pool yang salah ketahuan saat deploy, bukan saat likuiditas tiba.
        PoolSeeder.validate(_infra.positionManager, _infra.poolGuard, _infra.lpRecipient);
        if (_infra.ackConfiguredGas == 0 || _infra.ackLockedGas == 0) {
            revert TierLib.ZeroConfigField();
        }
        if (_pathwayToHome.eid != _infra.homeEid) revert UnsupportedEid(_pathwayToHome.eid);

        registry = IXofNRegistry(_infra.registry);
        positionManager = _infra.positionManager;
        poolGuard = _infra.poolGuard;
        lpRecipient = _infra.lpRecipient;
        homeEid = _infra.homeEid;
        ackConfiguredGas = _infra.ackConfiguredGas;
        ackLockedGas = _infra.ackLockedGas;

        // Resep tier pathway ke home dikunci di sini. Tidak ada setter.
        TierLib.validate(_pathwayToHome, registry, endpoint);
        _homePathway = _pathwayToHome;
    }

    /// @dev Saldo yang diisi tim: ETH pasangan pool ekspansi dan fee ack (PRD P51).
    receive() external payable {}

    // ───────────────────────────── Pesan dari Graduator ─────────────────────────────

    /// @dev Hanya terpanggil dari endpoint untuk pesan dari peer (Graduator) di home EID.
    ///      Idempoten: pesan DEPLOY kedua untuk token yang sama tidak mengubah apa pun dan tidak
    ///      mengirim ack dari saldo kontrak (lihat `reAck`).
    function _lzReceive(
        Origin calldata,
        /*_origin*/
        bytes32,
        /*_guid*/
        bytes calldata _message,
        address,
        /*_executor*/
        bytes calldata /*_extraData*/
    )
        internal
        override
    {
        (
            uint8 kind,
            address homeToken,
            bytes32 salt,
            uint8 tier,
            string memory name,
            string memory symbol
        ) = ExpansionMsg.decodeDeploy(_message);
        if (kind != ExpansionMsg.DEPLOY) revert UnknownMessage(kind);

        Deployment storage d = _deployments[homeToken];
        if (d.state == State.None) {
            TierLib.Pathway storage p = _homePathway;
            // Tier tidak pernah diturunkan: bila pathway ini tidak mendukungnya, pesan gagal.
            if (!TierLib.supportsTier(p, tier)) revert TierLib.TierUnavailable(tier, homeEid);

            address token = XofNTokenDeployer.deploy(
                salt, name, symbol, address(endpoint), address(this), address(0)
            );
            TierLib.applyRecipe(endpoint, token, p, tier);
            IOAppCore(token).setPeer(homeEid, bytes32(uint256(uint160(homeToken))));

            uint32[] memory eids = new uint32[](1);
            eids[0] = homeEid;
            bytes32[] memory hashes = new bytes32[](1);
            hashes[0] = TierLib.configHashOf(p, tier);
            registry.register(token, tier, eids, hashes);

            d.remoteToken = token;
            d.state = State.Configured;
            d.tier = tier;
            homeTokenOf[token] = homeToken;
            emit TokenDeployed(homeToken, token, tier);

            // Ack dari saldo hanya saat state berubah: DEPLOY berulang tidak bisa menguras saldo.
            _tryAck(homeToken);
        }
    }

    // ───────────────────────────── Composer ─────────────────────────────

    /// @notice Menerima likuiditas dari Graduator: buat + isi pool, kunci token, kirim ack.
    /// @param _from    OFT yang memanggil `endpoint.sendCompose` (XofNToken di chain ini).
    /// @param _message Pesan compose OFT: nonce, srcEid, amountLD, composeFrom, composeMsg.
    function lzCompose(
        address _from,
        bytes32,
        /*_guid*/
        bytes calldata _message,
        address,
        /*_executor*/
        bytes calldata /*_extraData*/
    )
        external
        payable
        override
    {
        if (msg.sender != address(endpoint)) revert OnlyEndpoint(msg.sender);

        address homeToken = homeTokenOf[_from];
        if (homeToken == address(0)) revert UnregisteredToken(_from);

        uint32 srcEid = OFTComposeMsgCodec.srcEid(_message);
        bytes32 composeFrom = OFTComposeMsgCodec.composeFrom(_message);
        if (srcEid != homeEid || composeFrom != peers[homeEid]) {
            revert UntrustedComposeSource(srcEid, composeFrom);
        }

        // ETH pasangan dari saldo kontrak (msg.value sudah termasuk), bukan dari executor.
        uint256 pairEth = abi.decode(OFTComposeMsgCodec.composeMsg(_message), (uint256));
        if (address(this).balance < pairEth) {
            revert InsufficientPairAsset(pairEth, address(this).balance);
        }

        _seedAndLock(homeToken, _from, OFTComposeMsgCodec.amountLD(_message), pairEth);
        _tryAck(homeToken);
    }

    function _seedAndLock(address homeToken, address token, uint256 tokenAmount, uint256 pairEth)
        private
    {
        Deployment storage d = _deployments[homeToken];
        if (d.state != State.Configured) revert AlreadySeeded(homeToken);
        d.state = State.Locked;

        (bytes32 poolId, uint256 positionId) = PoolSeeder.seed(
            positionManager, poolGuard, token, tokenAmount, pairEth, lpRecipient
        );
        d.poolId = poolId;
        d.positionId = positionId;
        emit PoolSeeded(homeToken, token, poolId, positionId, tokenAmount, pairEth);

        // Verifikasi pra-kunci → lepas owner + delegate → catat di Registry chain ini.
        if (!registry.checkConfig(token)) revert ConfigMismatch(token);
        // XofNToken.renounceOwnership() menolkan delegate lebih dulu.
        Ownable(token).renounceOwnership();
        registry.recordLock(token);
        emit RemoteLocked(homeToken, token);
    }

    // ───────────────────────────── Ack ─────────────────────────────

    /// @notice Mengirim ulang ack sesuai keadaan token di chain ini. Siapa pun boleh memanggil dan
    ///         membayar fee-nya; kelebihan dikembalikan.
    /// @dev Dibutuhkan bila ack otomatis tidak terkirim (saldo kontrak tidak cukup) atau
    ///      pesannya tidak sampai. Graduator mengabaikan ack ganda.
    function reAck(address homeToken) external payable {
        uint256 fee = _sendAck(homeToken, msg.value);
        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert EthTransferFailed();
        }
    }

    /// @notice Fee `reAck(homeToken)` saat ini.
    function quoteAck(address homeToken) external view returns (uint256) {
        (bytes memory message, bytes memory options,) = _ack(homeToken);
        return _quote(homeEid, message, options, false).nativeFee;
    }

    /// @dev Hanya untuk dipanggil kontrak ini sendiri, supaya kegagalan mengirim ack tidak
    ///      membatalkan deploy token atau pembuatan pool.
    function sendAckFromSelf(address homeToken) external {
        if (msg.sender != address(this)) revert OnlySelf();
        _sendAck(homeToken, address(this).balance);
    }

    function _tryAck(address homeToken) private {
        try this.sendAckFromSelf(homeToken) {}
        catch {
            emit AckDeferred(
                homeToken,
                _deployments[homeToken].state == State.Locked
                    ? ExpansionMsg.ACK_LOCKED
                    : ExpansionMsg.ACK_CONFIGURED
            );
        }
    }

    function _sendAck(address homeToken, uint256 budget) private returns (uint256 fee) {
        (bytes memory message, bytes memory options, uint8 kind) = _ack(homeToken);
        fee = _quote(homeEid, message, options, false).nativeFee;
        if (budget < fee) revert InsufficientFee(fee, budget);
        bytes32 guid = _lzSend(homeEid, message, options, MessagingFee(fee, 0), address(this)).guid;
        emit AckSent(homeToken, kind, guid);
    }

    function _ack(address homeToken)
        private
        view
        returns (bytes memory message, bytes memory options, uint8 kind)
    {
        Deployment storage d = _deployments[homeToken];
        if (d.state == State.None) revert NotDeployed(homeToken);
        bool locked = d.state == State.Locked;
        kind = locked ? ExpansionMsg.ACK_LOCKED : ExpansionMsg.ACK_CONFIGURED;
        message = ExpansionMsg.encodeAck(kind, homeToken, d.remoteToken);
        options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(locked ? ackLockedGas : ackConfiguredGas, 0);
    }

    /// @dev Fee ack dibayar dari saldo kontrak (diisi tim, atau value pemanggil `reAck`).
    ///      Jumlahnya selalu hasil quote di transaksi yang sama dan sudah dicek terhadap dana.
    function _payNative(uint256 _nativeFee) internal pure override returns (uint256) {
        return _nativeFee;
    }

    // ───────────────────────────── Owner (pathway infrastruktur) ─────────────────────────────

    /// @notice Memasang alamat Graduator di home chain. Hanya sekali, hanya untuk home EID.
    function setPeer(uint32 _eid, bytes32 _peer) public override onlyOwner {
        if (_eid != homeEid) revert UnsupportedEid(_eid);
        if (_peer == bytes32(0)) revert ZeroAddress();
        if (peers[_eid] != bytes32(0)) revert PeerAlreadySet(_eid);
        _setPeer(_eid, _peer);
    }

    // ───────────────────────────── View ─────────────────────────────

    function deploymentOf(address homeToken) external view returns (Deployment memory) {
        return _deployments[homeToken];
    }

    /// @notice PoolKey Uniswap v4 pool chain ini untuk token `remoteToken`.
    function poolKeyOf(address remoteToken) external view returns (PoolKey memory) {
        return PoolSeeder.poolKey(poolGuard, remoteToken);
    }

    function homePathway() external view returns (TierLib.Pathway memory) {
        return _homePathway;
    }
}
