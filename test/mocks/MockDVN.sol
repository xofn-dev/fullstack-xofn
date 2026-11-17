// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {
    ILayerZeroDVN
} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/interfaces/ILayerZeroDVN.sol";

interface IReceiveUlnVerify {
    function verify(bytes calldata packetHeader, bytes32 payloadHash, uint64 confirmations) external;
}

/// @dev DVN tiruan untuk sisi kirim (SendUln302 memanggil `assignJob`/`getFee`). Menggantikan
///      operator yang belum diputuskan (PRD P1). Verifikasi sisi terima disimulasikan di tes
///      dengan memanggil `ReceiveUln302.verify` atas nama alamat kontrak ini.
contract MockDVN is ILayerZeroDVN {
    uint256 public fee;
    bool public rejectJobs;

    constructor(uint256 _fee) {
        fee = _fee;
    }

    /// @dev Sisi terima untuk relayer lokal (script/local): ReceiveUln302 mencatat `msg.sender`
    ///      sebagai DVN yang memverifikasi, jadi panggilannya harus datang dari kontrak ini.
    ///      Siapa pun boleh memanggil: ini tiruan untuk Anvil, bukan DVN sungguhan.
    function verify(
        address receiveLib,
        bytes calldata packetHeader,
        bytes32 payloadHash,
        uint64 confirmations
    ) external {
        IReceiveUlnVerify(receiveLib).verify(packetHeader, payloadHash, confirmations);
    }

    function setRejectJobs(bool _reject) external {
        rejectJobs = _reject;
    }

    function assignJob(AssignJobParam calldata, bytes calldata) external payable returns (uint256) {
        require(!rejectJobs, "MockDVN: down");
        return fee;
    }

    function getFee(uint32, uint64, address, bytes calldata) external view returns (uint256) {
        require(!rejectJobs, "MockDVN: down");
        return fee;
    }
}
