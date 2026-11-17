// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title MockSafe
/// @notice Safe tiruan untuk tes: sebuah KONTRAK yang hanya menjalankan panggilan atas perintah
///         satu penanda tangan. Cukup untuk membuktikan bahwa owner/delegate yang berupa kontrak
///         (bukan EOA) bisa menjalankan semua fungsi admin yang dibutuhkan deploy dorman.
/// @dev Bukan Safe v1.4.1: tidak ada kuorum, nonce, atau tanda tangan EIP-712. Pemeriksaan Safe
///      sungguhan (versi, kuorum, guard) adalah urusan script deploy Phase 6 (playbook §9.3–9.5).
contract MockSafe {
    address public immutable signer;

    error OnlySigner();

    constructor(address _signer) {
        signer = _signer;
    }

    /// @notice Menjalankan satu panggilan; revert dari target diteruskan apa adanya.
    function exec(address to, uint256 value, bytes calldata data)
        external
        returns (bytes memory result)
    {
        if (msg.sender != signer) revert OnlySigner();
        bool ok;
        (ok, result) = to.call{value: value}(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(result, 0x20), mload(result))
            }
        }
    }

    receive() external payable {}
}
