// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Create3
/// @notice Deploy di alamat yang hanya bergantung pada (pemanggil, salt), bukan pada bytecode.
/// @dev Dipakai Graduator (home) dan Remote (ekspansi) untuk XofNToken. Karena proxy dibuat dengan
///      CREATE2 dari kontrak pemanggil, salt terikat pemanggil: pihak lain tidak bisa mendahului
///      alamatnya (PRD P39). Alamat token seragam antar-chain muncul bila Graduator dan Remote
///      berada di alamat yang sama; itu urusan deploy, bukan syarat di sini.
library Create3 {
    /// @dev Initcode proxy 16 byte. Runtime-nya (`363d3d37363d34f0`) menyalin calldata lalu CREATE.
    bytes internal constant PROXY_INITCODE = hex"67363d3d37363d34f03d5260086018f3";
    bytes32 internal constant PROXY_INITCODE_HASH = keccak256(PROXY_INITCODE);

    error Create3ProxyFailed();
    error Create3DeployFailed();

    function deploy(bytes32 salt, bytes memory initCode) internal returns (address deployed) {
        bytes memory proxyCode = PROXY_INITCODE;
        address proxy;
        assembly ("memory-safe") {
            proxy := create2(0, add(proxyCode, 0x20), mload(proxyCode), salt)
        }
        if (proxy == address(0)) revert Create3ProxyFailed();

        deployed = predict(address(this), salt);
        (bool ok,) = proxy.call(initCode);
        // Proxy tidak meneruskan kegagalan CREATE, jadi keberadaan kode yang jadi bukti.
        if (!ok || deployed.code.length == 0) revert Create3DeployFailed();
    }

    function predict(address deployer, bytes32 salt) internal pure returns (address) {
        address proxy = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, PROXY_INITCODE_HASH))
                )
            )
        );
        // Alamat CREATE dari proxy dengan nonce 1: keccak256(rlp([proxy, 1])).
        return address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", proxy, hex"01")))));
    }
}
