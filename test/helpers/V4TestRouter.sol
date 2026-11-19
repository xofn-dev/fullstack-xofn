// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title V4TestRouter
/// @notice Router TES untuk PoolManager v4 asli: swap exact-in, likuiditas, dan donasi oleh aktor
///         tes (pembeli, penjual, penyerang). Bukan kode produksi dan tidak di-deploy ke mana pun.
/// @dev Tanpa batas slippage; tes yang menilai hasilnya sendiri. Posisi likuiditas dimiliki router
///      ini dengan salt = alamat pemanggil, jadi tiap aktor punya posisi terpisah.
contract V4TestRouter is IUnlockCallback {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;
    using TransientStateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable manager;

    enum Op {
        Swap,
        Liquidity,
        Donate
    }

    struct Call {
        Op op;
        address payer;
        address recipient;
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
        uint256 amount0;
        uint256 amount1;
    }

    error OnlyManager();

    constructor(IPoolManager _manager) {
        manager = _manager;
    }

    receive() external payable {}

    /// @notice Beli token dengan seluruh `msg.value`.
    function buy(PoolKey memory key, address to) external payable returns (uint256 tokensOut) {
        return _swap(key, true, msg.value, to);
    }

    /// @notice Jual token (butuh approve ke router ini).
    function sell(PoolKey memory key, uint256 tokensIn, address to)
        external
        returns (uint256 ethOut)
    {
        return _swap(key, false, tokensIn, to);
    }

    /// @notice Tambah (delta > 0) atau tarik (delta < 0) likuiditas milik pemanggil.
    function modifyLiquidity(
        PoolKey memory key,
        int24 tickLower,
        int24 tickUpper,
        int256 liquidityDelta
    ) external payable {
        Call memory c;
        c.op = Op.Liquidity;
        c.payer = msg.sender;
        c.recipient = msg.sender;
        c.key = key;
        c.tickLower = tickLower;
        c.tickUpper = tickUpper;
        c.liquidityDelta = liquidityDelta;
        manager.unlock(abi.encode(c));
        _refund();
    }

    function donate(PoolKey memory key, uint256 amount0, uint256 amount1) external payable {
        Call memory c;
        c.op = Op.Donate;
        c.payer = msg.sender;
        c.recipient = msg.sender;
        c.key = key;
        c.amount0 = amount0;
        c.amount1 = amount1;
        manager.unlock(abi.encode(c));
        _refund();
    }

    function sqrtPriceOf(PoolKey memory key) public view returns (uint160 sqrtPriceX96) {
        (sqrtPriceX96,,,) = manager.getSlot0(key.toId());
    }

    function liquidityOf(PoolKey memory key) public view returns (uint128) {
        return manager.getLiquidity(key.toId());
    }

    /// @notice Cadangan virtual pool: x = L / sqrtP, y = L * sqrtP. Sama dengan cadangan nyata
    ///         hanya bila seluruh likuiditas aktif berasal dari posisi full-range.
    function reservesOf(PoolKey memory key)
        external
        view
        returns (uint256 reserveEth, uint256 reserveToken)
    {
        uint160 sqrtPriceX96 = sqrtPriceOf(key);
        uint128 liquidity = liquidityOf(key);
        if (sqrtPriceX96 == 0) return (0, 0);
        reserveEth = FullMath.mulDiv(liquidity, 1 << 96, sqrtPriceX96);
        reserveToken = FullMath.mulDiv(liquidity, sqrtPriceX96, 1 << 96);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert OnlyManager();
        Call memory c = abi.decode(data, (Call));

        uint256 out;
        if (c.op == Op.Swap) {
            BalanceDelta delta = manager.swap(
                c.key,
                SwapParams({
                    zeroForOne: c.zeroForOne,
                    amountSpecified: -int256(c.amountIn),
                    sqrtPriceLimitX96: c.zeroForOne
                        ? TickMath.MIN_SQRT_PRICE + 1
                        : TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );
            out = uint256(uint128(c.zeroForOne ? delta.amount1() : delta.amount0()));
        } else if (c.op == Op.Liquidity) {
            manager.modifyLiquidity(
                c.key,
                ModifyLiquidityParams({
                    tickLower: c.tickLower,
                    tickUpper: c.tickUpper,
                    liquidityDelta: c.liquidityDelta,
                    salt: bytes32(uint256(uint160(c.payer)))
                }),
                ""
            );
        } else {
            manager.donate(c.key, c.amount0, c.amount1, "");
        }

        _resolve(c.key.currency0, c.payer, c.recipient);
        _resolve(c.key.currency1, c.payer, c.recipient);
        return abi.encode(out);
    }

    function _swap(PoolKey memory key, bool zeroForOne, uint256 amountIn, address to)
        private
        returns (uint256 amountOut)
    {
        Call memory c;
        c.op = Op.Swap;
        c.payer = msg.sender;
        c.recipient = to;
        c.key = key;
        c.zeroForOne = zeroForOne;
        c.amountIn = amountIn;
        amountOut = abi.decode(manager.unlock(abi.encode(c)), (uint256));
        _refund();
    }

    /// @dev Utang dibayar: ETH dari saldo router (msg.value), ERC-20 ditarik dari `payer`.
    ///      Piutang dikirim ke `recipient`.
    function _resolve(Currency currency, address payer, address recipient) private {
        int256 delta = manager.currencyDelta(address(this), currency);
        if (delta < 0) {
            uint256 amount = uint256(-delta);
            if (Currency.unwrap(currency) == address(0)) {
                manager.settle{value: amount}();
            } else {
                manager.sync(currency);
                IERC20(Currency.unwrap(currency)).safeTransferFrom(payer, address(manager), amount);
                manager.settle();
            }
        } else if (delta > 0) {
            manager.take(currency, recipient, uint256(delta));
        }
    }

    function _refund() private {
        uint256 balance = address(this).balance;
        if (balance != 0) {
            (bool ok,) = msg.sender.call{value: balance}("");
            require(ok, "refund failed");
        }
    }
}
