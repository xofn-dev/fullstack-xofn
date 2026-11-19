// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

// Subset antarmuka Uniswap v4 yang dipakai PoolSeeder (PRD P2/P9: v4, keputusan 19 Nov 2026).
// Antarmuka resmi `IPositionManager` ikut menarik Permit2, yang tidak dipakai di sini.

interface IV4PositionManager {
    function poolManager() external view returns (IPoolManager);

    /// @dev ID NFT posisi yang akan dicetak berikutnya.
    function nextTokenId() external view returns (uint256);

    /// @param unlockData `abi.encode(bytes actions, bytes[] params)`.
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;

    function getPositionLiquidity(uint256 tokenId) external view returns (uint128 liquidity);

    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IXofNPoolGuard {
    function seeder() external view returns (address);

    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        view
        returns (bytes4);
}
