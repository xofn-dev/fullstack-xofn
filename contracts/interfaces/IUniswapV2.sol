// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Subset antarmuka Uniswap v2 yang dipakai PoolSeeder (PRD P2/P9: v2 + ETH, keputusan owner 17 Nov 2026).

interface IUniswapV2Router {
    function factory() external view returns (address);

    function WETH() external view returns (address);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);

    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2Pair {
    function token0() external view returns (address);

    function totalSupply() external view returns (uint256);

    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function mint(address to) external returns (uint256 liquidity);

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;

    function sync() external;
}

interface IWETH {
    function deposit() external payable;

    function transfer(address to, uint256 value) external returns (bool);
}
