// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {XofNToken} from "../XofNToken.sol";
import {Create3} from "./Create3.sol";

/// @title XofNTokenDeployer
/// @notice Library terhubung (linked) yang memegang bytecode XofNToken.
/// @dev Dipisah dari Graduator dan Remote supaya keduanya muat di batas ukuran kode EIP-170.
///      Fungsi `deploy` dijalankan lewat delegatecall, jadi CREATE2 proxy tetap berasal dari
///      kontrak pemanggil: alamat token hanya bergantung pada (pemanggil, salt), dan tidak ada
///      pihak lain yang bisa memakai salt yang sama.
library XofNTokenDeployer {
    function deploy(
        bytes32 salt,
        string memory name,
        string memory symbol,
        address endpoint,
        address owner,
        address supplyRecipient
    ) external returns (address) {
        return Create3.deploy(
            salt,
            abi.encodePacked(
                type(XofNToken).creationCode,
                abi.encode(name, symbol, endpoint, owner, supplyRecipient)
            )
        );
    }

    /// @notice Alamat token untuk `salt` bila di-deploy oleh `deployer`.
    function predict(address deployer, bytes32 salt) external pure returns (address) {
        return Create3.predict(deployer, salt);
    }
}
