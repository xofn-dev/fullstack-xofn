// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IXofNRegistry {
    function dvnAllowed(address dvn) external view returns (bool);

    function register(
        address token,
        uint8 tier,
        uint32[] calldata eids,
        bytes32[] calldata configHashes
    ) external;

    function recordLock(address token) external;

    function checkConfig(address token) external view returns (bool);

    function verify(address token)
        external
        view
        returns (bool locked, uint8 tier, uint32[] memory eids);

    function verifyEid(address token, uint32 eid) external view returns (bool);
}
