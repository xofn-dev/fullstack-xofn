// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ExpansionMsg
/// @notice Format pesan infrastruktur Graduator (home) ↔ Remote (chain ekspansi).
/// @dev Pesan hanya membawa identitas token dan tier. Alamat DVN, library, AMM, dan penerima LP
///      TIDAK dibawa pesan: semuanya dikunci di constructor masing-masing kontrak.
library ExpansionMsg {
    /// @dev Graduator → Remote: deploy token + pasang resep tier.
    uint8 internal constant DEPLOY = 1;

    /// @dev Remote → Graduator: token remote ter-deploy dan terkonfigurasi.
    uint8 internal constant ACK_CONFIGURED = 1;
    /// @dev Remote → Graduator: pool dibuat dan token remote terkunci.
    uint8 internal constant ACK_LOCKED = 2;

    function encodeDeploy(
        address homeToken,
        bytes32 salt,
        uint8 tier,
        string memory name,
        string memory symbol
    ) internal pure returns (bytes memory) {
        return abi.encode(DEPLOY, homeToken, salt, tier, name, symbol);
    }

    function decodeDeploy(bytes calldata message)
        internal
        pure
        returns (
            uint8 kind,
            address homeToken,
            bytes32 salt,
            uint8 tier,
            string memory name,
            string memory symbol
        )
    {
        return abi.decode(message, (uint8, address, bytes32, uint8, string, string));
    }

    function encodeAck(uint8 kind, address homeToken, address remoteToken)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(kind, homeToken, remoteToken);
    }

    function decodeAck(bytes calldata message)
        internal
        pure
        returns (uint8 kind, address homeToken, address remoteToken)
    {
        return abi.decode(message, (uint8, address, address));
    }
}
