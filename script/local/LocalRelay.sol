// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OptionsHelper} from "@layerzerolabs/test-devtools-evm-foundry/contracts/OptionsHelper.sol";
import {
    ExecutorOptions
} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/libs/ExecutorOptions.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {
    Origin,
    ILayerZeroEndpointV2
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    PacketV1Codec
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/messagelib/libs/PacketV1Codec.sol";
import {OFTMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTMsgCodec.sol";
import {OFTComposeMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";

import {MockDVN} from "../../test/mocks/MockDVN.sol";

interface IReceiveUln {
    function getUlnConfig(address oapp, uint32 remoteEid) external view returns (UlnConfig memory);

    function commitVerification(bytes calldata packetHeader, bytes32 payloadHash) external;
}

/// @title LocalRelay
/// @notice HANYA UNTUK ANVIL LOKAL. Menggantikan DVN dan executor LayerZero di simulasi satu-node:
///         tiga endpoint tiruan (EID 1/2/3) hidup di chain yang sama, dan kontrak ini mengantar
///         pesan di antaranya saat `deliverNext()` dipanggil.
/// @dev SendUln302Mock memanggil `schedulePacket` setiap ada pesan terkirim. `deliverNext`
///      meminta setiap DVN tiruan di konfigurasi penerima memverifikasi, melakukan commit, lalu
///      menjalankan `lzReceive` (dan `lzCompose` bila ada) dengan gas dan value dari opsi pesan.
///      Tidak ada pengamanan: siapa pun boleh memanggilnya. Jangan pernah di-deploy di jaringan
///      publik.
contract LocalRelay is OptionsHelper {
    using PacketV1Codec for bytes;

    struct Pending {
        bytes packet;
        bytes options;
    }

    mapping(uint32 eid => address endpoint) public endpoints;
    Pending[] private _queue;
    uint256 public head;

    event Scheduled(bytes32 indexed guid, uint32 srcEid, uint32 dstEid, address receiver);
    event Delivered(bytes32 indexed guid, uint32 dstEid, address receiver, bool composed);

    error NotLocal();
    error NothingPending();

    constructor() {
        if (block.chainid != 31337) revert NotLocal();
    }

    receive() external payable {}

    function setEndpoint(uint32 eid, address endpoint) external {
        endpoints[eid] = endpoint;
    }

    /// @dev Dipanggil SendUln302Mock.
    function schedulePacket(bytes calldata packet, bytes calldata options) external {
        _queue.push(Pending(packet, options));
        emit Scheduled(packet.guid(), packet.srcEid(), packet.dstEid(), packet.receiverB20());
    }

    function pendingCount() external view returns (uint256) {
        return _queue.length - head;
    }

    /// @notice Mengantar pesan tertua yang belum diantar. Revert bila `lzReceive`/`lzCompose`
    ///         gagal; pesannya tetap di antrean.
    function deliverNext() external {
        if (head == _queue.length) revert NothingPending();
        Pending storage item = _queue[head];
        this.deliver(item.packet, item.options);
        head++;
    }

    function deliver(bytes calldata packet, bytes calldata options) external {
        require(msg.sender == address(this), "LocalRelay: internal");
        ILayerZeroEndpointV2 endpoint = ILayerZeroEndpointV2(endpoints[packet.dstEid()]);
        address receiver = packet.receiverB20();

        _verify(endpoint, packet, receiver);
        _receive(endpoint, packet, options, receiver);

        bool composed = _executorOptionExists(options, ExecutorOptions.OPTION_TYPE_LZCOMPOSE)
            && OFTMsgCodec.isComposed(packet.message());
        if (composed) _compose(endpoint, packet, options, receiver);
        emit Delivered(packet.guid(), packet.dstEid(), receiver, composed);
    }

    function _receive(
        ILayerZeroEndpointV2 endpoint,
        bytes calldata packet,
        bytes calldata options,
        address receiver
    ) private {
        (uint256 gas, uint256 value) = _parseExecutorLzReceiveOption(options);
        Origin memory origin = Origin(packet.srcEid(), packet.sender(), packet.nonce());
        endpoint.lzReceive{value: value, gas: gas}(
            origin, receiver, packet.guid(), packet.message(), ""
        );
    }

    function _verify(ILayerZeroEndpointV2 endpoint, bytes calldata packet, address receiver)
        private
    {
        uint32 srcEid = packet.srcEid();
        (address receiveLib,) = endpoint.getReceiveLibrary(receiver, srcEid);
        UlnConfig memory config = IReceiveUln(receiveLib).getUlnConfig(receiver, srcEid);
        bytes memory header = packet.header();
        bytes32 payloadHash = keccak256(packet.payload());

        for (uint256 i = 0; i < config.requiredDVNs.length; i++) {
            MockDVN(config.requiredDVNs[i])
                .verify(receiveLib, header, payloadHash, config.confirmations);
        }
        for (uint256 i = 0; i < config.optionalDVNs.length; i++) {
            MockDVN(config.optionalDVNs[i])
                .verify(receiveLib, header, payloadHash, config.confirmations);
        }
        IReceiveUln(receiveLib).commitVerification(header, payloadHash);
    }

    function _compose(
        ILayerZeroEndpointV2 endpoint,
        bytes calldata packet,
        bytes calldata options,
        address oft
    ) private {
        // XofN hanya memakai compose indeks 0.
        (, uint256 gas, uint256 value) = _parseExecutorLzComposeOption(options);
        _lzCompose(endpoint, oft, packet, gas, value);
    }

    function _lzCompose(
        ILayerZeroEndpointV2 endpoint,
        address oft,
        bytes calldata packet,
        uint256 gas,
        uint256 value
    ) private {
        (address composer, bytes memory message) = _composeMessage(packet);
        endpoint.lzCompose{value: value, gas: gas}(oft, composer, packet.guid(), 0, message, "");
    }

    /// @dev Pesan compose OFT persis seperti yang dibuat `OFTCore._lzReceive`.
    function _composeMessage(bytes calldata packet)
        private
        pure
        returns (address composer, bytes memory message)
    {
        bytes calldata oftMessage = packet.message();
        composer = address(uint160(uint256(OFTMsgCodec.sendTo(oftMessage))));
        message = OFTComposeMsgCodec.encode(
            packet.nonce(),
            packet.srcEid(),
            uint256(OFTMsgCodec.amountSD(oftMessage)) * 1e12,
            OFTMsgCodec.composeMsg(oftMessage)
        );
    }
}
